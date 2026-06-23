// WordWise API Routes
const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const storage = require('./storage');
const https = require('https');
const http = require('http');

const router = express.Router();

// ===== Middleware =====
// Simple token-based auth: token = username (for single-user desktop use)
function requireAuth(req, res, next) {
    const username = req.headers['x-username'] || req.query.username;
    if (!username || !storage.userExists(username)) {
        return res.status(401).json({ ok: false, msg: '请先登录' });
    }
    req.username = username;
    req.userData = storage.readUser(username);
    next();
}

function requireAdmin(req, res, next) {
    if (!req.userData || !req.userData.isAdmin) {
        return res.status(403).json({ ok: false, msg: '需要管理员权限' });
    }
    next();
}

// ===== Auth Routes =====
router.post('/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.json({ ok: false, msg: '用户名和密码不能为空' });
        }
        if (username.length < 2 || username.length > 30) {
            return res.json({ ok: false, msg: '用户名长度2-30个字符' });
        }
        if (password.length < 4) {
            return res.json({ ok: false, msg: '密码至少4个字符' });
        }
        if (storage.userExists(username)) {
            return res.json({ ok: false, msg: '用户名已存在' });
        }

        const hash = await bcrypt.hash(password, 10);
        const userData = storage.createUser(username, hash);
        res.json({
            ok: true,
            username,
            isAdmin: userData.isAdmin,
            msg: '注册成功'
        });
    } catch (e) {
        console.error('Register error:', e);
        res.json({ ok: false, msg: '注册失败: ' + e.message });
    }
});

router.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.json({ ok: false, msg: '用户名和密码不能为空' });
        }
        const userData = storage.readUser(username);
        if (!userData) {
            return res.json({ ok: false, msg: '用户不存在' });
        }

        const valid = await bcrypt.compare(password, userData.passwordHash);
        if (!valid) {
            return res.json({ ok: false, msg: '密码错误' });
        }

        res.json({
            ok: true,
            username,
            isAdmin: userData.isAdmin,
            msg: '登录成功'
        });
    } catch (e) {
        console.error('Login error:', e);
        res.json({ ok: false, msg: '登录失败: ' + e.message });
    }
});

router.post('/auth/change-password', requireAuth, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const valid = await bcrypt.compare(oldPassword, req.userData.passwordHash);
        if (!valid) {
            return res.json({ ok: false, msg: '原密码错误' });
        }
        req.userData.passwordHash = await bcrypt.hash(newPassword, 10);
        storage.writeUser(req.username, req.userData);
        res.json({ ok: true, msg: '密码修改成功' });
    } catch (e) {
        res.json({ ok: false, msg: '修改失败: ' + e.message });
    }
});

// ===== Word Bank Routes =====
const BANKS = [
    { id: 'recommended', name: '推荐词汇', desc: '精选推荐词汇，含音标与释义', icon: '⭐', color: '#FF9500' },
    { id: 'kaoyan_core', name: '考研核心词', desc: '考研高频必考词汇', icon: '🔥', color: '#FF3B30' },
    { id: 'kaoyan_important', name: '考研重点词', desc: '考研中高频核心词汇', icon: '⭐️', color: '#FF9500' },
    { id: 'kaoyan_basic', name: '考研基础词', desc: '考研中低频基础词汇', icon: '📚', color: '#34C759' },
    { id: 'cet4', name: 'CET-4', desc: '大学英语四级核心词汇', icon: '🎓', color: '#007AFF' },
    { id: 'cet6', name: 'CET-6', desc: '大学英语六级核心词汇', icon: '🏆', color: '#5856D6' },
    { id: 'toefl', name: 'TOEFL', desc: '托福考试核心词汇', icon: '🌍', color: '#34C759' },
    { id: 'ielts', name: 'IELTS', desc: '雅思考试核心词汇', icon: '✈️', color: '#FF2D55' },
    { id: 'gre', name: 'GRE', desc: 'GRE 考试高频词汇', icon: '🧠', color: '#AF52DE' },
    { id: 'vocabulary_notes', name: '词汇笔记', desc: '从笔记照片 OCR 提取的词汇', icon: '📷', color: '#FF6B6B' }
];

// Cache word banks in memory
const bankCache = {};

function loadBankFromFile(bankId) {
    if (bankCache[bankId]) return bankCache[bankId];

    const jsonPath = path.join(__dirname, '..', 'data', bankId + '.json');
    if (fs.existsSync(jsonPath)) {
        try {
            const words = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            bankCache[bankId] = words;
            return words;
        } catch (e) {
            console.error('Error loading bank:', bankId, e.message);
        }
    }
    return [];
}

router.get('/banks', (req, res) => {
    const banksWithCount = BANKS.map(b => {
        const words = loadBankFromFile(b.id);
        return { ...b, wordCount: words.length };
    }).filter(b => b.wordCount > 0);
    res.json({ ok: true, banks: banksWithCount });
});

router.get('/banks/:id/words', (req, res) => {
    const { id } = req.params;
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 100;

    const bank = BANKS.find(b => b.id === id);
    if (!bank) {
        return res.json({ ok: false, msg: '词库不存在' });
    }

    const allWords = loadBankFromFile(id);
    const words = allWords.slice(offset, offset + limit);

    res.json({
        ok: true,
        bank: { ...bank, wordCount: allWords.length },
        total: allWords.length,
        offset,
        limit,
        words
    });
});

// ===== Study Routes =====
function getSelectedWords(username) {
    const userData = storage.readUser(username);
    const selectedBanks = userData.selectedBanks || ['recommended'];
    let allWords = [];
    for (const bankId of selectedBanks) {
        const words = loadBankFromFile(bankId);
        allWords = allWords.concat(words);
    }
    // Deduplicate by word
    const seen = new Set();
    return allWords.filter(w => {
        const key = w.word.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

router.get('/study/progress', requireAuth, (req, res) => {
    const userData = req.userData;
    const studyData = userData.studyData || {};
    const today = new Date().toISOString().split('T')[0];
    const INTERVALS = [0, 1, 3, 7, 15, 30];

    const learnedCount = Object.keys(studyData).length;

    // Use pre-computed review index if available and fresh
    let reviewWords;
    const todayRecord = userData.today || {};
    if (todayRecord.reviewIndexDate === today && userData.reviewIndex) {
        reviewWords = userData.reviewIndex;
    } else {
        reviewWords = storage.updateReviewIndex(req.username, userData);
    }

    const masteredCount = Object.values(studyData).filter(r => r.stage >= INTERVALS.length).length;

    // Today's count
    let newWordsToday = 0, reviewedToday = 0;
    if (todayRecord.date === today) {
        newWordsToday = todayRecord.newWords || 0;
        reviewedToday = todayRecord.reviewed || 0;
    }

    // Streak
    const streak = userData.streak || { count: 0, lastDate: '' };

    res.json({
        ok: true,
        learned: learnedCount,
        reviewReady: reviewWords.length,
        mastered: masteredCount,
        streak,
        today: { newWords: newWordsToday, reviewed: reviewedToday, date: today },
        settings: userData.settings || {}
    });
});

router.post('/study/start', requireAuth, (req, res) => {
    const { mode, count } = req.body;
    const batchSize = count || req.userData.settings?.reviewBatchSize || 100;

    let words = [];
    const allWords = getSelectedWords(req.username);
    const studyData = req.userData.studyData || {};
    const today = new Date().toISOString().split('T')[0];
    const INTERVALS = [0, 1, 3, 7, 15, 30];

    if (mode === 'review') {
        // Use pre-computed review index
        let reviewWords;
        const todayRecord = req.userData.today || {};
        if (todayRecord.reviewIndexDate === today && req.userData.reviewIndex) {
            reviewWords = req.userData.reviewIndex;
        } else {
            reviewWords = storage.updateReviewIndex(req.username, req.userData);
        }

        // Map review word strings back to word objects
        const wordMap = {};
        for (const w of allWords) wordMap[w.word.toLowerCase()] = w;

        words = reviewWords
            .slice(0, batchSize)
            .map(w => wordMap[w.toLowerCase()])
            .filter(Boolean);
    } else {
        // Learn mode — new words not yet studied
        const sortMode = req.userData.settings?.sortMode || 'frequency';

        let newWords = allWords.filter(w => !studyData[w.word]);

        // Sort
        if (sortMode === 'frequency') {
            newWords.sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
        } else if (sortMode === 'random') {
            newWords.sort(() => Math.random() - 0.5);
        } else {
            newWords.sort((a, b) => (a.word || '').localeCompare(b.word || ''));
        }

        words = newWords.slice(0, batchSize);
    }

    // Create session
    const session = {
        mode,
        queue: words,
        learnedWords: 0,
        totalWords: words.length,
        startedAt: Date.now()
    };

    // Save session to user data
    req.userData.session = session;
    storage.writeUser(req.username, req.userData);

    res.json({
        ok: true,
        session,
        wordsRemaining: mode === 'review'
            ? (req.userData.reviewIndex || []).length - words.length
            : 0
    });
});

router.post('/study/mark', requireAuth, (req, res) => {
    const { word, result } = req.body; // result: 'known' | 'unknown' | 'fuzzy'
    const studyData = req.userData.studyData || {};
    const today = new Date().toISOString().split('T')[0];
    const INTERVALS = [0, 1, 3, 7, 15, 30];
    const REQUIRED_CORRECT = req.userData.settings?.requiredCorrect || 2;

    let record = studyData[word];
    if (!record) {
        record = {
            stage: 0,
            correctCount: 0,
            wrongCount: 0,
            fuzzyCount: 0,
            firstSeen: today,
            lastReviewed: today,
            nextReviewDate: today
        };
    }

    if (result === 'known') {
        record.correctCount++;
        if (record.correctCount >= REQUIRED_CORRECT && record.stage < INTERVALS.length) {
            record.stage++;
        }
    } else if (result === 'unknown') {
        record.wrongCount++;
        record.stage = Math.max(0, record.stage - 1);
    } else if (result === 'fuzzy') {
        record.fuzzyCount++;
    }

    // Calculate next review date
    const interval = INTERVALS[Math.min(record.stage, INTERVALS.length - 1)] || 30;
    const next = new Date();
    next.setDate(next.getDate() + interval);
    record.nextReviewDate = next.toISOString().split('T')[0];
    record.lastReviewed = today;

    studyData[word] = record;
    req.userData.studyData = studyData;

    // Update today's count
    if (!req.userData.today || req.userData.today.date !== today) {
        req.userData.today = { newWords: 0, reviewed: 0, date: today };
    }
    req.userData.today.reviewed++;

    // Update streak
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (!req.userData.streak) req.userData.streak = { count: 0, lastDate: '' };
    if (req.userData.streak.lastDate === yesterdayStr) {
        req.userData.streak.count++;
        req.userData.streak.lastDate = today;
    } else if (req.userData.streak.lastDate !== today) {
        req.userData.streak.count = 1;
        req.userData.streak.lastDate = today;
    }

    // Update session progress
    if (req.userData.session) {
        req.userData.session.learnedWords = (req.userData.session.learnedWords || 0) + 1;
    }

    // Save user data
    storage.writeUser(req.username, req.userData);

    // Invalidate review index (will be recomputed on next progress check)
    res.json({
        ok: true,
        record,
        session: req.userData.session
    });
});

router.put('/study/session', requireAuth, (req, res) => {
    req.userData.session = req.body.session;
    storage.writeUser(req.username, req.userData);
    res.json({ ok: true });
});

router.delete('/study/session', requireAuth, (req, res) => {
    req.userData.session = null;
    storage.writeUser(req.username, req.userData);
    res.json({ ok: true });
});

// ===== Settings Routes =====
router.get('/settings', requireAuth, (req, res) => {
    res.json({ ok: true, settings: req.userData.settings || {} });
});

router.put('/settings', requireAuth, (req, res) => {
    const newSettings = { ...req.userData.settings, ...req.body };
    req.userData.settings = newSettings;
    storage.writeUser(req.username, req.userData);
    res.json({ ok: true, settings: newSettings, msg: '设置已保存' });
});

// ===== AI Routes =====
router.get('/ai/cache/:word', requireAuth, (req, res) => {
    const cache = req.userData.aiCache || {};
    const entry = cache[req.params.word];
    res.json({ ok: true, cached: !!entry, data: entry || null });
});

router.post('/ai/generate', requireAuth, async (req, res) => {
    try {
        const { word } = req.body;
        if (!word) return res.json({ ok: false, msg: '缺少单词' });

        // Check cache first
        const cache = req.userData.aiCache || {};
        if (cache[word]) {
            return res.json({ ok: true, content: cache[word].content, cached: true });
        }

        // Get settings
        const settings = req.userData.settings || {};
        const provider = settings.provider || 'siliconflow';
        const apiKey = settings.apiKey || '';
        const model = settings.model || 'Qwen/Qwen2.5-7B-Instruct';

        if (!apiKey) {
            return res.json({ ok: false, msg: '请先在设置中配置 AI API 密钥' });
        }

        // Build prompt
        const PROMOTION = settings.customPrompt || `你是一位专业的英语词汇教学专家。请为以下英语单词生成详细的记忆辅助内容。

请用中文输出，格式如下：

## 词根词缀
分析该单词的词根、词缀及其含义

## 词源故事
追溯该单词的词源演变过程

## 联想记忆法
提供3-5种形象生动的联想记忆方法

## 同根词家族
列出至少5个同根词，每个标注中文含义

## 例句
提供3个包含该单词的地道英文例句，每个例句附中文翻译

## 易混词辨析
列出与该单词形式或含义相近的易混词，并进行辨析

请确保内容丰富、准确、实用，每个部分都要详细展开。`;

        const content = await callAI(apiKey, provider, model, PROMOTION, word, settings.customUrl);

        // Cache result
        if (!req.userData.aiCache) req.userData.aiCache = {};
        req.userData.aiCache[word] = {
            content,
            cachedAt: new Date().toISOString(),
            provider,
            model
        };

        // Update usage
        if (!req.userData.usage) req.userData.usage = { totalTokens: 0, callCount: 0 };
        req.userData.usage.callCount++;
        req.userData.usage.totalTokens += estimateTokens(content + PROMOTION + word);

        storage.writeUser(req.username, req.userData);

        res.json({ ok: true, content, cached: false });
    } catch (e) {
        console.error('AI generate error:', e);
        res.json({ ok: false, msg: 'AI 生成失败: ' + e.message });
    }
});

router.get('/ai/stats', requireAuth, (req, res) => {
    const cache = req.userData.aiCache || {};
    const usage = req.userData.usage || { totalTokens: 0, callCount: 0 };
    const cacheCount = Object.keys(cache).length;
    const cacheSize = JSON.stringify(cache).length;

    res.json({
        ok: true,
        cacheCount,
        cacheSize,
        usage
    });
});

router.delete('/ai/cache', requireAuth, (req, res) => {
    req.userData.aiCache = {};
    storage.writeUser(req.username, req.userData);
    res.json({ ok: true, msg: 'AI 缓存已清除' });
});

// ===== Notebook Routes =====
router.get('/notebook', requireAuth, (req, res) => {
    const studyData = req.userData.studyData || {};
    const filter = req.query.filter || 'all';
    const search = (req.query.search || '').toLowerCase();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const today = new Date().toISOString().split('T')[0];

    let entries = Object.entries(studyData).map(([word, record]) => ({
        word,
        ...record
    }));

    // Filter
    if (filter === 'mastered') {
        const INTERVALS = [0, 1, 3, 7, 15, 30];
        entries = entries.filter(e => e.stage >= INTERVALS.length);
    } else if (filter === 'learning') {
        entries = entries.filter(e => e.nextReviewDate && e.nextReviewDate >= today);
    } else if (filter === 'review') {
        entries = entries.filter(e => e.nextReviewDate && e.nextReviewDate <= today);
    }

    // Search
    if (search) {
        entries = entries.filter(e => e.word.toLowerCase().includes(search));
    }

    // Sort by lastReviewed desc
    entries.sort((a, b) => (b.lastReviewed || '').localeCompare(a.lastReviewed || ''));

    const total = entries.length;
    const offset = (page - 1) * limit;
    entries = entries.slice(offset, offset + limit);

    res.json({
        ok: true,
        total,
        page,
        limit,
        entries
    });
});

// ===== Migration Route =====
router.post('/migrate', requireAuth, (req, res) => {
    try {
        const { localStorageData } = req.body; // { key: value, ... }
        if (!localStorageData || typeof localStorageData !== 'object') {
            return res.json({ ok: false, msg: '无效的数据格式' });
        }

        const userData = req.userData;
        const imported = { studyRecords: 0, aiCache: 0, settings: false };

        for (const [key, value] of Object.entries(localStorageData)) {
            if (!value) continue;

            try {
                const parsed = JSON.parse(value);

                // Study data: wordwise_study_<user>
                if (key.includes('wordwise_study_')) {
                    userData.studyData = parsed;
                    imported.studyRecords = Object.keys(parsed).length;
                }
                // AI cache: wordwise_aicache_<user>
                else if (key.includes('wordwise_aicache_')) {
                    userData.aiCache = parsed;
                    imported.aiCache = Object.keys(parsed).length;
                }
                // AI settings: wordwise_ai_<user>
                else if (key.includes('wordwise_ai_')) {
                    userData.settings = { ...userData.settings, ...parsed };
                    imported.settings = true;
                }
                // Today: wordwise_today_<user>
                else if (key.includes('wordwise_today_')) {
                    userData.today = parsed;
                }
                // Streak: wordwise_streak_<user>
                else if (key.includes('wordwise_streak_')) {
                    userData.streak = parsed;
                }
                // Word banks: wordwise_wordbanks_<user>
                else if (key.includes('wordwise_wordbanks_')) {
                    userData.selectedBanks = parsed;
                }
                // Usage: wordwise_usage_<user>
                else if (key.includes('wordwise_usage_')) {
                    userData.usage = parsed;
                }
            } catch (e) {
                // Skip unparseable values
            }
        }

        // Also check for non-prefixed settings
        if (localStorageData.wordwise_daily_new) {
            userData.settings.dailyNewWords = parseInt(localStorageData.wordwise_daily_new) || 20;
        }
        if (localStorageData.wordwise_required_correct) {
            userData.settings.requiredCorrect = parseInt(localStorageData.wordwise_required_correct) || 2;
        }
        if (localStorageData.wordwise_sort_mode) {
            userData.settings.sortMode = localStorageData.wordwise_sort_mode;
        }
        if (localStorageData.wordwise_preheat_count) {
            userData.settings.preheatCount = parseInt(localStorageData.wordwise_preheat_count) || 20;
        }
        if (localStorageData.wordwise_theme) {
            userData.settings.theme = localStorageData.wordwise_theme;
        }

        storage.writeUser(req.username, userData);

        res.json({
            ok: true,
            msg: `迁移成功！导入 ${imported.studyRecords} 条学习记录，${imported.aiCache} 条 AI 缓存`,
            imported
        });
    } catch (e) {
        console.error('Migration error:', e);
        res.json({ ok: false, msg: '数据迁移失败: ' + e.message });
    }
});

router.get('/migrate/status', requireAuth, (req, res) => {
    const studyData = req.userData.studyData || {};
    const needsMigration = Object.keys(studyData).length === 0;
    res.json({ ok: true, needsMigration });
});

// ===== Admin Routes =====
router.get('/admin/users', requireAuth, requireAdmin, (req, res) => {
    const users = storage.listUsers().map(u => {
        const data = storage.readUser(u);
        const studyData = data.studyData || {};
        const aiCache = data.aiCache || {};
        return {
            username: u,
            isAdmin: data.isAdmin || false,
            createdAt: data.createdAt,
            studyRecords: Object.keys(studyData).length,
            aiCacheEntries: Object.keys(aiCache).length,
            streak: data.streak || { count: 0 },
            selectedBanks: data.selectedBanks || []
        };
    });
    res.json({ ok: true, users });
});

router.post('/admin/users/:username/reset', requireAuth, requireAdmin, (req, res) => {
    const targetUser = req.params.username;
    if (!storage.userExists(targetUser)) {
        return res.json({ ok: false, msg: '用户不存在' });
    }
    const data = storage.readUser(targetUser);
    data.studyData = {};
    data.aiCache = {};
    data.today = { newWords: 0, reviewed: 0, date: new Date().toISOString().split('T')[0] };
    data.streak = { count: 0, lastDate: '' };
    data.session = null;
    data.reviewIndex = [];
    storage.writeUser(targetUser, data);
    res.json({ ok: true, msg: `已重置 ${targetUser} 的学习数据` });
});

router.get('/admin/config', requireAuth, requireAdmin, (req, res) => {
    res.json({ ok: true, config: storage.readConfig() });
});

router.put('/admin/config', requireAuth, requireAdmin, (req, res) => {
    const config = { ...storage.readConfig(), ...req.body };
    storage.writeConfig(config);
    res.json({ ok: true, config, msg: '配置已更新' });
});

router.get('/admin/stats', requireAuth, requireAdmin, (req, res) => {
    const users = storage.listUsers();
    let totalStudyRecords = 0;
    let totalAiCache = 0;
    let totalStorage = 0;

    for (const username of users) {
        const data = storage.readUser(username);
        totalStudyRecords += Object.keys(data.studyData || {}).length;
        totalAiCache += Object.keys(data.aiCache || {}).length;
        try {
            const filePath = path.join(storage.USERS_DIR, username + '.json');
            totalStorage += fs.statSync(filePath).size;
        } catch (e) { }
    }

    res.json({
        ok: true,
        stats: {
            totalUsers: users.length,
            totalStudyRecords,
            totalAiCache,
            totalStorageBytes: totalStorage,
            totalStorageMB: (totalStorage / 1024 / 1024).toFixed(2),
            uptime: process.uptime()
        }
    });
});

// ===== AI API Call Helper =====
function callAI(apiKey, provider, model, systemPrompt, userMessage, customUrl) {
    return new Promise((resolve, reject) => {
        const providers = {
            siliconflow: { url: 'https://api.siliconflow.cn/v1/chat/completions' },
            openai: { url: 'https://api.openai.com/v1/chat/completions' },
            gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent' },
            qwen: { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' },
            doubao: { url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions' },
            deepseek: { url: 'https://api.deepseek.com/chat/completions' },
            moonshot: { url: 'https://api.moonshot.cn/v1/chat/completions' },
            zhipu: { url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' },
            custom: { url: customUrl || '' }
        };

        const apiUrl = provider === 'custom' ? customUrl : (providers[provider]?.url || providers.siliconflow.url);
        if (!apiUrl) {
            return reject(new Error('未配置 API 地址'));
        }

        // Gemini uses a different request format
        if (provider === 'gemini') {
            const body = JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt + '\n\n单词: ' + userMessage }] }]
            });
            const url = new URL(apiUrl + '?key=' + apiKey);
            const options = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
            };
            const req = https.request(url, options, (resp) => {
                let data = '';
                resp.on('data', c => data += c);
                resp.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.candidates?.[0]?.content?.parts?.[0]?.text || '');
                    } catch (e) { reject(new Error('解析响应失败')); }
                });
            });
            req.on('error', reject);
            req.write(body);
            req.end();
            return;
        }

        // Standard OpenAI-compatible format
        const body = JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: '单词: ' + userMessage }
            ],
            max_tokens: 2000,
            temperature: 0.7
        });

        const url = new URL(apiUrl);
        const lib = url.protocol === 'https:' ? https : http;
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            timeout: 30000
        };

        const req = lib.request(url, options, (resp) => {
            let data = '';
            resp.on('data', c => data += c);
            resp.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) return reject(new Error(json.error.message || 'API 错误'));
                    resolve(json.choices?.[0]?.message?.content || '');
                } catch (e) { reject(new Error('解析响应失败')); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function estimateTokens(text) {
    // Rough estimate: 1 token ≈ 2 Chinese chars or 4 English chars
    let tokens = 0;
    for (const char of text) {
        if (/[一-鿿]/.test(char)) tokens += 0.5;
        else if (/\s/.test(char)) tokens += 0.25;
        else tokens += 0.25;
    }
    return Math.ceil(tokens);
}

module.exports = router;
