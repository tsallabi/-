/* زرّ الحساب + تسجيل دخول/خروج محلي + Google + Facebook + مفضّلة + VIP + دخول إدارة مخفي */

(function() {
    injectStyles();
    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', init);
    else init();

    function init() {
        ensureFirebaseScript();

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

        // 7 نقرات على التذييل لدخول الأدمن
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
    function pathPrefix() { return onAdminPage() ? '../' : ''; }

    function ensureFirebaseScript() {
        if (typeof FBAUTH !== 'undefined') return;
        if (typeof CONFIG === 'undefined' || !CONFIG.firebase || !CONFIG.firebase.enabled) return;
        if (document.querySelector('script[data-fb-auth-loader]')) return;
        const s = document.createElement('script');
        s.src = pathPrefix() + 'js/firebase-auth.js?v=28';
        s.setAttribute('data-fb-auth-loader', '1');
        document.head.appendChild(s);
    }

    function renderMenu() {
        const body = document.getElementById('profileMenuBody');
        if (!body) return;

        const u = (typeof USER !== 'undefined') ? USER.current() : null;
        const isVIP = (typeof DATA !== 'undefined' && DATA.isVIP) ? DATA.isVIP() : false;
        const favsCount = (typeof FAVS !== 'undefined') ? FAVS.getAll().length : 0;
        const lastRead = (typeof READING !== 'undefined') ? READING.lastReadBooks(3) : [];
        const restrictedAccess = u && Array.isArray(u.allowedCategories) && u.allowedCategories.length;
        const fbEnabled = (typeof FBAUTH !== 'undefined' && FBAUTH.isConfigured()) ||
                          (typeof CONFIG !== 'undefined' && CONFIG.firebase && CONFIG.firebase.enabled);

        let html = '';
        if (u) {
            const avatar = u.photoURL
                ? `<img src="${esc(u.photoURL)}" alt="" class="profile-avatar">`
                : '';
            const sourceTag = u.source === 'firebase'
                ? `<span class="profile-provider provider-${esc(u.provider || 'fb')}">${providerLabel(u.provider)}</span>` : '';

            html += `
                <div class="profile-userhead">
                    ${avatar}
                    <div>
                        <p class="profile-status">أهلاً <strong>${esc(u.displayName)}</strong></p>
                        <p class="profile-tagline">${esc(u.email || u.username)}${sourceTag}${restrictedAccess ? ' · ✨ صلاحية خاصة' : ''}</p>
                    </div>
                </div>
                <div class="profile-stats">
                    <div><b>${favsCount}</b><span>مفضّل</span></div>
                    <div><b>${lastRead.length}</b><span>قيد القراءة</span></div>
                </div>
                <a href="${pathPrefix()}favorites.html" class="vip-lock-btn" style="display:block;text-align:center;text-decoration:none;">♥ مفضّلتي</a>`;
            if (lastRead.length) {
                html += '<hr><p class="profile-section-title">📖 تابع القراءة</p><ul class="profile-last-read">';
                lastRead.forEach(r => {
                    html += `<li><a href="${pathPrefix()}book.html?id=${encodeURIComponent(r.bookId)}">صفحة ${r.page}</a></li>`;
                });
                html += '</ul>';
            }
            html += `<button id="logoutBtn" class="vip-lock-btn" type="button" style="margin-top:.5rem;">🚪 تسجيل خروج</button>`;
        } else {
            html += `
                <p class="profile-status">أهلاً بك في <strong>مكتبة ليبيا الطيبة</strong></p>
                <p class="profile-tagline">سجّل دخولك لحفظ المفضّلة ومتابعة القراءة</p>`;

            if (fbEnabled) {
                html += `
                    <div class="oauth-buttons">
                        <button id="googleBtn" class="oauth-btn google-btn" type="button">
                            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                            دخول عبر جوجل
                        </button>
                        <button id="facebookBtn" class="oauth-btn facebook-btn" type="button">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854V15.469H7.078V12h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.234 2.686.234v2.953H15.83c-1.491 0-1.956.925-1.956 1.875V12h3.328l-.532 3.469h-2.796v8.385C19.612 22.954 24 17.99 24 12z"/></svg>
                            دخول عبر فيسبوك
                        </button>
                    </div>
                    <div class="login-divider"><span>أو عبر البريد / الحساب المحلي</span></div>`;
            }

            html += `
                <form id="loginForm" class="login-form">
                    <input type="text" name="username" placeholder="البريد / اسم المستخدم" autocomplete="username" required>
                    <input type="password" name="password" placeholder="كلمة السر" autocomplete="current-password" required>
                    <button type="submit">🔓 دخول</button>
                    <p class="login-error" id="loginError" hidden></p>
                </form>
                <p class="profile-note">ليس لديك حساب؟ استخدم زر جوجل/فيسبوك أو تواصل مع إدارة المكتبة.</p>`;
        }

        if (isVIP) {
            html += `
                <hr>
                <p class="vip-indicator">✨ القسم الخاص مفتوح</p>
                <button id="vipLockBtn" class="vip-lock-btn vip-style" type="button">🔒 إغلاق القسم الخاص</button>`;
        }

        body.innerHTML = html;
        wireEvents();
    }

    function wireEvents() {
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', async e => {
                e.preventDefault();
                const fd = new FormData(loginForm);
                const username = fd.get('username').trim();
                const password = fd.get('password');

                // جرّب المحليّ أولاً
                const localUser = await USER.login(username, password);
                if (localUser) { location.reload(); return; }

                // إن فشل المحليّ وكانت Firebase مفعّلة، جرّب دخول بالإيميل
                if (typeof FBAUTH !== 'undefined' && FBAUTH.isConfigured() && username.includes('@')) {
                    try {
                        const fbUser = await FBAUTH.signInEmail(username, password);
                        await USER.setSession(fbUser);
                        location.reload();
                        return;
                    } catch (err) { showLoginError('بيانات غير صحيحة'); return; }
                }
                showLoginError('بيانات غير صحيحة');
            });
        }

        bindOAuth('googleBtn', async () => FBAUTH.signInGoogle());
        bindOAuth('facebookBtn', async () => FBAUTH.signInFacebook());

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', () => { USER.logout(); location.reload(); });

        const vipLockBtn = document.getElementById('vipLockBtn');
        if (vipLockBtn) vipLockBtn.addEventListener('click', () => {
            if (typeof DATA !== 'undefined' && DATA.lockVIP) DATA.lockVIP();
            location.reload();
        });
    }

    function bindOAuth(btnId, signInFn) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.addEventListener('click', async () => {
            if (typeof FBAUTH === 'undefined' || !FBAUTH.isConfigured()) {
                showLoginError('تسجيل الدخول الخارجي غير مهيأ بعد');
                return;
            }
            btn.disabled = true;
            try {
                const fbUser = await signInFn();
                await USER.setSession(fbUser);
                location.reload();
            } catch (err) {
                btn.disabled = false;
                showLoginError(err.message || 'فشل تسجيل الدخول');
            }
        });
    }

    function showLoginError(msg) {
        const el = document.getElementById('loginError');
        if (!el) return;
        el.textContent = msg;
        el.hidden = false;
    }

    function providerLabel(p) {
        if (p === 'google') return ' · 🟢 Google';
        if (p === 'facebook') return ' · 🔵 Facebook';
        if (p === 'email') return ' · ✉️ Email';
        return '';
    }

    function injectStyles() {
        if (document.getElementById('profile-injected-css')) return;
        const s = document.createElement('style');
        s.id = 'profile-injected-css';
        s.textContent = `
            .profile-userhead { display: flex; align-items: center; gap: .65rem; margin-bottom: .5rem; }
            .profile-avatar { width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--gold); object-fit: cover; flex-shrink: 0; }
            .profile-provider { font-size: .72rem; padding: .1rem .4rem; background: var(--bg-subtle); border-radius: 999px; }
            .oauth-buttons { display: flex; flex-direction: column; gap: .55rem; margin: .35rem 0 .25rem; }
            .oauth-btn { display: flex; align-items: center; justify-content: center; gap: .55rem; padding: .7rem; border-radius: 10px; font-family: inherit; font-weight: 700; font-size: .9rem; cursor: pointer; transition: all .15s; border: 1px solid var(--border); }
            .oauth-btn:disabled { opacity: .5; cursor: not-allowed; }
            .oauth-btn.google-btn { background: #fff; color: #3c4043; border-color: #dadce0; }
            .oauth-btn.google-btn:hover { background: #f8f9fa; box-shadow: 0 2px 6px rgba(0,0,0,.15); }
            .oauth-btn.facebook-btn { background: #1877F2; color: #fff; border-color: #1877F2; }
            .oauth-btn.facebook-btn:hover { background: #166fe5; box-shadow: 0 2px 6px rgba(24,119,242,.4); }
            .login-divider { display: flex; align-items: center; gap: .65rem; margin: .9rem 0 .65rem; color: var(--text-muted); font-size: .72rem; font-weight: 600; text-align: center; }
            .login-divider::before, .login-divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
            .login-error { display: block; padding: .5rem .75rem; background: rgba(206,17,38,.1); border: 1px solid #ce1126; border-radius: 8px; color: #ce1126; font-size: .82rem; font-weight: 700; margin: .3rem 0 0; text-align: center; }
        `;
        document.head.appendChild(s);
    }

    function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
})();
