/**
 * الصفحة الرئيسيّة الفاخرة — تستخدم Cloudflare Pages Functions API
 */

(async function() {
    const API = '/api';

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

    // ===== أفضل الكتب — فرس (carousel) =====
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
            const journeys = await r.json();
            const el = document.getElementById('journeysGrid');
            if (el) {
                el.innerHTML = journeys.map(j => `
                    <a href="#journey-${j.id}" class="journey-card">
                        <div class="journey-icon">${j.icon}</div>
                        <h3 class="journey-title">${escape(j.title)}</h3>
                        <p class="journey-desc">${escape(j.description)}</p>
                        <div class="journey-meta">
                            <span class="badge badge-gold">${j.bookCount} كتاب</span>
                            <span class="badge">${j.difficulty}</span>
                            <span class="badge">${j.durationWeeks} أسبوع</span>
                        </div>
                    </a>
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
                el.innerHTML = categories.slice(0, 12).map(c => `
                    <a href="#cat-${encodeURIComponent(c.name)}" class="category-tile">
                        <div class="category-tile-icon">${icons[c.name] || '📚'}</div>
                        <div class="category-tile-name">${escape(c.name)}</div>
                        <div class="category-tile-count">${c.count} كتاب</div>
                    </a>
                `).join('');
            }
        }
    } catch (_) {}

    // ===== حدث "فاجئني" =====
    const surpriseBtn = document.getElementById('surpriseBtn');
    if (surpriseBtn) {
        surpriseBtn.addEventListener('click', async () => {
            surpriseBtn.disabled = true;
            surpriseBtn.textContent = '⏳ أبحث، اصبر...';
            try {
                const r = await fetch(`${API}/books/random`);
                if (r.ok) {
                    const book = await r.json();
                    location.href = `book.html?id=${book.id}`;
                }
            } catch (e) {
                surpriseBtn.textContent = '🎲 فاجئني بكتاب';
                surpriseBtn.disabled = false;
            }
        });
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
        return String(s || '').replace(/[&<>"']/g, c => ({
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
