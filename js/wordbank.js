// ===== Word Bank Module =====

const WordBank = {
    SELECTION_KEY_PREFIX: 'wordwise_wordbanks_',

    // Available word banks
    banks: [
        { id: 'cet4', name: 'CET-4', desc: '大学英语四级核心词汇', icon: '🎓', color: '#007AFF' },
        { id: 'cet6', name: 'CET-6', desc: '大学英语六级核心词汇', icon: '🏆', color: '#5856D6' },
        { id: 'kaoyan', name: '考研', desc: '考研英语核心词汇', icon: '📖', color: '#FF9500' },
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
        const saved = localStorage.getItem(this.getSelectionKey());
        return saved ? JSON.parse(saved) : [];
    },

    saveSelectedBanks(bankIds) {
        localStorage.setItem(this.getSelectionKey(), JSON.stringify(bankIds));
    },

    async loadBank(bankId) {
        if (this.loadedBanks[bankId]) return this.loadedBanks[bankId];

        try {
            const response = await fetch(`data/${bankId}.json`);
            if (!response.ok) throw new Error(`Failed to load ${bankId}`);
            const words = await response.json();
            this.loadedBanks[bankId] = words;
            return words;
        } catch (e) {
            console.error(`Error loading word bank ${bankId}:`, e);
            return [];
        }
    },

    async loadSelectedWords() {
        const selectedIds = this.getSelectedBanks();
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

        return allWords;
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
    }
};

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
