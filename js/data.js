/* طبقة البيانات — JSON / Sheets / Firestore + فلتر VIP */

const DATA = (function() {
    let cachedBooks = null;
    let firebaseApp = null, firestoreRef = null, storageRef = null;

    const EXTRA_JSON_FILES = [
        'data/books-extra-1.json',
        'data/books-extra-2.json',
        'data/books-extra-3.json'
    ];

    const VIP_KEY = 'taybaa-vip-unlocked';

    // حدود معرّفات الكتب التي تم توليدها بروابط archive.org مخترعة (غير صالحة).
    // تلقائياً: يتم تفريغ حقل pdf لهذه المعرّفات حتى تظهر على الموقع بشارة "قريباً"
    // بدلاً من فتح قارئ معطّل على أرشيفـأورغ.
    const FAKE_PDF_ID_MIN = 116;
    const FAKE_PDF_ID_MAX = 217;

    function isVIP() {
        try {
            const params = new URLSearchParams(location.search);
            const fromUrl = params.get('vip');
            if (fromUrl && fromUrl === (CONFIG.vipPassword || '')) {
                localStorage.setItem(VIP_KEY, '1');
                return true;
            }
            return localStorage.getItem(VIP_KEY) === '1';
        } catch (_) { return false; }
    }
    function unlockVIP(password) {
        if (password && password === CONFIG.vipPassword) {
            try { localStorage.setItem(VIP_KEY, '1'); } catch (_) {}
            return true;
        }
        return false;
    }
    function lockVIP() { try { localStorage.removeItem(VIP_KEY); } catch (_) {} }

    function filterForViewer(books) {
        if (isVIP()) return books;
        const hidden = new Set(CONFIG.hiddenCategories || []);
        if (!hidden.size) return books;
        return books.filter(b => !hidden.has(b.category));
    }

    async function initFirebase() {
        if (firebaseApp) return { db: firestoreRef, storage: storageRef };
        if (!CONFIG.firebase.enabled) throw new Error('Firebase غير مفعّل');
        const [{ initializeApp }, fs, st] = await Promise.all([
            import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
            import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
            import('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js')
        ]);
        firebaseApp = initializeApp(CONFIG.firebase.config);
        firestoreRef = { db: fs.getFirestore(firebaseApp), ...fs };
        storageRef = { storage: st.getStorage(firebaseApp), ...st };
        return { db: firestoreRef, storage: storageRef };
    }

    async function loadBooks(forceReload = false) {
        if (cachedBooks && !forceReload) return cachedBooks;
        const source = CONFIG.dataSource || 'json';
        try {
            switch (source) {
                case 'firestore': cachedBooks = await loadFromFirestore(); break;
                case 'sheets':    cachedBooks = await loadFromSheets();    break;
                default:          cachedBooks = await loadFromJSON();      break;
            }
        } catch (err) {
            console.warn(`فشل تحميل من ${source}.`, err);
            cachedBooks = await loadFromJSON();
        }
        return cachedBooks;
    }

    async function fetchJsonBooks(path) {
        try {
            const res = await fetch(`${path}?t=${Date.now()}`);
            if (!res.ok) return [];
            const json = await res.json();
            return json.books || [];
        } catch (_) { return []; }
    }

    async function loadFromJSON() {
        const mainRes = await fetch('data/books-sample.json?t=' + Date.now());
        if (!mainRes.ok) throw new Error('تعذّر قراءة ملف العينة');
        const mainJson = await mainRes.json();
        const mainBooks = mainJson.books || [];
        const extraArrays = await Promise.all(EXTRA_JSON_FILES.map(fetchJsonBooks));
        const extraBooks = extraArrays.flat();
        const seen = new Set(mainBooks.map(b => String(b.id)));
        const merged = mainBooks.concat(extraBooks.filter(b => !seen.has(String(b.id))));
        return merged.map(normalizeBook);
    }

    async function loadFromSheets() {
        if (!CONFIG.sheetId) throw new Error('sheetId غير مضبوط');
        const url = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(CONFIG.sheetName)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('فشل الاتصال بـ Google Sheets');
        const text = await res.text();
        const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const json = JSON.parse(jsonStr);
        const cols = json.table.cols.map(c => (c.label || c.id || '').trim());
        const rows = json.table.rows || [];
        return rows.map(row => {
            const cells = row.c || [];
            const obj = {};
            cols.forEach((col, i) => { obj[col] = cells[i] ? (cells[i].v ?? '') : ''; });
            return normalizeBook(obj);
        }).filter(b => b.id && b.title);
    }

    async function loadFromFirestore() {
        const { db } = await initFirebase();
        const q = db.query(db.collection(db.db, 'books'), db.orderBy('addedDate', 'desc'));
        const snap = await db.getDocs(q);
        return snap.docs.map(d => normalizeBook({ id: d.id, ...d.data() }));
    }

    async function saveBook(bookData) {
        const { db } = await initFirebase();
        const id = String(bookData.id || Date.now());
        const ref = db.doc(db.db, 'books', id);
        const dataToSave = { ...normalizeBook({ ...bookData, id }), updatedAt: new Date().toISOString() };
        await db.setDoc(ref, dataToSave, { merge: true });
        cachedBooks = null;
        return dataToSave;
    }
    async function deleteBook(id) {
        const { db } = await initFirebase();
        const ref = db.doc(db.db, 'books', String(id));
        await db.deleteDoc(ref);
        cachedBooks = null;
    }
    async function uploadFile(file, folder = 'books') {
        const { storage } = await initFirebase();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${folder}/${Date.now()}_${safeName}`;
        const fileRef = storage.ref(storage.storage, path);
        await storage.uploadBytes(fileRef, file);
        return await storage.getDownloadURL(fileRef);
    }

    function normalizeBook(raw) {
        const get = (...keys) => {
            for (const k of keys) if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') return raw[k];
            return '';
        };
        let pdf = String(get('pdf', 'pdfUrl', 'رابط_pdf', 'الكتاب', 'ملف')).trim();
        const id = String(get('id', 'ID', 'المعرف') || '').trim();
        const numId = Number(id);
        // تفريغ روابط archive.org الوهمية التي اخترعها المولّد.
        if (pdf && /^https?:\/\/archive\.org\/embed\//.test(pdf) && numId >= FAKE_PDF_ID_MIN && numId <= FAKE_PDF_ID_MAX) {
            pdf = '';
        }
        return {
            id: id,
            title: String(get('title', 'العنوان', 'الاسم')).trim(),
            author: String(get('author', 'المؤلف', 'الكاتب')).trim(),
            category: String(get('category', 'القسم', 'الباب', 'التصنيف')).trim(),
            pages: Number(get('pages', 'الصفحات', 'عدد الصفحات')) || 0,
            cover: String(get('cover', 'coverUrl', 'الغلاف', 'صورة الغلاف')).trim(),
            pdf: pdf,
            html: String(get('html', 'htmlContent', 'محتوى')).trim(),
            description: cleanReasoningLeak(String(get('description', 'النبذة', 'الوصف', 'نبذة')).trim()),
            introduction: cleanReasoningLeak(String(get('introduction', 'intro', 'المقدمة')).trim()),
            views: Number(get('views', 'المشاهدات')) || 0,
            downloads: Number(get('downloads', 'التحميلات')) || 0,
            addedDate: String(get('addedDate', 'date', 'التاريخ') || new Date().toISOString().slice(0,10)).trim(),
            recommended: toBool(get('recommended', 'موصى به'))
        };
    }
    function toBool(v) {
        if (typeof v === 'boolean') return v;
        const s = String(v).trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'نعم' || s === 'yes';
    }
    function cleanReasoningLeak(text) {
        if (!text) return '';
        if (text.startsWith('{') && /"role"|"reasoning"|"choices"/.test(text)) {
            try {
                const json = JSON.parse(text);
                const content = json.content || json.choices?.[0]?.message?.content || json.message?.content || json.text;
                if (content && typeof content === 'string') return content.trim();
            } catch (_) {}
            return '';
        }
        return text;
    }

    function search(books, query) {
        const q = query.trim().toLowerCase();
        if (!q) return books;
        return books.filter(b =>
            b.title.toLowerCase().includes(q) ||
            b.author.toLowerCase().includes(q) ||
            b.category.toLowerCase().includes(q) ||
            b.description.toLowerCase().includes(q)
        );
    }
    function byCategory(books, category) { return books.filter(b => b.category === category); }
    function topPopular(books, n = 8) { return [...books].sort((a, b) => b.views - a.views).slice(0, n); }
    function newest(books, n = 8) { return [...books].sort((a, b) => (b.addedDate || '').localeCompare(a.addedDate || '')).slice(0, n); }
    function recommended(books, n = 8) { const recs = books.filter(b => b.recommended); return (recs.length ? recs : books).slice(0, n); }
    function findById(books, id) { return books.find(b => b.id === String(id)); }
    function categoriesWithCounts(books) {
        const map = new Map();
        for (const b of books) { if (!b.category) continue; map.set(b.category, (map.get(b.category) || 0) + 1); }
        const order = CONFIG.categoryOrder || [];
        const rank = name => { const i = order.indexOf(name); return i === -1 ? 999 : i; };
        return Array.from(map, ([name, count]) => ({ name, count }))
            .sort((a, b) => rank(a.name) - rank(b.name) || b.count - a.count);
    }
    function totals(books) {
        return {
            books: books.length,
            views: books.reduce((s, b) => s + (b.views || 0), 0),
            downloads: books.reduce((s, b) => s + (b.downloads || 0), 0)
        };
    }

    return {
        loadBooks, search, byCategory, topPopular, newest, recommended, findById,
        categoriesWithCounts, totals, saveBook, deleteBook, uploadFile, initFirebase,
        isVIP, unlockVIP, lockVIP, filterForViewer
    };
})();
