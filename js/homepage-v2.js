/**
 * الصفحة الرئيسيّة الفاخرة — تستخدم Cloudflare Pages Functions API
 * v23: بطاقات الرحلات والأقسام تفتح نافذة فاخرة بكتبها
 */

(async function() {
    const API = '/api';
    let JOURNEYS_CACHE = [];

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
            updateCounter('statCategories', stats.categories.length);
            const readers = 12400 + Math.floor((Date.now() / 86400000) % 1000);
            updateCounter('statReaders', readers);
        }
    } catch (_) {}

    // ===== أفضل الكتب =====
    try {
        const r = await fetch(`${API}/featured`);
        if (r.ok) {
            const featured = await r.json();
            const el = document.getElementById('featuredBooks');
            if (el && featured.length) {
                el.innerHTML = featured.slice(0, 12).map(b => bookCard(b)).join('');
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
            const categories = await r.json();
            const el = document.getElementById('categoriesGrid');
            if (el) {
                const icons = {
                    'الدين والإسلاميات': '🕌',
                    'تطوير الذات والنجاح': '🌱',
                    'علم النفس': '🧠',
                    'الفلسفة والفكر': '🏛️',
                    'التاريخ والتراث': '📜',
                    'الأدب والروايات': '📖',
                    'السير والتراجم': '👤',
                    'ريادة الأعمال': '🚀',
                    'إدارة الأعمال': '📊',
                    'التسويق': '📣',
                    'المال والاستثمار': '💰',
                    'العلوم والمعرفة': '🔬',
                    'الشعر': '✍️',
                    'كتب الأطفال': '🧸'
                };
                el.innerHTML = categories.slice(0, 14).map(c => `
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
            try {
                const r = await fetch(`${API}/books/random`);
                if (r.ok) {
                    const book = await r.json();
                    location.href = `book.html?id=${encodeURIComponent(book.id)}`;
                    return;
                }
            } catch (e) {}
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
    }

    function closeModal() {
        const m = document.getElementById('cardModal');
        if (m) m.classList.remove('is-open');
        document.body.style.overflow = '';
    }

    function booksGrid(books) {
        if (!books || !books.length) {
            return `<div class="taybaa-modal-empty">
                <div class="taybaa-modal-empty-icon">📚</div>
                <p>لا توجد كتب في هذه الباقة بعد.</p>
                <p class="taybaa-modal-empty-hint">المكتبة تنمو يوميّاً — تابعنا قريباً.</p>
            </div>`;
        }
        return `<div class="taybaa-modal-books">${books.map(b => bookCard(b)).join('')}</div>`;
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
        return `
            <a class="book-spine" href="book.html?id=${encodeURIComponent(b.id)}">
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
