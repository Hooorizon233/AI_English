// ===== AI API Multi-Platform Adapter =====

const AI = {
    SETTINGS_KEY_PREFIX: 'wordwise_ai_',
    USAGE_KEY_PREFIX: 'wordwise_usage_',
    CACHE_KEY_PREFIX: 'wordwise_aicache_',

    // Provider configurations
    providers: {
        siliconflow: {
            name: '硅基流动 (推荐)',
            endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
            defaultModel: 'Qwen/Qwen2.5-7B-Instruct'
        },
        gemini: {
            name: 'Google Gemini',
            endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
            defaultModel: 'gemini-2.0-flash'
        },
        openai: {
            name: 'OpenAI',
            endpoint: 'https://api.openai.com/v1/chat/completions',
            defaultModel: 'gpt-4o-mini'
        },
        qwen: {
            name: '通义千问',
            endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            defaultModel: 'qwen-plus'
        },
        doubao: {
            name: '豆包',
            endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
            defaultModel: 'doubao-pro-32k'
        },
        deepseek: {
            name: 'DeepSeek',
            endpoint: 'https://api.deepseek.com/v1/chat/completions',
            defaultModel: 'deepseek-chat'
        },
        moonshot: {
            name: 'Moonshot (Kimi)',
            endpoint: 'https://api.moonshot.cn/v1/chat/completions',
            defaultModel: 'moonshot-v1-8k'
        },
        zhipu: {
            name: '智谱 GLM',
            endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
            defaultModel: 'glm-4.7-flash'
        },
        custom: {
            name: '自定义',
            endpoint: '',
            defaultModel: ''
        }
    },

    getSettingsKey() {
        return this.SETTINGS_KEY_PREFIX + Auth.getUsername();
    },

    getUsageKey() {
        return this.USAGE_KEY_PREFIX + Auth.getUsername();
    },

    getCacheKey() {
        return this.CACHE_KEY_PREFIX + Auth.getUsername();
    },

    getSettings() {
        const data = localStorage.getItem(this.getSettingsKey());
        return data ? JSON.parse(data) : {
            provider: 'siliconflow',
            apiKey: '',
            customUrl: '',
            model: ''
        };
    },

    saveSettings(settings) {
        localStorage.setItem(this.getSettingsKey(), JSON.stringify(settings));
    },

    getUsage() {
        const data = localStorage.getItem(this.getUsageKey());
        return data ? JSON.parse(data) : { totalTokens: 0, callCount: 0 };
    },

    addUsage(tokens) {
        const usage = this.getUsage();
        usage.totalTokens += tokens;
        usage.callCount++;
        localStorage.setItem(this.getUsageKey(), JSON.stringify(usage));
        return usage;
    },

    // ===== AI Cache System =====
    getCache() {
        const data = localStorage.getItem(this.getCacheKey());
        return data ? JSON.parse(data) : {};
    },

    saveCache(cache) {
        localStorage.setItem(this.getCacheKey(), JSON.stringify(cache));
    },

    getCachedContent(word) {
        const cache = this.getCache();
        return cache[word] || null;
    },

    setCachedContent(word, content) {
        const cache = this.getCache();
        cache[word] = {
            content: content,
            cachedAt: new Date().toISOString(),
            provider: this.getSettings().provider,
            model: this.getModel()
        };
        this.saveCache(cache);
    },

    deleteCachedContent(word) {
        const cache = this.getCache();
        delete cache[word];
        this.saveCache(cache);
    },

    getCacheStats() {
        const cache = this.getCache();
        const count = Object.keys(cache).length;
        // Estimate size
        const sizeStr = JSON.stringify(cache);
        const sizeKB = (new Blob([sizeStr]).size / 1024).toFixed(1);
        return { count, sizeKB };
    },

    clearCache() {
        localStorage.removeItem(this.getCacheKey());
    },

    isGemini() {
        return this.getSettings().provider === 'gemini';
    },

    getEndpoint() {
        const settings = this.getSettings();
        if (settings.provider === 'custom') {
            return settings.customUrl;
        }
        if (settings.provider === 'gemini') {
            const model = this.getModel();
            return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`;
        }
        return this.providers[settings.provider]?.endpoint || '';
    },

    getModel() {
        const settings = this.getSettings();
        return settings.model || this.providers[settings.provider]?.defaultModel || '';
    },

    // Get appropriate max_tokens for the current provider/model
    getMaxTokens(defaultVal) {
        const model = this.getModel();
        // GLM-4.5/4.7 series require max_tokens >= 1024
        if (model && (model.startsWith('glm-4.5') || model.startsWith('glm-4.7') || model.startsWith('glm-4v'))) {
            return Math.max(defaultVal || 1024, 1024);
        }
        return defaultVal || 1000;
    },

    isConfigured() {
        const settings = this.getSettings();
        if (settings.provider === 'gemini') {
            return !!settings.apiKey;
        }
        return !!settings.apiKey && !!this.getEndpoint();
    },

    // Build the AI prompt for word memorization
    buildPrompt(word) {
        return `你是一位专业的英语词汇教学专家，擅长用多种创意方法帮助学生记忆英语单词。请针对单词 "${word}" 从以下角度提供详细的记忆辅助：

**1. 📝 词根词缀拆解**
拆解这个单词的词根、前缀、后缀，解释每部分的含义和来源。如果没有明显词根词缀，可以分析其构词方式。

**2. 📜 词源故事**
追溯这个词的历史起源（拉丁语/希腊语/古英语等），讲一个有趣的词源小故事，让人印象深刻。

**3. 🧩 联想记忆**
提供 1-2 个生动有趣的联想记忆法或谐音记忆法（可以用中文谐音、画面联想、故事联想等方式），要求有趣好记。

**4. 🔄 词族扩展**
列出与该词相关的 3-5 个派生词（如名词、动词、形容词形式），并简要标注词性和释义。

**5. 💬 地道例句**
给出 2 个贴近日常生活或考试场景的例句，中英对照。

**6. ⚠️ 易混淆辨析**
指出 1-2 个容易与该词混淆的单词，简要说明区别。

请用中文回答，格式清晰美观，内容简洁但有料，重点是要让人"过目不忘"。`;
    },

    // Call AI API (with cache support)
    async getWordAssist(word, skipCache = false) {
        if (!this.isConfigured()) {
            return { ok: false, msg: '请先在设置中配置 AI API' };
        }

        // Check cache first (unless explicitly skipping)
        if (!skipCache) {
            const cached = this.getCachedContent(word);
            if (cached) {
                return { ok: true, content: cached.content, tokens: 0, fromCache: true, cachedAt: cached.cachedAt };
            }
        }

        // Gemini uses a different API format
        let result;
        if (this.isGemini()) {
            result = await this._callGemini(this.buildPrompt(word));
        } else {
            result = await this._callOpenAICompatible(word);
        }

        // Save to cache on success
        if (result.ok) {
            this.setCachedContent(word, result.content);
        }

        return result;
    },

    // OpenAI-compatible API call (SiliconFlow, OpenAI, Qwen, DeepSeek, etc.)
    async _callOpenAICompatible(word) {
        const settings = this.getSettings();
        const endpoint = this.getEndpoint();
        const model = this.getModel();

        const requestBody = {
            model: model,
            messages: [
                {
                    role: 'system',
                    content: '你是一位专业的英语词汇教学专家，善于用词根分析、词源故事、联想记忆等多种方法帮助学生高效记忆英语单词。回答要简洁有趣，格式清晰。'
                },
                {
                    role: 'user',
                    content: this.buildPrompt(word)
                }
            ],
            temperature: 0.7,
            max_tokens: this.getMaxTokens(1000)
        };

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const errMsg = errData.error?.message || errData.message || `HTTP ${response.status}`;
                return { ok: false, msg: `API 错误: ${errMsg}` };
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';
            const tokens = data.usage?.total_tokens || 0;

            if (tokens > 0) {
                this.addUsage(tokens);
            }

            return { ok: true, content, tokens };
        } catch (err) {
            if (err.name === 'TypeError' && err.message.includes('fetch')) {
                return {
                    ok: false,
                    msg: '网络请求失败，可能是 CORS 限制。建议：\n1. 使用支持浏览器直连的 API\n2. 配置 CORS 代理\n3. 检查 API 端点是否正确'
                };
            }
            return { ok: false, msg: `请求失败: ${err.message}` };
        }
    },

    // Gemini-specific API call
    async _callGemini(prompt) {
        const endpoint = this.getEndpoint();

        const requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: prompt }]
                }
            ],
            systemInstruction: {
                parts: [{ text: '你是一位专业的英语词汇教学专家，善于用词根分析、词源故事、联想记忆等多种方法帮助学生高效记忆英语单词。回答要简洁有趣，格式清晰。' }]
            },
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1000
            }
        };

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const errMsg = errData.error?.message || `HTTP ${response.status}`;
                return { ok: false, msg: `API 错误: ${errMsg}` };
            }

            const data = await response.json();
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const tokens = (data.usageMetadata?.promptTokenCount || 0) + (data.usageMetadata?.candidatesTokenCount || 0);

            if (tokens > 0) {
                this.addUsage(tokens);
            }

            return { ok: true, content, tokens };
        } catch (err) {
            return { ok: false, msg: `请求失败: ${err.message}` };
        }
    },

    // ===== Batch Pre-generation =====
    _batchState: {
        running: false,
        total: 0,
        completed: 0,
        failed: 0,
        cancelled: false
    },

    cancelBatchGeneration() {
        this._batchState.cancelled = true;
    },

    async batchPreGenerate(words, onProgress) {
        if (this._batchState.running) {
            return { ok: false, msg: '正在生成中，请等待...' };
        }

        if (!this.isConfigured()) {
            return { ok: false, msg: '请先在设置中配置 AI API' };
        }

        // Filter out words that already have cache
        const cache = this.getCache();
        const uncachedWords = words.filter(w => !cache[w.word]);

        if (uncachedWords.length === 0) {
            return { ok: true, msg: '所有单词已经生成完毕！', skipped: words.length };
        }

        this._batchState = {
            running: true,
            total: uncachedWords.length,
            completed: 0,
            failed: 0,
            cancelled: false
        };

        if (onProgress) onProgress({ ...this._batchState, currentWord: '', skipped: words.length - uncachedWords.length });

        for (const wordObj of uncachedWords) {
            if (this._batchState.cancelled) break;

            if (onProgress) onProgress({ ...this._batchState, currentWord: wordObj.word });

            const result = await this.getWordAssist(wordObj.word);

            if (result.ok) {
                this._batchState.completed++;
            } else {
                this._batchState.failed++;
            }

            if (onProgress) onProgress({ ...this._batchState, currentWord: wordObj.word });

            // Rate limit: wait between requests to avoid overwhelming the API
            if (!this._batchState.cancelled) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }

        this._batchState.running = false;
        const finalState = { ...this._batchState };
        return {
            ok: true,
            msg: this._batchState.cancelled
                ? `已取消。成功 ${finalState.completed} 个，失败 ${finalState.failed} 个`
                : `完成！成功 ${finalState.completed} 个，失败 ${finalState.failed} 个`,
            ...finalState
        };
    },

    // Test API connection
    async testConnection() {
        if (!this.isConfigured()) {
            return { ok: false, msg: '请先填写 API 密钥' };
        }

        // Gemini test
        if (this.isGemini()) {
            try {
                const endpoint = this.getEndpoint();
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: 'Hi, reply OK' }] }],
                        generationConfig: { maxOutputTokens: 10 }
                    })
                });
                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    return { ok: false, msg: `连接失败: ${errData.error?.message || response.status}` };
                }
                const data = await response.json();
                if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    return { ok: true, msg: '连接成功 ✓' };
                }
                return { ok: false, msg: '响应格式异常' };
            } catch (err) {
                return { ok: false, msg: `连接失败: ${err.message}` };
            }
        }

        // OpenAI-compatible test
        const settings = this.getSettings();
        const endpoint = this.getEndpoint();
        const model = this.getModel();

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: 'user', content: 'Hi, just testing. Reply with "OK".' }],
                    max_tokens: this.getMaxTokens(10)
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const errMsg = errData.error?.message || errData.message || `HTTP ${response.status}`;
                return { ok: false, msg: `连接失败: ${errMsg}` };
            }

            const data = await response.json();
            if (data.choices?.[0]?.message?.content) {
                return { ok: true, msg: '连接成功 ✓' };
            }

            return { ok: false, msg: '响应格式异常' };
        } catch (err) {
            return { ok: false, msg: `连接失败: ${err.message}` };
        }
    }
};

// ===== AI UI Functions =====

async function getAIAssist(forceRefresh = false) {
    const word = Study.getCurrentWord();
    if (!word) return;

    if (!AI.isConfigured()) {
        showToast('请先在设置中配置 AI API');
        return;
    }

    const aiArea = document.getElementById('ai-area');

    // Check cache first for instant display
    if (!forceRefresh) {
        const cached = AI.getCachedContent(word.word);
        if (cached) {
            showAIContent(aiArea, cached.content, 0, true, cached.cachedAt);
            return;
        }
    }

    aiArea.innerHTML = `
    <div class="ai-content">
      <div class="ai-loading">
        <div class="spinner"></div>
        <span>AI 正在分析...</span>
      </div>
    </div>
  `;

    // Make sure card is flipped to show AI content
    const card = document.getElementById('study-card');
    if (!card.classList.contains('flipped')) {
        card.classList.add('flipped');
    }

    const result = await AI.getWordAssist(word.word, forceRefresh);

    if (result.ok) {
        showAIContent(aiArea, result.content, result.tokens, result.fromCache, result.cachedAt);
        updateUsageDisplay();
    } else {
        aiArea.innerHTML = `
      <div class="ai-content" style="border-color:rgba(255,59,48,0.2);background:rgba(255,59,48,0.05);">
        <div class="ai-content-header" style="color:var(--danger);">
          ❌ 请求失败
        </div>
        <div class="ai-content-body" style="color:var(--text-secondary);">${result.msg}</div>
      </div>
    `;
    }
}

function showAIContent(aiArea, content, tokens, fromCache, cachedAt) {
    // Simple markdown-like formatting
    let formatted = content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

    const cacheInfo = fromCache
        ? `<span class="ai-cache-badge" title="来自缓存，点击刷新可重新生成">⚡ 缓存</span>`
        : '';
    const tokenInfo = tokens ? `<span class="text-secondary" style="font-size:11px;">消耗 ${tokens} tokens</span>` : '';

    aiArea.innerHTML = `
      <div class="ai-content">
        <div class="ai-content-header">
          ✨ AI 辅助记忆
          <span style="margin-left:auto; display:flex; align-items:center; gap:6px;">
            ${cacheInfo}
            ${tokenInfo}
            <button class="btn-icon-sm" onclick="getAIAssist(true)" title="重新生成" style="font-size:14px; cursor:pointer; background:none; border:none; padding:2px 4px; border-radius:4px;">🔄</button>
          </span>
        </div>
        <div class="ai-content-body">${formatted}</div>
      </div>
    `;
}

function updateUsageDisplay() {
    const usage = AI.getUsage();
    const tokenEl = document.getElementById('token-usage');
    const callEl = document.getElementById('api-call-count');
    if (tokenEl) tokenEl.textContent = usage.totalTokens.toLocaleString();
    if (callEl) callEl.textContent = usage.callCount.toLocaleString();

    // Update cache stats
    const cacheStats = AI.getCacheStats();
    const cacheCountEl = document.getElementById('cache-count');
    const cacheSizeEl = document.getElementById('cache-size');
    if (cacheCountEl) cacheCountEl.textContent = cacheStats.count;
    if (cacheSizeEl) cacheSizeEl.textContent = cacheStats.sizeKB + ' KB';
}

// ===== Batch Pre-generation UI =====

async function startBatchPreGenerate() {
    if (!AI.isConfigured()) {
        showToast('请先在设置中配置 AI API');
        return;
    }

    const allWords = await WordBank.loadSelectedWords();
    if (allWords.length === 0) {
        showToast('请先选择词库');
        return;
    }

    // Get the words that will be studied next (new words or review words)
    const studyData = Study.getStudyData();
    const dailyLimit = parseInt(localStorage.getItem('wordwise_daily_new') || '20');

    // Combine: next batch of new words + today's review words
    const newWords = allWords.filter(w => !studyData[w.word]).slice(0, dailyLimit);
    const reviewWords = Study.getReviewWords(allWords);

    // De-duplicate targets just in case
    const targetMap = new Map();
    [...newWords, ...reviewWords].forEach(w => targetMap.set(w.word, w));
    const targetWords = Array.from(targetMap.values());

    if (targetWords.length === 0) {
        showToast('没有需要预热的单词');
        return;
    }

    // Check how many already cached
    const cache = AI.getCache();
    const uncachedCount = targetWords.filter(w => !cache[w.word]).length;

    if (uncachedCount === 0) {
        showToast('所有待学单词已预热完毕 ✅');
        return;
    }

    // Show the batch modal
    showBatchModal(targetWords, uncachedCount);
}

function showBatchModal(words, uncachedCount) {
    const totalCount = words.length;
    const cachedCount = totalCount - uncachedCount;

    const modalHTML = `
    <div class="modal-overlay show" id="batch-modal" onclick="closeBatchModal(event)">
      <div class="modal-content" onclick="event.stopPropagation()" style="max-width:400px;">
        <div class="modal-handle"></div>
        <div class="text-center">
          <div style="font-size:48px;margin-bottom:12px;">🚀</div>
          <h2 style="margin-bottom:8px;">批量预热 AI 内容</h2>
          <p class="text-secondary" style="margin-bottom:20px; font-size:13px;">
            提前生成待学单词的 AI 内容，学习时秒出结果
          </p>
          <div class="stats-grid" style="margin-bottom:20px;">
            <div class="stat-card">
              <div class="stat-value">${totalCount}</div>
              <div class="stat-label">待学单词</div>
            </div>
            <div class="stat-card">
              <div class="stat-value text-success">${cachedCount}</div>
              <div class="stat-label">已缓存</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" style="color:var(--primary);">${uncachedCount}</div>
              <div class="stat-label">需生成</div>
            </div>
          </div>
          <div id="batch-progress-area" style="display:none; margin-bottom:16px;">
            <div class="progress-bar" style="margin-bottom:8px;">
              <div class="progress-fill" id="batch-progress-bar" style="width:0%;transition:width 0.3s ease;"></div>
            </div>
            <p class="text-secondary" style="font-size:12px;" id="batch-status-text">准备中...</p>
          </div>
          <button class="btn btn-primary btn-block btn-lg" id="batch-start-btn" onclick="executeBatchPreGenerate()">
            ⚡ 开始预热 (约${Math.ceil(uncachedCount * 2 / 60)}分钟)
          </button>
          <button class="btn btn-danger btn-block" id="batch-cancel-btn" style="display:none;" onclick="cancelBatchPreGenerate()">
            ⏹ 停止
          </button>
          <button class="btn btn-secondary btn-block mt-8" id="batch-close-btn" onclick="closeBatchModal()">
            关闭
          </button>
        </div>
      </div>
    </div>
  `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Store words for use in executeBatchPreGenerate
    window._batchWords = words;
}

async function executeBatchPreGenerate() {
    const words = window._batchWords;
    if (!words) return;

    const startBtn = document.getElementById('batch-start-btn');
    const cancelBtn = document.getElementById('batch-cancel-btn');
    const closeBtn = document.getElementById('batch-close-btn');
    const progressArea = document.getElementById('batch-progress-area');

    startBtn.style.display = 'none';
    cancelBtn.style.display = '';
    closeBtn.style.display = 'none';
    progressArea.style.display = '';

    const result = await AI.batchPreGenerate(words, (state) => {
        const progressBar = document.getElementById('batch-progress-bar');
        const statusText = document.getElementById('batch-status-text');

        if (progressBar && statusText) {
            const done = state.completed + state.failed;
            const pct = state.total > 0 ? Math.round((done / state.total) * 100) : 0;
            progressBar.style.width = `${pct}%`;
            statusText.textContent = `正在生成: ${state.currentWord}  (${done}/${state.total})  ✅${state.completed} ❌${state.failed}`;
        }
    });

    // Done
    const progressBar = document.getElementById('batch-progress-bar');
    const statusText = document.getElementById('batch-status-text');
    if (progressBar) progressBar.style.width = '100%';
    if (statusText) statusText.textContent = result.msg;

    cancelBtn.style.display = 'none';
    closeBtn.style.display = '';

    // Update cache display
    updateUsageDisplay();
    showToast(result.msg);
}

function cancelBatchPreGenerate() {
    AI.cancelBatchGeneration();
    showToast('正在停止...');
}

function closeBatchModal(e) {
    if (e && e.target !== e.currentTarget) return;
    const modal = document.getElementById('batch-modal');
    if (modal) modal.remove();
    window._batchWords = null;
}
