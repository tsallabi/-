/* ============================================================
   🏠  منطق الصفحة الرئيسية
   ============================================================ */

(async function() {
    document.getElementById('year').textContent = new Date().getFullYear();

    const els = {
        categoriesGrid: document.getElementById('categoriesGrid'),
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
        popularSection: document.getElementById('popularSection'),
        newSection: document.getElementById('newSection'),
        recommendedSection: document.getElementById('recommendedSection')
    };

    let allBooks = [];
    try {
        allBooks = await DATA.loadBooks();
    } catch (err) {
        console.error(err);
    }

    if (!allBooks.length) {
        els.popularBooks.innerHTML = '<p class="empty-state">لم يتم العثور على كتب بعد.</p>';
        return;
    }

    renderCategories(DATA.categoriesWithCounts(allBooks));
    renderBooks(els.popularBooks, DATA.topPopular(allBooks));
    renderBooks(els.newBooks, DATA.newest(allBooks));
    renderBooks(els.recommendedBooks, DATA.recommended(allBooks));

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

    els.clearFilter.addEventListener('click', () => {
        els.searchInput.value = '';
        showAll();
    });

    function renderCategories(categories) {
        els.categoriesGrid.innerHTML = categories.map(c => {
            const icon = CONFIG.categoryIcons[c.name] || CONFIG.defaultCategoryIcon;
            return `
                <a href="#" class="category-card" data-category="${escapeHTML(c.name)}">
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

    function renderBooks(container, books) {
        if (!books.length) {
            container.innerHTML = '<p class="empty-state">لا توجد كتب لعرضها.</p>';
            return;
        }
        container.innerHTML = books.map(bookCardHTML).join('');
    }

    function bookCardHTML(book) {
        const cover = book.cover
            ? `<img class="book-cover" src="${escapeAttr(book.cover)}" alt="${escapeAttr(book.title)}" loading="lazy">`
            : `<div class="book-cover-placeholder">${escapeHTML(book.title.charAt(0) || '📖')}</div>`;
        return `
            <a class="book-card" href="book.html?id=${encodeURIComponent(book.id)}">
                ${cover}
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
        renderBooks(els.filteredBooks, books);
        els.emptyState.hidden = books.length > 0;
        els.filteredSection.hidden = false;
        toggleHomeSections(false);
        els.filteredSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function showAll() {
        els.filteredSection.hidden = true;
        toggleHomeSections(true);
    }

    function toggleHomeSections(show) {
        [els.popularSection, els.newSection, els.recommendedSection].forEach(s => {
            s.hidden = !show;
        });
    }

    function escapeHTML(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }
    function escapeAttr(s) { return escapeHTML(s); }
    function formatNumber(n) {
        n = Number(n) || 0;
        if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        return String(n);
    }
})();
