// ===== Admin Panel Module =====

async function loadAdminPage() {
    if (!Auth.isAdmin()) {
        showToast('需要管理员权限');
        navigateTo('home');
        return;
    }

    // Load config
    try {
        const cfg = await API.getAdminConfig();
        if (cfg.ok) {
            document.getElementById('admin-review-batch').value = cfg.config.defaultReviewBatchSize || 100;
        }
    } catch (e) { }

    // Load user list
    try {
        const users = await API.getAdminUsers();
        const usersList = document.getElementById('admin-users-list');
        if (users.ok && users.users) {
            usersList.innerHTML = users.users.map(u => `
                <div class="settings-item">
                  <div class="settings-item-left">
                    <div class="settings-item-icon" style="background:${u.isAdmin ? '#FF9500' : '#007AFF'};">${u.isAdmin ? '👑' : '👤'}</div>
                    <div>
                      <span class="settings-item-label">${u.username}${u.isAdmin ? ' (管理员)' : ''}</span>
                      <div class="text-secondary" style="font-size:12px;">
                        学习 ${u.studyRecords} 词 · AI缓存 ${u.aiCacheEntries} 条 · 连续 ${u.streak?.count || 0} 天
                      </div>
                    </div>
                  </div>
                  ${!u.isAdmin ? `<button class="btn btn-sm" style="color:var(--danger); font-size:12px;" onclick="resetUserData('${u.username}')">重置</button>` : ''}
                </div>
            `).join('');
        }
    } catch (e) {
        document.getElementById('admin-users-list').innerHTML =
            '<div class="settings-item"><span class="text-secondary">加载失败</span></div>';
    }

    // Load system stats
    try {
        const stats = await API.getAdminStats();
        const statsEl = document.getElementById('admin-system-stats');
        if (stats.ok && stats.stats) {
            const s = stats.stats;
            statsEl.innerHTML = `
                <div class="settings-item">
                  <div class="settings-item-left">
                    <div class="settings-item-icon" style="background:#34C759;">👥</div>
                    <span class="settings-item-label">用户总数</span>
                  </div>
                  <span class="settings-item-value">${s.totalUsers}</span>
                </div>
                <div class="settings-item">
                  <div class="settings-item-left">
                    <div class="settings-item-icon" style="background:#007AFF;">📝</div>
                    <span class="settings-item-label">总学习记录</span>
                  </div>
                  <span class="settings-item-value">${s.totalStudyRecords}</span>
                </div>
                <div class="settings-item">
                  <div class="settings-item-left">
                    <div class="settings-item-icon" style="background:#5856D6;">💾</div>
                    <span class="settings-item-label">总存储大小</span>
                  </div>
                  <span class="settings-item-value">${s.totalStorageMB} MB</span>
                </div>
                <div class="settings-item">
                  <div class="settings-item-left">
                    <div class="settings-item-icon" style="background:#FF9500;">⏱️</div>
                    <span class="settings-item-label">服务运行时间</span>
                  </div>
                  <span class="settings-item-value">${formatUptime(s.uptime)}</span>
                </div>
            `;
        }
    } catch (e) {
        document.getElementById('admin-system-stats').innerHTML =
            '<div class="settings-item"><span class="text-secondary">加载失败</span></div>';
    }
}

async function saveAdminReviewBatch() {
    const value = document.getElementById('admin-review-batch').value;
    try {
        await API.saveAdminConfig({ defaultReviewBatchSize: parseInt(value) });
        showToast(`默认复习数量已设为 ${value} 词`);
    } catch (e) {
        showToast('保存失败');
    }
}

async function resetUserData(username) {
    if (!confirm(`确定要重置 ${username} 的所有学习数据吗？此操作不可恢复！`)) return;
    try {
        const result = await API.resetUser(username);
        if (result.ok) {
            showToast(result.msg);
            loadAdminPage(); // Refresh
        } else {
            showToast('重置失败: ' + result.msg);
        }
    } catch (e) {
        showToast('操作失败');
    }
}

function formatUptime(seconds) {
    if (!seconds) return '刚启动';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(`${d}天`);
    if (h > 0) parts.push(`${h}小时`);
    parts.push(`${m}分钟`);
    return parts.join(' ');
}
