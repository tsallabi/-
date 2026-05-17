/* منطق صفحة تفاصيل الكتاب + زرّ المفضّلة + تمرير bookId للقارئ */

(async function() {
    initThemeToggle();
    document.getElementById('year').textContent = new Date().getFullYear();

    const params = new URLSearchParams(location.search);
    const id = params.get('id');

    const els = {
        loading: document.getElementById('loadingState'),
        notFound: document.getElementById('notFoundState'),
        detail: document.getElementById('bookDetail'),
        coverFrame: document.getElementById('bookCoverFrame'),
        category: document.getElementById('bookCategory'),
        title: document.getElementById('bookTitle'),
        author: document.getElementById('bookAuthor'),
        pages: document.getElementById('bookPages'),
        views: document.getElementById('bookViews'),
        downloads: document.getElementById('bookDownloads'),
        readBtn: document.getElementById('readBtn'),
        downloadBtn: document.getElementById('downloadBtn'),
        favBtn: document.getElementById('favBtn'),
        soonNotice: document.getElementById('soonNotice'),
        bookActions: document.getElementById('bookActions'),
        descSection: document.getElementById('descriptionSection'),
        introSection: document.getElementById('introSection'),
        description: document.getElementById('bookDescription'),
        intro: document.getElementById('bookIntro'),
        resumeBadge: document.getElementById('resumeBadge')
    };

    if (!id) return showNotFound();

    // Wait for admin-role module to finish loading (so IS_ADMIN, isBookHidden and
    // canSeeRestrictedCategory are reliable before we render the book).
    try {
        if (window.ADMIN_ROLE && window.ADMIN_ROLE.ready) await window.ADMIN_ROLE.ready;
    } catch (_) {}

    let books;
    try { books = await DATA.loadBooks(); } catch (err) { console.error(err); return showNotFound(); }
    books = DATA.filterForViewer(books);

    const book = DATA.findById(books, id);
    if (!book) return showNotFound();

    // Restricted-category gate (Wave 27)
    if (typeof window.canSeeRestrictedCategory === 'function' &&
        !window.canSeeRestrictedCategory(book.category)) {
        return showNotFound();
    }

    // Hidden-book gate: non-admins can't view hidden books even if they hit the URL directly
    const IS_ADMIN = !!window.IS_ADMIN;
    if (!IS_ADMIN && typeof window.isBookHidden === 'function' && window.isBookHidden(book.id)) {
        return showNotFound();
    }

    document.title = `${book.title} — مكتبة ليبيا الطيبة`;
    els.loading.hidden = true;
    els.detail.hidden = false;

    renderCoverFrame(book);
    els.category.textContent = book.category || 'غير مصنّف';
    els.title.textContent = book.title;
    els.author.textContent = book.author || 'غير معروف';
    els.pages.textContent = book.pages || '—';
    els.views.textContent = book.views || 0;
    els.downloads.textContent = book.downloads || 0;

    // زرّ المفضّلة
    if (els.favBtn && typeof FAVS !== 'undefined') {
        updateFavBtn();
        els.favBtn.addEventListener('click', () => {
            FAVS.toggle(book.id);
            updateFavBtn();
        });
    }
    function updateFavBtn() {
        const isFav = FAVS.has(book.id);
        els.favBtn.classList.toggle('is-fav', isFav);
        els.favBtn.innerHTML = isFav ? '♥ في المفضّلة' : '♡ أضف للمفضّلة';
    }

    // موقع آخر صفحة قراءة
    if (els.resumeBadge && typeof READING !== 'undefined') {
        const lastPage = READING.getPage(book.id);
        if (lastPage > 1) {
            els.resumeBadge.hidden = false;
            els.resumeBadge.innerHTML = `📖 تركت القراءة عند الصفحة <strong>${lastPage}</strong>`;
        }
    }

    const source = book.pdf || book.html;
    if (source) {
        // تمرير bookId ليتمكّن القارئ من حفظ واستئناف موقع القراءة
        els.readBtn.href = `reader.html?pdf=${encodeURIComponent(source)}&title=${encodeURIComponent(book.title)}&bookId=${encodeURIComponent(book.id)}`;
        if (book.pdf) {
            els.downloadBtn.href = book.pdf;
            els.downloadBtn.setAttribute('download', `${book.title}.pdf`);
            els.downloadBtn.addEventListener('click', () => {
                COUNTER.increment(book.id, 'downloads');
                els.downloads.textContent = (Number(els.downloads.textContent) + 1);
            });
        } else { els.downloadBtn.style.display = 'none'; }
    } else {
        if (els.bookActions) els.bookActions.style.display = 'none';
        if (els.soonNotice) els.soonNotice.hidden = false;
    }

    if (book.description) { els.description.textContent = book.description; els.descSection.hidden = false; }
    if (book.introduction) { els.intro.textContent = book.introduction; els.introSection.hidden = false; }

    COUNTER.increment(book.id, 'views');
    const live = await COUNTER.getCounts(book.id);
    if (live) {
        if (typeof live.views === 'number') els.views.textContent = live.views;
        if (typeof live.downloads === 'number') els.downloads.textContent = live.downloads;
    }

    async function renderCoverFrame(book) {
        if (!els.coverFrame) return;
        const icon = (CONFIG.categoryIcons && CONFIG.categoryIcons[book.category]) || CONFIG.defaultCategoryIcon || '📚';
        const publisher = CONFIG.publisherShort || 'دار مكتبة ليبيا الطيبة';
        els.coverFrame.innerHTML = `<div class="book-cover-fallback" aria-hidden="true">
            <div class="cf-top"><span class="cf-icon">${icon}</span></div>
            <div class="cf-mid"><h3 class="cf-title">${escapeHTML(book.title)}</h3></div>
            <div class="cf-bottom"><p class="cf-author">${escapeHTML(book.author || 'مؤلف غير معروف')}</p><p class="cf-publisher">${escapeHTML(publisher)}</p></div>
        </div>`;
        if (typeof COVER !== 'undefined') {
            try {
                const url = await COVER.resolve(book);
                if (url) {
                    const img = document.createElement('img');
                    img.className = 'book-cover';
                    img.alt = book.title;
                    img.onerror = function() { this.remove(); };
                    img.src = url;
                    els.coverFrame.appendChild(img);
                }
            } catch (_) {}
        }
    }

    function escapeHTML(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function showNotFound() { els.loading.hidden = true; els.notFound.hidden = false; }
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
})();
