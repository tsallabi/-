/* زرّ الحساب + تسجيل دخول/خروج + روابط المفضلة + VIP + دخول إدارة مخفي */

(function() {
    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', init);
    else init();

    function init() {
        const btn = document.getElementById('profileBtn');
        const menu = document.getElementById('profileMenu');
        if (btn && menu) {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const willOpen = menu.hidden;
                menu.hidden = !willOpen;
                if (willOpen) renderMenu();
            });
            document.addEventListener('click', e => {
                if (!menu.hidden && !menu.contains(e.target) && e.target !== btn)
                    menu.hidden = true;
            });
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && !menu.hidden) menu.hidden = true;
            });
        }

        // دخول الإدارة المخفي: 7 نقرات على تذييل حقوق النشر
        let adminClicks = 0, adminTimer = null;
        const adminTrigger = document.querySelector('.footer-copy');
        if (adminTrigger) {
            adminTrigger.style.cursor = 'pointer';
            adminTrigger.addEventListener('click', () => {
                adminClicks++;
                if (adminTimer) clearTimeout(adminTimer);
                adminTimer = setTimeout(() => { adminClicks = 0; }, 3000);
                if (adminClicks >= 7) {
                    adminClicks = 0;
                    location.href = onAdminPage() ? '../admin.html' : 'admin.html';
                }
            });
        }
    }

    function onAdminPage() { return /\/admin(\/|\.html)/.test(location.pathname); }
    function favHref() { return onAdminPage() ? '../favorites.html' : 'favorites.html'; }

    function renderMenu() {
        const body = document.getElementById('profileMenuBody');
        if (!body) return;

        const u = (typeof USER !== 'undefined') ? USER.current() : null;
        const isVIP = (typeof DATA !== 'undefined' && DATA.isVIP) ? DATA.isVIP() : false;
        const favsCount = (typeof FAVS !== 'undefined') ? FAVS.getAll().length : 0;
        const lastRead = (typeof READING !== 'undefined') ? READING.lastReadBooks(3) : [];
        const restrictedAccess = u && Array.isArray(u.allowedCategories) && u.allowedCategories.length;

        let html = '';
        if (u) {
            html += `
                <p class="profile-status">أهلاً <strong>${esc(u.displayName)}</strong></p>
                <p class="profile-tagline">@${esc(u.username)}${restrictedAccess ? ' · ✨ صلاحية خاصة' : ''}</p>
                <div class="profile-stats">
                    <div><b>${favsCount}</b><span>مفضّل</span></div>
                    <div><b>${lastRead.length}</b><span>قيد القراءة</span></div>
                </div>
                <a href="${favHref()}" class="vip-lock-btn" style="display:block;text-align:center;text-decoration:none;">♥ مفضّلتي</a>`;
            if (lastRead.length) {
                html += '<hr><p class="profile-section-title">📖 تابع القراءة</p><ul class="profile-last-read">';
                lastRead.forEach(r => {
                    html += `<li><a href="${onAdminPage() ? '../' : ''}book.html?id=${encodeURIComponent(r.bookId)}">صفحة ${r.page}</a></li>`;
                });
                html += '</ul>';
            }
            html += `<button id="logoutBtn" class="vip-lock-btn" type="button" style="margin-top:.5rem;">🚪 تسجيل خروج</button>`;
        } else {
            html += `
                <p class="profile-status">أهلاً بك في <strong>المكتبة الطيبة</strong></p>
                <p class="profile-tagline">سجّل دخولك لحفظ المفضّلة ومتابعة القراءة</p>
                <form id="loginForm" class="login-form">
                    <input type="text" name="username" placeholder="اسم المستخدم" autocomplete="username" required>
                    <input type="password" name="password" placeholder="كلمة السر" autocomplete="current-password" required>
                    <button type="submit">🔓 دخول</button>
                    <p class="login-error" id="loginError" hidden>بيانات غير صحيحة</p>
                </form>
                <p class="profile-note">ليس لديك حساب؟ تواصل مع إدارة المكتبة.</p>`;
        }

        if (isVIP) {
            html += `
                <hr>
                <p class="vip-indicator">✨ القسم الخاص مفتوح</p>
                <button id="vipLockBtn" class="vip-lock-btn vip-style" type="button">🔒 إغلاق القسم الخاص</button>`;
        }

        body.innerHTML = html;

        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', async e => {
                e.preventDefault();
                const fd = new FormData(loginForm);
                const user = await USER.login(fd.get('username').trim(), fd.get('password'));
                if (user) location.reload();
                else {
                    const err = document.getElementById('loginError');
                    if (err) err.hidden = false;
                }
            });
        }
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', () => { USER.logout(); location.reload(); });
        const vipLockBtn = document.getElementById('vipLockBtn');
        if (vipLockBtn) vipLockBtn.addEventListener('click', () => {
            if (typeof DATA !== 'undefined' && DATA.lockVIP) DATA.lockVIP();
            location.reload();
        });
    }

    function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
})();
