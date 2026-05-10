/* ============================================================
   📡  طبقة البيانات: تحميل الكتب من Google Sheets أو ملف JSON
   ============================================================ */

const DATA = (function() {
    let cachedBooks = null;

    async function loadBooks() {
        if (cachedBooks) return cachedBooks;

        try {
            if (CONFIG.useSheets && CONFIG.sheetId) {
                cachedBooks = await loadFromSheets();
            } else {
                cachedBooks = await loadFromJSON();
            }
        } catch (err) {
            console.warn('فشل تحميل الكتب من المصدر الأساسي، يتم استخدام البيانات التجريبية.', err);
            cachedBooks = await loadFromJSON();
        }
        return cachedBooks;
    }

    async function loadFromJSON() {
        const res = await fetch('data/books-sample.json');
        if (!res.ok) throw new Error('تعذّر قراءة ملف العينة');
        const json = await res.json();
        return (json.books || []).map(normalizeBook);
    }

    async function loadFromSheets() {
        const url =
            `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}` +
            `/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(CONFIG.sheetName)}`;

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
            cols.forEach((col, i) => {
                obj[col] = cells[i] ? (cells[i].v ?? '') : '';
            });
            return normalizeBook(obj);
        }).filter(b => b.id && b.title);
    }

    function normalizeBook(raw) {
        const get = (...keys) => {
            for (const k of keys) {
                if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') return raw[k];
            }
            return '';
        };

        return {
            id: String(get('id', 'ID', 'المعرف') || '').trim(),
            title: String(get('title', 'العنوان', 'الاسم')).trim(),
            author: String(get('author', 'المؤلف', 'الكاتب')).trim(),
            category: String(get('category', 'القسم', 'الباب', 'التصنيف')).trim(),
            pages: Number(get('pages', 'الصفحات', 'عدد الصفحات')) || 0,
            cover: String(get('cover', 'coverUrl', 'الغلاف', 'صورة الغلاف')).trim(),
            pdf: String(get('pdf', 'pdfUrl', 'رابط_pdf', 'الكتاب', 'ملف')).trim(),
            description: String(get('description', 'النبذة', 'الوصف', 'نبذة')).trim(),
            introduction: String(get('introduction', 'intro', 'المقدمة')).trim(),
            views: Number(get('views', 'المشاهدات')) || 0,
            downloads: Number(get('downloads', 'التحميلات')) || 0,
            addedDate: String(get('addedDate', 'date', 'التاريخ')).trim(),
            recommended: toBool(get('recommended', 'موصى به'))
        };
    }

    function toBool(v) {
        if (typeof v === 'boolean') return v;
        const s = String(v).trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'نعم' || s === 'yes';
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

    function byCategory(books, category) {
        return books.filter(b => b.category === category);
    }

    function topPopular(books, n = 8) {
        return [...books].sort((a, b) => b.views - a.views).slice(0, n);
    }

    function newest(books, n = 8) {
        return [...books]
            .sort((a, b) => (b.addedDate || '').localeCompare(a.addedDate || ''))
            .slice(0, n);
    }

    function recommended(books, n = 8) {
        const recs = books.filter(b => b.recommended);
        return (recs.length ? recs : books).slice(0, n);
    }

    function findById(books, id) {
        return books.find(b => b.id === String(id));
    }

    function categoriesWithCounts(books) {
        const map = new Map();
        for (const b of books) {
            if (!b.category) continue;
            map.set(b.category, (map.get(b.category) || 0) + 1);
        }
        return Array.from(map, ([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }

    return {
        loadBooks, search, byCategory, topPopular, newest,
        recommended, findById, categoriesWithCounts
    };
})();
