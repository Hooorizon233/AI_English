// ===== Authentication Module =====
// Now uses server-side API instead of localStorage

const Auth = {
    async register(username, password) {
        if (!username || username.length < 2 || username.length > 30) {
            return { ok: false, msg: '用户名需要 2-30 个字符' };
        }
        if (!password || password.length < 4) {
            return { ok: false, msg: '密码至少需要 4 位' };
        }

        const result = await API.register(username, password);
        if (result.ok) {
            this._session = { username, loginAt: Date.now(), isAdmin: result.isAdmin };
            // Check if migration needed
            this._checkMigration();
        }
        return result;
    },

    async login(username, password) {
        if (!username || !password) {
            return { ok: false, msg: '请输入用户名和密码' };
        }

        const result = await API.login(username, password);
        if (result.ok) {
            this._session = { username, loginAt: Date.now(), isAdmin: result.isAdmin };
            // Check if migration needed
            this._checkMigration();
        }
        return result;
    },

    async changePassword(oldPassword, newPassword) {
        if (!newPassword || newPassword.length < 4) {
            return { ok: false, msg: '新密码至少需要 4 位' };
        }
        return API.changePassword(oldPassword, newPassword);
    },

    // In-memory session (no localStorage)
    _session: null,

    isLoggedIn() {
        return !!this._session && !!this._session.username;
    },

    getUsername() {
        return this._session ? this._session.username : null;
    },

    isAdmin() {
        return this._session ? !!this._session.isAdmin : false;
    },

    logout() {
        this._session = null;
    },

    // Migration from old localStorage data
    _migrationChecked: false,

    async _checkMigration() {
        if (this._migrationChecked) return;
        this._migrationChecked = true;

        const username = this.getUsername();
        if (!username) return;

        // Check if server already has data
        const needsMigration = await API.getMigrateStatus();
        if (!needsMigration) return;

        // Check if browser localStorage has old data
        const oldData = API.collectLocalStorage(username);
        const hasOldData = Object.keys(oldData).length > 0;
        if (!hasOldData) return;

        // Show migration prompt
        const doMigrate = confirm(
            '检测到浏览器中有旧版学习数据，是否迁移到服务器？\n\n' +
            '迁移后数据将保存在服务器，不会丢失。\n' +
            '点击「确定」开始迁移，点击「取消」跳过。'
        );

        if (doMigrate) {
            try {
                const result = await API.migrate(oldData);
                if (result.ok) {
                    alert('✅ ' + result.msg);
                    // Clear old localStorage
                    for (const key of Object.keys(oldData)) {
                        localStorage.removeItem(key);
                    }
                } else {
                    alert('❌ 迁移失败: ' + result.msg);
                }
            } catch (e) {
                console.error('Migration error:', e);
                alert('迁移出错，请稍后重试');
            }
        }
    }
};

// Helper: toggle password visibility
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
