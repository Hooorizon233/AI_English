// ===== Word Bank Module =====
// Now fetches words from server API instead of script tag injection

const WordBank = {
    // Default banks (will be enriched with wordCount from server)
    banks: [
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
    ],

    // Local cache: { bankId: [words] }
    loadedBanks: {},

    // Selected banks cache
    _selectedBanks: null,

    async refreshBanks() {
        try {
            const serverBanks = await API.getBanks();
            if (serverBanks && serverBanks.length > 0) {
                // Merge server word counts into local bank definitions
                const serverMap = {};
                for (const b of serverBanks) serverMap[b.id] = b;

                for (const local of this.banks) {
                    if (serverMap[local.id]) {
                        local.wordCount = serverMap[local.id].wordCount;
                    }
                }

                // Add any server-only banks (e.g., vocabulary_notes)
                for (const sb of serverBanks) {
                    if (!this.banks.find(b => b.id === sb.id)) {
                        this.banks.push(sb);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to refresh banks:', e);
        }
    },

    async getSelectedBanks() {
        if (this._selectedBanks) return this._selectedBanks;

        try {
            const settings = await API.getSettings();
            const raw = settings.selectedBanks || ['recommended'];
            // Handle legacy 'kaoyan' -> 'kaoyan_core'
            let banks = Array.isArray(raw) ? raw : ['recommended'];
            if (banks.includes('kaoyan')) {
                banks = banks.filter(id => id !== 'kaoyan');
                if (!banks.includes('kaoyan_core')) banks.push('kaoyan_core');
                // Save corrected selection
                await API.saveSettings({ selectedBanks: banks });
            }
            if (banks.length === 0) banks = ['recommended'];
            this._selectedBanks = banks;
            return banks;
        } catch (e) {
            return ['recommended'];
        }
    },

    async saveSelectedBanks(bankIds) {
        this._selectedBanks = bankIds;
        await API.saveSettings({ selectedBanks: bankIds });
    },

    // Fetch words for a bank from server API
    async loadBank(bankId) {
        if (this.loadedBanks[bankId]) return this.loadedBanks[bankId];

        try {
            const result = await API.getBankWords(bankId, 0, 100000);
            if (result.words && result.words.length > 0) {
                this.loadedBanks[bankId] = result.words;
                return result.words;
            }
        } catch (e) {
            console.error(`Error loading word bank ${bankId}:`, e);
        }
        return [];
    },

    async loadSelectedWords() {
        const selectedIds = await this.getSelectedBanks();
        if (selectedIds.length === 0) return [];

        const allWords = [];
        const seen = new Set();

        for (const bankId of selectedIds) {
            const words = await this.loadBank(bankId);
            for (const w of words) {
                if (!seen.has(w.word)) {
                    seen.add(w.word);
                    allWords.push(w);
                }
            }
        }

        // Apply sort mode
        let sortMode = 'frequency';
        try {
            const settings = await API.getSettings();
            sortMode = settings.sortMode || 'frequency';
        } catch (e) { }

        if (sortMode === 'frequency') {
            allWords.sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
        } else if (sortMode === 'random') {
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
            seed = (seed * 9301 + 49297) % 233280;
            const rnd = seed / 233280;
            i = Math.floor(rnd * m--);
            t = array[m];
            array[m] = array[i];
            array[i] = t;
        }
        return array;
    },

    async renderBankList() {
        const container = document.getElementById('wordbank-list');
        await this.refreshBanks();
        const selected = await this.getSelectedBanks();

        container.innerHTML = this.banks.map(bank => {
            const isSelected = selected.includes(bank.id);
            const countStr = bank.wordCount ? ` (${bank.wordCount}词)` : '';
            return `
                <div class="wordbank-card ${isSelected ? 'selected' : ''}"
                     data-bank-id="${bank.id}"
                     onclick="toggleBankSelection('${bank.id}')">
                  <div class="wordbank-icon" style="background:${bank.color}20; color:${bank.color};">
                    ${bank.icon}
                  </div>
                  <div class="wordbank-info">
                    <div class="wordbank-name">${bank.name}${countStr}</div>
                    <div class="wordbank-desc">${bank.desc}</div>
                  </div>
                  <div class="wordbank-check"></div>
                </div>
              `;
        }).join('');
    }
};

function toggleBankSelection(bankId) {
    const card = document.querySelector(`[data-bank-id="${bankId}"]`);
    card.classList.toggle('selected');
}

async function saveWordBankSelection() {
    const selected = [];
    document.querySelectorAll('.wordbank-card.selected').forEach(card => {
        selected.push(card.dataset.bankId);
    });

    if (selected.length === 0) {
        showToast('请至少选择一个词库');
        return;
    }

    // Clear word bank cache since selection changed
    WordBank.loadedBanks = {};
    WordBank._selectedBanks = null;

    await WordBank.saveSelectedBanks(selected);
    showToast('词库已更新 ✓');
    navigateTo('home');
    updateHomeStats();
}
