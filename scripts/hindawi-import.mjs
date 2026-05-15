#!/usr/bin/env node
/**
 * Hindawi Foundation importer — fetches free Arabic books with direct PDFs
 *
 * Hindawi (https://www.hindawi.org/books/) has ~700+ free modern Arabic books:
 *   - Philosophy, psychology, self-development
 *   - Modern Arabic literature & novels
 *   - History, biographies, science
 *   - All copyright-free, direct PDF downloads
 *
 * Usage:
 *   node scripts/hindawi-import.mjs [limit]
 *   node scripts/hindawi-import.mjs 100   # first 100 new books
 *   node scripts/hindawi-import.mjs all   # all available
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, '..', 'data', 'books-extra-3.json');

const BASE = 'https://www.hindawi.org';
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';

// Map Hindawi categories → site categories
const CATEGORY_MAP = {
    'الفلسفة': 'الفلسفة والفكر',
    'علم النفس': 'علم النفس',
    'تنمية بشرية': 'تطوير الذات والنجاح',
    'التنمية البشرية': 'تطوير الذات والنجاح',
    'تاريخ': 'التاريخ والتراث',
    'التاريخ': 'التاريخ والتراث',
    'السير الذاتية': 'السير والتراجم',
    'السير': 'السير والتراجم',
    'تراجم': 'السير والتراجم',
    'الرواية': 'الأدب والروايات',
    'روايات': 'الأدب والروايات',
    'القصة القصيرة': 'الأدب والروايات',
    'قصص قصيرة': 'الأدب والروايات',
    'أدب': 'الأدب والروايات',
    'الشعر': 'الشعر',
    'شعر': 'الشعر',
    'علوم': 'العلوم والمعرفة',
    'العلوم': 'العلوم والمعرفة',
    'الاقتصاد': 'المال والاستثمار',
    'اقتصاد': 'المال والاستثمار',
    'إدارة': 'إدارة الأعمال',
    'الإدارة': 'إدارة الأعمال',
    'دين': 'الدين والإسلاميات',
    'إسلاميات': 'الدين والإسلاميات',
    'كتب الأطفال': 'كتب الأطفال',
    'أطفال': 'كتب الأطفال',
    'سياسة': 'العلوم والمعرفة',
    'اجتماع': 'العلوم والمعرفة'
};

async function fetchHtml(url, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const r = await fetch(url, {
                headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
                redirect: 'follow'
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return await r.text();
        } catch (e) {
            if (i === retries) throw e;
            await sleep(1000 * (i + 1));
        }
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// محاولة 1: sitemap.xml
async function tryGetBookLinksFromSitemap() {
    try {
        const sitemap = await fetchHtml(`${BASE}/sitemap.xml`);
        // قد يكون sitemap index → يشير لـsitemaps فرعية
        const subSitemaps = [...sitemap.matchAll(/<loc>([^<]+sitemap[^<]+\.xml)<\/loc>/g)].map(m => m[1]);
        const allUrls = [];
        if (subSitemaps.length) {
            for (const sub of subSitemaps) {
                try {
                    const subContent = await fetchHtml(sub);
                    const bookUrls = [...subContent.matchAll(/<loc>([^<]*\/books\/\d+\/?)<\/loc>/g)].map(m => m[1]);
                    allUrls.push(...bookUrls);
                } catch {}
            }
        } else {
            const bookUrls = [...sitemap.matchAll(/<loc>([^<]*\/books\/\d+\/?)<\/loc>/g)].map(m => m[1]);
            allUrls.push(...bookUrls);
        }
        return [...new Set(allUrls)];
    } catch (e) {
        console.log(`   ⚠️ sitemap: ${e.message}`);
        return [];
    }
}

// محاولة 2: تصفّح صفحات الفهرس
async function tryGetBookLinksFromIndex() {
    const links = new Set();
    for (let page = 1; page <= 100; page++) {
        try {
            // جرّب أنماطاً متعدّدة للترقيم
            const urls = [
                `${BASE}/books/?p=${page}`,
                `${BASE}/books/page/${page}`,
                `${BASE}/books/index/${page}`
            ];
            let foundOnPage = 0;
            for (const url of urls) {
                try {
                    const html = await fetchHtml(url);
                    const before = links.size;
                    const matches = [...html.matchAll(/href="([^"]*\/books\/(\d+)\/?)"/g)];
                    for (const m of matches) {
                        const full = m[1].startsWith('http') ? m[1] : `${BASE}${m[1].startsWith('/') ? '' : '/'}${m[1]}`;
                        links.add(full.replace(/\/$/, '') + '/');
                    }
                    foundOnPage = links.size - before;
                    if (foundOnPage > 0) break;
                } catch {}
            }
            console.log(`   📄 page ${page}: +${foundOnPage} (total: ${links.size})`);
            if (foundOnPage === 0 && page > 3) break;
            await sleep(400);
        } catch (e) {
            break;
        }
    }
    return [...links];
}

async function getAllBookLinks() {
    console.log('📋 اكتشاف كل الكتب...');
    let links = await tryGetBookLinksFromSitemap();
    console.log(`   sitemap: ${links.length} رابط`);
    if (links.length < 100) {
        console.log('   جاري تجربة فهرس الصفحات...');
        const indexLinks = await tryGetBookLinksFromIndex();
        const merged = new Set([...links, ...indexLinks]);
        links = [...merged];
    }
    return links;
}

function extractText(html, regex) {
    const m = html.match(regex);
    if (!m) return '';
    return m[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

async function getBookMetadata(bookUrl) {
    const html = await fetchHtml(bookUrl);

    // العنوان
    const title = extractText(html, /<h1[^>]*>([\s\S]+?)<\/h1>/) ||
                  extractText(html, /<meta\s+property="og:title"[^>]+content="([^"]+)"/);

    // المؤلف
    const author = extractText(html, /<a[^>]+href="\/authors\/[^"]+"[^>]*>([^<]+)<\/a>/) ||
                   extractText(html, /<a[^>]+href="\/author\/[^"]+"[^>]*>([^<]+)<\/a>/) ||
                   extractText(html, /class="author[^"]*"[^>]*>([^<]+)</);

    // التصنيف
    const category = extractText(html, /<a[^>]+href="\/categories\/[^"]+"[^>]*>([^<]+)<\/a>/) ||
                     extractText(html, /<a[^>]+href="\/category\/[^"]+"[^>]*>([^<]+)<\/a>/);

    // الوصف
    const description = extractText(html, /<meta\s+name="description"[^>]+content="([^"]+)"/) ||
                        extractText(html, /<meta\s+property="og:description"[^>]+content="([^"]+)"/) ||
                        extractText(html, /class="description[^"]*"[^>]*>([\s\S]+?)</);

    // الـPDF: عدّة أنماط محتملة
    let pdfUrl = '';
    const pdfPatterns = [
        /href="([^"]*\/contents\/[^"]+\.pdf)"/,
        /href="([^"]*\/books\/\d+\/[^"]+\.pdf)"/,
        /href="([^"]+\.pdf)"[^>]*>(?:[^<]*(?:تحميل|تنزيل|PDF|download)[^<]*)</i,
        /data-pdf="([^"]+)"/,
        /<a[^>]+class="[^"]*download[^"]*"[^>]+href="([^"]+)"/
    ];
    for (const re of pdfPatterns) {
        const m = html.match(re);
        if (m && m[1].endsWith('.pdf')) {
            pdfUrl = m[1].startsWith('http') ? m[1] : `${BASE}${m[1]}`;
            break;
        }
    }

    // الغلاف: عدّة أنماط
    let coverUrl = '';
    const coverPatterns = [
        /<meta\s+property="og:image"[^>]+content="([^"]+)"/,
        /<img[^>]+class="[^"]*(?:cover|thumbnail)[^"]*"[^>]+src="([^"]+)"/,
        /<img[^>]+src="([^"]+(?:cover|thumb)[^"]+)"/
    ];
    for (const re of coverPatterns) {
        const m = html.match(re);
        if (m) {
            coverUrl = m[1].startsWith('http') ? m[1] : `${BASE}${m[1]}`;
            break;
        }
    }

    return { title, author, category, description, pdfUrl, coverUrl, sourceUrl: bookUrl };
}

function mapBook(meta, id) {
    const our = CATEGORY_MAP[meta.category] || 'العلوم والمعرفة';
    return {
        id: String(id),
        title: meta.title,
        author: meta.author || 'مؤسسة هنداوي',
        category: our,
        pages: 0,
        cover: meta.coverUrl,
        pdf: meta.pdfUrl,
        description: (meta.description || '').slice(0, 700),
        views: 0, downloads: 0,
        addedDate: new Date().toISOString().slice(0, 10),
        recommended: false,
        source: 'hindawi.org',
        sourceUrl: meta.sourceUrl,
        originalCategory: meta.category
    };
}

async function loadExisting() {
    try {
        const data = JSON.parse(await fs.readFile(OUT_FILE, 'utf8'));
        return data.books || [];
    } catch { return []; }
}

async function main() {
    const limitArg = process.argv[2] || '200';
    const limit = limitArg === 'all' ? Infinity : parseInt(limitArg);
    console.log(`📚 Hindawi importer — هدف: ${limit === Infinity ? 'الكل' : limit} كتاب\n`);

    const links = await getAllBookLinks();
    console.log(`\n✓ وُجد ${links.length} رابط كتاب\n`);
    if (!links.length) { console.error('❌ لم يُعثر على روابط. تحقّق من النمط في الكود.'); process.exit(1); }

    const existing = await loadExisting();
    const existingUrls = new Set(existing.map(b => b.sourceUrl).filter(Boolean));
    const fresh = links.filter(url => !existingUrls.has(url) && !existingUrls.has(url.replace(/\/$/, '')));
    console.log(`✓ ${fresh.length} كتاب جديد للجلب (${existing.length} مستورد بالفعل)\n`);

    const toFetch = fresh.slice(0, limit);
    const startId = Math.max(217, ...existing.map(b => Number(b.id) || 0)) + 1;
    const newBooks = [];

    for (let i = 0; i < toFetch.length; i++) {
        const url = toFetch[i];
        try {
            const meta = await getBookMetadata(url);
            if (!meta.title) { console.log(`⛔ [${i+1}/${toFetch.length}] لا عنوان: ${url}`); continue; }
            if (!meta.pdfUrl) { console.log(`⚠️  [${i+1}/${toFetch.length}] ${meta.title.slice(0,50)} — لا PDF`); continue; }
            const book = mapBook(meta, startId + newBooks.length);
            newBooks.push(book);
            console.log(`✓ [${newBooks.length}] ${book.title.slice(0,60)}`);
        } catch (err) {
            console.log(`❌ [${i+1}/${toFetch.length}] ${url} — ${err.message}`);
        }
        await sleep(400);
    }

    console.log(`\n✅ تمّ جلب ${newBooks.length} كتاب جديد من هنداوي`);
    const merged = { books: [...existing, ...newBooks] };
    await fs.writeFile(OUT_FILE, JSON.stringify(merged, null, 2));
    console.log(`💾 محفوظ في ${path.relative(process.cwd(), OUT_FILE)}`);
    console.log(`📊 إجمالي extra-3: ${merged.books.length} كتاب`);
}

main().catch(err => { console.error('\n❌', err); process.exit(1); });
