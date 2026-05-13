/* ============================================================
   🛠️  لوحة الإدارة — منطق التطبيق
   ============================================================ */

(function() {
    'use strict';

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
        loginScreen.hidden = true;
        dashboard.hidden = false;
        logoutBtn.hidden = false;
        loadBooksTable();
        updateStorageNotice();
    }

    function updateStorageNotice() {
        const notice = document.getElementById('storageNotice');
        const status = document.getElementById('storageStatus');
        const btn = document.getElementById('storageNoticeBtn');
        if (!notice || !status) return;
        if (typeof GHSAVE !== 'undefined' && GHSAVE.hasToken()) {
            notice.hidden = false;
            notice.style.background = 'var(--primary-soft)';
            notice.style.borderColor = 'var(--primary)';
            status.textContent = '✅ مفعّل — الكتب تُحفظ على GitHub مباشرة';
            if (btn) btn.textContent = '⚙️ تعديل';
        } else {
            notice.hidden = false;
            notice.style.background = 'var(--accent-soft)';
            notice.style.borderColor = 'var(--accent)';
            status.textContent = '— لم يُضبط GitHub Token بعد. الكتب لن تُحفظ.';
            if (btn) btn.textContent = '⚙️ اضبط الآن';
        }
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
        if (!GHSAVE.hasToken()) {
            toast('⚠️ اضبط GitHub Token أولاً من زر "إعدادات GitHub"', 'warning');
            openGitHubModal();
            return;
        }
        try {
            await GHSAVE.deleteBook(id);
            toast('✅ تم الحذف! سيظهر التغيير خلال دقيقة', 'success');
            booksState = booksState.filter(b => b.id !== id);
            renderTable(booksState);
            updateStats(booksState);
        } catch (err) {
            console.error(err);
            if (err.status === 401) {
                GHSAVE.setToken(null);
                updateStorageNotice();
                toast('❌ Token غير صالح. اضبطه مرة أخرى.', 'error');
            } else {
                toast('❌ تعذّر الحذف: ' + (err.message || ''), 'error');
            }
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
        const result = await window.mammoth.convertToHtml({ arrayBuffer }, {
            styleMap: [
                "p[style-name='Heading 1'] => h1:fresh",
                "p[style-name='Heading 2'] => h2:fresh",
                "p[style-name='Heading 3'] => h3:fresh",
                "p[style-name='Title'] => h1.book-title-h:fresh",
                "p[style-name='Subtitle'] => h2.book-subtitle:fresh"
            ]
        });
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

    /* ============================================================
       💾  Save to GitHub
       ============================================================ */
    document.getElementById('saveBookBtn').addEventListener('click', async () => {
        const title = document.getElementById('bookTitle').value.trim();
        if (!title) { toast('⚠️ العنوان مطلوب', 'warning'); goToStep(1); return; }

        if (!GHSAVE.hasToken()) {
            toast('⚠️ اضبط GitHub Token أولاً لتفعيل الحفظ', 'warning');
            openGitHubModal();
            return;
        }

        const saveBtn = document.getElementById('saveBookBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = '⏳ جارٍ الحفظ على GitHub...';

        try {
            const coverUrl = document.getElementById('coverUrl').value.trim();
            let pdfUrl = document.getElementById('pdfUrl').value.trim();
            // تحويل تلقائي لروابط Google Drive من /view إلى /preview (لتعمل في iframe)
            const driveMatch = pdfUrl.match(/drive\.google\.com\/file\/d\/([^\/]+)/);
            if (driveMatch) pdfUrl = `https://drive.google.com/file/d/${driveMatch[1]}/preview`;

            if (!coverUrl) {
                toast('⚠️ أضف غلافاً (ولّده بالذكاء الاصطناعي أو الصق رابطاً)', 'warning');
                goToStep(2);
                return;
            }
            if (!pdfUrl && !convertedDocxHtml) {
                toast('⚠️ أضف رابط PDF أو ارفع ملف Word', 'warning');
                goToStep(2);
                return;
            }

            const data = {
                id: document.getElementById('bookId').value || String(Date.now()),
                title,
                author: document.getElementById('bookAuthor').value.trim(),
                category: document.getElementById('bookCategory').value.trim(),
                pages: Number(document.getElementById('bookPages').value) || 0,
                cover: coverUrl,
                pdf: pdfUrl,
                description: document.getElementById('bookDescription').value.trim(),
                introduction: document.getElementById('bookIntro').value.trim(),
                recommended: document.getElementById('bookRecommended').checked,
                views: 0,
                downloads: 0,
                addedDate: new Date().toISOString().slice(0, 10)
            };

            const result = await GHSAVE.upsertBook(data);
            toast(`✅ تم ${result.action === 'created' ? 'إضافة' : 'تحديث'} الكتاب! سيظهر خلال دقيقة بعد بناء الموقع`, 'success');
            closeModal();
            const idx = booksState.findIndex(b => b.id === result.id);
            if (idx >= 0) booksState[idx] = result;
            else booksState.unshift(result);
            renderTable(booksState);
            updateStats(booksState);
        } catch (err) {
            console.error(err);
            if (err.status === 401) {
                GHSAVE.setToken(null);
                updateStorageNotice();
                toast('❌ Token غير صالح. اضبطه مرة أخرى.', 'error');
                openGitHubModal();
            } else if (err.status === 409) {
                toast('⚠️ تم تعديل الملف من مكان آخر. حدّث الصفحة وأعد المحاولة.', 'warning');
            } else {
                toast('❌ تعذّر الحفظ: ' + (err.message || ''), 'error');
            }
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 حفظ الكتاب';
        }
    });

    /* ============================================================
       ⚙️  GitHub Settings Modal
       ============================================================ */
    function openGitHubModal() {
        const m = document.getElementById('githubModal');
        const input = document.getElementById('ghTokenInput');
        const removeBtn = document.getElementById('ghRemoveBtn');
        const result = document.getElementById('ghTestResult');
        input.value = GHSAVE.getToken() || '';
        removeBtn.hidden = !GHSAVE.hasToken();
        result.textContent = '';
        m.hidden = false;
        document.body.style.overflow = 'hidden';
    }
    function closeGitHubModal() {
        document.getElementById('githubModal').hidden = true;
        document.body.style.overflow = '';
    }

    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', openGitHubModal);
    const noticeBtn = document.getElementById('storageNoticeBtn');
    if (noticeBtn) noticeBtn.addEventListener('click', openGitHubModal);
    document.querySelectorAll('[data-close-gh]').forEach(el => el.addEventListener('click', closeGitHubModal));

    document.getElementById('ghSaveBtn').addEventListener('click', async () => {
        const token = document.getElementById('ghTokenInput').value.trim();
        const result = document.getElementById('ghTestResult');
        if (!token) { result.textContent = '⚠️ الصق Token أولاً'; result.style.color = 'var(--accent)'; return; }
        result.textContent = '⏳ جارٍ اختبار Token...';
        result.style.color = 'var(--text-muted)';
        GHSAVE.setToken(token);
        const test = await GHSAVE.testToken();
        if (test.ok) {
            result.textContent = '✅ Token صالح! تم الحفظ بنجاح.';
            result.style.color = 'var(--primary)';
            updateStorageNotice();
            setTimeout(closeGitHubModal, 1200);
            toast('✅ تم تفعيل الحفظ على GitHub', 'success');
        } else {
            GHSAVE.setToken(null);
            let msg;
            if (test.status === 401) msg = '❌ Token غير صالح أو منتهي.';
            else if (test.status === 403) msg = '❌ Token لا يملك صلاحية الكتابة (Contents: Read and write).';
            else if (test.status === 404) msg = '❌ Token لا يصل إلى TAYBAA-LIBRARY.';
            else if (test.status === 0) msg = '❌ مشكلة في الاتصال بالإنترنت.';
            else msg = `❌ خطأ (HTTP ${test.status})`;
            result.textContent = msg;
            result.style.color = 'var(--rose)';
            console.error('Token test failed:', test);
        }
    });
    document.getElementById('ghRemoveBtn').addEventListener('click', () => {
        if (!confirm('احذف Token من جهازك؟ ستحتاج إعداده مجدداً لاحقاً.')) return;
        GHSAVE.setToken(null);
        document.getElementById('ghTokenInput').value = '';
        document.getElementById('ghRemoveBtn').hidden = true;
        document.getElementById('ghTestResult').textContent = '';
        updateStorageNotice();
        toast('🗑️ تم حذف Token', 'success');
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

    /* ============================================================
       ✨  AI Helpers (via Pollinations.ai — free, no API key)
       ============================================================ */
    function withButtonLoading(btn, loadingText, fn) {
        return async function(...args) {
            const html = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="ai-icon">⏳</span> ' + loadingText;
            try { await fn.apply(this, args); }
            finally { btn.disabled = false; btn.innerHTML = html; }
        };
    }

    async function pollinationsText(prompt) {
        // mistral = نموذج موثوق يعيد نصاً عادياً (لا reasoning)
        const url = 'https://text.pollinations.ai/' + encodeURIComponent(prompt) +
                    '?model=mistral&private=true';
        const res = await fetch(url);
        if (!res.ok) throw new Error('AI text request failed: ' + res.status);
        let text = (await res.text()).trim();
        // أحياناً تعيد الخدمة JSON من نموذج reasoning — استخرج النص الفعلي
        if (text.startsWith('{') && /"role"|"reasoning"|"choices"/.test(text)) {
            try {
                const json = JSON.parse(text);
                const content = json.content || json.choices?.[0]?.message?.content || json.message?.content || json.text;
                if (content && typeof content === 'string') return content.trim();
            } catch (_) {}
            throw new Error('AI returned unexpected format. حاول مرة أخرى.');
        }
        return text;
    }

    function pollinationsImageURL(prompt, opts = {}) {
        const params = new URLSearchParams({
            width: opts.width || 400,
            height: opts.height || 600,
            model: opts.model || 'flux',
            nologo: 'true',
            seed: Math.floor(Math.random() * 999999)
        });
        return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?' + params.toString();
    }

    const aiCoverBtn = document.getElementById('aiGenCoverBtn');
    if (aiCoverBtn) {
        aiCoverBtn.addEventListener('click', withButtonLoading(aiCoverBtn, 'جارٍ توليد الغلاف...', async () => {
            const title = document.getElementById('bookTitle').value.trim();
            const author = document.getElementById('bookAuthor').value.trim();
            const category = document.getElementById('bookCategory').value.trim();
            if (!title) { toast('⚠️ أدخل عنوان الكتاب أولاً', 'warning'); return; }
            const isIslamic = /إسلام|دين|تيمية|قيم|توحيد|عقيدة|فقه|قرآن|حديث|سنة/i.test(title + ' ' + author + ' ' + category);
            const promptParts = isIslamic
                ? [`Beautiful traditional Islamic book cover design`, `title in elegant Arabic calligraphy: "${title}"`, author && `author: "${author}"`, `dark green and gold colors, ornamental border, vintage manuscript aesthetic, professional book cover, no people, no faces`].filter(Boolean)
                : [`Beautiful book cover design for "${title}"`, author && `by ${author}`, category && `category: ${category}`, `elegant typography, professional, high quality, no faces`].filter(Boolean);
            const url = pollinationsImageURL(promptParts.join(', '));
            await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = resolve;
                img.onerror = reject;
                img.src = url;
            });
            document.getElementById('coverPreview').src = url;
            document.getElementById('coverPreview').hidden = false;
            document.getElementById('coverUrl').value = url;
            toast('✅ تم توليد الغلاف بنجاح', 'success');
        }));
    }

    const aiDescBtn = document.getElementById('aiGenDescBtn');
    if (aiDescBtn) {
        aiDescBtn.addEventListener('click', withButtonLoading(aiDescBtn, 'جارٍ كتابة النبذة...', async () => {
            const title = document.getElementById('bookTitle').value.trim();
            const author = document.getElementById('bookAuthor').value.trim();
            const category = document.getElementById('bookCategory').value.trim();
            if (!title) { toast('⚠️ أدخل عنوان الكتاب أولاً', 'warning'); return; }
            const prompt = `اكتب نبذة قصيرة احترافية (2-3 جمل فقط) عن كتاب "${title}"` +
                           (author ? ` للمؤلف ${author}` : '') +
                           (category ? ` في تصنيف ${category}` : '') +
                           `. النبذة بالعربية الفصحى البليغة، تذكر موضوع الكتاب وأهميته. ` +
                           `لا تكتب أي مقدمات أو ترحيب، اكتب النبذة مباشرة فقط.`;
            const text = await pollinationsText(prompt);
            document.getElementById('bookDescription').value = text;
            toast('✅ تم كتابة النبذة', 'success');
        }));
    }

    const aiIntroBtn = document.getElementById('aiGenIntroBtn');
    if (aiIntroBtn) {
        aiIntroBtn.addEventListener('click', withButtonLoading(aiIntroBtn, 'جارٍ كتابة المقدمة...', async () => {
            const title = document.getElementById('bookTitle').value.trim();
            const author = document.getElementById('bookAuthor').value.trim();
            const desc = document.getElementById('bookDescription').value.trim();
            if (!title) { toast('⚠️ أدخل عنوان الكتاب أولاً', 'warning'); return; }
            const prompt = `اكتب مقدمة قصيرة (5-8 جمل) لكتاب "${title}"` +
                           (author ? ` للمؤلف ${author}` : '') +
                           (desc ? `. النبذة: ${desc}` : '') +
                           `. المقدمة بالعربية الفصحى البليغة، مناسبة لكتاب علمي، تبدأ بالحمد لله والصلاة على رسوله. ` +
                           `لا تكتب أي مقدمات أو ترحيب لي، اكتب نص المقدمة مباشرة فقط.`;
            const text = await pollinationsText(prompt);
            document.getElementById('bookIntro').value = text;
            toast('✅ تم كتابة المقدمة', 'success');
        }));
    }

    const aiEnhanceBtn = document.getElementById('aiEnhanceIntroBtn');
    if (aiEnhanceBtn) {
        aiEnhanceBtn.addEventListener('click', withButtonLoading(aiEnhanceBtn, 'جارٍ تحسين النص...', async () => {
            const intro = document.getElementById('bookIntro').value.trim();
            if (!intro) { toast('⚠️ اكتب المقدمة أولاً ثم اضغط للتحسين', 'warning'); return; }
            if (intro.length > 2000) { toast('⚠️ النص طويل جداً (الحد 2000 حرف)', 'warning'); return; }
            const prompt = `حرّر النص العربي التالي وصحّح الأخطاء النحوية والإملائية، ` +
                           `وحسّن الصياغة لتكون أكثر بلاغة وفصاحة، ` +
                           `مع الحفاظ التام على المعنى الأصلي. ` +
                           `لا تضف أي شرح أو تعليق، اكتب النص المحرّر فقط:\n\n${intro}`;
            const text = await pollinationsText(prompt);
            document.getElementById('bookIntro').value = text;
            toast('✅ تم تحسين الصياغة', 'success');
        }));
    }
})();
