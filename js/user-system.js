/* نظام المستخدمين: تسجيل دخول محلي + دخول خارجي + مفضّلة + موقع آخر صفحة قراءة */

const USER = (function() {
    const SESSION_KEY = 'taybaa-user-session';
    let usersCache = null;

    async function sha256(text) {
        const buf = new TextEncoder().encode(String(text));
        const hash = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function loadUsers(force) {
        if (usersCache && !force) return usersCache;
        try {
            const res = await fetch(pathRoot() + 'data/users.json?t=' + Date.now());
            if (!res.ok) { usersCache = []; return []; }
            const data = await res.json();
            usersCache = data.users || [];
        } catch (_) { usersCache = []; }
        return usersCache;
    }

    function pathRoot() {
        return /\/admin(\/|\.html)/.test(location.pathname) ? '../' : '';
    }

    async function loadFirebasePermissions(email) {
        if (!email) return [];
        try {
            const res = await fetch(pathRoot() + 'data/firebase-permissions.json?t=' + Date.now());
            if (!res.ok) return [];
            const data = await res.json();
            const entry = (data.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase());
            return entry ? (entry.allowedCategories || []) : [];
        } catch { return []; }
    }

    async function login(username, password) {
        if (!username || !password) return null;
        const users = await loadUsers(true);
        const hash = await sha256(password);
        const user = users.find(u =>
            u.username && u.username.toLowerCase() === String(username).toLowerCase() &&
            u.passwordHash === hash && u.active !== false
        );
        if (!user) return null;
        const session = {
            username: user.username,
            displayName: user.displayName || user.username,
            allowedCategories: Array.isArray(user.allowedCategories) ? user.allowedCategories : [],
            source: 'local',
            loginAt: new Date().toISOString()
        };
        setSession(session);
        return session;
    }

    /* تثبيت جلسة جاهزة من مزوّد خارجي (مثل Firebase) */
    async function setSession(session) {
        if (!session) { logout(); return; }
        // للحسابات الخارجية: اجلب صلاحياتها إن وجدت، وإلا اترك الأصلي
        if (session.source === 'firebase' && session.email && !session.allowedCategories?.length) {
            try {
                const perms = await loadFirebasePermissions(session.email);
                if (perms.length) session.allowedCategories = perms;
            } catch (_) {}
        }
        if (!Array.isArray(session.allowedCategories)) session.allowedCategories = [];
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }

    function logout() {
        localStorage.removeItem(SESSION_KEY);
        if (typeof FBAUTH !== 'undefined' && FBAUTH.isConfigured()) {
            try { FBAUTH.signOut(); } catch (_) {}
        }
    }

    function current() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
        catch { return null; }
    }

    function isLoggedIn() { return !!current(); }

    return { login, logout, current, isLoggedIn, sha256, loadUsers, setSession };
})();

/* المفضّلة بحسب الحساب */
const FAVS = (function() {
    function key() {
        const u = USER.current();
        return u ? `taybaa-favs-${u.username}` : 'taybaa-favs-anon';
    }
    function getAll() {
        try { return JSON.parse(localStorage.getItem(key()) || '[]'); }
        catch { return []; }
    }
    function save(arr) { localStorage.setItem(key(), JSON.stringify(arr)); }
    function has(id) { return getAll().includes(String(id)); }
    function add(id) {
        const a = getAll(); const s = String(id);
        if (!a.includes(s)) { a.push(s); save(a); }
    }
    function remove(id) { save(getAll().filter(x => x !== String(id))); }
    function toggle(id) {
        if (has(id)) { remove(id); return false; }
        else { add(id); return true; }
    }
    return { getAll, has, add, remove, toggle };
})();

/* موقع آخر صفحة قراءة */
const READING = (function() {
    function userPrefix() {
        const u = USER.current();
        return u ? u.username : 'anon';
    }
    function key(bookId) { return `taybaa-read-${userPrefix()}-${bookId}`; }
    function setPage(bookId, page) {
        if (!bookId) return;
        try {
            localStorage.setItem(key(bookId), JSON.stringify({ page: Number(page) || 1, ts: Date.now() }));
        } catch (_) {}
    }
    function getPage(bookId) {
        if (!bookId) return 1;
        try {
            const v = localStorage.getItem(key(bookId));
            if (!v) return 1;
            return Number(JSON.parse(v).page) || 1;
        } catch { return 1; }
    }
    function lastReadBooks(limit) {
        limit = limit || 5;
        const prefix = `taybaa-read-${userPrefix()}-`;
        const items = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith(prefix)) continue;
            const bookId = k.slice(prefix.length);
            try {
                const obj = JSON.parse(localStorage.getItem(k));
                items.push({ bookId, page: obj.page, ts: obj.ts });
            } catch (_) {}
        }
        items.sort((a, b) => b.ts - a.ts);
        return items.slice(0, limit);
    }
    return { setPage, getPage, lastReadBooks };
})();
