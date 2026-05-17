#!/usr/bin/env node
/**
 * Hindawi Foundation importer — fetches free Arabic books with direct PDFs.
 *
 * VERIFIED URL patterns (Nov 2025):
 *   - Listing:    https://www.hindawi.org/books/{N}/  (N = 1..~165, 20 books each)
 *   - Book page:  https://www.hindawi.org/books/{8-digit-ID}/
 *   - PDF (CDN):  https://downloads.hindawi.org/books/{ID}.pdf
 *   - Cover:      og:image meta
 *
 * Total: ~3,291 books. No sitemap.xml — must iterate pagination.
 *
 * Hindawi.org sits behind Cloudflare which aggressively blocks generic UAs.
 * Strategy: rotate modern browser User-Agents + realistic Sec-Fetch headers
 * + 2s delays. If that still returns 0 after retries, we fall back to the
 * Internet Archive hindawifoundation collection (mirrored copies).
 *
 * Usage:
 *   node scripts/hindawi-import.mjs            # default 200
 *   node scripts/hindawi-import.mjs 500
 *   node scripts/hindawi-import.mjs all        # all 3000+
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, '..', 'data', 'books-extra-3.json');

const BASE = 'https://www.hindawi.org';
const CDN  = 'https://downloads.hindawi.org';

// Rotating set of modern browser User-Agents to avoid Cloudflare WAF blocks.
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'
];
let _uaIdx = 0;
function pickUA() { _uaIdx = (_uaIdx + 1) % USER_AGENTS.length; return USER_AGENTS[_uaIdx]; }

const CATEGORY_MAP = {
    'philosophy': 'الفلسفة والفكر',
    'philosophy-and-thought': 'الفلسفة والفكر',
    'psychology': 'علم النفس',
    'self-help': 'تطوير الذات والنجاح',
    'history': 'التاريخ والتراث',
    'biographies': 'السير والتراجم',
    'biography': 'السير والتراجم',
    'novels': 'الأدب والروايات',
    'novel': 'الأدب والروايات',
    'short-stories': 'الأدب والروايات',
    'literature': 'الأدب والروايات',
    'poetry': 'الشعر',
    'science': 'العلوم والمعرفة',
    'sciences': 'العلوم والمعرفة',
    'economics': 'المال والاستثمار',
    'management': 'إدارة الأعمال',
    'religion': 'الدين والإسلاميات',
    'islam': 'الدين والإسلاميات',
    'children': 'كتب الأطفال',
    'political-science': 'العلوم والمعرفة',
    'sociology': 'العلوم والمعرفة'
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function browserHeaders() {
    return {
        'User-Agent': pickUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar-SA,ar;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Sec-Fetch-Dest': 'document',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };
}

async function fetchHtml(url, retries = 3) {
    let lastErr;
    for (let i = 0; i <= retries; i++) {
        try {
            const r = await fetch(url, { headers: browserHeaders(), redirect: 'follow' });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return await r.text();
        } catch (e) {
            lastErr = e;
            if (i === retries) throw e;
            await sleep(2000 * (i + 1));  // back-off: 2s, 4s, 6s
        }
    }
    throw lastErr;
}

function extractClean(html, re) {
    const m = html.match(re);
    if (!m) return '';
    return m[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

async function getBookIdsFromListingPage(pageNum) {
    const url = pageNum === 1 ? `${BASE}/books/` : `${BASE}/books/${pageNum}/`;
    try {
        const html = await fetchHtml(url);
        const ids = new Set();
        for (const m of html.matchAll(/href="\/books\/(\d{8})\/"/g)) ids.add(m[1]);
        return [...ids];
    } catch (e) {
        return [];
    }
}

async function getAllBookIds(maxPages = 170) {
    console.log('📋 اكتشاف معرّفات الكتب من صفحات الفهرس...');
    const allIds = new Set();
    for (let page = 1; page <= maxPages; page++) {
        const ids = await getBookIdsFromListingPage(page);
        const before = allIds.size;
        for (const id of ids) allIds.add(id);
        const added = allIds.size - before;
        if (page % 10 === 0 || added === 0 || page <= 3) {
            console.log(`   📄 صفحة ${page}: +${added} (إجمالي: ${allIds.size})`);
        }
        if (added === 0 && page > 3) break;
        await sleep(2000);  // 2s between requests to look human-ish
    }
    return [...allIds];
}

async function getBookMetadata(bookId) {
    const url = `${BASE}/books/${bookId}/`;
    const html = await fetchHtml(url);

    const title = extractClean(html, /<h1[^>]*>([\s\S]+?)<\/h1>/) ||
                  extractClean(html, /<meta\s+property="og:title"[^>]+content="([^"]+)"/) ||
                  extractClean(html, /<title>([^<|]+)/);

    const author = extractClean(html, /<a[^>]+href="\/authors\/\d+\/?"[^>]*>([\s\S]+?)<\/a>/) ||
                   extractClean(html, /class="author[^"]*"[^>]*>([^<]+)</);

    const catMatch = html.match(/<a[^>]+href="\/books\/categories\/([^"\/]+)\/?"[^>]*>([\s\S]+?)<\/a>/);
    const categorySlug = catMatch ? catMatch[1] : '';
    const categoryName = catMatch ? extractClean(html, /<a[^>]+href="\/books\/categories\/[^"\/]+\/?"[^>]*>([\s\S]+?)<\/a>/) : '';

    const description = extractClean(html, /<meta\s+name="description"\s+content="([^"]+)"/) ||
                        extractClean(html, /<meta\s+property="og:description"[^>]+content="([^"]+)"/);

    let coverUrl = extractClean(html, /<meta\s+property="og:image"[^>]+content="([^"]+)"/);
    if (!coverUrl) {
        const m = html.match(/<img[^>]+src="(https?:\/\/[^"]*\/(?:books|covers|media)\/[^"]+\.(?:jpg|jpeg|png|webp))"/i);
        if (m) coverUrl = m[1];
    }

    return {
        bookId,
        title,
        author: author || 'مؤسسة هنداوي',
        categorySlug,
        categoryName,
        description: description.slice(0, 700),
        coverUrl,
        pdfUrl: `${CDN}/books/${bookId}.pdf`,
        sourceUrl: url
    };
}

function mapBook(meta, numericId) {
    const ourCategory = CATEGORY_MAP[meta.categorySlug] || 'العلوم والمعرفة';
    return {
        id: String(numericId),
        title: meta.title,
        author: meta.author,
        category: ourCategory,
        pages: 0,
        cover: meta.coverUrl,
        pdf: meta.pdfUrl,
        description: meta.description,
        views: 0,
        downloads: 0,
        addedDate: new Date().toISOString().slice(0, 10),
        recommended: false,
        source: 'hindawi.org',
        sourceUrl: meta.sourceUrl,
        hindawiId: meta.bookId,
        originalCategory: meta.categoryName
    };
}

async function loadExisting() {
    try {
        const data = JSON.parse(await fs.readFile(OUT_FILE, 'utf8'));
        return data.books || [];
    } catch { return []; }
}

/* ------------------------------------------------------------------ */
/* Fallback: Internet Archive hindawifoundation collection             */
/* ------------------------------------------------------------------ */

async function iaFallback(limit, existing, startId) {
    console.log('\n🔄 Hindawi.org غير متاح — التبديل إلى Internet Archive (collection: hindawifoundation)');
    const query = encodeURIComponent('(collection:hindawifoundation OR creator:"hindawi") AND mediatype:texts');
    const url = `https://archive.org/advancedsearch.php?q=${query}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=description&fl%5B%5D=subject&rows=${Math.min(limit, 2000)}&output=json`;
    try {
        const r = await fetch(url, { headers: { 'User-Agent': pickUA(), 'Accept': 'application/json' } });
        if (!r.ok) { console.error(`   ❌ IA HTTP ${r.status}`); return []; }
        const data = await r.json();
        const docs = data?.response?.docs || [];
        console.log(`   ✓ Internet Archive رجّع ${docs.length} نتيجة`);
        const existingIaIds = new Set(existing.filter(b => b.source === 'archive.org').map(b => b.archiveId || b.id));
        const newBooks = [];
        for (const d of docs) {
            if (newBooks.length >= limit) break;
            if (existingIaIds.has(d.identifier)) continue;
            const title = Array.isArray(d.title) ? d.title[0] : d.title;
            if (!title) continue;
            const author = Array.isArray(d.creator) ? d.creator.join('، ') : (d.creator || 'مؤسسة هنداوي');
            const desc = Array.isArray(d.description) ? d.description.join(' ') : (d.description || '');
            newBooks.push({
                id: String(startId + newBooks.length),
                title,
                author,
                category: 'العلوم والمعرفة',
                pages: 0,
                cover: `https://archive.org/services/img/${d.identifier}`,
                pdf: `https://archive.org/download/${d.identifier}/${d.identifier}.pdf`,
                description: String(desc).slice(0, 700),
                views: 0, downloads: 0,
                addedDate: new Date().toISOString().slice(0, 10),
                recommended: false,
                source: 'archive.org',
                sourceUrl: `https://archive.org/details/${d.identifier}`,
                archiveId: d.identifier,
                originalCategory: 'هنداوي (مرآة IA)'
            });
        }
        return newBooks;
    } catch (e) {
        console.error('   ❌ IA fallback failed:', e.message);
        return [];
    }
}

async function main() {
    const limitArg = process.argv[2] || '200';
    const limit = limitArg === 'all' ? Infinity : parseInt(limitArg);

    console.log(`📚 Hindawi importer (CDN-direct + UA rotation) — هدف: ${limit === Infinity ? 'الكل' : limit} كتاب\n`);

    const existing = await loadExisting();
    const startId = Math.max(217, ...existing.map(b => Number(b.id) || 0)) + 1;

    let allIds = [];
    try {
        allIds = await getAllBookIds();
        console.log(`\n✓ اكتُشف ${allIds.length} كتاب`);
    } catch (e) {
        console.error('❌ خطأ في اكتشاف المعرّفات:', e.message);
    }

    // If Hindawi.org is unreachable / WAF-blocked, fall back to Internet Archive.
    if (!allIds.length) {
        console.log('⚠️ لا معرّفات من هنداوي مباشرة (WAF محتمل).');
        const iaBooks = await iaFallback(limit === Infinity ? 500 : limit, existing, startId);
        if (!iaBooks.length) { console.error('❌ كلا المصدرَين فشل.'); process.exit(1); }
        const merged = { books: [...existing, ...iaBooks] };
        await fs.writeFile(OUT_FILE, JSON.stringify(merged, null, 2));
        console.log(`\n✅ جلب ${iaBooks.length} كتاب من Internet Archive (مرآة هنداوي)`);
        console.log(`💾 محفوظ في ${path.relative(process.cwd(), OUT_FILE)}`);
        console.log(`📊 إجمالي extra-3: ${merged.books.length} كتاب`);
        return;
    }

    const existingHindawiIds = new Set(existing.filter(b => b.hindawiId).map(b => b.hindawiId));
    const fresh = allIds.filter(id => !existingHindawiIds.has(id));
    console.log(`✓ ${fresh.length} معرّف جديد للجلب (${existingHindawiIds.size} موجود مسبقاً)\n`);

    const toFetch = fresh.slice(0, limit === Infinity ? fresh.length : limit);
    const newBooks = [];

    for (let i = 0; i < toFetch.length; i++) {
        const bookId = toFetch[i];
        try {
            const meta = await getBookMetadata(bookId);
            if (!meta.title) { console.log(`⛔ [${i+1}/${toFetch.length}] لا عنوان: ${bookId}`); continue; }
            const book = mapBook(meta, startId + newBooks.length);
            newBooks.push(book);
            if (newBooks.length <= 5 || newBooks.length % 10 === 0) {
                console.log(`✓ [${newBooks.length}] ${book.title.slice(0,55)}`);
            }
        } catch (err) {
            console.log(`❌ [${i+1}/${toFetch.length}] ${bookId} — ${err.message}`);
        }
        await sleep(2000);  // 2s between book-detail requests
    }

    // If direct Hindawi yielded nothing despite finding ids, try IA fallback too.
    if (!newBooks.length) {
        console.log('\n⚠️ اكتشفنا معرّفات لكن لم نتمكن من جلب التفاصيل — تجريب Internet Archive');
        const iaBooks = await iaFallback(limit === Infinity ? 500 : limit, existing, startId);
        if (iaBooks.length) {
            const merged = { books: [...existing, ...iaBooks] };
            await fs.writeFile(OUT_FILE, JSON.stringify(merged, null, 2));
            console.log(`\n✅ جلب ${iaBooks.length} كتاب من Internet Archive`);
            return;
        }
    }

    console.log(`\n✅ جلب ${newBooks.length} كتاب جديد من هنداوي`);
    const merged = { books: [...existing, ...newBooks] };
    await fs.writeFile(OUT_FILE, JSON.stringify(merged, null, 2));
    console.log(`💾 محفوظ في ${path.relative(process.cwd(), OUT_FILE)}`);
    console.log(`📊 إجمالي extra-3: ${merged.books.length} كتاب`);
}

main().catch(err => { console.error('\n❌', err); process.exit(1); });
