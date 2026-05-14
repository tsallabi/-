#!/usr/bin/env node
/**
 * Shamela.ws scraper — VPS-only (Shamela blocks browser CORS).
 *
 * Strategy:
 *   1. Fetch the public sitemap of books from Shamela
 *   2. For each book ID: pull metadata (title, author, category)
 *   3. Save as a stub entry pointing to shamela.ws (تُفتح في iframe حالياً)
 *
 * Future: also download HTML content per page and host on R2 or VPS,
 * then serve in OUR HTML viewer (needs reader extension for HTML mode).
 *
 * Usage:
 *   node scripts/shamela-scraper.mjs --start 1 --end 200
 *   node scripts/shamela-scraper.mjs --category 1 --limit 100
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, '..', 'data', 'shamela-books.json');

const BASE = 'https://shamela.ws';
const BOOK_URL = id => `${BASE}/book/${id}`;

// User-Agent: لبعض المواقع تحتاج بصمة متصفّح
const UA = 'Mozilla/5.0 (X11; Linux x86_64) TaybaaLibrary/1.0';

async function fetchBook(id) {
    const r = await fetch(BOOK_URL(id), { headers: { 'User-Agent': UA } });
    if (!r.ok) return null;
    const html = await r.text();
    // استخراج بسيط للعنوان والمؤلف
    const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
    const authorMatch = html.match(/<a[^>]+href="\/author\/[^"]+"[^>]*>(.*?)<\/a>/);
    const categoryMatch = html.match(/<a[^>]+href="\/category\/(\d+)"[^>]*>(.*?)<\/a>/);

    return {
        id: 'shamela-' + id,
        shamelaId: id,
        title: clean(titleMatch?.[1]) || 'Book #' + id,
        author: clean(authorMatch?.[1]) || 'مجهول',
        category: 'الدين والإسلاميات',
        shamelaCategory: clean(categoryMatch?.[2]),
        pdf: BOOK_URL(id),  // يفتح في iframe للآن
        source: 'shamela',
        addedDate: new Date().toISOString().slice(0, 10),
        views: 0,
        downloads: 0,
        recommended: false
    };
}

function clean(s) {
    if (!s) return '';
    return s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = { start: 1, end: 50 };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--start') opts.start = parseInt(args[++i], 10);
        else if (args[i] === '--end') opts.end = parseInt(args[++i], 10);
        else if (args[i] === '--limit') opts.end = opts.start + parseInt(args[++i], 10) - 1;
    }
    return opts;
}

async function main() {
    const { start, end } = parseArgs();
    console.log(`📖 Shamela scraper — IDs ${start}→${end}`);

    // Load existing
    let existing = { books: [] };
    try {
        existing = JSON.parse(await fs.readFile(OUT_FILE, 'utf8'));
    } catch {}
    const seenIds = new Set(existing.books.map(b => b.shamelaId));

    const fresh = [];
    let okCount = 0, failCount = 0;
    for (let id = start; id <= end; id++) {
        if (seenIds.has(id)) {
            process.stdout.write('.');
            continue;
        }
        try {
            const book = await fetchBook(id);
            if (book && book.title && !/Book #/.test(book.title)) {
                fresh.push(book);
                okCount++;
                process.stdout.write('+');
            } else {
                failCount++;
                process.stdout.write('-');
            }
        } catch (err) {
            failCount++;
            process.stdout.write('!');
        }
        // بطيء (200ms) تجنّبًا لحظر الـIP
        await new Promise(r => setTimeout(r, 200));
        if ((id - start) % 50 === 49) console.log(`  [${id}] ✓${okCount} ✗${failCount}`);
    }
    console.log(`\n✅ ${okCount} new · ⛔ ${failCount} failed`);

    existing.books.push(...fresh);
    await fs.writeFile(OUT_FILE, JSON.stringify(existing, null, 2));
    console.log(`💾 Saved → ${OUT_FILE}`);
}

main().catch(err => { console.error(err); process.exit(1); });
