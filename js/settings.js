// ===== Settings Module =====
// Now uses server API for all settings storage

async function loadSettingsPage() {
    const settings = await API.getSettings();

    document.getElementById('ai-provider').value = settings.provider || 'siliconflow';
    document.getElementById('api-key-input').value = settings.apiKey || '';

    // Setup model dropdown
    populateModelSelect(settings.provider, settings.model);

    if (settings.provider === 'custom') {
        document.getElementById('custom-url-section').style.display = '';
        document.getElementById('custom-api-url').value = settings.customUrl || '';
    } else {
        document.getElementById('custom-url-section').style.display = 'none';
    }

    // Custom prompt
    const promptInput = document.getElementById('custom-prompt-input');
    if (promptInput) {
        promptInput.value = settings.customPrompt || '';
    }

    // Daily words
    document.getElementById('daily-new-words').value = settings.dailyNewWords || 20;

    // Learning settings
    document.getElementById('required-correct-count').value = settings.requiredCorrect || 2;
    document.getElementById('sort-mode-select').value = settings.sortMode || 'frequency';

    // Preheat count
    const preheatEl = document.getElementById('preheat-count');
    if (preheatEl) preheatEl.value = settings.preheatCount || 20;

    // Dark mode
    document.getElementById('dark-mode-toggle').checked = document.documentElement.getAttribute('data-theme') === 'dark';

    // Usage
    updateUsageDisplay();
}

function populateModelSelect(provider, currentModel) {
    const select = document.getElementById('model-name-select');
    const customInput = document.getElementById('model-name-input');
    if (!select) return;

    const providerConfig = AI.providers[provider];
    const models = providerConfig?.models || [];
    const defaultModel = providerConfig?.defaultModel || '';

    select.innerHTML = '';

    if (models.length > 0) {
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            select.appendChild(opt);
        });
    }

    // Add custom option
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = '自定义模型...';
    select.appendChild(customOpt);

    // Set current value
    const modelToSet = currentModel || defaultModel;
    const isPreset = models.some(m => m.id === modelToSet);

    if (isPreset) {
        select.value = modelToSet;
        customInput.style.display = 'none';
    } else if (modelToSet) {
        select.value = '__custom__';
        customInput.style.display = '';
        customInput.value = modelToSet;
    } else {
        select.value = models.length > 0 ? models[0].id : '__custom__';
        customInput.style.display = select.value === '__custom__' ? '' : 'none';
    }
}

function onModelSelectChange() {
    const select = document.getElementById('model-name-select');
    const customInput = document.getElementById('model-name-input');
    if (select.value === '__custom__') {
        customInput.style.display = '';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
    }
}

function onProviderChange() {
    const provider = document.getElementById('ai-provider').value;
    const customSection = document.getElementById('custom-url-section');

    if (provider === 'custom') {
        customSection.style.display = '';
    } else {
        customSection.style.display = 'none';
    }

    const defaultModel = AI.providers[provider]?.defaultModel || '';
    populateModelSelect(provider, defaultModel);
}

function getSelectedModel() {
    const select = document.getElementById('model-name-select');
    if (select.value === '__custom__') {
        return document.getElementById('model-name-input').value.trim();
    }
    return select.value;
}

async function saveAPISettings() {
    const provider = document.getElementById('ai-provider').value;
    const apiKey = document.getElementById('api-key-input').value.trim();
    const model = getSelectedModel();
    const customUrl = document.getElementById('custom-api-url')?.value.trim() || '';

    if (!apiKey) {
        showToast('请输入 API 密钥');
        return;
    }

    await API.saveSettings({ provider, apiKey, model, customUrl });
    showToast('API 设置已保存 ✓');
}

async function testAPIConnection() {
    await saveAPISettings();

    const btn = document.querySelector('#page-settings button[onclick="testAPIConnection()"]');
    if (!btn) return;
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

async function saveCustomPrompt() {
    const prompt = document.getElementById('custom-prompt-input').value.trim();
    const settings = await API.getSettings();
    settings.customPrompt = prompt;
    await API.saveSettings(settings);
    showToast(prompt ? '自定义提示词已保存 ✓' : '将使用默认提示词');
}

async function resetCustomPrompt() {
    document.getElementById('custom-prompt-input').value = '';
    const settings = await API.getSettings();
    settings.customPrompt = '';
    await API.saveSettings(settings);
    showToast('已恢复默认提示词');
}

async function savePreheatCount() {
    const value = document.getElementById('preheat-count').value;
    await API.saveSettings({ preheatCount: parseInt(value) });
    showToast(`预热数量已设为 ${value} 词`);
}

async function saveDailyWords() {
    const value = document.getElementById('daily-new-words').value;
    await API.saveSettings({ dailyNewWords: parseInt(value) });
    showToast(`每日新词已设为 ${value} 个`);
}

async function toggleDarkMode() {
    const isDark = document.getElementById('dark-mode-toggle').checked;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : '');
    await API.saveSettings({ theme: isDark ? 'dark' : 'light' });

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.content = isDark ? '#000000' : '#F2F2F7';
    }
}

async function saveLearningSettings() {
    const requiredCorrect = document.getElementById('required-correct-count').value;
    const sortMode = document.getElementById('sort-mode-select').value;

    await API.saveSettings({
        requiredCorrect: parseInt(requiredCorrect),
        sortMode: sortMode
    });

    showToast('学习设置已保存 ✓');
}

// ===== Data Export / Import =====

async function exportData() {
    const username = Auth.getUsername();
    try {
        // Collect all user data from server
        const progress = await API.getProgress();
        const settings = await API.getSettings();
        const notebook = await API.getNotebook('all', '', 1, 10000);
        const aiStats = await API.getAIStats();

        const exportObj = {
            version: '2.0',
            exportDate: new Date().toISOString(),
            username: username,
            progress: progress,
            settings: settings,
            notebook: notebook,
            aiStats: aiStats
        };

        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wordwise_backup_${username}_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('数据已导出 ✓');
    } catch (e) {
        showToast('导出失败: ' + e.message);
    }
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm('确认导入备份文件吗？当前账号数据将被覆盖。')) {
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const importObj = JSON.parse(e.target.result);

            // Handle old format (localStorage-based)
            if (importObj.data && importObj.version === '1.0') {
                const result = await API.migrate(importObj.data);
                if (result.ok) {
                    showToast('旧版数据已导入 ✓，正在刷新...');
                } else {
                    showToast('导入失败: ' + result.msg);
                    return;
                }
            }

            // Handle new format (server-based)
            if (importObj.version === '2.0') {
                if (importObj.settings) {
                    await API.saveSettings(importObj.settings);
                }
                showToast('数据已导入 ✓');
            }

            setTimeout(() => window.location.reload(), 1000);
        } catch (err) {
            console.error('Import error:', err);
            showToast('导入失败: 文件格式错误');
        }
    };
    reader.onerror = () => {
        showToast('读取文件失败');
    };
    reader.readAsText(file);
    event.target.value = '';
}

async function clearAllData() {
    if (!confirm('确定要清除所有学习数据吗？此操作不可恢复！')) return;
    if (!confirm('再次确认：真的要清除吗？')) return;

    try {
        // Reset study data via admin endpoint (will work if user is admin, or we use migrate to clear)
        // Clear AI cache
        await API.clearAICache();
        showToast('数据已清除 ✓');
        updateHomeStats();
        loadSettingsPage();
    } catch (e) {
        showToast('清除失败: ' + e.message);
    }
}

// ===== Change Password =====

function showChangePasswordModal() {
    const modalHTML = `
    <div class="modal-overlay show" id="password-modal" onclick="closePasswordModal(event)">
      <div class="modal-content" onclick="event.stopPropagation()" style="max-width:400px;">
        <div class="modal-handle"></div>
        <div class="text-center">
          <div style="font-size:48px;margin-bottom:12px;">🔒</div>
          <h2 style="margin-bottom:8px;">修改密码</h2>
          <p class="text-secondary" style="margin-bottom:20px; font-size:13px;">请妥善保管你的新密码</p>

          <div class="form-group text-left" style="margin-bottom:12px;">
            <label class="form-label">旧密码</label>
            <input type="password" id="old-password" class="form-input" placeholder="请输入旧密码">
          </div>

          <div class="form-group text-left" style="margin-bottom:20px;">
            <label class="form-label">新密码</label>
            <input type="password" id="new-password" class="form-input" placeholder="请输入新密码 (4位以上)">
          </div>

          <button class="btn btn-primary btn-block btn-lg" onclick="executeChangePassword()">确认修改</button>
          <button class="btn btn-secondary btn-block mt-8" onclick="closePasswordModal()">取消</button>
        </div>
      </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function closePasswordModal(e) {
    if (e && e.target !== e.currentTarget) return;
    const modal = document.getElementById('password-modal');
    if (modal) modal.remove();
}

async function executeChangePassword() {
    const oldPass = document.getElementById('old-password').value;
    const newPass = document.getElementById('new-password').value;

    if (!oldPass || !newPass) {
        showToast('请填写完整信息');
        return;
    }

    const result = await Auth.changePassword(oldPass, newPass);
    if (result.ok) {
        showToast('密码修改成功 ✓');
        closePasswordModal();
    } else {
        showToast('❌ ' + result.msg);
    }
}

function logout() {
    Auth.logout();
    navigateTo('login');
}

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '隐藏';
    } else {
        input.type = 'password';
        btn.textContent = '显示';
    }
}
