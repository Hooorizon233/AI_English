// WordWise API Client — replaces all localStorage calls with server requests
const API = (() => {
    const BASE = '';  // Same origin

    let _username = '';
    let _isAdmin = false;

    function setAuth(username, isAdmin) {
        _username = username;
        _isAdmin = isAdmin || false;
    }

    function getUsername() {
        return _username;
    }

    function isAdmin() {
        return _isAdmin;
    }

    async function request(method, path, body) {
        const headers = {
            'Content-Type': 'application/json',
            'X-Username': _username
        };
        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        try {
            const resp = await fetch(BASE + path, options);
            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`HTTP ${resp.status}: ${text}`);
            }
            return await resp.json();
        } catch (e) {
            console.error('API Error:', path, e.message);
            return { ok: false, msg: '网络错误: ' + e.message };
        }
    }

    // ===== Auth =====
    async function login(username, password) {
        const result = await request('POST', '/api/auth/login', { username, password });
        if (result.ok) {
            _username = username;
            _isAdmin = result.isAdmin;
        }
        return result;
    }

    async function register(username, password) {
        const result = await request('POST', '/api/auth/register', { username, password });
        if (result.ok) {
            _username = username;
            _isAdmin = result.isAdmin;
        }
        return result;
    }

    async function changePassword(oldPassword, newPassword) {
        return request('POST', '/api/auth/change-password', { oldPassword, newPassword });
    }

    // ===== Word Banks =====
    async function getBanks() {
        const result = await request('GET', '/api/banks');
        return result.ok ? result.banks : [];
    }

    async function getBankWords(bankId, offset = 0, limit = 10000) {
        const result = await request('GET', `/api/banks/${bankId}/words?offset=${offset}&limit=${limit}`);
        if (result.ok) {
            return { words: result.words, total: result.total };
        }
        return { words: [], total: 0 };
    }

    // ===== Study =====
    async function getProgress() {
        const result = await request('GET', '/api/study/progress');
        return result.ok ? result : {
            ok: true, learned: 0, reviewReady: 0, mastered: 0,
            streak: { count: 0, lastDate: '' },
            today: { newWords: 0, reviewed: 0 },
            settings: {}
        };
    }

    async function startStudy(mode, count) {
        return request('POST', '/api/study/start', { mode, count });
    }

    async function markWord(word, result) {
        return request('POST', '/api/study/mark', { word, result });
    }

    async function saveSession(session) {
        if (!session) return;
        return request('PUT', '/api/study/session', { session });
    }

    async function deleteSession() {
        return request('DELETE', '/api/study/session');
    }

    // ===== Settings =====
    async function getSettings() {
        const result = await request('GET', '/api/settings');
        return result.ok ? result.settings : {};
    }

    async function saveSettings(settings) {
        return request('PUT', '/api/settings', settings);
    }

    // ===== AI =====
    async function getAICache(word) {
        const result = await request('GET', `/api/ai/cache/${encodeURIComponent(word)}`);
        return result.ok ? result.data : null;
    }

    async function generateAI(word) {
        return request('POST', '/api/ai/generate', { word });
    }

    async function getAIStats() {
        const result = await request('GET', '/api/ai/stats');
        return result.ok ? result : { cacheCount: 0, cacheSize: 0, usage: { totalTokens: 0, callCount: 0 } };
    }

    async function clearAICache() {
        return request('DELETE', '/api/ai/cache');
    }

    // ===== Notebook =====
    async function getNotebook(filter = 'all', search = '', page = 1, limit = 50) {
        const params = new URLSearchParams({ filter, search, page, limit });
        return request('GET', `/api/notebook?${params}`);
    }

    // ===== Migration =====
    async function migrate(localStorageData) {
        return request('POST', '/api/migrate', { localStorageData });
    }

    async function getMigrateStatus() {
        const result = await request('GET', '/api/migrate/status');
        return result.ok ? result.needsMigration : false;
    }

    // ===== Admin =====
    async function getAdminUsers() {
        return request('GET', '/api/admin/users');
    }

    async function resetUser(username) {
        return request('POST', `/api/admin/users/${encodeURIComponent(username)}/reset`);
    }

    async function getAdminConfig() {
        return request('GET', '/api/admin/config');
    }

    async function saveAdminConfig(config) {
        return request('PUT', '/api/admin/config', config);
    }

    async function getAdminStats() {
        return request('GET', '/api/admin/stats');
    }

    // ===== Utility: collect localStorage for migration =====
    function collectLocalStorage(username) {
        const data = {};
        const prefixes = [
            'wordwise_users', 'wordwise_session',
            'wordwise_study_', 'wordwise_session_', 'wordwise_today_',
            'wordwise_streak_', 'wordwise_wordbanks_', 'wordwise_ai_',
            'wordwise_usage_', 'wordwise_aicache_',
            'wordwise_daily_new', 'wordwise_required_correct',
            'wordwise_sort_mode', 'wordwise_preheat_count', 'wordwise_theme'
        ];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            for (const prefix of prefixes) {
                if (key.startsWith(prefix)) {
                    data[key] = localStorage.getItem(key);
                    break;
                }
            }
        }
        return data;
    }

    return {
        setAuth,
        getUsername,
        isAdmin,
        login,
        register,
        changePassword,
        getBanks,
        getBankWords,
        getProgress,
        startStudy,
        markWord,
        saveSession,
        deleteSession,
        getSettings,
        saveSettings,
        getAICache,
        generateAI,
        getAIStats,
        clearAICache,
        getNotebook,
        migrate,
        getMigrateStatus,
        getAdminUsers,
        resetUser,
        getAdminConfig,
        saveAdminConfig,
        getAdminStats,
        collectLocalStorage
    };
})();
