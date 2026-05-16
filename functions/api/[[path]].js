/**
 * المكتبة الطيبة — Cloudflare Pages Function (Backend API)
 * تعمل تلقائيّاً على https://taybaa-library.pages.dev/api/...
 */

const QUOTES = [
    { text: 'العلم في الصغر كالنقش في الحجر', author: 'الحسن البصري' },
    { text: 'الحكمة ضالّة المؤمن، فحيث وجدها فهو أحقّ بها', author: 'الحديث الشريف' },
    { text: 'إن للقلوب صدأً كصدأ الحديد، وجلاؤها الذكر وتلاوة القرآن', author: 'ابن تيمية' },
    { text: 'الكتاب في الوحدة صديق، وفي السفر رفيق', author: 'الجاحظ' },
    { text: 'في التأنّي السلامة وفي العجلة الندامة', author: 'ثابت بن أوفى' },
    { text: 'وما لجرح إذا أرضاك من ألم', author: 'المتنبّي' },
    { text: 'إنّما الأمم الأخلاق ما بقيتْ', author: 'أحمد شوقي' },
    { text: 'لو أنّ الحياة تبقى لحيٍّ لعددتُ فيها جميع الأحياء أمواتاً', author: 'أبو العلاء المعرّي' },
    { text: 'خير جليس في الأنام كتاب', author: 'المتنبّي' },
    { text: 'إنّ أفضل الإخوان من إذا استغنيتَ عنه لم يزداد أنفة', author: 'علي بن أبي طالب' }
];

const JOURNEYS = [
    { id: 'classics-arabic', title: 'جواهر الأدب العربي', description: 'رحلة في تراث الأدب الخالد', icon: '📜', difficulty: 'متوسّط', durationWeeks: 8, keywords: ['ديوان', 'أبو الطيّب', 'الجاحظ'] },
    { id: 'islamic-foundations', title: 'أسس الفكر الإسلامي', description: 'للمبتدئين في فهم الدين', icon: '🕌', difficulty: 'مبتدئ', durationWeeks: 6, keywords: ['العقيدة', 'علوم القرآن', 'رياض الصالحين'] },
    { id: 'entrepreneurship-arabic', title: 'ريادة الأعمال للمبتدئين', description: 'من الفكرة إلى السوق', icon: '🚀', difficulty: 'مبتدئ', durationWeeks: 4, keywords: ['ريادة', 'مشروع', 'التسويق'] },
    { id: 'arab-mind-20c', title: 'العقل العربي في القرن العشرين', description: 'فلاسفة ومفكّرون', icon: '🧠', difficulty: 'متقدّم', durationWeeks: 12, keywords: ['طه حسين', 'جبران', 'الجابري'] }
];

let booksCache = null;
let booksCacheTime = 0;

async function loadBooks(origin) {
    if (booksCache && (Date.now() - booksCacheTime) < 300000) return booksCache;
    const files = ['books-sample.json', 'books-extra-1.json', 'books-extra-2.json', 'books-extra-3.json'];
    const all = [];
    const seen = new Set();
    for (const f of files) {
        try {
            const r = await fetch(`${origin}/data/${f}`);
            if (r.ok) {
                const d = await r.json();
                for (const b of (d.books || [])) {
                    const id = String(b.id);
                    if (seen.has(id)) continue;
                    seen.add(id);
                    all.push(b);
                }
            }
        } catch {}
    }
    booksCache = all;
    booksCacheTime = Date.now();
    return all;
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*'
    }
});

export async function onRequest({ request, params }) {
    const url = new URL(request.url);
    const path = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');

    if (path === 'health' || path === '') {
        return json({ status: 'ok', service: 'المكتبة الطيبة API', platform: 'Cloudflare Pages', timestamp: new Date().toISOString() });
    }

    if (path === 'quote') {
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
        const q = QUOTES[dayOfYear % QUOTES.length];
        return json({ ...q, date: new Date().toISOString().slice(0, 10) });
    }

    if (path === 'stats') {
        const books = await loadBooks(url.origin);
        const byCategory = {};
        const bySource = {};
        let withCover = 0, withPdf = 0;
        for (const b of books) {
            byCategory[b.category] = (byCategory[b.category] || 0) + 1;
            bySource[b.source || 'sample'] = (bySource[b.source || 'sample'] || 0) + 1;
            if (b.cover) withCover++;
            if (b.pdf) withPdf++;
        }
        return json({
            totalBooks: books.length, withCover, withPdf,
            categories: Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
            sources: Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
        });
    }

    if (path === 'categories') {
        const books = await loadBooks(url.origin);
        const counts = {};
        for (const b of books) counts[b.category] = (counts[b.category] || 0) + 1;
        return json(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })));
    }

    if (path === 'featured') {
        const books = await loadBooks(url.origin);
        return json(books.filter(b => b.pdf && b.cover).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 20));
    }

    if (path === 'journeys') {
        const books = await loadBooks(url.origin);
        return json(JOURNEYS.map(j => {
            const matched = books.filter(b => {
                const haystack = `${b.title || ''} ${b.author || ''} ${b.description || ''}`.toLowerCase();
                return j.keywords.some(kw => haystack.includes(kw.toLowerCase()));
            }).slice(0, 8);
            return { ...j, bookCount: matched.length, books: matched };
        }));
    }

    if (path === 'books/random') {
        const books = await loadBooks(url.origin);
        const withPdf = books.filter(b => b.pdf);
        if (!withPdf.length) return json({ error: 'No books' }, 404);
        return json(withPdf[Math.floor(Math.random() * withPdf.length)]);
    }

    if (path.startsWith('books/') && path !== 'books/random') {
        const id = path.replace('books/', '');
        const books = await loadBooks(url.origin);
        const book = books.find(b => String(b.id) === String(id));
        if (!book) return json({ error: 'Book not found' }, 404);
        const related = books.filter(b => b.category === book.category && b.id !== book.id).sort(() => Math.random() - 0.5).slice(0, 6);
        return json({ ...book, related });
    }

    if (path === 'books') {
        const books = await loadBooks(url.origin);
        const q = url.searchParams.get('q')?.toLowerCase();
        const category = url.searchParams.get('category');
        const sortBy = url.searchParams.get('sortBy') || 'views';
        const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
        const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0'));

        let filtered = books;
        if (q) filtered = filtered.filter(b =>
            (b.title || '').toLowerCase().includes(q) ||
            (b.author || '').toLowerCase().includes(q) ||
            (b.description || '').toLowerCase().includes(q)
        );
        if (category) filtered = filtered.filter(b => b.category === category);
        filtered.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));

        return json({ total: filtered.length, offset, limit, books: filtered.slice(offset, offset + limit) });
    }

    return json({ error: 'Not found', path }, 404);
}
