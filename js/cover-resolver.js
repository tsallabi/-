/* محلّل أغلفة الكتب: overrides ← Google Books ← cache */

const COVER = (function() {
    const CACHE_KEY = 'taybaa-cover-cache-v3';
    let cache = {};
    let overrides = null;
    let overridesLoading = null;

    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (_) { cache = {}; }

    function persist() { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (_) {} }
    function keyOf(book) { return ((book.title || '') + '|' + (book.author || '')).toLowerCase().trim(); }

    async function loadOverrides() {
        if (overrides !== null) return overrides;
        if (overridesLoading) return overridesLoading;
        overridesLoading = (async () => {
            try {
                const res = await fetch('data/book-overrides.json?t=' + Date.now());
                if (!res.ok) { overrides = {}; return {}; }
                overrides = await res.json();
                return overrides;
            } catch { overrides = {}; return {}; }
        })();
        return overridesLoading;
    }

    async function fromGoogleBooks(book) {
        const q = encodeURIComponent(`${book.title || ''} ${book.author || ''}`.trim());
        const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=3&printType=books&fields=items(volumeInfo(title,authors,imageLinks))`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('GB_' + res.status);
        const data = await res.json();
        const items = data.items || [];
        for (const item of items) {
            const links = item.volumeInfo && item.volumeInfo.imageLinks;
            const src = links && (links.extraLarge || links.large || links.medium || links.thumbnail || links.smallThumbnail);
            if (src) return src.replace(/^http:/, 'https:').replace(/&edge=curl/g, '').replace(/&zoom=\d+/g, '&zoom=2');
        }
        return null;
    }

    async function resolve(book) {
        if (!book || !book.title) return '';
        const ov = await loadOverrides();
        if (ov && ov[book.id] && ov[book.id].cover) return ov[book.id].cover;
        const k = keyOf(book);
        if (cache[k] !== undefined) return cache[k];
        if (book.cover && !/pollinations\.ai/.test(book.cover)) {
            cache[k] = book.cover; persist(); return book.cover;
        }
        try {
            const real = await fromGoogleBooks(book);
            if (real) { cache[k] = real; persist(); return real; }
        } catch (_) {}
        const fb = book.cover || '';
        cache[k] = fb; persist();
        return fb;
    }

    async function hydrate(container, books) {
        if (!container) return;
        const chunkSize = 4;
        for (let i = 0; i < books.length; i += chunkSize) {
            const chunk = books.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (book) => {
                const url = await resolve(book);
                if (!url) return;
                const frame = container.querySelector(`[data-book-id="${CSS.escape(String(book.id))}"] .book-cover-frame`);
                if (!frame) return;
                const existing = frame.querySelector('.book-cover');
                if (existing) { if (existing.src !== url) existing.src = url; return; }
                const img = document.createElement('img');
                img.className = 'book-cover';
                img.alt = book.title || '';
                img.loading = 'lazy';
                img.onerror = function() { this.remove(); };
                img.src = url;
                frame.appendChild(img);
            }));
        }
    }

    function clear() { cache = {}; persist(); overrides = null; overridesLoading = null; }

    return { resolve, hydrate, clear, loadOverrides };
})();
