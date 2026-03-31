// ===== Word Bank Module =====

const WordBank = {
    SELECTION_KEY_PREFIX: 'wordwise_wordbanks_',

    // Available word banks
    banks: [
        { id: 'recommended', name: '推荐词汇', desc: '精选推荐词汇，含音标与释义', icon: '⭐', color: '#FF9500' },
        { id: 'kaoyan_core', name: '考研核心词', desc: '考研高频必考词汇', icon: '🔥', color: '#FF3B30' },
        { id: 'kaoyan_important', name: '考研重点词', desc: '考研中高频核心词汇', icon: '⭐️', color: '#FF9500' },
        { id: 'kaoyan_basic', name: '考研基础词', desc: '考研中低频基础词汇', icon: '📚', color: '#34C759' },
        { id: 'cet4', name: 'CET-4', desc: '大学英语四级核心词汇', icon: '🎓', color: '#007AFF' },
        { id: 'cet6', name: 'CET-6', desc: '大学英语六级核心词汇', icon: '🏆', color: '#5856D6' },
        { id: 'toefl', name: 'TOEFL', desc: '托福考试核心词汇', icon: '🌍', color: '#34C759' },
        { id: 'ielts', name: 'IELTS', desc: '雅思考试核心词汇', icon: '✈️', color: '#FF2D55' },
        { id: 'gre', name: 'GRE', desc: 'GRE 考试高频词汇', icon: '🧠', color: '#AF52DE' }
    ],

    // Local cache
    loadedBanks: {},

    getSelectionKey() {
        return this.SELECTION_KEY_PREFIX + Auth.getUsername();
    },

    getSelectedBanks() {
        // Fallback backward compatibility for users who previously had 'kaoyan'
        const savedStr = localStorage.getItem(this.getSelectionKey());
        let saved = savedStr ? JSON.parse(savedStr) : [];
        if (saved.includes('kaoyan')) {
            saved = saved.filter(id => id !== 'kaoyan');
            if (!saved.includes('kaoyan_core')) saved.push('kaoyan_core');
            this.saveSelectedBanks(saved);
        }
        return saved;
    },

    saveSelectedBanks(bankIds) {
        localStorage.setItem(this.getSelectionKey(), JSON.stringify(bankIds));
    },

    async loadBank(bankId) {
        if (this.loadedBanks[bankId]) return this.loadedBanks[bankId];

        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = `data/${bankId}.js`;
            script.onload = () => {
                const words = window.WORDWISE_BANKS && window.WORDWISE_BANKS[bankId] ? window.WORDWISE_BANKS[bankId] : [];
                this.loadedBanks[bankId] = words;
                document.head.removeChild(script);
                resolve(words);
            };
            script.onerror = () => {
                console.error(`Error loading word bank ${bankId}`);
                resolve([]);
            };
            document.head.appendChild(script);
        });
    },

    async loadSelectedWords() {
        const selectedIds = this.getSelectedBanks();
        if (selectedIds.length === 0) return [];

        const allWords = [];
        const seen = new Set();

        for (const bankId of selectedIds) {
            const words = await loadBankWithFallback(bankId, this);
            for (const w of words) {
                if (!seen.has(w.word)) {
                    seen.add(w.word);
                    allWords.push(w);
                }
            }
        }

        // Apply sort mode
        const sortMode = localStorage.getItem('wordwise_sort_mode') || 'frequency';
        if (sortMode === 'frequency') {
            allWords.sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
        } else if (sortMode === 'random') {
            // Stable shuffle based on date seed
            const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const seed = parseInt(dateStr);
            this._seededShuffle(allWords, seed);
        } else if (sortMode === 'alphabetical') {
            allWords.sort((a, b) => a.word.localeCompare(b.word));
        }

        return allWords;
    },

    // Simple Fisher-Yates shuffle with a seed
    _seededShuffle(array, seed) {
        let m = array.length, t, i;
        while (m) {
            // Pseudo-random generator based on seed
            seed = (seed * 9301 + 49297) % 233280;
            const rnd = seed / 233280;

            i = Math.floor(rnd * m--);
            t = array[m];
            array[m] = array[i];
            array[i] = t;
        }
        return array;
    },

    renderBankList() {
        const container = document.getElementById('wordbank-list');
        const selected = this.getSelectedBanks();

        container.innerHTML = this.banks.map(bank => {
            const isSelected = selected.includes(bank.id);
            return `
                <div class="wordbank-card ${isSelected ? 'selected' : ''}" 
                     data-bank-id="${bank.id}" 
                     onclick="toggleBankSelection('${bank.id}')">
                  <div class="wordbank-icon" style="background:${bank.color}20; color:${bank.color};">
                    ${bank.icon}
                  </div>
                  <div class="wordbank-info">
                    <div class="wordbank-name">${bank.name}</div>
                    <div class="wordbank-desc">${bank.desc}</div>
                  </div>
                  <div class="wordbank-check"></div>
                </div>
              `;
        }).join('');
    },

    // Internal helper for this object context
    _loadHelper() { }
};

async function loadBankWithFallback(bankId, ctx) {
    if (ctx.loadedBanks[bankId]) return ctx.loadedBanks[bankId];
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = `data/${bankId}.js`;
        script.onload = () => {
            const words = window.WORDWISE_BANKS && window.WORDWISE_BANKS[bankId] ? window.WORDWISE_BANKS[bankId] : [];
            ctx.loadedBanks[bankId] = words;
            document.head.removeChild(script);
            resolve(words);
        };
        script.onerror = () => {
            console.error(`Error loading word bank ${bankId}`);
            resolve([]);
        };
        document.head.appendChild(script);
    });
}

function toggleBankSelection(bankId) {
    const card = document.querySelector(`[data-bank-id="${bankId}"]`);
    card.classList.toggle('selected');
}

function saveWordBankSelection() {
    const selected = [];
    document.querySelectorAll('.wordbank-card.selected').forEach(card => {
        selected.push(card.dataset.bankId);
    });

    if (selected.length === 0) {
        showToast('请至少选择一个词库');
        return;
    }

    WordBank.saveSelectedBanks(selected);
    showToast('词库已更新 ✓');
    navigateTo('home');
    updateHomeStats();
}
