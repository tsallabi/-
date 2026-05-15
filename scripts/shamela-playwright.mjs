#!/usr/bin/env node
/**
 * Shamela.ws scraper using Playwright (real browser) to bypass Cloudflare WAF.
 *
 * Requires: npm install playwright && npx playwright install chromium
 * (أو شغّل scripts/install-playwright.sh)
 *
 * Usage:
 *   node scripts/shamela-playwright.mjs               # default 500 books
 *   node scripts/shamela-playwright.mjs 1000
 *   node scripts/shamela-playwright.mjs --cat 1       # category 1 only
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try {
    ({ chromium } = await import('playwright'));
} catch (e) {
    console.error('❌ Playwright not installed. Run: bash scripts/install-playwright.sh');
    process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, '..', 'data', 'shamela-books.json');
const BASE = 'https://shamela.ws';

const CATEGORY_MAP = {
    'العقيدة': 'الدين والإسلاميات',
    'التفسير': 'الدين والإسلاميات',
    'علوم القرآن': 'الدين والإسلاميات',
    'الحديث': 'الدين والإسلاميات',
    'علوم الحديث': 'الدين والإسلاميات',
    'الفقه': 'الدين والإسلاميات',
    'أصول الفقه': 'الدين والإسلاميات',
    'السيرة النبوية': 'الدين والإسلاميات',
    'التراجم والطبقات': 'السير والتراجم',
    'التاريخ': 'التاريخ والتراث',
    'اللغة العربية': 'التعليم والدراسة',
    'الأدب': 'الأدب والروايات'
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithBrowser(page, url) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    return await page.content();
}

function extractText(html, regex) {
    const m = html.match(regex);
    if (!m) return '';
    return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function discoverCategories(page) {
    const html = await fetchWithBrowser(page, `${BASE}/categories`);
    const cats = new Map();
    for (const m of html.matchAll(/href="[^"]*\/category\/(\d+)"[^>]*>([^<]+)</g)) {
        cats.set(m[1], m[2].trim());
    }
    return [...cats.entries()];
}

async function getBooksInCategory(page, catId) {
    const html = await fetchWithBrowser(page, `${BASE}/category/${catId}`);
    const ids = new Set();
    for (const m of html.matchAll(/href="[^"]*\/book\/(\d+)/g)) ids.add(m[1]);
    return [...ids];
}

async function getBookMetadata(page, bookId) {
    const html = await fetchWithBrowser(page, `${BASE}/book/${bookId}`);
    return {
        bookId,
        title: extractText(html, /<h1[^>]*>([\s\S]+?)<\/h1>/),
        author: extractText(html, /<a[^>]+href="[^"]*\/author\/[^"]+"[^>]*>([^<]+)<\/a>/),
        category: extractText(html, /<a[^>]+href="[^"]*\/category\/\d+"[^>]*>([^<]+)<\/a>/)
    };
}

function mapBook(meta, id) {
    return {
        id: 'shamela-' + meta.bookId,
        numericId: id,
        shamelaId: meta.bookId,
        title: meta.title,
        author: meta.author || 'مجهول',
        category: CATEGORY_MAP[meta.category] || 'الدين والإسلاميات',
        shamelaCategory: meta.category,
        cover: '',
        pdf: `${BASE}/book/${meta.bookId}`,
        description: '',
        views: 0,
        downloads: 0,
        addedDate: new Date().toISOString().slice(0, 10),
        recommended: false,
        source: 'shamela.ws-playwright'
    };
}

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = { limit: 500, cat: null };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cat') opts.cat = args[++i];
        else if (!isNaN(args[i])) opts.limit = parseInt(args[i]);
    }
    return opts;
}

async function main() {
    const { limit, cat } = parseArgs();
    console.log(`🌐 Shamela Playwright scraper — هدف: ${limit} كتاب\n`);

    console.log('⏳ تشغيل Chromium headless...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'ar-SA'
    });
    const page = await context.newPage();

    let existing = { books: [] };
    try { existing = JSON.parse(await fs.readFile(OUT_FILE, 'utf8')); } catch {}
    const seenIds = new Set(existing.books.map(b => b.shamelaId));

    try {
        let categories;
        if (cat) {
            categories = [[cat, 'فئة محدّدة']];
        } else {
            console.log('⏳ اكتشاف التصنيفات...');
            categories = await discoverCategories(page);
            if (!categories.length) {
                categories = [['1','العقيدة'],['2','الفرق'],['3','التفسير'],['4','علوم القرآن'],['6','كتب السنة'],['7','شروح الحديث'],['11','أصول الفقه'],['12','الفقه'],['26','التراجم']];
            }
            console.log(`✓ ${categories.length} تصنيف`);
        }

        const newBooks = [];
        let nextId = Math.max(0, ...existing.books.map(b => Number(b.numericId) || 0)) + 1;

        for (const [catId, catName] of categories) {
            if (newBooks.length >= limit) break;
            console.log(`\n📂 [${catId}] ${catName}`);
            try {
                const bookIds = await getBooksInCategory(page, catId);
                console.log(`   → ${bookIds.length} كتاب في هذا التصنيف`);

                for (const bookId of bookIds) {
                    if (newBooks.length >= limit) break;
                    if (seenIds.has(bookId)) continue;
                    try {
                        const meta = await getBookMetadata(page, bookId);
                        if (meta.title) {
                            newBooks.push(mapBook(meta, nextId++));
                            seenIds.add(bookId);
                            if (newBooks.length <= 5 || newBooks.length % 10 === 0) {
                                console.log(`   ✓ [${newBooks.length}/${limit}] ${meta.title.slice(0, 55)}`);
                            }
                        }
                    } catch (e) { /* skip individual book errors */ }
                    await sleep(800);  // بطيء لتجنّب الحجب
                }
            } catch (e) {
                console.log(`   ⚠️ فشل التصنيف: ${e.message}`);
            }
        }

        existing.books.push(...newBooks);
        await fs.writeFile(OUT_FILE, JSON.stringify(existing, null, 2));
        console.log(`\n✅ جلب ${newBooks.length} كتاب من شاملة`);
        console.log(`💾 محفوظ في ${OUT_FILE}`);
    } finally {
        await browser.close();
    }
}

main().catch(err => { console.error('\n❌', err); process.exit(1); });
