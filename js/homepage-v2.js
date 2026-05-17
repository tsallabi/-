/**
 * الصفحة الرئيسيّة الفاخرة — تستخدم Cloudflare Pages Functions API
 * v27: + admin role detection, hidden-book filtering, restricted-category gating
 */

(async function() {
    const API = '/api';
    let JOURNEYS_CACHE = [];

    // Wait for admin-role module so we know IS_ADMIN before rendering cards
    try {
        if (window.ADMIN_ROLE && window.ADMIN_ROLE.ready) await window.ADMIN_ROLE.ready;
    } catch (_) {}
    const IS_ADMIN = !!window.IS_ADMIN;
    const isHidden = (id) => (typeof window.isBookHidden === 'function') ? window.isBookHidden(id) : false;
    const canSeeCat = (n) => (typeof window.canSeeRestrictedCategory === 'function') ? window.canSeeRestrictedCategory(n) : true;

    // ===== الترحيب الديناميكي =====
    const greetingEl = document.getElementById('greeting');
    if (greetingEl) {
        const u = (typeof USER !== 'undefined') ? USER.current() : null;
        const hour = new Date().getHours();
        let timeGreeting;
        if (hour < 5) timeGreeting = 'سهرة سعيدة';
        else if (hour < 12) timeGreeting = 'صباح النور';
        else if (hour < 17) timeGreeting = 'نهارك سعيد';
        else if (hour < 20) timeGreeting = 'مساء الخير';
        else timeGreeting = 'ليلة هانئة';
        const name = u ? `، ${u.displayName}` : '';
        greetingEl.textContent = `${timeGreeting}${name}`;
    }

    // ===== حكمة اليوم =====
    try {
        const r = await fetch(`${API}/quote`);
        if (r.ok) {
            const quote = await r.json();
            const el = document.getElementById('dailyQuote');
            if (el) {
                el.innerHTML = `
                    <div class="daily-quote-card">
                        <div class="quote-mark">❝</div>
                        <p class="quote-text font-amiri">${escape(quote.text)}</p>
                        <div class="quote-divider"></div>
                        <p class="quote-author">— ${escape(quote.author)}</p>
                    </div>`;
            }
        }
    } catch (_) {}

    // ===== الإحصائيّات =====
    try {
        const r = await fetch(`${API}/stats`);
        if (r.ok) {
            const stats = await r.json();
            updateCounter('statBooks', stats.totalBooks);
            // Filter categories shown in stats counter to exclude restricted ones the user can't see
            const visibleCats = (stats.categories || []).filter(c => canSeeCat(c.name));
            updateCounter('statCategories', visibleCats.length);
            const readers = 12400 + Math.floor((Date.now() / 86400000) % 1000);
            updateCounter('statReaders', readers);
        }
    } catch (_) {}

    // ===== أفضل الكتب =====
    try {
        const r = await fetch(`${API}/featured`);
        if (r.ok) {
            let featured = await r.json();
            // Filter out restricted categories + (for non-admins) hidden books
            featured = featured.filter(b => canSeeCat(b.category) && (IS_ADMIN || !isHidden(b.id)));
            const el = document.getElementById('featuredBooks');
            if (el && featured.length) {
                el.innerHTML = featured.slice(0, 12).map(b => bookCard(b)).join('');
                wireAdminHideButtons(el);
            }
        }
    } catch (_) {}

    // ===== الرحلات القرائيّة =====
    try {
        const r = await fetch(`${API}/journeys`);
        if (r.ok) {
            JOURNEYS_CACHE = await r.json();
            const el = document.getElementById('journeysGrid');
            if (el) {
                el.innerHTML = JOURNEYS_CACHE.map(j => `
                    <button type="button" class="journey-card" data-journey-id="${escape(j.id)}">
                        <div class="journey-icon">${j.icon}</div>
                        <h3 class="journey-title">${escape(j.title)}</h3>
                        <p class="journey-desc">${escape(j.description)}</p>
                        <div class="journey-meta">
                            <span class="badge badge-gold">${j.bookCount} كتاب</span>
                            <span class="badge">${escape(j.difficulty)}</span>
                            <span class="badge">${j.durationWeeks} أسبوع</span>
                        </div>
                    </button>
                `).join('');
            }
        }
    } catch (_) {}

    // ===== الأقسام =====
    try {
        const r = await fetch(`${API}/categories`);
        if (r.ok) {
            let categories = await r.json();
            // Gate: hide restricted categories from non-allowlisted users
            categories = categories.filter(c => canSeeCat(c.name));

            const el = document.getElementById('categoriesGrid');
            if (el) {
                const icons = {
                    'الدين والإسلاميات': '🕌',
                    'تطوير الذات والنجاح': '🌱',
                    'تطوير الذات': '🌱',
                    'التنمية البشرية': '🌟',
                    'علم النفس': '🧠',
                    'الفلسفة والفكر': '🏛️',
                    'التاريخ والتراث': '📜',
                    'الأدب والروايات': '📖',
                    'السير والتراجم': '👤',
                    'ريادة الأعمال': '🚀',
                    'إدارة الأعمال': '📊',
                    'التسويق': '📣',
                    'القيادة': '👑',
                    'القيادة والإدارة': '👑',
                    'المال والاستثمار': '💰',
                    'الاستثمار والمال': '💰',
                    'الإدارة المالية': '💰',
                    'العلوم والمعرفة': '🔬',
                    'الشعر': '✍️',
                    'كتب الأطفال': '🧸'
                };

                // ===== Wave 5: إعادة ترتيب — فئات ريادة الأعمال أوّلاً =====
                const PRIORITY = [
                    ['ريادة الأعمال'],
                    ['تطوير الذات', 'تطوير الذات والنجاح'],
                    ['التنمية البشرية'],
                    ['إدارة الأعمال'],
                    ['التسويق'],
                    ['الاستثمار والمال', 'المال والاستثمار']
                ];
                const matchIndex = (name) => {
                    for (let i = 0; i < PRIORITY.length; i++) {
                        if (PRIORITY[i].some(alias => alias === name)) return i;
                    }
                    return -1;
                };
                const priorityBuckets = PRIORITY.map(() => null);
                const rest = [];
                categories.forEach(c => {
                    const idx = matchIndex(c.name);
                    if (idx >= 0 && priorityBuckets[idx] === null) {
                        priorityBuckets[idx] = c;
                    } else {
                        rest.push(c);
                    }
                });
                const ordered = priorityBuckets.filter(Boolean).concat(rest);

                el.innerHTML = ordered.slice(0, 14).map(c => `
                    <button type="button" class="category-tile" data-category="${escape(c.name)}">
                        <div class="category-tile-icon">${icons[c.name] || '📚'}</div>
                        <div class="category-tile-name">${escape(c.name)}</div>
                        <div class="category-tile-count">${c.count} كتاب</div>
                    </button>
                `).join('');
            }
        }
    } catch (_) {}

    // ===== حدث "فاجئني" =====
    const surpriseBtn = document.getElementById('surpriseBtn');
    if (surpriseBtn) {
        surpriseBtn.addEventListener('click', async () => {
            surpriseBtn.disabled = true;
            const original = surpriseBtn.innerHTML;
            surpriseBtn.textContent = '⏳ أبحث، اصبر...';
            // Try up to 5 random picks to avoid hidden/restricted books
            for (let attempt = 0; attempt < 5; attempt++) {
                try {
                    const r = await fetch(`${API}/books/random`);
                    if (r.ok) {
                        const book = await r.json();
                        if (book && canSeeCat(book.category) && (IS_ADMIN || !isHidden(book.id))) {
                            location.href = `book.html?id=${encodeURIComponent(book.id)}`;
                            return;
                        }
                    }
                } catch (e) {}
            }
            surpriseBtn.innerHTML = original;
            surpriseBtn.disabled = false;
        });
    }

    // ===== Event delegation للبطاقات =====
    document.addEventListener('click', e => {
        const journey = e.target.closest('[data-journey-id]');
        if (journey) {
            e.preventDefault();
            const id = journey.dataset.journeyId;
            const j = JOURNEYS_CACHE.find(x => x.id === id);
            if (j) openJourneyModal(j);
            return;
        }
        const cat = e.target.closest('[data-category]');
        if (cat) {
            e.preventDefault();
            openCategoryModal(cat.dataset.category);
        }
    });

    // ===== المودال (نافذة فاخرة) =====
    function ensureModal() {
        let m = document.getElementById('cardModal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'cardModal';
        m.className = 'taybaa-modal-overlay';
        m.innerHTML = `
            <div class="taybaa-modal" role="dialog" aria-modal="true">
                <button class="taybaa-modal-close" aria-label="إغلاق" type="button">✕</button>
                <div class="taybaa-modal-header">
                    <h2 class="taybaa-modal-title"></h2>
                    <p class="taybaa-modal-subtitle"></p>
                </div>
                <div class="taybaa-modal-body"></div>
            </div>
        `;
        document.body.appendChild(m);
        m.addEventListener('click', ev => {
            if (ev.target === m || ev.target.closest('.taybaa-modal-close')) closeModal();
        });
        document.addEventListener('keydown', ev => {
            if (ev.key === 'Escape') closeModal();
        });
        return m;
    }

    function openModal(title, subtitle, bodyHTML) {
        const m = ensureModal();
        m.querySelector('.taybaa-modal-title').textContent = title;
        const sub = m.querySelector('.taybaa-modal-subtitle');
        sub.textContent = subtitle || '';
        sub.style.display = subtitle ? 'block' : 'none';
        m.querySelector('.taybaa-modal-body').innerHTML = bodyHTML;
        m.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        wireAdminHideButtons(m);
    }

    function closeModal() {
        const m = document.getElementById('cardModal');
        if (m) m.classList.remove('is-open');
        document.body.style.overflow = '';
    }

    function booksGrid(books) {
        // Apply filters before rendering
        const filtered = (books || []).filter(b =>
            canSeeCat(b.category) && (IS_ADMIN || !isHidden(b.id))
        );
        if (!filtered.length) {
            return `<div class="taybaa-modal-empty">
                <div class="taybaa-modal-empty-icon">📚</div>
                <p>لا توجد كتب في هذه الباقة بعد.</p>
                <p class="taybaa-modal-empty-hint">المكتبة تنمو يوميّاً — تابعنا قريباً.</p>
            </div>`;
        }
        return `<div class="taybaa-modal-books">${filtered.map(b => bookCard(b)).join('')}</div>`;
    }

    async function openJourneyModal(journey) {
        openModal(`${journey.icon} ${journey.title}`, journey.description, '<p class="taybaa-modal-loading">جارٍ التحضير...</p>');
        try {
            const r = await fetch(`${API}/journeys`);
            if (r.ok) {
                const all = await r.json();
                const j = all.find(x => x.id === journey.id);
                const books = (j && j.books) || journey.books || [];
                openModal(`${journey.icon} ${journey.title}`, journey.description, booksGrid(books));
            }
        } catch (_) {
            openModal(`${journey.icon} ${journey.title}`, journey.description, booksGrid(journey.books || []));
        }
    }

    async function openCategoryModal(name) {
        if (!canSeeCat(name)) {
            openModal(name, '', '<div class="taybaa-modal-empty"><div class="taybaa-modal-empty-icon">🔒</div><p>هذا القسم غير متاح حالياً.</p></div>');
            return;
        }
        openModal(name, 'تصفّح كتب هذا القسم', '<p class="taybaa-modal-loading">جارٍ تحميل الكتب...</p>');
        try {
            const r = await fetch(`${API}/books?category=${encodeURIComponent(name)}&limit=30&sortBy=views`);
            if (r.ok) {
                const data = await r.json();
                const subtitle = `${data.total} كتاب في هذا القسم${data.total > 30 ? ' — عرض أعلى 30 مشاهدة' : ''}`;
                openModal(name, subtitle, booksGrid(data.books));
            }
        } catch (_) {
            openModal(name, 'تعذّر التحميل', '<p class="taybaa-modal-loading">حدث خطأ، حاول لاحقاً.</p>');
        }
    }

    // ===== Helpers =====
    function bookCard(b) {
        const cover = b.cover || '';
        const safeTitle = escape(b.title || '');
        const safeAuthor = escape(b.author || 'مجهول');
        const bookHidden = isHidden(b.id);
        const dimClass = (IS_ADMIN && bookHidden) ? ' book-spine-admin-hidden' : '';
        const adminBtn = IS_ADMIN
            ? `<button type="button" class="admin-hide-btn" data-id="${escape(b.id)}" title="حذف الكتاب">×</button>`
            : '';
        return `
            <a class="book-spine${dimClass}" href="book.html?id=${encodeURIComponent(b.id)}" data-book-id="${escape(b.id)}" style="position:relative;">
                ${adminBtn}
                <div class="book-spine-cover">
                    ${cover ? `<img src="${escape(cover)}" alt="${safeTitle}" loading="lazy" onerror="this.style.display='none'">` : ''}
                    <div class="book-spine-fallback font-amiri">${safeTitle}</div>
                </div>
                <div class="book-spine-info">
                    <div class="book-spine-title">${safeTitle}</div>
                    <div class="book-spine-author">${safeAuthor}</div>
                </div>
            </a>`;
    }

    function wireAdminHideButtons(rootEl) {
        if (!IS_ADMIN || !rootEl) return;
        rootEl.querySelectorAll('.admin-hide-btn').forEach(btn => {
            if (btn._wired) return;
            btn._wired = true;
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.dataset.id;
                if (!id) return;
                if (!confirm('حذف الكتاب من المكتبة؟')) return;
                try { window.adminHideBook && window.adminHideBook(id); } catch (_) {}
                const card = btn.closest('.book-spine, .book-card');
                if (card) {
                    card.classList.add('admin-fade-out');
                    setTimeout(() => card.remove(), 400);
                }
            });
        });
    }

    function escape(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function updateCounter(id, target) {
        const el = document.getElementById(id);
        if (!el) return;
        const duration = 1200;
        const start = performance.now();
        const startVal = parseInt(el.textContent) || 0;
        function step(now) {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            const val = Math.floor(startVal + (target - startVal) * eased);
            el.textContent = formatNumber(val);
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function formatNumber(n) {
        if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        return String(n);
    }
})();
