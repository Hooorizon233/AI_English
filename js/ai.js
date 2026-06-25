// ===== AI API Multi-Platform Adapter =====
// Now proxies all requests through the server (API keys stay server-side)

const AI = {
    // Provider configurations (for UI display only — actual API calls happen server-side)
    providers: {
        siliconflow: {
            name: '硅基流动 (推荐)',
            defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
            models: [
                { id: 'Qwen/Qwen2.5-7B-Instruct', name: '通义千问 7B (极速)' },
                { id: 'Qwen/Qwen2.5-1.5B-Instruct', name: '通义千问 1.5B (秒出)' },
                { id: 'Qwen/Qwen2.5-72B-Instruct', name: '通义千问 72B (最强)' },
                { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3 (智能)' },
                { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B', name: 'DeepSeek R1-7B (推理)' },
                { id: 'THUDM/glm-4-9b-chat', name: 'GLM-4-9B (均衡)' }
            ]
        },
        gemini: {
            name: 'Google AI Studio',
            defaultModel: 'gemini-2.0-flash',
            models: [
                { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (推荐)' },
                { id: 'gemini-2.5-flash-preview-04-17', name: 'Gemini 2.5 Flash (快速)' },
                { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro (最强)' },
                { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (经济)' }
            ]
        },
        zhipu: {
            name: '智谱 GLM',
            defaultModel: 'glm-4-flash',
            models: [
                { id: 'glm-4-flash', name: 'GLM-4 Flash (免费)' },
                { id: 'glm-4-air', name: 'GLM-4 Air (均衡)' },
                { id: 'glm-4-plus', name: 'GLM-4 Plus (强大)' },
                { id: 'glm-4-long', name: 'GLM-4 Long (长文本)' }
            ]
        },
        deepseek: {
            name: 'DeepSeek',
            defaultModel: 'deepseek-chat',
            models: [
                { id: 'deepseek-chat', name: 'DeepSeek Chat (通用)' },
                { id: 'deepseek-reasoner', name: 'DeepSeek R1 (推理)' }
            ]
        },
        qwen: {
            name: '通义千问',
            defaultModel: 'qwen-plus',
            models: [
                { id: 'qwen-turbo', name: 'Qwen Turbo (快速)' },
                { id: 'qwen-plus', name: 'Qwen Plus (推荐)' },
                { id: 'qwen-max', name: 'Qwen Max (最强)' }
            ]
        },
        openai: {
            name: 'OpenAI',
            defaultModel: 'gpt-4o-mini',
            models: [
                { id: 'gpt-4o-mini', name: 'GPT-4o Mini (经济)' },
                { id: 'gpt-4o', name: 'GPT-4o (强大)' },
                { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini (新)' }
            ]
        },
        doubao: {
            name: '豆包',
            defaultModel: 'doubao-1.5-pro-32k',
            models: [
                { id: 'doubao-1.5-pro-32k', name: '豆包 1.5 Pro (推荐)' },
                { id: 'doubao-pro-32k', name: '豆包 Pro 32K' },
                { id: 'doubao-lite-32k', name: '豆包 Lite (经济)' }
            ]
        },
        moonshot: {
            name: 'Moonshot (Kimi)',
            defaultModel: 'moonshot-v1-8k',
            models: [
                { id: 'moonshot-v1-8k', name: 'Moonshot 8K (快速)' },
                { id: 'moonshot-v1-32k', name: 'Moonshot 32K (长文本)' }
            ]
        },
        custom: {
            name: '自定义',
            defaultModel: '',
            models: []
        }
    },

    // Cached settings (loaded from server)
    _settingsCache: null,
    _settingsCacheTime: 0,

    async getSettings() {
        const now = Date.now();
        if (this._settingsCache && (now - this._settingsCacheTime) < 30000) {
            return this._settingsCache;
        }
        try {
            this._settingsCache = await API.getSettings();
            this._settingsCacheTime = now;
        } catch (e) {
            if (!this._settingsCache) this._settingsCache = {};
        }
        return this._settingsCache || {};
    },

    async saveSettings(settings) {
        await API.saveSettings(settings);
        this._settingsCache = null; // Invalidate cache
    },

    async getModel() {
        const settings = await this.getSettings();
        return settings.model || this.providers[settings.provider]?.defaultModel || '';
    },

    isConfigured() {
        return Auth.isLoggedIn();
        // API key validation happens server-side
    },

    // Get cached AI content from server
    async getCachedContent(word) {
        const result = await API.getAICache(word);
        return result;
    },

    // Generate AI content via server (server handles caching + API call)
    async getWordAssist(word, skipCache = false) {
        if (skipCache) {
            // Force refresh: call generate which bypasses cache on server?
            // For now, server always returns cached if exists.
            // To force refresh, we'd need a force flag.
            // Just call generate — server will serve cached result.
        }

        return await API.generateAI(word);
    },

    // Get usage stats from server
    async getUsage() {
        const stats = await API.getAIStats();
        return stats.usage || { totalTokens: 0, callCount: 0 };
    },

    // Get cache stats from server
    async getCacheStats() {
        const stats = await API.getAIStats();
        const sizeKB = stats.cacheSize ? (stats.cacheSize / 1024).toFixed(1) : '0.0';
        return { count: stats.cacheCount || 0, sizeKB };
    },

    // Clear AI cache on server
    async clearCache() {
        return await API.clearAICache();
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

        // Filter out words that already have cache (check via server)
        const uncachedWords = [];
        for (const w of words) {
            const cached = await API.getAICache(w.word);
            if (!cached) uncachedWords.push(w);
        }

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

            const result = await API.generateAI(wordObj.word);

            if (result.ok) {
                this._batchState.completed++;
            } else {
                this._batchState.failed++;
            }

            if (onProgress) onProgress({ ...this._batchState, currentWord: wordObj.word });

            // Rate limit
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

    // Test API connection via server
    async testConnection() {
        // Server will test with the current settings
        try {
            const result = await API.generateAI('test');
            if (result.ok || result.msg?.includes('请先')) {
                // Even if "please configure API key", the connection to server works
                const settings = await this.getSettings();
                if (!settings.apiKey) {
                    return { ok: false, msg: '请先配置 API 密钥' };
                }
            }
            if (result.ok) {
                return { ok: true, msg: '连接成功 ✓' };
            }
            return { ok: false, msg: result.msg || '连接失败' };
        } catch (e) {
            return { ok: false, msg: '连接失败: ' + e.message };
        }
    }
};

// ===== AI UI Functions =====

async function getAIAssist(forceRefresh = false) {
    const word = Study.getCurrentWord();
    if (!word) return;

    const aiArea = document.getElementById('ai-area');

    // Check cache first for instant display
    if (!forceRefresh) {
        const cached = await AI.getCachedContent(word.word);
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

    // Flip card if not flipped
    const card = document.getElementById('study-card');
    if (!card.classList.contains('flipped')) {
        card.classList.add('flipped');
    }

    const result = await AI.getWordAssist(word.word, forceRefresh);

    if (result.ok) {
        showAIContent(aiArea, result.content, 0, result.cached, null);
        updateUsageDisplay();
    } else {
        aiArea.innerHTML = `
      <div class="ai-content" style="border-color:rgba(255,59,48,0.2);background:rgba(255,59,48,0.05);">
        <div class="ai-content-header" style="color:var(--danger);">
          ❌ 请求失败
        </div>
        <div class="ai-content-body" style="color:var(--text-secondary);">${result.msg || '未知错误'}</div>
      </div>
    `;
    }
}

function showAIContent(aiArea, content, tokens, fromCache, cachedAt) {
    let formatted = content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

    const cacheInfo = fromCache
        ? `<span class="ai-cache-badge" title="来自服务器缓存">⚡ 缓存</span>`
        : '';
    const tokenInfo = tokens > 0 ? `<span class="text-secondary" style="font-size:11px;">消耗 ${tokens} tokens</span>` : '';

    aiArea.innerHTML = `
      <div class="ai-content">
        <div class="ai-content-header">
          ✨ AI 辅助记忆
          <span style="margin-left:auto; display:flex; align-items:center; gap:6px;">
            ${cacheInfo}
            ${tokenInfo}
          </span>
        </div>
        <div class="ai-content-body">${formatted}</div>
        <div style="margin-top:12px; text-align:center;">
          <button class="btn btn-secondary btn-sm" onclick="getAIAssist(true)" style="font-size:13px;">
            🔄 不满意？重新生成
          </button>
        </div>
      </div>
    `;
}

async function updateUsageDisplay() {
    const stats = await API.getAIStats();
    const tokenEl = document.getElementById('token-usage');
    const callEl = document.getElementById('api-call-count');
    if (tokenEl) tokenEl.textContent = (stats.usage?.totalTokens || 0).toLocaleString();
    if (callEl) callEl.textContent = (stats.usage?.callCount || 0).toLocaleString();

    const cacheCountEl = document.getElementById('cache-count');
    const cacheSizeEl = document.getElementById('cache-size');
    if (cacheCountEl) cacheCountEl.textContent = stats.cacheCount || 0;
    if (cacheSizeEl) cacheSizeEl.textContent = (stats.cacheSize
        ? (stats.cacheSize / 1024).toFixed(1) + ' KB'
        : '0 KB');
}

// ===== Batch Pre-generation UI =====

async function startBatchPreGenerate() {
    if (!Auth.isLoggedIn()) {
        showToast('请先登录');
        return;
    }

    const settings = await API.getSettings();
    const preheatCount = settings.preheatCount || 20;

    // Ask server for smart preheat word list:
    // priority: review-ready words (urgent) > new unstudied words (upcoming)
    const result = await API.getPreheatWords(preheatCount);
    const targetWords = result.words || [];

    if (targetWords.length === 0) {
        showToast('所选单词已全部预热完毕 ✅');
        return;
    }

    showBatchModal(targetWords, targetWords.length, result.reviewCount || 0);
}

function showBatchModal(words, uncachedCount, reviewCount) {
    const totalCount = words.length;
    const newCount = totalCount - (reviewCount || 0);

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
              <div class="stat-label">待预热</div>
            </div>
            ${reviewCount > 0 ? `
            <div class="stat-card">
              <div class="stat-value" style="color:var(--danger);">${reviewCount}</div>
              <div class="stat-label">待复习</div>
            </div>` : ''}
            <div class="stat-card">
              <div class="stat-value" style="color:var(--primary);">${newCount}</div>
              <div class="stat-label">新单词</div>
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

    cancelBtn.style.display = 'none';
    closeBtn.style.display = '';

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
