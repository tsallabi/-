#!/usr/bin/env node
/**
 * Comprehensive Archive.org Arabic uploaders import.
 *
 * يبحث عبر أكبر مستخدمي archive.org الدين يرفعون كتباً عربيّة:
 *   waqfeya, shameladev, almostafa, noorbook, kotobgy, ibrahimnet, etc.
 * + مجموعات (collections) الكتب العربيّة الرئيسيّة.
 *
 * Usage:
 *   node scripts/archive-uploaders.mjs              # default 5000
 *   node scripts/archive-uploaders.mjs 10000        # جلب على نطاق واسع
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

// أكبر مراجع للكتب العربيّة على archive.org
const QUERIES = [
    // مستخدمون (uploaders)
    'uploader:waqfeya@gmail.com',
    'uploader:shameladev@gmail.com',
    'creator:"الوقفية"',
    'creator:"المكتبة الوقفية"',
    'creator:"دار الفكر"',
    'creator:"دار الحديث"',
    'creator:"دار الكتب العلمية"',

    // مجموعات فرعيّة عربيّة
    'collection:waqfeya',
    'collection:arabicliterature',
    'collection:arabicbookcollection',
    'collection:arabic',
    'collection:islamicbookscollection',
    'collection:arabicclassics',
    'collection:arabicrarebookcollection',
    'collection:kotob',

    // بحث بـdescription
    '(description:"الوقفية" OR description:"al-Maktaba al-Waqfiya")',
    'description:"المكتبة الوقفية"',

    // كتب تراثيّة عربيّة شهيرة
    '(title:"تفسير الطبري" OR title:"تفسير القرطبي")',
    '(title:"المغني" OR title:"السير" OR title:"التاريخ")',
    '(title:"صحيح البخاري" OR title:"صحيح مسلم" OR title:"سنن")',
    '(title:"الرحلة" OR title:"الاجتهاد" OR title:"التفسير")',
    '(title:"الترجمة" OR title:"التاريخ الإسلامي")',
    '(title:"ديوان" AND mediatype:texts)',
    '(title:"رحلة" OR title:"سفر")',

    // أدب عربي حديث
    '(title:"رواية" AND language:Arabic)',
    '(title:"قصص" OR title:"قصيدة")',
    '(creator:"نجيب محفوظ" OR creator:"طه حسين")',
    '(creator:"غسان كنفاني" OR creator:"إحسان عبد القدوس")',

    // علم وفكر
    '(creator:"جلال الدين السيوطي" OR creator:"ابن تيمية" OR creator:"ابن خلدون")',
    '(creator:"ابن القيّم" OR creator:"الغزالي" OR creator:"النووي")'
];

// تصنيف ذكي حسب العنوان، الموضوع، الوصف
const CATEGORY_HINTS = [
    { keywords: ['تفسير', 'قرآن', 'tafsir', 'quran', 'tajweed'], category: 'الدين والإسلاميات' },
    { keywords: ['حديث', 'سنة', 'بخاري', 'مسلم', 'hadith'], category: 'الدين والإسلاميات' },
    { keywords: ['فقه', 'أصول', 'fiqh'], category: 'الدين والإسلاميات' },
    { keywords: ['عقيدة', 'توحيد', 'islam'], category: 'الدين والإسلاميات' },
    { keywords: ['سيرة', 'تراجم', 'صحابة', 'sirah', 'biography'], category: 'السير والتراجم' },
    { keywords: ['تاريخ', 'تراث', 'history'], category: 'التاريخ والتراث' },
    { keywords: ['رواية', 'قصة', 'أدب', 'novel', 'fiction'], category: 'الأدب والروايات' },
    { keywords: ['ديوان', 'شعر', 'قصيدة', 'poetry'], category: 'الشعر' },
    { keywords: ['فلسفة', 'فكر', 'philosophy'], category: 'الفلسفة والفكر' },
    { keywords: ['علوم', 'science', 'arabic science'], category: 'العلوم والمعرفة' },
    { keywords: ['تعلم', 'لغة', 'نحو', 'language'], category: 'التعليم والدراسة' },
    { keywords: ['تطوير', 'الذات', 'self-help'], category: 'تطوير الذات والنجاح' }
];

function categorize(doc) {
    const haystack = [
        Array.isArray(doc.title) ? doc.title.join(' ') : (doc.title || ''),
        Array.isArray(doc.subject) ? doc.subject.join(' ') : (doc.subject || ''),
        Array.isArray(doc.description) ? doc.description.join(' ') : (doc.description || '')
    ].join(' ').toLowerCase();
    for (const { keywords, category } of CATEGORY_HINTS) {
        for (const kw of keywords) {
            if (haystack.includes(kw.toLowerCase())) return category;
        }
    }
    return 'التاريخ والتراث';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchArchive(query, count) {
    const fl = ['identifier', 'title', 'creator', 'description', 'subject', 'downloads', 'language'];
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
        source: 'archive-uploaders',
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
    const target = parseInt(process.argv[2] || '5000');
    console.log(`🌍 Archive.org Arabic uploaders — هدف: ${target} كتاب\n`);

    const existingArchive = await loadAllBooks();
    console.log(`📊 الموجود: ${existingArchive.size} archive.org IDs\n`);

    let extra3 = { books: [] };
    try { extra3 = JSON.parse(await fs.readFile(EXTRA_FILE, 'utf8')); } catch {}
    const maxId = Math.max(217, ...extra3.books.map(b => Number(b.id) || 0));
    let nextId = maxId + 1;

    const verified = [];
    let queryIdx = 0;

    for (const query of QUERIES) {
        queryIdx++;
        if (verified.length >= target) break;
        try {
            const docs = await searchArchive(query, 1500);
            console.log(`[${queryIdx}/${QUERIES.length}] "${query.slice(0, 55)}" → ${docs.length} نتيجة`);

            for (const doc of docs) {
                if (verified.length >= target) break;
                if (existingArchive.has(doc.identifier)) continue;

                const ok = await verifyHasPdf(doc.identifier);
                if (ok) {
                    existingArchive.add(doc.identifier);
                    verified.push(doc);
                    if (verified.length <= 5 || verified.length % 50 === 0) {
                        console.log(`   ✓ [${verified.length}/${target}] ${firstString(doc.title).slice(0, 55)}`);
                    }
                }
                await sleep(50);
            }
        } catch (e) {
            console.log(`   ⚠️ ${e.message}`);
        }
    }

    const newBooks = verified.map((doc, i) => mapToBook(doc, nextId + i));
    extra3.books.push(...newBooks);
    await fs.writeFile(EXTRA_FILE, JSON.stringify(extra3, null, 2));

    // تقرير توزيع
    const byCategory = {};
    for (const b of newBooks) byCategory[b.category] = (byCategory[b.category] || 0) + 1;

    console.log(`\n✨ النتائج:`);
    console.log(`✅ جلب ${newBooks.length} كتاب جديد`);
    console.log(`📁 extra-3: ${extra3.books.length}\n`);
    console.log(`📊 التوزيع:`);
    for (const [cat, n] of Object.entries(byCategory).sort((a,b) => b[1]-a[1])) {
        console.log(`   ${String(n).padStart(4)}  ${cat}`);
    }
}

main().catch(err => { console.error('\n❌', err); process.exit(1); });
