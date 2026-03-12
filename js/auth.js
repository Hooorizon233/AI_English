// ===== Authentication Module =====

const Auth = {
    USERS_KEY: 'wordwise_users',
    SESSION_KEY: 'wordwise_session',

    // Hash password using SHA-256
    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    getUsers() {
        return JSON.parse(localStorage.getItem(this.USERS_KEY) || '{}');
    },

    saveUsers(users) {
        localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
    },

    async register(username, password) {
        if (!username || username.length < 3 || username.length > 20) {
            return { ok: false, msg: '用户名需要 3-20 个字符' };
        }
        if (!password || password.length < 6) {
            return { ok: false, msg: '密码至少需要 6 位' };
        }

        const users = this.getUsers();
        if (users[username]) {
            return { ok: false, msg: '用户名已存在' };
        }

        const hash = await this.hashPassword(password);
        users[username] = { passwordHash: hash, createdAt: Date.now() };
        this.saveUsers(users);

        // Auto login after register
        this.setSession(username);
        return { ok: true };
    },

    async login(username, password) {
        if (!username || !password) {
            return { ok: false, msg: '请输入用户名和密码' };
        }

        const users = this.getUsers();
        const user = users[username];
        if (!user) {
            return { ok: false, msg: '用户名或密码错误' };
        }

        const hash = await this.hashPassword(password);
        if (hash !== user.passwordHash) {
            return { ok: false, msg: '用户名或密码错误' };
        }

        this.setSession(username);
        return { ok: true };
    },

    setSession(username) {
        localStorage.setItem(this.SESSION_KEY, JSON.stringify({
            username,
            loginAt: Date.now()
        }));
    },

    getSession() {
        const session = localStorage.getItem(this.SESSION_KEY);
        return session ? JSON.parse(session) : null;
    },

    isLoggedIn() {
        return !!this.getSession();
    },

    getUsername() {
        const session = this.getSession();
        return session ? session.username : null;
    },

    logout() {
        localStorage.removeItem(this.SESSION_KEY);
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
