/* لوحة إدارة الكتب: بحث Google Books + تعديل الأغلفة + إضافة PDF */

(async function() {
    const OWNER = (typeof GHSAVE !== 'undefined' && GHSAVE.OWNER) || 'tsallabi';
    const REPO = (typeof GHSAVE !== 'undefined' && GHSAVE.REPO) || '-';
    const BRANCH = (typeof GHSAVE !== 'undefined' && GHSAVE.BRANCH) || 'main';
    const OVERRIDES_PATH = 'data/book-overrides.json';
    const EXTRA_PATH = 'data/books-extra-3.json';

    // التبويب
    document.querySelectorAll('.bm-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.bm-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.bm-panel').forEach(p => p.hidden = p.dataset.panel !== tab.dataset.tab);
        });
    });

    // تعبئة الأقسام
    const categories = CONFIG.categoryOrder || [];
    const bulkCatSel = document.getElementById('gbBulkCategory');
    const pdfCatSel = document.getElementById('pdfCategory');
    categories.forEach(c => {
        bulkCatSel.appendChild(new Option(c, c));
        pdfCatSel.appendChild(new Option(c, c));
    });
    document.getElementById('pdfDate').value = new Date().toISOString().slice(0, 10);

    // تحميل الكتب الحالية
    const allBooks = await DATA.loadBooks();

    /* ============ Tab 1: Google Books Search ============ */
    let gbResults = [];
    const gbSelected = new Set();

    document.getElementById('gbSearchBtn').addEventListener('click', searchGoogle);
    document.getElementById('gbQuery').addEventListener('keydown', e => { if (e.key === 'Enter') searchGoogle(); });

    async function searchGoogle() {
        const q = document.getElementById('gbQuery').value.trim();
        if (!q) return;
        const lang = document.getElementById('gbLang').value;
        const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=40${lang ? '&langRestrict=' + lang : ''}`;
        showGBMessage('جارٍ البحث...', '');
        try {
            const res = await fetch(url);
            const data = await res.json();
            gbResults = (data.items || []).map(item => normalizeGoogle(item));
            renderGBResults();
            document.getElementById('gbBulkBar').hidden = !gbResults.length;
            showGBMessage(gbResults.length ? `✅ وجدنا ${gbResults.length} نتيجة` : '⚠️ لا نتائج', gbResults.length ? 'success' : 'error');
        } catch (err) {
            showGBMessage('❌ فشل البحث: ' + err.message, 'error');
        }
    }

    function normalizeGoogle(item) {
        const v = item.volumeInfo || {};
        let cover = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || '';
        if (cover) cover = cover.replace(/^http:/, 'https:').replace(/&edge=curl/, '').replace(/&zoom=\d/, '&zoom=2');
        return {
            googleId: item.id,
            title: v.title || '',
            author: (v.authors || []).join('، '),
            cover,
            pages: v.pageCount || 0,
            description: v.description || '',
            publishedDate: v.publishedDate || '',
            isbn: (v.industryIdentifiers || []).map(x => x.identifier).join(', '),
            previewLink: v.previewLink || ''
        };
    }

    function renderGBResults() {
        const container = document.getElementById('gbResults');
        container.innerHTML = gbResults.map((b, i) => `
            <div class="gb-card${gbSelected.has(i) ? ' selected' : ''}" data-i="${i}">
                ${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '<div style="height:220px;display:grid;place-items:center;background:var(--bg-base);font-size:2rem;">📖</div>'}
                <span class="gb-tag">${b.pages || '—'} ص</span>
                <div class="gb-check">✓</div>
                <div class="gb-info">
                    <h3>${esc(b.title)}</h3>
                    <p>${esc(b.author || '—')}</p>
                </div>
            </div>`).join('');
        container.querySelectorAll('.gb-card').forEach(card => {
            card.addEventListener('click', () => {
                const i = Number(card.dataset.i);
                if (gbSelected.has(i)) gbSelected.delete(i); else gbSelected.add(i);
                card.classList.toggle('selected');
                document.getElementById('gbSelectedCount').textContent = gbSelected.size;
            });
        });
    }

    document.getElementById('gbSelectAll').addEventListener('click', () => {
        gbResults.forEach((_, i) => gbSelected.add(i));
        renderGBResults();
        document.getElementById('gbSelectedCount').textContent = gbSelected.size;
    });
    document.getElementById('gbDeselectAll').addEventListener('click', () => {
        gbSelected.clear();
        renderGBResults();
        document.getElementById('gbSelectedCount').textContent = 0;
    });

    document.getElementById('gbImportBtn').addEventListener('click', async () => {
        if (!gbSelected.size) return showGBMessage('⚠️ حدد كتباً أولاً', 'error');
        const cat = bulkCatSel.value;
        if (!cat) return showGBMessage('⚠️ اختر القسم أولاً', 'error');
        if (!GHSAVE.hasToken()) return showGBMessage('⚠️ يلزم GitHub Token — أضفه من admin.html', 'error');

        showGBMessage('جارٍ الاستيراد...', '');
        const picked = Array.from(gbSelected).map(i => gbResults[i]);
        const today = new Date().toISOString().slice(0, 10);
        const startId = nextBookId(allBooks);
        const newBooks = picked.map((p, i) => ({
            id: String(startId + i),
            title: p.title,
            author: p.author,
            category: cat,
            pages: p.pages,
            cover: p.cover,
            pdf: '',
            description: stripHTML(p.description).slice(0, 600),
            views: 0, downloads: 0,
            addedDate: today,
            recommended: false,
            source: 'google-books',
            googleId: p.googleId,
            isbn: p.isbn
        }));

        try {
            await appendToExtraJSON(newBooks);
            showGBMessage(`✅ تمّ استيراد ${newBooks.length} كتاباً. ستظهر في الموقع بعد بضع دقائق.`, 'success');
            gbSelected.clear();
            renderGBResults();
            document.getElementById('gbSelectedCount').textContent = 0;
        } catch (err) {
            showGBMessage('❌ فشل الحفظ: ' + err.message, 'error');
        }
    });

    /* ============ Tab 2: Edit Covers ============ */
    let selectedBook = null;
    let overrides = await loadOverrides();

    document.getElementById('bookFilter').addEventListener('input', e => renderBookList(e.target.value));
    renderBookList('');

    function renderBookList(filter) {
        const f = filter.trim().toLowerCase();
        const filtered = allBooks.filter(b =>
            !f || b.title.toLowerCase().includes(f) || (b.author || '').toLowerCase().includes(f)
        ).slice(0, 100);
        const html = filtered.map(b => `
            <div class="bm-book-row" data-id="${esc(b.id)}">
                <div class="mini-cover">${(overrides[b.id]?.cover || b.cover) ? `<img src="${esc(overrides[b.id]?.cover || b.cover)}" onerror="this.style.display='none'">` : '📖'}</div>
                <div class="mini-info"><b>${esc(b.title)}</b><span>${esc(b.author || '—')} · ${esc(b.category)}</span></div>
                <button type="button">✏️ تعديل غلاف</button>
            </div>`).join('');
        document.getElementById('bookList').innerHTML = html || '<p style="text-align:center;padding:1rem;color:var(--text-muted);">لا نتائج</p>';
        document.querySelectorAll('#bookList .bm-book-row').forEach(row => {
            row.querySelector('button').addEventListener('click', () => openCoverEdit(row.dataset.id));
        });
    }

    function openCoverEdit(bookId) {
        selectedBook = allBooks.find(b => b.id === bookId);
        if (!selectedBook) return;
        document.getElementById('coverEditCard').hidden = false;
        document.getElementById('editBookTitle').textContent = selectedBook.title;
        document.getElementById('editBookAuthor').textContent = selectedBook.author + ' · ' + selectedBook.category;
        const cur = overrides[bookId]?.cover || selectedBook.cover || '';
        document.getElementById('coverUrl').value = cur;
        updateCoverPreview(cur);
        document.getElementById('coverEditCard').scrollIntoView({ behavior: 'smooth' });
    }

    document.getElementById('coverUrl').addEventListener('input', e => updateCoverPreview(e.target.value));
    function updateCoverPreview(url) {
        const prev = document.getElementById('coverPreview');
        prev.innerHTML = url ? `<img src="${esc(url)}" onerror="this.outerHTML='<div style=\'padding:1rem;text-align:center;\'>❌</div>'">` : '<div style="padding:1rem;text-align:center;font-size:1.5rem;">📖</div>';
    }

    document.getElementById('saveCoverBtn').addEventListener('click', async () => {
        if (!selectedBook) return;
        if (!GHSAVE.hasToken()) { showCoverMsg('⚠️ يلزم GitHub Token — أضفه من admin.html', 'error'); return; }
        const newUrl = document.getElementById('coverUrl').value.trim();
        showCoverMsg('جارٍ الحفظ...', '');
        try {
            overrides[selectedBook.id] = { ...(overrides[selectedBook.id] || {}), cover: newUrl };
            await saveOverrides();
            showCoverMsg('✅ تمّ حفظ الغلاف!', 'success');
            renderBookList(document.getElementById('bookFilter').value);
        } catch (err) { showCoverMsg('❌ ' + err.message, 'error'); }
    });

    /* ============ Tab 3: Add PDF from URL ============ */
    document.getElementById('pdfForm').addEventListener('submit', async e => {
        e.preventDefault();
        if (!GHSAVE.hasToken()) { showPdfMsg('⚠️ يلزم GitHub Token', 'error'); return; }
        const book = {
            id: String(nextBookId(allBooks)),
            title: document.getElementById('pdfTitle').value.trim(),
            author: document.getElementById('pdfAuthor').value.trim(),
            category: document.getElementById('pdfCategory').value,
            pages: Number(document.getElementById('pdfPages').value) || 0,
            cover: document.getElementById('pdfCoverUrl').value.trim(),
            pdf: document.getElementById('pdfUrl').value.trim(),
            description: document.getElementById('pdfDescription').value.trim(),
            views: 0, downloads: 0,
            addedDate: document.getElementById('pdfDate').value || new Date().toISOString().slice(0, 10),
            recommended: false
        };
        showPdfMsg('جارٍ الحفظ...', '');
        try {
            await appendToExtraJSON([book]);
            showPdfMsg('✅ تمّ إضافة الكتاب!', 'success');
            document.getElementById('pdfForm').reset();
            document.getElementById('pdfDate').value = new Date().toISOString().slice(0, 10);
        } catch (err) { showPdfMsg('❌ ' + err.message, 'error'); }
    });

    /* ============ Helpers ============ */
    async function loadOverrides() {
        try {
            const res = await fetch(`../${OVERRIDES_PATH}?t=${Date.now()}`);
            if (!res.ok) return {};
            return await res.json();
        } catch { return {}; }
    }
    async function saveOverrides() {
        const token = GHSAVE.getToken();
        const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${OVERRIDES_PATH}`;
        let sha = null;
        try {
            const r = await fetch(`${apiBase}?ref=${BRANCH}`, { headers: { 'Authorization': 'Bearer ' + token } });
            if (r.ok) sha = (await r.json()).sha;
        } catch {}
        const body = JSON.stringify(overrides, null, 2);
        const content = btoa(unescape(encodeURIComponent(body)));
        const r2 = await fetch(apiBase, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'admin: update cover overrides', content, sha, branch: BRANCH })
        });
        if (!r2.ok) throw new Error('GitHub ' + r2.status);
    }
    async function appendToExtraJSON(newBooks) {
        const token = GHSAVE.getToken();
        const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${EXTRA_PATH}`;
        let current = { books: [] }, sha = null;
        try {
            const r = await fetch(`${apiBase}?ref=${BRANCH}`, { headers: { 'Authorization': 'Bearer ' + token } });
            if (r.ok) {
                const meta = await r.json();
                sha = meta.sha;
                const raw = atob(meta.content.replace(/\s/g, ''));
                current = JSON.parse(decodeURIComponent(escape(raw)));
                current.books = current.books || [];
            }
        } catch {}
        current.books = current.books.concat(newBooks);
        const body = JSON.stringify(current, null, 2);
        const content = btoa(unescape(encodeURIComponent(body)));
        const r2 = await fetch(apiBase, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `admin: add ${newBooks.length} book(s)`, content, sha, branch: BRANCH })
        });
        if (!r2.ok) throw new Error('GitHub ' + r2.status);
    }
    function nextBookId(books) {
        const maxId = books.reduce((m, b) => Math.max(m, Number(b.id) || 0), 0);
        return maxId + 1;
    }
    function stripHTML(s) { return String(s ?? '').replace(/<[^>]*>/g, ''); }
    function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
    function showGBMessage(t, type) { showMsg('gbMessage', t, type); }
    function showCoverMsg(t, type) { showMsg('coverMessage', t, type); }
    function showPdfMsg(t, type) { showMsg('pdfMessage', t, type); }
    function showMsg(id, text, type) {
        const el = document.getElementById(id);
        el.innerHTML = text ? `<div class="bm-message ${type || ''}">${esc(text)}</div>` : '';
    }
})();
