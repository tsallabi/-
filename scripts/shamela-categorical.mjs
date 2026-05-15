#!/usr/bin/env node
/**
 * Shamela.ws categorical scraper — discovers ALL books via category browsing.
 *
 * Strategy:
 *   1. Fetch shamela.ws/categories (or /index.php/categories)
 *   2. For each main category: enumerate all books listed
 *   3. For each book: fetch metadata (title, author, category, pages)
 *   4. Save to data/shamela-books.json
 *
 * NOTE: Books open via iframe to shamela.ws (until Phase 2 adds VPS proxy).
 *       This script just builds the METADATA index.
 *
 * Usage:
 *   node scripts/shamela-categorical.mjs              # all categories
 *   node scripts/shamela-categorical.mjs --cat 1      # just category 1
 *   node scripts/shamela-categorical.mjs --limit 500  # max 500 books
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, '..', 'data', 'shamela-books.json');

const BASE = 'https://shamela.ws';
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';

// كل التصنيفات الرئيسيّة تذهب إلى "الدين والإسلاميات" في موقعنا
// (إلا التاريخ والأدب → أقسامها المخصّصة)
const CATEGORY_MAP = {
    'العقيدة': 'الدين والإسلاميات',
    'التفسير': 'الدين والإسلاميات',
    'علوم القرآن': 'الدين والإسلاميات',
    'الحديث': 'الدين والإسلاميات',
    'علوم الحديث': 'الدين والإسلاميات',
    'الفقه': 'الدين والإسلاميات',
    'أصول الفقه': 'الدين والإسلاميات',
    'السيرة النبوية': 'الدين والإسلاميات',
    'الفرق والردود': 'الدين والإسلاميات',
    'التراجم والطبقات': 'السير والتراجم',
    'التاريخ': 'التاريخ والتراث',
    'اللغة العربية': 'التعليم والدراسة',
    'الأدب': 'الأدب والروايات',
    'علوم اللغة': 'التعليم والدراسة'
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchHtml(url, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const r = await fetch(url, {
                headers: { 'User-Agent': UA, 'Accept-Language': 'ar,en;q=0.5' },
                redirect: 'follow'
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return await r.text();
        } catch (e) {
            if (i === retries) throw e;
            await sleep(1500 * (i + 1));
        }
    }
}

function extractText(html, regex) {
    const m = html.match(regex);
    if (!m) return '';
    return m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// كشف كل التصنيفات من الصفحة الرئيسيّة
async function discoverCategories() {
    const urls = [
        `${BASE}/categories`,
        `${BASE}/index.php/categories`,
        `${BASE}/`
    ];
    for (const url of urls) {
        try {
            const html = await fetchHtml(url);
            // ابحث عن جميع روابط الـcategory
            const matches = [...html.matchAll(/href="[^"]*\/category\/(\d+)"[^>]*>([^<]+)</g)];
            if (matches.length) {
                const cats = new Map();
                for (const m of matches) cats.set(m[1], m[2].trim().replace(/<[^>]+>/g, ' '));
                return [...cats.entries()];
            }
        } catch {}
    }
    // احتياط: قائمة معروفة من التصنيفات الرئيسيّة في شامِلة
    return [
        ['1', 'العقيدة'], ['2', 'التفسير'], ['3', 'الحديث'], ['4', 'الفقه'],
        ['5', 'السيرة النبوية'], ['6', 'التراجم والطبقات'], ['7', 'التاريخ'],
        ['8', 'اللغة العربية'], ['9', 'الأدب']
    ];
}

async function getBooksInCategory(catId, catName) {
    const books = new Set();
    const urls = [
        `${BASE}/category/${catId}`,
        `${BASE}/index.php/category/${catId}`
    ];
    for (const url of urls) {
        try {
            const html = await fetchHtml(url);
            const ids = [...html.matchAll(/href="[^"]*\/book\/(\d+)/g)].map(m => m[1]);
            for (const id of ids) books.add(id);
            if (books.size) break;
        } catch {}
    }
    return [...books];
}

async function getBookMetadata(bookId) {
    const urls = [
        `${BASE}/book/${bookId}`,
        `${BASE}/index.php/book/${bookId}`
    ];
    let html = null;
    for (const url of urls) {
        try { html = await fetchHtml(url); break; } catch {}
    }
    if (!html) return null;

    const title = extractText(html, /<h1[^>]*>([\s\S]+?)<\/h1>/) ||
                  extractText(html, /<title>([^<|]+)/);
    const author = extractText(html, /<a[^>]+href="[^"]*\/author\/[^"]+"[^>]*>([^<]+)<\/a>/) ||
                   extractText(html, /<a[^>]+href="[^"]*\/authors\/[^"]+"[^>]*>([^<]+)<\/a>/);
    const category = extractText(html, /<a[^>]+href="[^"]*\/category\/\d+"[^>]*>([^<]+)<\/a>/);
    const pagesCount = (html.match(/(\d+)\s*(?:صفحة|page)/i) || [])[1];

    return { bookId, title, author, category, pages: parseInt(pagesCount) || 0 };
}

function mapBook(meta, id) {
    const our = CATEGORY_MAP[meta.category] || 'الدين والإسلاميات';
    return {
        id: 'shamela-' + meta.bookId,
        numericId: id,
        shamelaId: meta.bookId,
        title: meta.title,
        author: meta.author || 'مجهول',
        category: our,
        shamelaCategory: meta.category,
        pages: meta.pages,
        cover: '',
        pdf: `${BASE}/book/${meta.bookId}`,
        description: '',
        views: 0, downloads: 0,
        addedDate: new Date().toISOString().slice(0, 10),
        recommended: false,
        source: 'shamela.ws'
    };
}

async function loadExisting() {
    try {
        const data = JSON.parse(await fs.readFile(OUT_FILE, 'utf8'));
        return data.books || [];
    } catch { return []; }
}

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = { cat: null, limit: Infinity };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cat') opts.cat = args[++i];
        else if (args[i] === '--limit') opts.limit = parseInt(args[++i]);
    }
    return opts;
}

async function main() {
    const { cat, limit } = parseArgs();
    console.log('📖 Shamela categorical scraper\n');

    const categories = cat ? [[cat, 'فئة محدّدة']] : await discoverCategories();
    console.log(`✓ ${categories.length} تصنيف للزحف فيه\n`);

    const existing = await loadExisting();
    const existingIds = new Set(existing.map(b => b.shamelaId));
    console.log(`✓ ${existing.length} كتاب مستورد بالفعل\n`);

    const fresh = new Map();  // bookId → catName
    for (const [catId, catName] of categories) {
        console.log(`📂 [${catId}] ${catName}`);
        try {
            const bookIds = await getBooksInCategory(catId, catName);
            console.log(`   → ${bookIds.length} كتاب في هذه الفئة`);
            for (const id of bookIds) {
                if (!existingIds.has(id) && !fresh.has(id)) fresh.set(id, catName);
            }
        } catch (e) { console.log(`   ⚠️ ${e.message}`); }
        await sleep(800);
    }

    console.log(`\n📊 إجماليّ كتب جديدة: ${fresh.size}\n`);
    if (!fresh.size) { console.log('لا كتب جديدة.'); return; }

    const startId = Math.max(217, ...existing.map(b => Number(b.numericId) || 0)) + 1;
    const newBooks = [];
    let i = 0;
    for (const [bookId, _catName] of fresh) {
        if (newBooks.length >= limit) break;
        i++;
        try {
            const meta = await getBookMetadata(bookId);
            if (meta && meta.title) {
                newBooks.push(mapBook(meta, startId + newBooks.length));
                if (newBooks.length % 10 === 0 || newBooks.length <= 10) {
                    console.log(`✓ [${newBooks.length}] ${meta.title.slice(0, 60)}`);
                }
            } else {
                console.log(`⛔ [${i}] لا metadata: ${bookId}`);
            }
        } catch (e) {
            console.log(`❌ [${i}] ${bookId} — ${e.message}`);
        }
        await sleep(300);
    }

    console.log(`\n✅ تمّ جلب ${newBooks.length} كتاب جديد من شامِلة`);
    const merged = { books: [...existing, ...newBooks] };
    await fs.writeFile(OUT_FILE, JSON.stringify(merged, null, 2));
    console.log(`💾 محفوظ في ${path.relative(process.cwd(), OUT_FILE)}`);
}

main().catch(err => { console.error('\n❌', err); process.exit(1); });
