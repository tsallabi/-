#!/usr/bin/env node
/**
 * Open Library importer — يجلب كتب عربيّة مع روابط archive.org فعالة
 *
 * Open Library API لديها فهرس ضخم جدّاً و has_fulltext=true يعني أنّ الكتاب
 * متوفر للقراءة الكاملة (على archive.org).
 *
 * Usage:
 *   node scripts/openlibrary-import.mjs              # default 500
 *   node scripts/openlibrary-import.mjs 1000
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const EXTRA_FILE = path.join(DATA_DIR, 'books-extra-3.json');

const OL_SEARCH = 'https://openlibrary.org/search.json';
const ARCHIVE_EMBED = id => `https://archive.org/embed/${id}`;
const ARCHIVE_COVER = id => `https://archive.org/services/img/${id}`;

// أسئلة بحث لكل قسم — تستهدف الأقسام الصغيرة أولاً
const SUBJECT_QUERIES = {
    'ريادة الأعمال': ['entrepreneurship', 'startup', 'small business', 'ريادة'],
    'فن البيع': ['sales', 'selling techniques', 'بيع'],
    'التسويق': ['marketing', 'digital marketing', 'تسويق'],
    'التحفيز والإلهام': ['motivation', 'inspiration', 'self help', 'تحفيز'],
    'علم النفس التطبيقي': ['psychology', 'cognitive', 'behavioral', 'علم النفس'],
    'الإدارة المالية': ['accounting', 'finance', 'financial', 'مالية'],
    'المال والاستثمار': ['investment', 'wealth', 'money', 'استثمار'],
    'السير والتراجم': ['biography', 'autobiography', 'memoir', 'سيرة'],
    'إدارة الأعمال': ['business', 'management', 'leadership', 'إدارة'],
    'التاريخ والتراث': ['history', 'arabic history', 'islamic history'],
    'الفلسفة والفكر': ['philosophy', 'arabic philosophy', 'islamic philosophy'],
    'الأدب والروايات': ['arabic literature', 'arabic novels', 'fiction'],
    'العلوم والمعرفة': ['science', 'arabic science']
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchOpenLibrary(query, page = 1) {
    const url = `${OL_SEARCH}?q=${encodeURIComponent(query)}&language=ara&has_fulltext=true&fields=key,title,author_name,subject,ia,first_publish_year,cover_i&limit=100&page=${page}`;
    try {
        const r = await fetch(url, { headers: { 'User-Agent': 'TaybaaLibrary/3.0' } });
        if (!r.ok) return [];
        const data = await r.json();
        return data.docs || [];
    } catch (e) {
        return [];
    }
}

function firstAuthor(doc) {
    return Array.isArray(doc.author_name) ? doc.author_name[0] : (doc.author_name || 'مجهول');
}

function mapToBook(doc, category, id) {
    // ia field يحتوي archive.org identifiers
    const archiveId = Array.isArray(doc.ia) ? doc.ia[0] : doc.ia;
    if (!archiveId) return null;

    return {
        id: String(id),
        title: doc.title || '',
        author: firstAuthor(doc),
        category,
        pages: 0,
        cover: doc.cover_i
            ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
            : ARCHIVE_COVER(archiveId),
        pdf: ARCHIVE_EMBED(archiveId),
        description: '',
        views: 0,
        downloads: 0,
        addedDate: new Date().toISOString().slice(0, 10),
        recommended: false,
        source: 'open-library',
        archiveId,
        olKey: doc.key
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
    const target = parseInt(process.argv[2] || '500');
    console.log(`📖 Open Library importer — هدف: ${target} كتاب\n`);

    const existingArchive = await loadAllBooks();
    console.log(`📊 الموجود: ${existingArchive.size} archive.org IDs\n`);

    let extra3 = { books: [] };
    try { extra3 = JSON.parse(await fs.readFile(EXTRA_FILE, 'utf8')); } catch {}
    const maxId = Math.max(217, ...extra3.books.map(b => Number(b.id) || 0));
    let nextId = maxId + 1;

    const newBooks = [];
    let totalSearched = 0;

    for (const [category, queries] of Object.entries(SUBJECT_QUERIES)) {
        const perCategoryTarget = Math.ceil(target / Object.keys(SUBJECT_QUERIES).length);
        const verifiedHere = [];
        console.log(`\n📂 ${category} (هدف: ${perCategoryTarget})`);

        for (const query of queries) {
            if (verifiedHere.length >= perCategoryTarget) break;
            for (let page = 1; page <= 3; page++) {
                if (verifiedHere.length >= perCategoryTarget) break;
                const docs = await searchOpenLibrary(query, page);
                totalSearched += docs.length;

                for (const doc of docs) {
                    if (verifiedHere.length >= perCategoryTarget) break;
                    const archiveId = Array.isArray(doc.ia) ? doc.ia[0] : doc.ia;
                    if (!archiveId || existingArchive.has(archiveId)) continue;

                    existingArchive.add(archiveId);
                    const book = mapToBook(doc, category, nextId + newBooks.length + verifiedHere.length);
                    if (book) {
                        verifiedHere.push(book);
                        if (verifiedHere.length <= 3 || verifiedHere.length % 10 === 0) {
                            console.log(`   ✓ [${verifiedHere.length}] ${book.title.slice(0, 55)}`);
                        }
                    }
                }
                await sleep(150);
            }
        }
        newBooks.push(...verifiedHere);
        console.log(`   ✅ ${verifiedHere.length} كتاب جديد`);
    }

    extra3.books.push(...newBooks);
    await fs.writeFile(EXTRA_FILE, JSON.stringify(extra3, null, 2));
    console.log(`\n✨ النتائج:`);
    console.log(`🔍 بحث في ${totalSearched} نتيجة`);
    console.log(`✅ أضفت ${newBooks.length} كتاب من Open Library`);
    console.log(`📁 extra-3: ${extra3.books.length}`);
}

main().catch(err => { console.error('\n❌', err); process.exit(1); });
