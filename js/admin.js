/* لوحة الإدارة — منطق التطبيق */

(function() {
    'use strict';

    /* الوضع الداكن هو الافتراضي */
    const stored = localStorage.getItem('taybaa-theme');
    document.documentElement.setAttribute('data-theme', stored || 'dark');
    document.getElementById('themeToggle').addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme');
        const next = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('taybaa-theme', next);
    });

    const SESSION_KEY = 'taybaa-admin-session';
    const loginScreen = document.getElementById('loginScreen');
    const dashboard = document.getElementById('dashboard');
    const logoutBtn = document.getElementById('logoutBtn');

    function isLoggedIn() { return sessionStorage.getItem(SESSION_KEY) === 'ok'; }
    function showLogin() { loginScreen.hidden = false; dashboard.hidden = true; logoutBtn.hidden = true; }
    function showDashboard() {
        loginScreen.hidden = true; dashboard.hidden = false; logoutBtn.hidden = false;
        loadBooksTable();
        if (!CONFIG.firebase.enabled) document.getElementById('firebaseNotice').hidden = false;
    }

    document.getElementById('loginForm').addEventListener('submit', e => {
        e.preventDefault();
        const pwd = document.getElementById('pwd').value;
        const errEl = document.getElementById('loginError');
        if (pwd === (CONFIG.admin && CONFIG.admin.password)) {
            sessionStorage.setItem(SESSION_KEY, 'ok');
            errEl.hidden = true;
            showDashboard();
        } else {
            errEl.hidden = false;
        }
    });

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem(SESSION_KEY);
        showLogin();
    });

    if (isLoggedIn()) showDashboard(); else showLogin();

    let booksState = [];
    const tableBody = document.getElementById('booksTableBody');
    const adminSearch = document.getElementById('adminSearch');

    async function loadBooksTable() {
        try {
            booksState = await DATA.loadBooks(true);
            renderTable(booksState);
            updateStats(booksState);
        } catch (err) {
            console.error(err);
            tableBody.innerHTML = `<tr><td colspan="6" class="empty-state">⚠️ تعذّر تحميل الكتب</td></tr>`;
        }
    }

    function renderTable(books) {
        if (!books.length) {
            tableBody.innerHTML = `<tr><td colspan="6" class="empty-state">لا توجد كتب بعد. اضغط <strong>"أضف كتاباً"</strong> لتبدأ.</td></tr>`;
            return;
        }
        tableBody.innerHTML = books.map(b => `
            <tr data-id="${escapeAttr(b.id)}">
                <td>${b.cover ? `<img class="row-cover" src="${escapeAttr(b.cover)}" alt="" loading="lazy">` : `<div class="row-cover" style="display:grid;place-items:center;font-size:1.2rem">📖</div>`}</td>
                <td><strong>${escapeHTML(b.title)}</strong></td>
                <td>${escapeHTML(b.author || '—')}</td>
                <td>${b.category ? `<span class="book-detail-category" style="font-size:.75rem">${escapeHTML(b.category)}</span>` : '—'}</td>
                <td><div class="row-stats"><span>👁️ ${b.views || 0}</span><span>⬇️ ${b.downloads || 0}</span></div></td>
                <td><div class="row-actions">
                    <button class="btn-icon" data-action="edit" title="تعديل" type="button">✏️</button>
                    <a class="btn-icon" href="book.html?id=${encodeURIComponent(b.id)}" target="_blank" title="عرض">👁️</a>
                    <button class="btn-icon danger" data-action="delete" title="حذف" type="button">🗑️</button>
                </div></td>
            </tr>
        `).join('');

        tableBody.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.closest('tr').dataset.id;
                if (btn.dataset.action === 'edit') openModal(booksState.find(b => b.id === id));
                if (btn.dataset.action === 'delete') confirmDelete(id);
            });
        });
    }

    function updateStats(books) {
        const t = DATA.totals(books);
        document.getElementById('totalBooks').textContent = t.books;
        document.getElementById('totalViews').textContent = t.views.toLocaleString('en-US');
        document.getElementById('totalDownloads').textContent = t.downloads.toLocaleString('en-US');
        document.getElementById('totalCategories').textContent = DATA.categoriesWithCounts(books).length;
    }

    adminSearch.addEventListener('input', () => {
        const q = adminSearch.value.trim();
        renderTable(q ? DATA.search(booksState, q) : booksState);
    });

    async function confirmDelete(id) {
        const book = booksState.find(b => b.id === id);
        if (!book) return;
        if (!confirm(`هل تريد حذف كتاب "${book.title}" نهائياً؟`)) return;
        if (!CONFIG.firebase.enabled) { toast('⚠️ فعّل Firebase أولاً للحفظ الدائم', 'warning'); return; }
        try {
            await DATA.deleteBook(id);
            toast('✅ تم الحذف بنجاح', 'success');
            await loadBooksTable();
        } catch (err) {
            console.error(err);
            toast('❌ تعذّر الحذف', 'error');
        }
    }

    const modal = document.getElementById('bookModal');
    const form = document.getElementById('bookForm');
    let currentStep = 1;
    let convertedDocxHtml = '';
    let convertedDocxName = '';

    document.getElementById('addBookBtn').addEventListener('click', () => openModal(null));
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));

    function openModal(book) {
        form.reset();
        convertedDocxHtml = '';
        convertedDocxName = '';
        document.getElementById('coverPreview').hidden = true;
        document.getElementById('docxPreviewWrap').hidden = true;
        document.getElementById('pdfFileName').textContent = 'لم يتم اختيار ملف';
        document.getElementById('docxFileName').textContent = 'لم يتم اختيار ملف';

        if (book) {
            document.getElementById('modalTitle').textContent = '✏️ تعديل الكتاب';
            document.getElementById('bookId').value = book.id;
            document.getElementById('bookTitle').value = book.title;
            document.getElementById('bookAuthor').value = book.author;
            document.getElementById('bookCategory').value = book.category;
            document.getElementById('bookPages').value = book.pages;
            document.getElementById('bookRecommended').checked = book.recommended;
            document.getElementById('bookDescription').value = book.description;
            document.getElementById('bookIntro').value = book.introduction;
            document.getElementById('coverUrl').value = book.cover;
            document.getElementById('pdfUrl').value = book.pdf;
            if (book.cover) {
                const img = document.getElementById('coverPreview');
                img.src = book.cover;
                img.hidden = false;
            }
        } else {
            document.getElementById('modalTitle').textContent = '➕ إضافة كتاب جديد';
            document.getElementById('bookId').value = '';
        }
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        goToStep(1);
    }
    function closeModal() { modal.hidden = true; document.body.style.overflow = ''; }

    document.getElementById('nextStepBtn').addEventListener('click', () => goToStep(currentStep + 1));
    document.getElementById('prevStepBtn').addEventListener('click', () => goToStep(currentStep - 1));
    function goToStep(step) {
        currentStep = Math.max(1, Math.min(3, step));
        document.querySelectorAll('.step').forEach(s => {
            s.classList.toggle('active', Number(s.dataset.step) <= currentStep);
        });
        document.querySelectorAll('.step-panel').forEach(p => {
            p.classList.toggle('active', Number(p.dataset.panel) === currentStep);
        });
        document.getElementById('prevStepBtn').style.visibility = currentStep === 1 ? 'hidden' : 'visible';
        document.getElementById('nextStepBtn').hidden = currentStep === 3;
        document.getElementById('saveBookBtn').hidden = currentStep !== 3;
    }

    document.querySelectorAll('.tab-btn').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            document.querySelector(`[data-tab-panel="${b.dataset.tab}"]`).classList.add('active');
        });
    });

    setupDropZone(document.getElementById('coverUpload'), document.getElementById('coverFile'), file => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = document.getElementById('coverPreview');
            img.src = e.target.result;
            img.hidden = false;
        };
        reader.readAsDataURL(file);
    });

    setupDropZone(document.getElementById('pdfUpload'), document.getElementById('pdfFile'), file => {
        document.getElementById('pdfFileName').textContent = `✓ ${file.name} (${formatSize(file.size)})`;
    });

    setupDropZone(document.getElementById('docxUpload'), document.getElementById('docxFile'), async file => {
        document.getElementById('docxFileName').textContent = `📖 جارٍ تحويل: ${file.name}...`;
        try {
            const html = await convertDocxToBook(file);
            convertedDocxHtml = html;
            convertedDocxName = file.name.replace(/\.docx$/i, '');
            document.getElementById('docxPreview').innerHTML = html;
            document.getElementById('docxPreviewWrap').hidden = false;
            document.getElementById('docxFileName').textContent = `✓ تم تحويل: ${file.name}`;
            autoFillFromDocx(html);
            toast('✨ تم تحويل الكتاب بنجاح', 'success');
        } catch (err) {
            console.error(err);
            toast('❌ تعذّر تحويل الملف', 'error');
            document.getElementById('docxFileName').textContent = `❌ فشل التحويل`;
        }
    });

    async function convertDocxToBook(file) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.mammoth.convertToHtml(
            { arrayBuffer },
            {
                styleMap: [
                    "p[style-name='Heading 1'] => h1:fresh",
                    "p[style-name='Heading 2'] => h2:fresh",
                    "p[style-name='Heading 3'] => h3:fresh",
                    "p[style-name='Title'] => h1.book-title-h:fresh",
                    "p[style-name='Subtitle'] => h2.book-subtitle:fresh"
                ]
            }
        );
        return `<div dir="rtl" lang="ar">${result.value}</div>`;
    }

    function autoFillFromDocx(html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const headings = tmp.querySelectorAll('h1');
        const paragraphs = tmp.querySelectorAll('p');
        const titleInput = document.getElementById('bookTitle');
        if (!titleInput.value && headings.length) titleInput.value = headings[0].textContent.trim();
        const descInput = document.getElementById('bookDescription');
        if (!descInput.value && paragraphs.length) {
            const firstShort = Array.from(paragraphs).find(p => p.textContent.trim().length > 30);
            if (firstShort) descInput.value = firstShort.textContent.trim().slice(0, 300);
        }
        const introInput = document.getElementById('bookIntro');
        if (!introInput.value) {
            let intro = '';
            for (const el of tmp.firstChild.children) {
                if (el.tagName === 'H1' && intro.length > 100) break;
                if (el.tagName === 'P') intro += el.textContent.trim() + '\n\n';
                if (intro.length > 800) break;
            }
            introInput.value = intro.trim();
        }
    }

    document.getElementById('downloadHtmlBtn').addEventListener('click', () => {
        if (!convertedDocxHtml) return;
        const blob = new Blob([wrapBookHtml(convertedDocxHtml, convertedDocxName)], { type: 'text/html;charset=utf-8' });
        downloadBlob(blob, `${convertedDocxName || 'book'}.html`);
    });
    document.getElementById('downloadPdfBtn').addEventListener('click', () => {
        const w = window.open('', '_blank');
        w.document.write(wrapBookHtml(convertedDocxHtml, convertedDocxName));
        w.document.close();
        setTimeout(() => w.print(), 500);
    });

    function wrapBookHtml(html, title) {
        return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${escapeHTML(title || 'كتاب')}</title><link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap" rel="stylesheet"><style>body { font-family: 'Amiri', serif; max-width: 720px; margin: 3rem auto; padding: 0 2rem; line-height: 1.95; color: #1f2937; background: #fefdf7; font-size: 1.15rem; } h1, h2, h3 { color: #0f766e; font-family: 'Amiri', serif; margin-top: 2rem; } p { text-indent: 2rem; margin: 1rem 0; text-align: justify; } img { max-width: 100%; height: auto; display: block; margin: 1.5rem auto; } @media print { body { font-size: 12pt; } }</style></head><body>${html}</body></html>`;
    }

    document.getElementById('saveBookBtn').addEventListener('click', async () => {
        const title = document.getElementById('bookTitle').value.trim();
        if (!title) { toast('⚠️ العنوان مطلوب', 'warning'); goToStep(1); return; }
        if (!CONFIG.firebase.enabled) { toast('⚠️ فعّل Firebase أولاً لحفظ الكتب', 'warning'); return; }

        const saveBtn = document.getElementById('saveBookBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = '⏳ جارٍ الحفظ...';

        try {
            let coverUrl = document.getElementById('coverUrl').value.trim();
            let pdfUrl = document.getElementById('pdfUrl').value.trim();
            const coverFileEl = document.getElementById('coverFile');
            if (coverFileEl.files[0]) coverUrl = await DATA.uploadFile(coverFileEl.files[0], 'covers');
            const pdfFileEl = document.getElementById('pdfFile');
            if (pdfFileEl.files[0]) pdfUrl = await DATA.uploadFile(pdfFileEl.files[0], 'books');
            let htmlContent = '';
            if (convertedDocxHtml) {
                const htmlBlob = new Blob([wrapBookHtml(convertedDocxHtml, title)], { type: 'text/html;charset=utf-8' });
                const htmlFile = new File([htmlBlob], `${title}.html`, { type: 'text/html' });
                htmlContent = await DATA.uploadFile(htmlFile, 'books');
            }
            const data = {
                id: document.getElementById('bookId').value || undefined,
                title,
                author: document.getElementById('bookAuthor').value.trim(),
                category: document.getElementById('bookCategory').value.trim(),
                pages: Number(document.getElementById('bookPages').value) || 0,
                cover: coverUrl,
                pdf: pdfUrl,
                html: htmlContent,
                description: document.getElementById('bookDescription').value.trim(),
                introduction: document.getElementById('bookIntro').value.trim(),
                recommended: document.getElementById('bookRecommended').checked,
                addedDate: new Date().toISOString().slice(0, 10)
            };
            await DATA.saveBook(data);
            toast('✅ تم حفظ الكتاب بنجاح', 'success');
            closeModal();
            await loadBooksTable();
        } catch (err) {
            console.error(err);
            toast('❌ تعذّر الحفظ: ' + (err.message || ''), 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 حفظ الكتاب';
        }
    });

    function setupDropZone(zone, fileInput, onFile) {
        zone.addEventListener('click', () => fileInput.click());
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('dragover');
            if (e.dataTransfer.files[0]) {
                fileInput.files = e.dataTransfer.files;
                onFile(e.dataTransfer.files[0]);
            }
        });
        fileInput.addEventListener('change', () => { if (fileInput.files[0]) onFile(fileInput.files[0]); });
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
        return (bytes/(1024*1024)).toFixed(1) + ' MB';
    }

    function escapeHTML(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function escapeAttr(s) { return escapeHTML(s); }

    function toast(msg, type = 'success') {
        const el = document.createElement('div');
        el.className = 'toast ' + type;
        el.textContent = msg;
        document.getElementById('toastContainer').appendChild(el);
        setTimeout(() => el.remove(), 3500);
    }
})();
