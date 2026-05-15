#!/usr/bin/env node
/**
 * Waqfeya importer (waqfeya.net + archive.org @waqfeya).
 *
 * المكتبة الوقفيّة ترفع آلاف PDFs إسلاميّة على archive.org تحت
 * مستخدم @waqfeya. هذا السكربت يجلبها بدون WAF.
 *
 * Usage:
 *   node scripts/waqfeya-import.mjs              # default 2000
 *   node scripts/waqfeya-import.mjs 5000         # all
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

// تصنيفات الوقفيّة → تصنيفاتنا
const SUBJECT_HINTS = [
    { keywords: ['تفسير', 'قرآن', 'تجويد', 'tafsir', 'quran'], category: 'الدين والإسلاميات' },
    { keywords: ['حديث', 'سنة', 'بخاري', 'مسلم', 'hadith', 'sunnah'], category: 'الدين والإسلاميات' },
    { keywords: ['فقه', 'أصول', 'fiqh'], category: 'الدين والإسلاميات' },
    { keywords: ['عقيدة', 'توحيد', 'aqidah'], category: 'الدين والإسلاميات' },
    { keywords: ['سيرة', 'صحابة', 'biography', 'sirah'], category: 'السير والتراجم' },
    { keywords: ['تاريخ', 'history'], category: 'التاريخ والتراث' },
    { keywords: ['أدب', 'لغة', 'نحو', 'literature', 'arabic'], category: 'الأدب والروايات' },
    { keywords: ['شعر', 'poetry'], category: 'الشعر' }
];

function categorize(doc) {
    const haystack = [
        Array.isArray(doc.title) ? doc.title.join(' ') : (doc.title || ''),
        Array.isArray(doc.subject) ? doc.subject.join(' ') : (doc.subject || ''),
        Array.isArray(doc.description) ? doc.description.join(' ') : (doc.description || '')
    ].join(' ').toLowerCase();

    for (const { keywords, category } of SUBJECT_HINTS) {
        for (const kw of keywords) {
            if (haystack.includes(kw)) return category;
        }
    }
    return 'الدين والإسلاميات';  // default
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchArchive(query, count) {
    const fl = ['identifier', 'title', 'creator', 'description', 'subject', 'downloads', 'collection'];
    const flParams = fl.map(f => `fl[]=${encodeURIComponent(f)}`).join('&');
    const q = `${query} AND mediatype:texts`;
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
        category: categorize(doc),
        pages: 0,
        cover: ARCHIVE_COVER(doc.identifier),
        pdf: ARCHIVE_EMBED(doc.identifier),
        description: cleanDescription(doc.description),
        views: Number(doc.downloads) || 0,
        downloads: 0,
        addedDate: new Date().toISOString().slice(0, 10),
        recommended: false,
        source: 'waqfeya',
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

// استعلامات للوصول لكل كتب الوقفيّة على archive.org
const WAQFEYA_QUERIES = [
    'uploader:waqfeya@gmail.com',
    'creator:waqfeya',
    'collection:waqfeya',
    'description:"الوقفية" OR description:"waqfeya"',
    'title:"المكتبة الوقفية"'
];

async function main() {
    const target = parseInt(process.argv[2] || '2000');
    console.log(`📚 Waqfeya importer — هدف: ${target} كتاب إسلامي\n`);

    const existingArchive = await loadAllBooks();
    console.log(`📊 موجود الآن: ${existingArchive.size} archive.org IDs\n`);

    let extra3 = { books: [] };
    try { extra3 = JSON.parse(await fs.readFile(EXTRA_FILE, 'utf8')); } catch {}
    const maxId = Math.max(217, ...extra3.books.map(b => Number(b.id) || 0));
    let nextId = maxId + 1;

    const verified = [];
    let queryIdx = 0;

    for (const query of WAQFEYA_QUERIES) {
        queryIdx++;
        if (verified.length >= target) break;
        try {
            // archive.org يسمح بـ rows up to 10000
            const docs = await searchArchive(query, 1500);
            console.log(`[${queryIdx}/${WAQFEYA_QUERIES.length}] "${query.slice(0, 50)}" → ${docs.length} نتيجة`);

            for (const doc of docs) {
                if (verified.length >= target) break;
                if (existingArchive.has(doc.identifier)) continue;

                // الوقفيّة موثوقة جداً، يمكن تخفيف التحقّق
                const ok = await verifyHasPdf(doc.identifier);
                if (ok) {
                    existingArchive.add(doc.identifier);
                    verified.push(doc);
                    if (verified.length <= 10 || verified.length % 50 === 0) {
                        console.log(`   ✓ [${verified.length}/${target}] ${firstString(doc.title).slice(0, 60)}`);
                    }
                }
                await sleep(60);
            }
        } catch (e) {
            console.log(`   ⚠️ ${e.message}`);
        }
    }

    const newBooks = verified.map((doc, i) => mapToBook(doc, nextId + i));
    extra3.books.push(...newBooks);
    await fs.writeFile(EXTRA_FILE, JSON.stringify(extra3, null, 2));

    // تقرير حسب التصنيف
    const byCategory = {};
    for (const b of newBooks) byCategory[b.category] = (byCategory[b.category] || 0) + 1;

    console.log(`\n✨ النتائج:`);
    console.log(`✅ جلب ${newBooks.length} كتاب من الوقفيّة`);
    console.log(`📁 extra-3 الآن: ${extra3.books.length} كتاب\n`);
    console.log(`📊 التوزيع حسب التصنيف:`);
    for (const [cat, n] of Object.entries(byCategory).sort((a,b) => b[1]-a[1])) {
        console.log(`   ${String(n).padStart(4)}  ${cat}`);
    }
}

main().catch(err => { console.error('\n❌', err); process.exit(1); });
