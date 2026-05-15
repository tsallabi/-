#!/usr/bin/env node
/**
 * Shamela-via-archive.org importer.
 *
 * Strategy: العديد من كتب المكتبة الشاملة مرفوعة على archive.org
 * بواسطة مستخدمين مثل waqfeya و shameladev و غيرهم.
 * هذا السكربت يجلبها بدون الحاجة لـPlaywright أو WAF bypass.
 *
 * Usage:
 *   node scripts/shamela-via-archive.mjs            # default 1000
 *   node scripts/shamela-via-archive.mjs 2000
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const EXTRA_FILE = path.join(DATA_DIR, 'books-extra-3.json');

const ARCHIVE_SEARCH = 'https://archive.org/advancedsearch.php';
const ARCHIVE_META = id => `https://archive.org/metadata/${id}`;
const ARCHIVE_EMBED = id => `https://archive.org/embed/${id}`;
const ARCHIVE_COVER = id => `https://archive.org/services/img/${id}`;

// استعلامات لجلب كتب الشاملة المرفوعة على archive.org
const SHAMELA_QUERIES = [
    '(creator:waqfeya OR uploader:waqfeya@gmail.com)',
    '(collection:waqfeya)',
    '("المكتبة الشاملة")',
    '(uploader:"shamela" OR creator:"shamela")',
    '(title:"صحيح البخاري" OR title:"صحيح مسلم")',
    '(title:"تفسير ابن كثير" OR title:"تفسير الطبري")',
    '(title:"فتح الباري" OR title:"سبل السلام")',
    '(title:"ابن تيمية" OR title:"ابن القيم")',
    '(title:"رياض الصالحين" OR title:"بلوغ المرام")',
    '(subject:"shamela" OR subject:"المكتبة الشاملة")',
    '(title:"إحياء علوم الدين" OR title:"سيرة ابن هشام")',
    '(title:"البداية والنهاية" OR title:"السيرة النبوية")',
    '(title:"المغني" OR title:"المجموع")'
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchArchive(query, count) {
    const fl = ['identifier', 'title', 'creator', 'description', 'subject', 'downloads', 'collection'];
    const flParams = fl.map(f => `fl[]=${encodeURIComponent(f)}`).join('&');
    const q = `${query} AND mediatype:texts AND language:Arabic`;
    const url = `${ARCHIVE_SEARCH}?q=${encodeURIComponent(q)}&${flParams}&rows=${count}&output=json&sort=downloads+desc`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return data.response?.docs || [];
}

async function verifyHasPdf(id) {
    try {
        const r = await fetch(ARCHIVE_META(id));
        if (!r.ok) return false;
        const data = await r.json();
        if (!data.metadata || data.is_dark) return false;
        return (data.files || []).some(f => f.name && /\.pdf$/i.test(f.name));
    } catch { return false; }
}

function firstString(v) {
    return Array.isArray(v) ? String(v[0] || '').trim() : String(v || '').trim();
}
function cleanDescription(d) {
    if (!d) return '';
    if (Array.isArray(d)) d = d.join(' ');
    return String(d).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 700);
}

function mapToBook(doc, id) {
    return {
        id: String(id),
        title: firstString(doc.title),
        author: firstString(doc.creator) || 'مجهول',
        category: 'الدين والإسلاميات',
        pages: 0,
        cover: ARCHIVE_COVER(doc.identifier),
        pdf: ARCHIVE_EMBED(doc.identifier),
        description: cleanDescription(doc.description),
        views: Number(doc.downloads) || 0,
        downloads: 0,
        addedDate: new Date().toISOString().slice(0, 10),
        recommended: false,
        source: 'shamela-via-archive',
        archiveId: doc.identifier
    };
}

async function loadAllBooks() {
    const files = ['books-sample.json', 'books-extra-1.json', 'books-extra-2.json', 'books-extra-3.json'];
    const archiveIds = new Set();
    for (const f of files) {
        try {
            const data = JSON.parse(await fs.readFile(path.join(DATA_DIR, f), 'utf8'));
            for (const b of (data.books || [])) {
                if (b.archiveId) archiveIds.add(b.archiveId);
                const m = String(b.pdf || '').match(/archive\.org\/(?:embed|details|download)\/([^/?#]+)/);
                if (m) archiveIds.add(m[1]);
            }
        } catch {}
    }
    return archiveIds;
}

async function main() {
    const target = parseInt(process.argv[2] || '1000');
    console.log(`🕌 شاملة-via-archive — هدف: ${target} كتاب إسلامي\n`);

    const existingArchive = await loadAllBooks();
    console.log(`📊 الكتب الموجودة: ${existingArchive.size} archive.org IDs\n`);

    let extra3 = { books: [] };
    try { extra3 = JSON.parse(await fs.readFile(EXTRA_FILE, 'utf8')); } catch {}
    const maxId = Math.max(217, ...extra3.books.map(b => Number(b.id) || 0));
    let nextId = maxId + 1;

    const verified = [];
    let queryIdx = 0;

    for (const query of SHAMELA_QUERIES) {
        queryIdx++;
        if (verified.length >= target) break;
        try {
            const docs = await searchArchive(query, 200);
            console.log(`[${queryIdx}/${SHAMELA_QUERIES.length}] "${query.slice(0, 55)}..." → ${docs.length} نتيجة`);

            for (const doc of docs) {
                if (verified.length >= target) break;
                if (existingArchive.has(doc.identifier)) continue;

                const ok = await verifyHasPdf(doc.identifier);
                if (ok) {
                    existingArchive.add(doc.identifier);
                    verified.push(doc);
                    if (verified.length <= 10 || verified.length % 25 === 0) {
                        console.log(`   ✓ [${verified.length}/${target}] ${firstString(doc.title).slice(0, 60)}`);
                    }
                }
                await sleep(80);
            }
        } catch (e) {
            console.log(`   ⚠️ ${e.message}`);
        }
    }

    const newBooks = verified.map((doc, i) => mapToBook(doc, nextId + i));
    extra3.books.push(...newBooks);
    await fs.writeFile(EXTRA_FILE, JSON.stringify(extra3, null, 2));

    console.log(`\n✨ النتائج:`);
    console.log(`✅ جلب ${newBooks.length} كتاب إسلامي موثّق`);
    console.log(`📁 extra-3: ${extra3.books.length} كتاب`);
}

main().catch(err => { console.error('\n❌', err); process.exit(1); });
