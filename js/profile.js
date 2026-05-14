/* زرّ الحساب + تسجيل خروج VIP + دخول إدارة مخفي (7 نقرات على تذييل العام) */

(function() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

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
                if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) {
                    menu.hidden = true;
                }
            });
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && !menu.hidden) menu.hidden = true;
            });
        }

        const lockBtn = document.getElementById('vipLockBtn');
        if (lockBtn) {
            lockBtn.addEventListener('click', () => {
                if (typeof DATA !== 'undefined' && DATA.lockVIP) DATA.lockVIP();
                location.reload();
            });
        }

        // دخول الإدارة المخفي: 7 نقرات سريعة على تذييل حقوق النشر
        let adminClicks = 0, adminTimer = null;
        const adminTrigger = document.querySelector('.footer-copy');
        if (adminTrigger) {
            adminTrigger.style.cursor = 'pointer';
            adminTrigger.title = '';
            adminTrigger.addEventListener('click', () => {
                adminClicks++;
                if (adminTimer) clearTimeout(adminTimer);
                adminTimer = setTimeout(() => { adminClicks = 0; }, 3000);
                if (adminClicks >= 7) {
                    adminClicks = 0;
                    location.href = 'admin.html';
                }
            });
        }
    }

    function renderMenu() {
        const isVIP = (typeof DATA !== 'undefined' && DATA.isVIP) ? DATA.isVIP() : false;
        const vipBlock = document.getElementById('profileVip');
        if (vipBlock) vipBlock.hidden = !isVIP;
    }
})();
