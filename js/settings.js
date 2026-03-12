// ===== Settings Module =====

function loadSettingsPage() {
    const settings = AI.getSettings();

    document.getElementById('ai-provider').value = settings.provider || 'openai';
    document.getElementById('api-key-input').value = settings.apiKey || '';
    document.getElementById('model-name-input').value = settings.model || AI.providers[settings.provider]?.defaultModel || '';

    if (settings.provider === 'custom') {
        document.getElementById('custom-url-section').style.display = '';
        document.getElementById('custom-api-url').value = settings.customUrl || '';
    } else {
        document.getElementById('custom-url-section').style.display = 'none';
    }

    // Daily words
    const dailyWords = localStorage.getItem('wordwise_daily_new') || '20';
    document.getElementById('daily-new-words').value = dailyWords;

    // Dark mode
    document.getElementById('dark-mode-toggle').checked = document.documentElement.getAttribute('data-theme') === 'dark';

    // Usage
    updateUsageDisplay();
}

function onProviderChange() {
    const provider = document.getElementById('ai-provider').value;
    const modelInput = document.getElementById('model-name-input');
    const customSection = document.getElementById('custom-url-section');

    if (provider === 'custom') {
        customSection.style.display = '';
        modelInput.placeholder = '输入模型名称';
    } else {
        customSection.style.display = 'none';
        modelInput.value = AI.providers[provider]?.defaultModel || '';
        modelInput.placeholder = AI.providers[provider]?.defaultModel || '';
    }
}

function saveAPISettings() {
    const provider = document.getElementById('ai-provider').value;
    const apiKey = document.getElementById('api-key-input').value.trim();
    const model = document.getElementById('model-name-input').value.trim();
    const customUrl = document.getElementById('custom-api-url')?.value.trim() || '';

    if (!apiKey) {
        showToast('请输入 API 密钥');
        return;
    }

    AI.saveSettings({ provider, apiKey, model, customUrl });
    showToast('API 设置已保存 ✓');
}

async function testAPIConnection() {
    // Save first
    saveAPISettings();

    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '测试中...';
    btn.disabled = true;

    const result = await AI.testConnection();

    btn.textContent = originalText;
    btn.disabled = false;

    if (result.ok) {
        showToast('✅ ' + result.msg);
    } else {
        showToast('❌ ' + result.msg);
    }
}

function saveDailyWords() {
    const value = document.getElementById('daily-new-words').value;
    localStorage.setItem('wordwise_daily_new', value);
    showToast(`每日新词已设为 ${value} 个`);
}

function toggleDarkMode() {
    const isDark = document.getElementById('dark-mode-toggle').checked;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : '');
    localStorage.setItem('wordwise_theme', isDark ? 'dark' : 'light');

    // Update theme-color meta
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.content = isDark ? '#000000' : '#F2F2F7';
    }
}

function exportData() {
    const username = Auth.getUsername();
    const exportObj = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        username: username,
        data: {}
    };

    // Collect all user data
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.includes(username) || key === 'wordwise_theme' || key === 'wordwise_daily_new') {
            exportObj.data[key] = localStorage.getItem(key);
        }
    }

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wordwise_backup_${username}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('数据已导出 ✓');
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importObj = JSON.parse(e.target.result);
            if (!importObj.data || !importObj.version) {
                showToast('无效的备份文件');
                return;
            }

            if (!confirm(`确认导入来自 "${importObj.username}" 的数据吗？当前数据将被覆盖。`)) {
                return;
            }

            for (const [key, value] of Object.entries(importObj.data)) {
                localStorage.setItem(key, value);
            }

            showToast('数据已导入 ✓');
            updateHomeStats();
            loadSettingsPage();
        } catch (err) {
            showToast('导入失败: 文件格式错误');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function clearAllData() {
    if (!confirm('确定要清除所有学习数据吗？此操作不可恢复！')) return;
    if (!confirm('再次确认：真的要清除吗？')) return;

    const username = Auth.getUsername();
    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.includes(username) && key !== Auth.USERS_KEY) {
            keysToRemove.push(key);
        }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    showToast('数据已清除');
    updateHomeStats();
    loadSettingsPage();
}

function logout() {
    Auth.logout();
    navigateTo('login');
}
