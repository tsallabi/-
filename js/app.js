/* منطق الصفحة الرئيسية + فلتر VIP + أقسام مميّزة */

(async function() {
    initThemeToggle();
    document.getElementById('year').textContent = new Date().getFullYear();
    initVIPUnlock();

    const els = {
        categoriesGrid: document.getElementById('categoriesGrid'),
        managementBooks: document.getElementById('managementBooks'),
        entrepreneurshipBooks: document.getElementById('entrepreneurshipBooks'),
        popularBooks: document.getElementById('popularBooks'),
        newBooks: document.getElementById('newBooks'),
        recommendedBooks: document.getElementById('recommendedBooks'),
        filteredSection: document.getElementById('filteredSection'),
        filteredBooks: document.getElementById('filteredBooks'),
        filteredTitle: document.getElementById('filteredTitle'),
        emptyState: document.getElementById('emptyState'),
        clearFilter: document.getElementById('clearFilter'),
        searchForm: document.getElementById('searchForm'),
        searchInput: document.getElementById('searchInput'),
        managementSection: document.getElementById('managementSection'),
        entrepreneurshipSection: document.getElementById('entrepreneurshipSection'),
        popularSection: document.getElementById('popularSection'),
        newSection: document.getElementById('newSection'),
        recommendedSection: document.getElementById('recommendedSection'),
        statBooks: document.getElementById('statBooks'),
        statReaders: document.getElementById('statReaders'),
        statDownloads: document.getElementById('statDownloads'),
        vipBadge: document.getElementById('vipBadge')
    };

    let allBooks = [];
    try { allBooks = await DATA.loadBooks(); } catch (err) { console.error(err); }
    allBooks = DATA.filterForViewer(allBooks);

    if (els.vipBadge && DATA.isVIP()) els.vipBadge.hidden = false;

    if (!allBooks.length) {
        if (els.popularBooks) els.popularBooks.innerHTML = '<p class="empty-state">لم يتم العثور على كتب بعد.</p>';
        return;
    }

    const totals = DATA.totals(allBooks);
    animateCount(els.statBooks, totals.books);
    animateCount(els.statReaders, totals.views);
    animateCount(els.statDownloads, totals.downloads);

    renderCategories(DATA.categoriesWithCounts(allBooks));

    const mgmtCats = ['تطوير الذات والنجاح', 'التحفيز والإلهام', 'القيادة والإدارة', 'إدارة الأعمال'];
    const entCats = ['ريادة الأعمال', 'فن البيع', 'التسويق', 'الإدارة المالية', 'المال والاستثمار'];
    const mgmtBooks = allBooks.filter(b => mgmtCats.includes(b.category)).slice(0, 12);
    const entBooks = allBooks.filter(b => entCats.includes(b.category)).slice(0, 12);

    renderAndHydrate(els.managementBooks, mgmtBooks);
    renderAndHydrate(els.entrepreneurshipBooks, entBooks);
    renderAndHydrate(els.popularBooks, DATA.topPopular(allBooks));
    renderAndHydrate(els.newBooks, DATA.newest(allBooks));
    renderAndHydrate(els.recommendedBooks, DATA.recommended(allBooks));

    els.searchForm.addEventListener('submit', e => {
        e.preventDefault();
        const q = els.searchInput.value.trim();
        if (!q) { showAll(); return; }
        showFiltered(`نتائج البحث عن "${q}"`, DATA.search(allBooks, q));
    });

    let typingTimer;
    els.searchInput.addEventListener('input', () => {
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            const q = els.searchInput.value.trim();
            if (q.length < 2) { showAll(); return; }
            showFiltered(`نتائج البحث عن "${q}"`, DATA.search(allBooks, q));
        }, 250);
    });

    els.clearFilter.addEventListener('click', () => { els.searchInput.value = ''; showAll(); });

    document.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); els.searchInput.focus(); }
    });

    function renderCategories(categories) {
        els.categoriesGrid.innerHTML = categories.map(c => {
            const icon = CONFIG.categoryIcons[c.name] || CONFIG.defaultCategoryIcon;
            return `<a href="#" class="category-card" data-category="${escapeHTML(c.name)}">
                <span class="category-icon">${icon}</span>
                <span class="category-name">${escapeHTML(c.name)}</span>
                <span class="category-count">${c.count} كتاب</span>
            </a>`;
        }).join('');
        els.categoriesGrid.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', e => {
                e.preventDefault();
                const cat = card.dataset.category;
                showFiltered(`📂 ${cat}`, DATA.byCategory(allBooks, cat));
            });
        });
    }

    function renderAndHydrate(container, books) {
        if (!container) return;
        if (!books.length) { container.innerHTML = '<p class="empty-state">لا توجد كتب لعرضها.</p>'; return; }
        container.innerHTML = books.map(bookCardHTML).join('');
        if (typeof COVER !== 'undefined') COVER.hydrate(container, books);
    }

    function bookCardHTML(book) {
        const icon = CONFIG.categoryIcons[book.category] || CONFIG.defaultCategoryIcon || '📚';
        const publisher = CONFIG.publisherShort || 'دار المكتبة الطيبة';
        const fallback = `<div class="book-cover-fallback" aria-hidden="true">
            <div class="cf-top"><span class="cf-icon">${icon}</span></div>
            <div class="cf-mid"><h3 class="cf-title">${escapeHTML(book.title)}</h3></div>
            <div class="cf-bottom">
                <p class="cf-author">${escapeHTML(book.author || 'مؤلف غير معروف')}</p>
                <p class="cf-publisher">${escapeHTML(publisher)}</p>
            </div></div>`;
        return `<a class="book-card" data-book-id="${escapeAttr(book.id)}" href="book.html?id=${encodeURIComponent(book.id)}">
            <div class="book-cover-frame">${fallback}</div>
            <div class="book-body">
                <h3 class="book-title">${escapeHTML(book.title)}</h3>
                <p class="book-author">${escapeHTML(book.author || 'مؤلف غير معروف')}</p>
                <div class="book-meta">
                    ${book.pages ? `<span>📄 ${book.pages}</span>` : ''}
                    <span>👁️ ${formatNumber(book.views)}</span>
                    <span>⬇️ ${formatNumber(book.downloads)}</span>
                </div>
            </div>
        </a>`;
    }

    function showFiltered(title, books) {
        els.filteredTitle.textContent = title;
        renderAndHydrate(els.filteredBooks, books);
        els.emptyState.hidden = books.length > 0;
        els.filteredSection.hidden = false;
        toggleHomeSections(false);
        els.filteredSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function showAll() { els.filteredSection.hidden = true; toggleHomeSections(true); }
    function toggleHomeSections(show) {
        [els.managementSection, els.entrepreneurshipSection, els.popularSection, els.newSection, els.recommendedSection]
            .forEach(s => { if (s) s.hidden = !show; });
    }

    function escapeHTML(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function escapeAttr(s) { return escapeHTML(s); }
    function formatNumber(n) {
        n = Number(n) || 0;
        if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        return String(n);
    }
    function animateCount(el, target) {
        if (!el) return;
        const duration = 1000, start = performance.now();
        const step = now => {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = formatNumber(Math.floor(target * eased));
            if (p < 1) requestAnimationFrame(step); else el.textContent = formatNumber(target);
        };
        requestAnimationFrame(step);
    }

    function initThemeToggle() {
        const theme = localStorage.getItem('taybaa-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        const btn = document.getElementById('themeToggle');
        if (!btn) return;
        btn.addEventListener('click', () => {
            const cur = document.documentElement.getAttribute('data-theme');
            const next = cur === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('taybaa-theme', next);
        });
    }

    function initVIPUnlock() {
        // 5 نقرات على الشعار خلال ثانيتين تفتح صندوق كلمة سرّ القسم الخاص
        const logo = document.querySelector('.logo-mark');
        if (!logo) return;
        let clicks = 0, timer = null;
        logo.addEventListener('click', e => {
            clicks++;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => { clicks = 0; }, 2000);
            if (clicks >= 5) {
                clicks = 0;
                e.preventDefault();
                const p = prompt('🔐 أدخل كلمة سرّ القسم الخاص:');
                if (p === null) return;
                if (DATA.unlockVIP(p)) {
                    alert('✅ تم فتح القسم الخاص. أعد تحميل الصفحة.');
                    location.reload();
                } else {
                    alert('❌ كلمة سرّ غير صحيحة.');
                }
            }
        });
    }
})();
