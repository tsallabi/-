/* ============================================================
   📕  منطق صفحة تفاصيل الكتاب
   ============================================================ */

(async function() {
    document.getElementById('year').textContent = new Date().getFullYear();

    const params = new URLSearchParams(location.search);
    const id = params.get('id');

    const els = {
        loading: document.getElementById('loadingState'),
        notFound: document.getElementById('notFoundState'),
        detail: document.getElementById('bookDetail'),
        cover: document.getElementById('bookCover'),
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
    try {
        books = await DATA.loadBooks();
    } catch (err) {
        console.error(err);
        return showNotFound();
    }

    const book = DATA.findById(books, id);
    if (!book) return showNotFound();

    document.title = `${book.title} — المكتبة`;
    els.loading.hidden = true;
    els.detail.hidden = false;

    if (book.cover) {
        els.cover.src = book.cover;
        els.cover.alt = book.title;
    } else {
        els.cover.replaceWith(Object.assign(document.createElement('div'), {
            className: 'book-cover-placeholder',
            textContent: book.title.charAt(0) || '📖'
        }));
    }
    els.category.textContent = book.category || 'غير مصنّف';
    els.title.textContent = book.title;
    els.author.textContent = book.author || 'غير معروف';
    els.pages.textContent = book.pages || '—';
    els.views.textContent = book.views || 0;
    els.downloads.textContent = book.downloads || 0;

    if (book.pdf) {
        els.readBtn.href = `reader.html?pdf=${encodeURIComponent(book.pdf)}` +
                          `&title=${encodeURIComponent(book.title)}`;
        els.downloadBtn.href = book.pdf;
        els.downloadBtn.setAttribute('download', `${book.title}.pdf`);

        els.downloadBtn.addEventListener('click', () => {
            COUNTER.increment(book.id, 'downloads');
            els.downloads.textContent = (Number(els.downloads.textContent) + 1);
        });
    } else {
        els.readBtn.classList.add('disabled');
        els.readBtn.setAttribute('aria-disabled', 'true');
        els.readBtn.removeAttribute('href');
        els.downloadBtn.style.display = 'none';
    }

    if (book.description) {
        els.description.textContent = book.description;
        els.descSection.hidden = false;
    }
    if (book.introduction) {
        els.intro.textContent = book.introduction;
        els.introSection.hidden = false;
    }

    COUNTER.increment(book.id, 'views');
    const live = await COUNTER.getCounts(book.id);
    if (live) {
        if (typeof live.views === 'number') els.views.textContent = live.views;
        if (typeof live.downloads === 'number') els.downloads.textContent = live.downloads;
    }

    function showNotFound() {
        els.loading.hidden = true;
        els.notFound.hidden = false;
    }
})();
