// ===== App Entry & Router =====

// ===== Toast =====
function showToast(msg, duration = 2500) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

// ===== Navigation =====
function navigateTo(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // Show target page
    const target = document.getElementById(`page-${page}`);
    if (target) {
        target.classList.add('active');
        target.style.animation = 'none';
        target.offsetHeight; // force reflow
        target.style.animation = '';
    }

    // Nav bar visibility
    const navBar = document.getElementById('nav-bar');
    if (page === 'login' || page === 'study') {
        navBar.classList.add('hidden');
    } else {
        navBar.classList.remove('hidden');
    }

    // Nav bar active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Show/hide admin tab
    const adminTab = document.getElementById('nav-admin');
    if (adminTab) {
        adminTab.style.display = Auth.isAdmin() ? '' : 'none';
    }

    // Page-specific init
    if (page === 'home') {
        updateHomeStats();
    } else if (page === 'wordbank') {
        WordBank.renderBankList();
    } else if (page === 'notebook') {
        loadNotebookPage();
    } else if (page === 'settings') {
        loadSettingsPage();
    } else if (page === 'admin') {
        loadAdminPage();
    }

    // Update hash
    if (page !== 'login') {
        window.location.hash = page;
    }
}

// ===== Init =====
async function initApp() {
    // Restore theme from URL hash or default
    const savedTheme = localStorage.getItem('wordwise_theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) metaTheme.content = '#000000';
    }

    // Check login state
    if (Auth.isLoggedIn()) {
        // Apply saved theme from server
        try {
            const settings = await API.getSettings();
            if (settings.theme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
            }
        } catch (e) { }

        const hash = window.location.hash.replace('#', '') || 'home';
        navigateTo(hash);
    } else {
        navigateTo('login');
    }

    // Setup login form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');

        const result = await Auth.login(username, password);
        if (result.ok) {
            errorEl.classList.remove('show');
            navigateTo('home');
            showToast(`欢迎回来，${username}！`);
        } else {
            errorEl.textContent = result.msg;
            errorEl.classList.add('show');
        }
    });

    // Setup register form
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value;
        const password2 = document.getElementById('reg-password2').value;
        const errorEl = document.getElementById('register-error');

        if (password !== password2) {
            errorEl.textContent = '两次密码不一致';
            errorEl.classList.add('show');
            return;
        }

        const result = await Auth.register(username, password);
        if (result.ok) {
            errorEl.classList.remove('show');
            navigateTo('home');
            showToast(`注册成功，欢迎 ${username}！`);
        } else {
            errorEl.textContent = result.msg;
            errorEl.classList.add('show');
        }
    });

    // Toggle login/register
    document.getElementById('show-register').addEventListener('click', () => {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.remove('hidden');
    });

    document.getElementById('show-login').addEventListener('click', () => {
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
    });

    // Hash change
    window.addEventListener('hashchange', () => {
        if (!Auth.isLoggedIn()) return;
        const page = window.location.hash.replace('#', '') || 'home';
        const validPages = ['home', 'wordbank', 'notebook', 'settings', 'admin'];
        if (validPages.includes(page)) {
            navigateTo(page);
        }
    });
}

// Start the app
document.addEventListener('DOMContentLoaded', initApp);
