#!/usr/bin/env node
/**
 * Bulk import Arabic books from archive.org
 *
 * Usage:
 *   node scripts/bulk-import-archive.mjs <category> <count>
 *   node scripts/bulk-import-archive.mjs "تطوير الذات" 100
 *
 * Runs on: GitHub Actions, VPS, or local Node.js 18+
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

/**
 * خرائط أقسام الموقع → استعلامات archive.org
 * تستخدم mediatype:texts AND language:Arabic تلقائياً
 */
const CATEGORY_QUERIES = {
    'تطوير الذات والنجاح': '(subject:"self-help" OR subject:"تنمية بشرية" OR subject:"تطوير الذات")',
    'التحفيز والإلهام': '(subject:"motivation" OR title:"تحفيز")',
    'القيادة والإدارة': '(subject:"management" OR subject:"leadership" OR subject:"إدارة")',
    'إدارة الأعمال': '(subject:"business" OR subject:"إدارة أعمال")',
    'ريادة الأعمال': '(subject:"entrepreneurship" OR subject:"ريادة أعمال")',
    'فن البيع': '(subject:"sales" OR subject:"بيع")',
    'التسويق': '(subject:"marketing" OR subject:"تسويق")',
    'الإدارة المالية': '(subject:"finance" OR subject:"إدارة مالية")',
    'المال والاستثمار': '(subject:"investment" OR subject:"الاستثمار")',
    'علم النفس': '(subject:"psychology" OR subject:"علم النفس")',
    'الفلسفة والفكر': '(subject:"philosophy" OR subject:"فلسفة")',
    'الأدب والروايات': '(subject:"literature" OR subject:"أدب" OR subject:"رواية")',
    'التاريخ والتراث': '(subject:"history" OR subject:"تاريخ")',
    'العلوم والمعرفة': '(subject:"science" OR subject:"علوم")',
    'الدين والإسلاميات': '(subject:"Islam" OR subject:"الإسلام" OR subject:"تفسير" OR subject:"حديث")',
    'كتب الأطفال': '(subject:"children" OR subject:"أطفال")',
    'الشعر': '(subject:"poetry" OR subject:"شعر")'
};

async function searchArchive(query, count) {
    const fl = ['identifier', 'title', 'creator', 'description', 'subject', 'downloads', 'language', 'date'];
    const flParams = fl.map(f => `fl[]=${encodeURIComponent(f)}`).join('&');
    const q = `${query} AND mediatype:texts AND language:Arabic`;
    const url = `${ARCHIVE_SEARCH}?q=${encodeURIComponent(q)}&${flParams}&rows=${count}&output=json&sort=downloads+desc`;
    console.log('   GET', url.slice(0, 110), '...');
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Archive search failed: HTTP ${r.status}`);
    const data = await r.json();
    return data.response?.docs || [];
}

async function verifyHasPdf(identifier) {
    try {
        const r = await fetch(ARCHIVE_META(identifier));
        if (!r.ok) return false;
        const data = await r.json();
        if (!data.metadata || data.is_dark) return false;
        const files = data.files || [];
        return files.some(f => f.name && /\.pdf$/i.test(f.name));
    } catch {
        return false;
    }
}

function firstString(v) {
    if (Array.isArray(v)) return String(v[0] || '').trim();
    return String(v || '').trim();
}
function cleanDescription(d) {
    if (!d) return '';
    if (Array.isArray(d)) d = d.join(' ');
    return String(d).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800);
}

function mapToBook(doc, category, id) {
    return {
        id: String(id),
        title: firstString(doc.title),
        author: firstString(doc.creator) || 'مجهول',
        category,
        pages: 0,
        cover: ARCHIVE_COVER(doc.identifier),
        pdf: ARCHIVE_EMBED(doc.identifier),
        description: cleanDescription(doc.description),
        views: Number(doc.downloads) || 0,
        downloads: 0,
        addedDate: new Date().toISOString().slice(0, 10),
        recommended: false,
        source: 'archive.org-bulk',
        archiveId: doc.identifier
    };
}

async function loadExisting() {
    try {
        const txt = await fs.readFile(EXTRA_FILE, 'utf8');
        const data = JSON.parse(txt);
        return data.books || [];
    } catch {
        return [];
    }
}

async function loadAllExistingIds() {
    const files = ['books-sample.json', 'books-extra-1.json', 'books-extra-2.json', 'books-extra-3.json'];
    const ids = new Set();
    const archiveIds = new Set();
    for (const f of files) {
        try {
            const data = JSON.parse(await fs.readFile(path.join(DATA_DIR, f), 'utf8'));
            (data.books || []).forEach(b => {
                ids.add(String(b.id));
                if (b.archiveId) archiveIds.add(b.archiveId);
                // also pick from pdf URL
                const m = String(b.pdf || '').match(/archive\.org\/(?:embed|details|download)\/([^/?#]+)/);
                if (m) archiveIds.add(m[1]);
            });
        } catch {}
    }
    return { ids, archiveIds };
}

async function main() {
    const category = process.argv[2];
    const count = parseInt(process.argv[3] || '50', 10);

    if (!category) {
        console.error('Usage: node bulk-import-archive.mjs <category> <count>');
        console.error('\nAvailable categories:');
        Object.keys(CATEGORY_QUERIES).forEach(c => console.error('  -', c));
        process.exit(1);
    }

    const query = CATEGORY_QUERIES[category];
    if (!query) {
        console.error(`Unknown category: ${category}`);
        process.exit(1);
    }

    console.log(`📚 Bulk importing "${category}" — target: ${count} books`);
    console.log(`🔍 Query: ${query}\n`);

    // Search (fetch more than needed since some won't have PDFs)
    const docs = await searchArchive(query, count * 3);
    console.log(`   → ${docs.length} candidates from archive.org`);

    if (!docs.length) {
        console.log('⚠️  No results. Exiting.');
        return;
    }

    // De-dup against existing
    const { ids: existingIds, archiveIds: existingArchive } = await loadAllExistingIds();
    console.log(`   → ${existingIds.size} books already in library (skipping duplicates)\n`);

    const fresh = docs.filter(d => !existingArchive.has(d.identifier));
    console.log(`   → ${fresh.length} unique candidates to verify\n`);

    // Verify each has PDF (parallel, polite throttle)
    console.log('⏳ Verifying PDFs...');
    const verified = [];
    let checked = 0;
    for (const doc of fresh) {
        checked++;
        const ok = await verifyHasPdf(doc.identifier);
        if (ok) {
            verified.push(doc);
            console.log(`   ✓ [${verified.length}/${count}] ${firstString(doc.title).slice(0, 60)}`);
            if (verified.length >= count) break;
        }
        await new Promise(r => setTimeout(r, 80));
    }

    console.log(`\n✅ Verified ${verified.length} books from ${checked} checked`);

    if (!verified.length) {
        console.log('⚠️  No verified books. Exiting without changes.');
        return;
    }

    // Build entries
    const existing = await loadExisting();
    const maxId = Math.max(217, ...existing.map(b => Number(b.id) || 0));
    const newBooks = verified.map((doc, i) => mapToBook(doc, category, maxId + 1 + i));

    const merged = { books: [...existing, ...newBooks] };
    await fs.writeFile(EXTRA_FILE, JSON.stringify(merged, null, 2));

    console.log(`\n💾 Saved ${newBooks.length} new books → ${path.relative(process.cwd(), EXTRA_FILE)}`);
    console.log(`📖 Total in extra-3: ${merged.books.length}`);
}

main().catch(err => {
    console.error('\n❌ Failed:', err);
    process.exit(1);
});
