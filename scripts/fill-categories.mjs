#!/usr/bin/env node
/**
 * Fill low-count categories with TARGETED Arabic + English queries.
 * 
 * The original bulk-import used only English subject tags (e.g., "entrepreneurship")
 * which missed many Arabic books that tag themselves differently.
 * 
 * This script uses MULTIPLE query strategies per category:
 *   1. English subject tags (subject:entrepreneurship)
 *   2. Arabic title keywords (title:"ريادة")
 *   3. Arabic description matching (description:"ريادة الأعمال")
 * 
 * Skips categories that already have enough books.
 * 
 * Usage:
 *   node scripts/fill-categories.mjs           # default: target 200 per category
 *   node scripts/fill-categories.mjs 500       # target 500 per category
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

// استعلامات متعدّدة لكل قسم — تستخدم إنجليزي + عربي
const QUERIES = {
    'ريادة الأعمال': [
        '(subject:entrepreneurship OR subject:startup OR subject:"small business")',
        '(title:"ريادة" OR title:"رواد" OR title:"مشروع" OR title:"مشاريع")',
        'description:"ريادة الأعمال"',
        '(title:"إنشاء مشروع" OR title:"بدأ عمل")'
    ],
    'فن البيع': [
        '(subject:sales OR subject:selling OR subject:negotiation)',
        '(title:"البيع" OR title:"المبيعات" OR title:"بيع" OR title:"تفاوض")',
        '(title:"فن الإقناع" OR description:"فن البيع")'
    ],
    'التسويق': [
        '(subject:marketing OR subject:advertising OR subject:"digital marketing")',
        '(title:"تسويق" OR title:"الإعلان" OR title:"الترويج" OR title:"العلامة التجارية")',
        'description:"تسويق رقمي"',
        '(title:"وسائل التواصل" OR title:"سوسيال ميديا")'
    ],
    'التحفيز والإلهام': [
        '(subject:motivation OR subject:inspiration OR subject:"self-improvement")',
        '(title:"تحفيز" OR title:"إلهام" OR title:"طموح" OR title:"النجاح" OR title:"التميز")',
        '(title:"التفاؤل" OR title:"الأمل" OR title:"السعادة")'
    ],
    'علم النفس التطبيقي': [
        '(subject:"applied psychology" OR subject:"cognitive behavioral")',
        '(title:"تحليل نفسي" OR title:"السلوك" OR title:"العادات" OR title:"عادات")',
        '(title:"علم النفس التطبيقي" OR title:"الاتصال")'
    ],
    'الإدارة المالية': [
        '(subject:"financial management" OR subject:finance OR subject:accounting)',
        '(title:"المالية" OR title:"الميزانية" OR title:"المحاسبة" OR title:"تحليل مالي")'
    ],
    'المال والاستثمار': [
        '(subject:investment OR subject:wealth OR subject:"personal finance")',
        '(title:"الاستثمار" OR title:"الثراء" OR title:"البورصة" OR title:"العقار")',
        '(title:"إدارة الثروة" OR title:"التجارة" OR title:"العملات")',
        '(title:"البنوك" OR title:"التأمين" OR title:"التأمينات")'
    ],
    'السير والتراجم': [
        '(subject:biography OR subject:autobiography OR subject:memoir)',
        '(title:"سيرة" OR title:"ترجمة" OR title:"حياة" OR title:"مذكرات")',
        '(title:"تراجم" OR title:"سير")'
    ],
    'إدارة الأعمال': [
        '(subject:"business administration" OR subject:management OR subject:"organizational management")',
        '(title:"إدارة الأعمال" OR title:"الإدارة" OR title:"إدارة شركة")',
        '(title:"الموارد البشرية" OR title:"القيادة")'
    ]
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchArchive(query, count) {
    const fl = ['identifier', 'title', 'creator', 'description', 'subject', 'downloads', 'language'];
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
        source: 'archive.org-fill',
        archiveId: doc.identifier
    };
}

async function loadAllBooks() {
    const files = ['books-sample.json', 'books-extra-1.json', 'books-extra-2.json', 'books-extra-3.json'];
    const all = [];
    const archiveIds = new Set();
    for (const f of files) {
        try {
            const data = JSON.parse(await fs.readFile(path.join(DATA_DIR, f), 'utf8'));
            for (const b of (data.books || [])) {
                all.push(b);
                if (b.archiveId) archiveIds.add(b.archiveId);
                const m = String(b.pdf || '').match(/archive\.org\/(?:embed|details|download)\/([^/?#]+)/);
                if (m) archiveIds.add(m[1]);
            }
        } catch {}
    }
    return { all, archiveIds };
}

async function fillCategory(category, queries, neededCount, existingArchive, startId) {
    console.log(`\n⏳ بحث عن كتب جديدة لـ: ${category} (حاجة: ${neededCount})`);
    const verified = [];
    let queryIdx = 0;

    for (const query of queries) {
        queryIdx++;
        if (verified.length >= neededCount) break;
        try {
            const docs = await searchArchive(query, 200);
            console.log(`   [${queryIdx}/${queries.length}] "${query.slice(0, 60)}..." → ${docs.length} نتيجة`);

            for (const doc of docs) {
                if (verified.length >= neededCount) break;
                if (existingArchive.has(doc.identifier)) continue;

                const ok = await verifyHasPdf(doc.identifier);
                if (ok) {
                    existingArchive.add(doc.identifier);
                    verified.push(doc);
                    if (verified.length <= 5 || verified.length % 15 === 0) {
                        console.log(`      ✓ [${verified.length}/${neededCount}] ${firstString(doc.title).slice(0, 55)}`);
                    }
                }
                await sleep(80);
            }
        } catch (e) {
            console.log(`   ⚠️ ${e.message}`);
        }
    }

    return verified.map((doc, i) => mapToBook(doc, category, startId + i));
}

async function main() {
    const targetCount = parseInt(process.argv[2] || '200');
    console.log(`🎯 ملء الأقسام المنخفضة (هدف: ${targetCount} لكل قسم)\n`);

    const { all, archiveIds } = await loadAllBooks();
    console.log(`📊 إجمالي الكتب الموجودة: ${all.length}`);
    console.log(`🔗 archive.org معرّفات محفوظة: ${archiveIds.size}\n`);

    const currentCounts = {};
    for (const b of all) currentCounts[b.category] = (currentCounts[b.category] || 0) + 1;

    console.log('📈 التوزيع الحالي:');
    for (const [cat] of Object.entries(QUERIES)) {
        const c = currentCounts[cat] || 0;
        const need = Math.max(0, targetCount - c);
        const status = need > 0 ? `❌ يحتاج ${need}` : '✅ كافٍ';
        console.log(`   ${cat.padEnd(28)} ${String(c).padStart(4)}/${targetCount}  ${status}`);
    }

    let extra3 = { books: [] };
    try {
        extra3 = JSON.parse(await fs.readFile(EXTRA_FILE, 'utf8'));
    } catch {}

    const maxId = Math.max(217, ...all.map(b => Number(b.id) || 0));
    let nextId = maxId + 1;
    let totalAdded = 0;

    for (const [category, queries] of Object.entries(QUERIES)) {
        const current = currentCounts[category] || 0;
        const needed = Math.max(0, targetCount - current);
        if (needed === 0) continue;

        const newBooks = await fillCategory(category, queries, needed, archiveIds, nextId);
        extra3.books.push(...newBooks);
        nextId += newBooks.length;
        totalAdded += newBooks.length;
        console.log(`✅ ${category}: +${newBooks.length} كتاب`);
    }

    await fs.writeFile(EXTRA_FILE, JSON.stringify(extra3, null, 2));
    console.log(`\n✨ النتائج:`);
    console.log(`📦 جلب ${totalAdded} كتاب جديد`);
    console.log(`💾 extra-3 الآن: ${extra3.books.length} كتاب`);
    console.log(`🎯 إجمالي المكتبة: ~${all.length + totalAdded} كتاب`);
}

main().catch(err => { console.error('\n❌', err); process.exit(1); });
