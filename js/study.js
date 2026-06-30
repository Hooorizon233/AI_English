// ===== Study Module — Core Learning + Ebbinghaus Spaced Repetition =====
// Now uses server-side API for all data operations

const Study = {
    // Ebbinghaus intervals (in days)
    INTERVALS: [1, 2, 4, 7, 15, 30],

    // Current study session (in-memory)
    session: {
        queue: [],
        currentWord: null,
        mode: 'learn',       // 'learn' or 'review'
        totalWords: 0,
        learnedWords: 0,
        requiredCorrect: 2,
        results: { correct: 0, wrong: 0, fuzzy: 0, actions: 0 },
        wordState: {}         // { word: consecutiveCorrectCount }
    },

    // Cached progress data (avoid O(n) scans)
    _progressCache: null,
    _progressCacheTime: 0,

    // Fisher-Yates shuffle
    _shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    },

    // Get progress from server (cached for 5 seconds)
    async getProgress(forceRefresh) {
        const now = Date.now();
        if (!forceRefresh && this._progressCache && (now - this._progressCacheTime) < 5000) {
            return this._progressCache;
        }
        const result = await API.getProgress();
        this._progressCache = result;
        this._progressCacheTime = now;
        return result;
    },

    // Start a new study session — fetches batch from server
    async startSession(mode, wordCount) {
        // Ensure word banks are loaded
        await WordBank.refreshBanks();
        const selectedBanks = await WordBank.getSelectedBanks();
        if (selectedBanks.length === 0) {
            showToast('请先选择词库');
            navigateTo('wordbank');
            return false;
        }

        // Start session on server
        const result = await API.startStudy(mode, wordCount || 20);
        if (!result.ok) {
            showToast(result.msg || '启动学习失败');
            return false;
        }

        const { session } = result;
        if (!session || !session.queue || session.queue.length === 0) {
            if (mode === 'review') {
                showToast('暂无需要复习的单词 🎉');
            } else {
                showToast('所有单词都已学过！');
            }
            return false;
        }

        // Get required correct count from settings
        const settings = await API.getSettings();
        const requiredCorrect = settings.requiredCorrect || 2;

        // Initialize local session
        this.session = {
            queue: [...session.queue],
            currentWord: null,
            mode,
            totalWords: session.queue.length,
            learnedWords: 0,
            requiredCorrect: requiredCorrect,
            results: { correct: 0, wrong: 0, fuzzy: 0, actions: 0 },
            wordState: {}
        };

        // Initialize word states
        for (const w of session.queue) {
            this.session.wordState[w.word] = 0;
        }

        this._prepareNextWord();
        return true;
    },

    _prepareNextWord() {
        if (this.session.queue.length === 0) {
            this.session.currentWord = null;
            return;
        }
        this.session.currentWord = this.session.queue[0];
    },

    getCurrentWord() {
        return this.session.currentWord;
    },

    // Handle when user confirms "记对了"
    async handleKnown() {
        if (!this.session.currentWord) return false;

        const word = this.session.currentWord.word;
        this.session.wordState[word] = (this.session.wordState[word] || 0) + 1;
        this.session.results.correct++;
        this.session.results.actions++;

        const currentObj = this.session.queue.shift();

        if (this.session.wordState[word] >= this.session.requiredCorrect) {
            // Word mastered — update server
            this.session.learnedWords++;
            await API.markWord(word, 'known');
        } else {
            // Not fully learned yet, put it back later in queue
            if (this.session.queue.length <= 3) {
                this.session.queue.push(currentObj);
            } else {
                const insertPos = Math.min(this.session.queue.length - 1, Math.floor(Math.random() * 3) + 3);
                this.session.queue.splice(insertPos, 0, currentObj);
            }
        }

        this._prepareNextWord();
        return this.isSessionComplete();
    },

    async handleUnknown() {
        if (!this.session.currentWord) return;

        const wordObj = this.session.currentWord;
        const word = wordObj.word;

        this.session.wordState[word] = 0;
        this.session.results.wrong++;
        this.session.results.actions++;

        await API.markWord(word, 'unknown');

        this.session.queue.shift();
        this.session.queue.push(wordObj);

        this._prepareNextWord();
    },

    async handleFuzzy() {
        if (!this.session.currentWord) return;

        const wordObj = this.session.currentWord;
        const word = wordObj.word;

        this.session.wordState[word] = 0;
        this.session.results.fuzzy++;
        this.session.results.actions++;

        await API.markWord(word, 'fuzzy');

        this.session.queue.shift();
        if (this.session.queue.length <= 2) {
            this.session.queue.push(wordObj);
        } else {
            const insertPos = Math.min(this.session.queue.length - 1, Math.floor(Math.random() * 3) + 2);
            this.session.queue.splice(insertPos, 0, wordObj);
        }

        this._prepareNextWord();
    },

    isSessionComplete() {
        return this.session.queue.length === 0;
    }
};

// ===== Study UI Functions =====

let _pendingChoice = null; // 'known', 'fuzzy', 'unknown'

// Show word count picker before starting study
async function startStudy() {
    await WordBank.refreshBanks();
    const selectedBanks = await WordBank.getSelectedBanks();
    if (selectedBanks.length === 0) {
        showToast('请先选择词库');
        navigateTo('wordbank');
        return;
    }

    // Get progress to know how many new words available
    const progress = await Study.getProgress(true);
    const settings = await API.getSettings();
    const dailyGoal = settings.dailyNewWords || 20;
    const alreadyDone = progress.today ? progress.today.newWords : 0;

    // Get new words count - load words and count unstudied
    let allWords = [];
    for (const bankId of selectedBanks) {
        const result = await API.getBankWords(bankId, 0, 100000);
        if (result.words) allWords = allWords.concat(result.words);
    }
    const studyDataCount = progress.learned || 0;
    const remaining = Math.max(0, allWords.length - studyDataCount);

    const options = [5, 10, 15, 20, 30, 50];
    const optionBtns = options.map(n => {
        const disabled = n > remaining ? 'disabled' : '';
        return `<button class="word-count-option ${n === dailyGoal ? 'recommended' : ''}"
                  onclick="confirmStartStudy(${Math.min(n, remaining)})" ${disabled}>
                  ${n}
                  ${n === dailyGoal ? '<span class="word-count-tag">日常</span>' : ''}
                </button>`;
    }).join('');

    const modalHTML = `
    <div class="modal-overlay show" id="word-count-modal" onclick="closeWordCountModal(event)">
      <div class="modal-content" onclick="event.stopPropagation()" style="max-width:400px;">
        <div class="modal-handle"></div>
        <div class="text-center">
          <div style="font-size:48px;margin-bottom:8px;">📖</div>
          <h2 style="margin-bottom:4px;">选择学习数量</h2>
          <p class="text-secondary" style="font-size:13px; margin-bottom:6px;">
            今日已学 <strong style="color:var(--primary);">${alreadyDone}</strong> 个，
            剩余 <strong>${remaining}</strong> 个新词
          </p>
          <div class="word-count-grid">
            ${optionBtns}
          </div>
          <div style="margin-top:14px; display:flex; align-items:center; gap:8px; justify-content:center;">
            <span class="text-secondary" style="font-size:13px;">自定义：</span>
            <input type="number" id="custom-word-count" class="form-input"
                   style="width:80px; padding:8px 12px; text-align:center; font-size:16px; font-weight:600;"
                   min="1" max="${remaining}" value="${Math.min(dailyGoal, remaining)}"
                   onkeydown="if(event.key==='Enter') confirmStartStudyCustom()">
            <button class="btn btn-primary btn-sm" onclick="confirmStartStudyCustom()">开始</button>
          </div>
          <button class="btn btn-secondary btn-block mt-16" onclick="closeWordCountModal()">取消</button>
        </div>
      </div>
    </div>
  `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

async function confirmStartStudy(count) {
    closeWordCountModal();
    const success = await Study.startSession('learn', count);
    if (!success) return;
    navigateTo('study');
    showCurrentWord();
}

function confirmStartStudyCustom() {
    const input = document.getElementById('custom-word-count');
    let count = parseInt(input.value);
    if (isNaN(count) || count < 1) {
        showToast('请输入有效数字');
        return;
    }
    confirmStartStudy(count);
}

function closeWordCountModal(e) {
    if (e && e.target !== e.currentTarget) return;
    const modal = document.getElementById('word-count-modal');
    if (modal) modal.remove();
}

async function startReview() {
    const success = await Study.startSession('review');
    if (!success) return;
    navigateTo('study');
    showCurrentWord();
}

function showCurrentWord() {
    const word = Study.getCurrentWord();
    if (!word) {
        finishSession();
        return;
    }

    _pendingChoice = null;

    const card = document.getElementById('study-card');
    card.classList.remove('flipped');

    document.getElementById('study-word').textContent = word.word;
    document.getElementById('study-phonetic').textContent = word.phonetic || '';
    document.getElementById('study-word-back').textContent = word.word;
    document.getElementById('study-phonetic-back').textContent = word.phonetic || '';
    document.getElementById('study-translation').textContent = word.translation || '';
    document.getElementById('study-example').textContent = word.example || '';

    // Clear AI content
    document.getElementById('ai-area').innerHTML = '';

    // Show initial 3-button actions, hide confirm
    document.getElementById('study-actions').style.display = 'grid';
    document.getElementById('study-confirm-actions').style.display = 'none';

    // Update progress
    const total = Study.session.totalWords;
    const learned = Study.session.learnedWords;
    document.getElementById('study-progress').textContent = `${learned} / ${total}`;

    // Visual indicators (dots) for required correct
    const required = Study.session.requiredCorrect;
    const state = Study.session.wordState[word.word] || 0;
    let dotsHtml = '';
    for (let i = 0; i < required; i++) {
        dotsHtml += `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; margin:0 2px; background:${i < state ? 'var(--success)' : 'var(--bg-tertiary)'}"></span>`;
    }
    const hintEl = document.querySelector('.study-tap-hint');
    if (hintEl) {
        hintEl.innerHTML = `<div style="margin-bottom:8px">${dotsHtml}</div>点击卡片查看释义`;
    }

    document.getElementById('study-progress-bar').style.width = `${(learned / total) * 100}%`;
}

function flipCard() {
    const card = document.getElementById('study-card');
    card.classList.toggle('flipped');
}

// Phase 1: User makes initial choice
function markWord(choice) {
    _pendingChoice = choice;

    const card = document.getElementById('study-card');
    if (!card.classList.contains('flipped')) {
        card.classList.add('flipped');
    }

    // Hide initial 3 buttons, show confirm 2 buttons
    document.getElementById('study-actions').style.display = 'none';
    document.getElementById('study-confirm-actions').style.display = 'grid';

    // Try to auto-load AI content if available
    if (typeof getAIAssist === 'function' && AI.isConfigured()) {
        const word = Study.getCurrentWord();
        if (word) {
            const cached = AI.getCachedContent(word.word);
            if (cached) {
                const aiArea = document.getElementById('ai-area');
                showAIContent(aiArea, cached.content, 0, true, cached.cachedAt);
            }
        }
    }
}

// Phase 2: User confirms
async function confirmMark(correct) {
    if (!_pendingChoice) return;

    let isComplete = false;
    if (correct) {
        isComplete = await Study.handleKnown();
    } else {
        if (_pendingChoice === 'fuzzy') {
            await Study.handleFuzzy();
        } else {
            await Study.handleUnknown();
        }
    }

    _pendingChoice = null;

    if (isComplete) {
        finishSession();
    } else {
        showCurrentWord();
    }
}

async function finishSession() {
    const results = Study.session.results;
    const learned = Study.session.learnedWords;
    const totalActions = results.actions;
    const mode = Study.session.mode;

    const progress = await Study.getProgress(true);
    const hasReviewWords = progress.reviewReady > 0;
    const hasMoreWords = mode === 'learn';

    const continueReviewBtn = hasReviewWords ? `
        <button class="btn btn-block btn-lg mt-8" onclick="closeFinishModal(); startReview();"
                style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none;">
          🔄 复习单词 (${progress.reviewReady}个)
        </button>` : '';

    const continueLearnBtn = hasMoreWords ? `
        <button class="btn btn-block mt-8" onclick="closeFinishModal(); startStudy();"
                style="background: var(--primary); color: white; border: none;">
          🔥 继续学新词
        </button>` : '';

    const fuzzyInfo = results.fuzzy > 0 ? `
            <div class="stat-card">
              <div class="stat-value" style="color:var(--warning);">${results.fuzzy}</div>
              <div class="stat-label">点模糊</div>
            </div>` : '';

    const modalHTML = `
    <div class="modal-overlay show" id="finish-modal" onclick="closeFinishModal(event)">
      <div class="modal-content" onclick="event.stopPropagation()">
        <div class="modal-handle"></div>
        <div class="text-center">
          <div style="font-size:64px;margin-bottom:16px;">🎉</div>
          <h2 style="margin-bottom:8px;">本组完成！</h2>
          <p class="text-secondary" style="margin-bottom:24px;">
            ${mode === 'learn' ? '新学' : '复习'}了 ${learned} 个单词
          </p>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value text-success">${results.correct}</div>
              <div class="stat-label">记对了</div>
            </div>
            ${fuzzyInfo}
            <div class="stat-card">
              <div class="stat-value text-danger">${results.wrong}</div>
              <div class="stat-label">记错了</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${totalActions > 0 ? Math.round((results.correct / totalActions) * 100) : 0}%</div>
              <div class="stat-label">正确率</div>
            </div>
          </div>
          ${continueReviewBtn}
          ${continueLearnBtn}
          <button class="btn btn-secondary btn-block mt-8" onclick="closeFinishModal(); navigateTo('home');">
            返回首页
          </button>
        </div>
      </div>
    </div>
  `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function closeFinishModal(e) {
    if (e && e.target !== e.currentTarget) return;
    const modal = document.getElementById('finish-modal');
    if (modal) modal.remove();
    updateHomeStats();
}

function exitStudy() {
    navigateTo('home');
    updateHomeStats();
}

// ===== KEY FIX: O(1) home stats via server API =====
async function updateHomeStats() {
    try {
        const progress = await Study.getProgress(true);
        const settings = progress.settings || {};

        // Learned count
        document.getElementById('stat-learned').textContent = progress.learned || 0;

        // Review count — from server pre-computed index (O(1)!)
        document.getElementById('stat-review').textContent = progress.reviewReady || 0;

        // Mastered count
        document.getElementById('stat-mastered').textContent = progress.mastered || 0;

        // Streak
        const streak = progress.streak || { count: 0 };
        document.getElementById('streak-badge').textContent = `🔥 连续 ${streak.count} 天`;

        // Today progress
        const todayCount = progress.today || { newWords: 0, reviewed: 0 };
        const dailyLimit = settings.dailyNewWords || 20;
        const todayTotal = todayCount.newWords;
        const progressPct = Math.min(100, (todayTotal / dailyLimit) * 100);
        const overGoal = todayTotal > dailyLimit;
        document.getElementById('today-progress-text').textContent = overGoal
            ? `${todayTotal} / ${dailyLimit} 🔥 超额完成！`
            : `${todayTotal} / ${dailyLimit}`;
        document.getElementById('today-progress-bar').style.width = `${progressPct}%`;
        if (overGoal) {
            document.getElementById('today-progress-bar').style.background = 'linear-gradient(90deg, #34C759, #30D158)';
        } else {
            document.getElementById('today-progress-bar').style.background = '';
        }

        // Review badge
        const badge = document.getElementById('review-count-badge');
        if (progress.reviewReady > 0) {
            badge.textContent = `(${progress.reviewReady})`;
        } else {
            badge.textContent = '';
        }

        // Greeting
        const hour = new Date().getHours();
        let greeting;
        if (hour < 6) greeting = '夜深了，注意休息 🌙';
        else if (hour < 12) greeting = '早安，开始学习吧 ☀️';
        else if (hour < 18) greeting = '下午好，继续加油 💪';
        else greeting = '晚上好，坚持学习 📚';
        document.getElementById('home-greeting').textContent = greeting;
    } catch (e) {
        console.error('updateHomeStats error:', e);
    }
}
