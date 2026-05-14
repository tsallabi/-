/* منطق صفحة تفاصيل الكتاب */

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
        descSection: document.getElementById('descriptionSection'),
        introSection: document.getElementById('introSection'),
        description: document.getElementById('bookDescription'),
        intro: document.getElementById('bookIntro')
    };

    if (!id) return showNotFound();

    let books;
    try { books = await DATA.loadBooks(); } catch (err) { console.error(err); return showNotFound(); }
    books = DATA.filterForViewer(books);

    const book = DATA.findById(books, id);
    if (!book) return showNotFound();

    document.title = `${book.title} — المكتبة الطيبة`;
    els.loading.hidden = true;
    els.detail.hidden = false;

    renderCoverFrame(book);
    els.category.textContent = book.category || 'غير مصنّف';
    els.title.textContent = book.title;
    els.author.textContent = book.author || 'غير معروف';
    els.pages.textContent = book.pages || '—';
    els.views.textContent = book.views || 0;
    els.downloads.textContent = book.downloads || 0;

    const source = book.pdf || book.html;
    if (source) {
        els.readBtn.href = `reader.html?pdf=${encodeURIComponent(source)}&title=${encodeURIComponent(book.title)}`;
        if (book.pdf) {
            els.downloadBtn.href = book.pdf;
            els.downloadBtn.setAttribute('download', `${book.title}.pdf`);
            els.downloadBtn.addEventListener('click', () => {
                COUNTER.increment(book.id, 'downloads');
                els.downloads.textContent = (Number(els.downloads.textContent) + 1);
            });
        } else { els.downloadBtn.style.display = 'none'; }
    } else {
        els.readBtn.style.opacity = '.5';
        els.readBtn.style.pointerEvents = 'none';
        els.downloadBtn.style.display = 'none';
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
        const publisher = CONFIG.publisherShort || 'دار المكتبة الطيبة';
        els.coverFrame.innerHTML = `<div class="book-cover-fallback" aria-hidden="true">
            <div class="cf-top"><span class="cf-icon">${icon}</span></div>
            <div class="cf-mid"><h3 class="cf-title">${escapeHTML(book.title)}</h3></div>
            <div class="cf-bottom">
                <p class="cf-author">${escapeHTML(book.author || 'مؤلف غير معروف')}</p>
                <p class="cf-publisher">${escapeHTML(publisher)}</p>
            </div></div>`;
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
