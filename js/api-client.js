/**
 * Taybaa API Client — frontend connector to backend API.
 *
 * Use:
 *   const stats = await TaybaaAPI.stats();
 *   const books = await TaybaaAPI.searchBooks({ q: 'تفسير', limit: 20 });
 *   const quote = await TaybaaAPI.dailyQuote();
 */

const TaybaaAPI = (function() {
    // VPS macchina-direct
    let API_BASE = 'http://104.248.118.96:3000/api';

    // التبديل تلقائيّاً للتطوير المحلّي
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        API_BASE = 'http://localhost:3000/api';
    }

    // تجاوز يدوي (للاختبار)
    try {
        const override = localStorage.getItem('taybaa-api-base');
        if (override) API_BASE = override;
    } catch (_) {}

    let cache = {};
    const CACHE_TTL = 5 * 60 * 1000; // 5 دقائق

    async function get(path, opts = {}) {
        const cacheKey = path;
        if (opts.cache !== false) {
            const cached = cache[cacheKey];
            if (cached && (Date.now() - cached.time) < CACHE_TTL) return cached.data;
        }
        try {
            const url = `${API_BASE}${path}`;
            const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
            if (!r.ok) throw new Error(`API ${r.status} for ${path}`);
            const data = await r.json();
            cache[cacheKey] = { time: Date.now(), data };
            return data;
        } catch (e) {
            console.warn('TaybaaAPI error:', e.message);
            // Fallback: load from static JSON for read-only ops
            if (path.startsWith('/books') || path === '/stats' || path === '/categories') {
                return fallbackToStatic(path);
            }
            throw e;
        }
    }

    async function fallbackToStatic(path) {
        // لو VPS داون، استخدم الـJSON مباشرةً
        if (!cache._allBooks) {
            const files = ['data/books-sample.json', 'data/books-extra-1.json', 'data/books-extra-2.json', 'data/books-extra-3.json'];
            const all = [];
            for (const f of files) {
                try {
                    const r = await fetch(f + '?t=' + Date.now());
                    if (r.ok) {
                        const d = await r.json();
                        for (const b of (d.books || [])) all.push(b);
                    }
                } catch (_) {}
            }
            cache._allBooks = all;
        }
        const all = cache._allBooks;
        if (path === '/stats') {
            const byCat = {};
            for (const b of all) byCat[b.category] = (byCat[b.category] || 0) + 1;
            return {
                totalBooks: all.length,
                categories: Object.entries(byCat).sort((a,b) => b[1]-a[1]).map(([name, count]) => ({ name, count }))
            };
        }
        if (path === '/categories') {
            const byCat = {};
            for (const b of all) byCat[b.category] = (byCat[b.category] || 0) + 1;
            return Object.entries(byCat).sort((a,b) => b[1]-a[1]).map(([name, count]) => ({ name, count }));
        }
        if (path.startsWith('/books')) {
            return { total: all.length, books: all.slice(0, 100) };
        }
        return null;
    }

    return {
        get API_BASE() { return API_BASE; },
        setApiBase(url) { API_BASE = url; localStorage.setItem('taybaa-api-base', url); },
        clearCache() { cache = {}; },

        health: () => get('/health', { cache: false }),
        stats: () => get('/stats'),
        categories: () => get('/categories'),
        dailyQuote: () => get('/quote', { cache: false }),
        featured: () => get('/featured'),
        journeys: () => get('/journeys'),
        randomBook: () => get('/books/random', { cache: false }),
        bookById: (id) => get(`/books/${id}`),
        searchBooks: ({ q = '', category = '', sortBy = 'views', limit = 50, offset = 0 } = {}) => {
            const params = new URLSearchParams({ q, category, sortBy, limit, offset }).toString();
            return get(`/books?${params}`);
        }
    };
})();
