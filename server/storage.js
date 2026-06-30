// WordWise Storage Layer — JSON file-based persistence
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_DIR = path.join(DATA_DIR, 'users');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Ensure directories exist
function ensureDirs() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });
}
ensureDirs();

// Default config
const DEFAULT_CONFIG = {
    port: 3000,
    defaultReviewBatchSize: 100,
    adminUsers: []
};

// Default user data template
function defaultUserData(username, passwordHash) {
    return {
        username,
        passwordHash,
        isAdmin: false,
        createdAt: Date.now(),
        studyData: {},       // { word: { stage, correctCount, wrongCount, fuzzyCount, firstSeen, lastReviewed, nextReviewDate } }
        aiCache: {},         // { word: { content, cachedAt, provider, model } }
        settings: {
            provider: 'siliconflow',
            apiKey: '',
            model: 'Qwen/Qwen2.5-7B-Instruct',
            customUrl: '',
            customPrompt: '',
            dailyNewWords: 20,
            requiredCorrect: 2,
            sortMode: 'frequency',
            preheatCount: 20,
            theme: 'light'
        },
        today: { newWords: 0, reviewed: 0, date: new Date().toISOString().split('T')[0] },
        streak: { count: 0, lastDate: '' },
        selectedBanks: ['recommended'],
        usage: { totalTokens: 0, callCount: 0 },
        session: null,
        reviewIndex: []      // Pre-computed list of words due for review today
    };
}

// ===== Config =====
function readConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error reading config:', e.message);
    }
    // Write default config
    writeConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
}

function writeConfig(config) {
    const tmp = CONFIG_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
    fs.renameSync(tmp, CONFIG_FILE);
}

// ===== User Operations =====
function userFile(username) {
    return path.join(USERS_DIR, username + '.json');
}

function userExists(username) {
    return fs.existsSync(userFile(username));
}

function readUser(username) {
    try {
        if (userExists(username)) {
            return JSON.parse(fs.readFileSync(userFile(username), 'utf8'));
        }
    } catch (e) {
        console.error('Error reading user:', username, e.message);
    }
    return null;
}

function writeUser(username, data) {
    const tmp = userFile(username) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, userFile(username));
}

function createUser(username, passwordHash) {
    const data = defaultUserData(username, passwordHash);
    // First user is auto-admin
    const config = readConfig();
    if (!config.adminUsers || config.adminUsers.length === 0) {
        data.isAdmin = true;
        config.adminUsers = [username];
        writeConfig(config);
    }
    writeUser(username, data);
    return data;
}

function listUsers() {
    try {
        return fs.readdirSync(USERS_DIR)
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
    } catch (e) {
        return [];
    }
}

// ===== Review Index =====
function updateReviewIndex(username, userData) {
    if (!userData) {
        userData = readUser(username);
        if (!userData) return [];
    }

    const today = new Date().toISOString().split('T')[0];
    const INTERVALS = [1, 2, 4, 7, 15, 30];

    // Only recompute if date changed or study data changed
    const todayRecord = userData.today || {};
    if (todayRecord.reviewIndexDate === today && userData.reviewIndex && userData.reviewIndex.length > 0) {
        return userData.reviewIndex;
    }

    // Scan study data for words due today
    const reviewWords = [];
    for (const [word, record] of Object.entries(userData.studyData || {})) {
        if (record.nextReviewDate && record.nextReviewDate <= today && record.stage < INTERVALS.length) {
            reviewWords.push(word);
        }
    }

    userData.reviewIndex = reviewWords;
    if (!userData.today) userData.today = {};
    userData.today.reviewIndexDate = today;
    writeUser(username, userData);
    return reviewWords;
}

module.exports = {
    readConfig,
    writeConfig,
    userExists,
    readUser,
    writeUser,
    createUser,
    listUsers,
    updateReviewIndex,
    USERS_DIR,
    DATA_DIR
};
