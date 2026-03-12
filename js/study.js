// ===== Study Module — Core Learning + Ebbinghaus Spaced Repetition =====

const Study = {
    DATA_KEY_PREFIX: 'wordwise_study_',
    STREAK_KEY_PREFIX: 'wordwise_streak_',
    TODAY_KEY_PREFIX: 'wordwise_today_',

    // Ebbinghaus intervals (in days)
    INTERVALS: [1, 2, 4, 7, 15, 30],

    // Current study session
    session: {
        words: [],
        currentIndex: 0,
        mode: 'learn', // 'learn' or 'review'
        results: { correct: 0, wrong: 0 }
    },

    getDataKey() {
        return this.DATA_KEY_PREFIX + Auth.getUsername();
    },

    getStreakKey() {
        return this.STREAK_KEY_PREFIX + Auth.getUsername();
    },

    getTodayKey() {
        return this.TODAY_KEY_PREFIX + Auth.getUsername();
    },

    // Get all study records for current user
    getStudyData() {
        const data = localStorage.getItem(this.getDataKey());
        return data ? JSON.parse(data) : {};
    },

    saveStudyData(data) {
        localStorage.setItem(this.getDataKey(), JSON.stringify(data));
    },

    // Get today's date string
    getToday() {
        return new Date().toISOString().split('T')[0];
    },

    // Get today's study count
    getTodayCount() {
        const today = this.getToday();
        const data = localStorage.getItem(this.getTodayKey());
        if (!data) return { newWords: 0, reviewed: 0, date: today };
        const parsed = JSON.parse(data);
        if (parsed.date !== today) return { newWords: 0, reviewed: 0, date: today };
        return parsed;
    },

    saveTodayCount(count) {
        localStorage.setItem(this.getTodayKey(), JSON.stringify(count));
    },

    incrementTodayCount(type) {
        const count = this.getTodayCount();
        count.date = this.getToday();
        if (type === 'new') count.newWords++;
        else count.reviewed++;
        this.saveTodayCount(count);
    },

    // Streak management
    getStreak() {
        const data = localStorage.getItem(this.getStreakKey());
        if (!data) return { count: 0, lastDate: null };
        return JSON.parse(data);
    },

    updateStreak() {
        const streak = this.getStreak();
        const today = this.getToday();

        if (streak.lastDate === today) return streak;

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (streak.lastDate === yesterdayStr) {
            streak.count++;
        } else if (streak.lastDate !== today) {
            streak.count = 1;
        }
        streak.lastDate = today;
        localStorage.setItem(this.getStreakKey(), JSON.stringify(streak));
        return streak;
    },

    // Calculate next review date based on stage
    getNextReviewDate(stage) {
        const interval = this.INTERVALS[Math.min(stage, this.INTERVALS.length - 1)];
        const next = new Date();
        next.setDate(next.getDate() + interval);
        return next.toISOString().split('T')[0];
    },

    // Get words that need review today
    getReviewWords(allWords) {
        const studyData = this.getStudyData();
        const today = this.getToday();
        const reviewWords = [];

        for (const word of allWords) {
            const record = studyData[word.word];
            if (record && record.nextReviewDate && record.nextReviewDate <= today && record.stage < this.INTERVALS.length) {
                reviewWords.push(word);
            }
        }

        return reviewWords;
    },

    // Get new words (not yet learned)
    getNewWords(allWords) {
        const studyData = this.getStudyData();
        return allWords.filter(w => !studyData[w.word]);
    },

    // Get mastered words (completed all review stages)
    getMasteredCount() {
        const studyData = this.getStudyData();
        return Object.values(studyData).filter(r => r.stage >= this.INTERVALS.length).length;
    },

    // Mark a word as known/unknown
    markWord(word, known) {
        const studyData = this.getStudyData();
        let record = studyData[word];

        if (!record) {
            record = {
                stage: 0,
                correctCount: 0,
                wrongCount: 0,
                firstSeen: this.getToday(),
                nextReviewDate: null
            };
        }

        if (known) {
            record.stage++;
            record.correctCount++;
            record.nextReviewDate = this.getNextReviewDate(record.stage);
        } else {
            record.stage = 0;
            record.wrongCount++;
            record.nextReviewDate = this.getNextReviewDate(0);
        }

        record.lastReviewed = this.getToday();
        studyData[word] = record;
        this.saveStudyData(studyData);
    },

    // Start a new study session — wordCount is user-chosen, no hard limit
    async startSession(mode, wordCount) {
        const allWords = await WordBank.loadSelectedWords();
        if (allWords.length === 0) {
            showToast('请先选择词库');
            navigateTo('wordbank');
            return false;
        }

        let words;
        if (mode === 'review') {
            words = this.getReviewWords(allWords);
            if (words.length === 0) {
                showToast('暂无需要复习的单词 🎉');
                return false;
            }
            // Shuffle review words
            words = words.sort(() => Math.random() - 0.5);
        } else {
            // Learn mode: get new words, no hard daily limit
            const newWords = this.getNewWords(allWords);
            if (newWords.length === 0) {
                showToast('所有单词都已学过！');
                return false;
            }

            // Use user-chosen count, default to 20, cap by available words
            const count = wordCount || 20;
            words = newWords.slice(0, count);
        }

        this.session = {
            words,
            currentIndex: 0,
            mode,
            results: { correct: 0, wrong: 0 }
        };

        return true;
    },

    getCurrentWord() {
        if (this.session.currentIndex >= this.session.words.length) return null;
        return this.session.words[this.session.currentIndex];
    },

    nextWord() {
        this.session.currentIndex++;
        return this.getCurrentWord();
    },

    isSessionComplete() {
        return this.session.currentIndex >= this.session.words.length;
    }
};

// ===== Study UI Functions =====

// Show word count picker before starting study
async function startStudy() {
    const allWords = await WordBank.loadSelectedWords();
    if (allWords.length === 0) {
        showToast('请先选择词库');
        navigateTo('wordbank');
        return;
    }

    const newWords = Study.getNewWords(allWords);
    if (newWords.length === 0) {
        showToast('所有单词都已学过！');
        return;
    }

    const todayCount = Study.getTodayCount();
    const dailyGoal = parseInt(localStorage.getItem('wordwise_daily_new') || '20');
    const alreadyDone = todayCount.newWords;
    const remaining = newWords.length;

    // Build option buttons
    const options = [5, 10, 15, 20, 30, 50];
    const optionBtns = options.map(n => {
        const disabled = n > remaining ? 'disabled' : '';
        const label = n <= remaining ? n : n;
        return `<button class="word-count-option ${n === dailyGoal ? 'recommended' : ''}" 
                  onclick="confirmStartStudy(${Math.min(n, remaining)})" ${disabled}>
                  ${label}
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

    // Update progress
    const total = Study.session.words.length;
    const current = Study.session.currentIndex + 1;
    document.getElementById('study-progress').textContent = `${current} / ${total}`;
    document.getElementById('study-progress-bar').style.width = `${(current / total) * 100}%`;
}

function flipCard() {
    const card = document.getElementById('study-card');
    card.classList.toggle('flipped');
}

function markWord(known) {
    const word = Study.getCurrentWord();
    if (!word) return;

    Study.markWord(word.word, known);

    if (known) {
        Study.session.results.correct++;
    } else {
        Study.session.results.wrong++;
    }

    // Update streak
    Study.updateStreak();

    // Update today's count
    if (Study.session.mode === 'learn') {
        Study.incrementTodayCount('new');
    } else {
        Study.incrementTodayCount('review');
    }

    // Next word
    Study.nextWord();
    if (Study.isSessionComplete()) {
        finishSession();
    } else {
        showCurrentWord();
    }
}

async function finishSession() {
    const results = Study.session.results;
    const total = results.correct + results.wrong;
    const mode = Study.session.mode;

    // Check if there are more new words available for "continue learning"
    let hasMoreWords = false;
    if (mode === 'learn') {
        const allWords = await WordBank.loadSelectedWords();
        const newWords = Study.getNewWords(allWords);
        hasMoreWords = newWords.length > 0;
    }

    // Check if there are review words available
    let hasReviewWords = false;
    const allWordsForReview = await WordBank.loadSelectedWords();
    const reviewWords = Study.getReviewWords(allWordsForReview);
    hasReviewWords = reviewWords.length > 0;

    const continueBtn = hasMoreWords ? `
        <button class="btn btn-block btn-lg mt-8" onclick="closeFinishModal(); startStudy();" 
                style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none;">
          🔥 继续学习
        </button>` : '';

    const reviewBtn = hasReviewWords ? `
        <button class="btn btn-secondary btn-block mt-8" onclick="closeFinishModal(); startReview();">
          🔄 去复习 (${reviewWords.length}个)
        </button>` : '';

    const modalHTML = `
    <div class="modal-overlay show" id="finish-modal" onclick="closeFinishModal(event)">
      <div class="modal-content" onclick="event.stopPropagation()">
        <div class="modal-handle"></div>
        <div class="text-center">
          <div style="font-size:64px;margin-bottom:16px;">🎉</div>
          <h2 style="margin-bottom:8px;">学习完成！</h2>
          <p class="text-secondary" style="margin-bottom:24px;">
            ${mode === 'learn' ? '新学' : '复习'}了 ${total} 个单词
          </p>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value text-success">${results.correct}</div>
              <div class="stat-label">认识</div>
            </div>
            <div class="stat-card">
              <div class="stat-value text-danger">${results.wrong}</div>
              <div class="stat-label">不认识</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${total > 0 ? Math.round((results.correct / total) * 100) : 0}%</div>
              <div class="stat-label">正确率</div>
            </div>
          </div>
          ${continueBtn}
          ${reviewBtn}
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

async function updateHomeStats() {
    const allWords = await WordBank.loadSelectedWords();
    const studyData = Study.getStudyData();
    const streak = Study.getStreak();
    const todayCount = Study.getTodayCount();
    const dailyLimit = parseInt(localStorage.getItem('wordwise_daily_new') || '20');

    // Learned count
    const learnedCount = Object.keys(studyData).length;
    document.getElementById('stat-learned').textContent = learnedCount;

    // Review count
    const reviewWords = Study.getReviewWords(allWords);
    document.getElementById('stat-review').textContent = reviewWords.length;

    // Mastered count
    document.getElementById('stat-mastered').textContent = Study.getMasteredCount();

    // Streak
    document.getElementById('streak-badge').textContent = `🔥 连续 ${streak.count} 天`;

    // Today progress — shows progress beyond daily goal too
    const todayTotal = todayCount.newWords;
    const progressPct = Math.min(100, (todayTotal / dailyLimit) * 100);
    const overGoal = todayTotal > dailyLimit;
    document.getElementById('today-progress-text').textContent = overGoal
        ? `${todayTotal} / ${dailyLimit} 🔥 超额完成！`
        : `${todayTotal} / ${dailyLimit}`;
    document.getElementById('today-progress-bar').style.width = `${progressPct}%`;
    // Change color when exceeded goal
    if (overGoal) {
        document.getElementById('today-progress-bar').style.background = 'linear-gradient(90deg, #34C759, #30D158)';
    } else {
        document.getElementById('today-progress-bar').style.background = '';
    }

    // Review badge
    const badge = document.getElementById('review-count-badge');
    if (reviewWords.length > 0) {
        badge.textContent = `(${reviewWords.length})`;
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
}
