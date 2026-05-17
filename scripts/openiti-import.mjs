#!/usr/bin/env node
/**
 * OpenITI importer — مبادرة النصوص الإسلاميّة المفتوحة
 *
 * OpenITI (جامعة آغا خان) لديها ~10,000 نصّ إسلاميّ أكاديمي على GitHub.
 * البيانات في github.com/OpenITI/RELEASE بصيغة markdown مع عنوان ومؤلف.
 *
 * هذا السكربت:
 * 1. يستخدم GitHub Search API ليجد كل ملفات OpenITI
 * 2. يستخرج الميتاداتا (العنوان، المؤلف، التصنيف)
 * 3. يربط بصفحة GitHub للنصّ (للقراءة)
 *
 * Usage:
 *   node scripts/openiti-import.mjs              # default 500
 *   node scripts/openiti-import.mjs 2000
 *
 * Auth: set GITHUB_TOKEN env var to raise rate-limit from 10/min to 5000/hr.
 * (GitHub Actions provides GITHUB_TOKEN automatically.)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const EXTRA_FILE = path.join(DATA_DIR, 'books-extra-3.json');

const GH_SEARCH = 'https://api.github.com/search/code';
const REPO = 'OpenITI/RELEASE';
const GH_TOKEN = process.env.GITHUB_TOKEN || '';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ghHeaders() {
    const h = {
        'User-Agent': 'TaybaaLibrary/3.0',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
    if (GH_TOKEN) h['Authorization'] = `Bearer ${GH_TOKEN}`;
    return h;
}

/**
 * بحث GitHub Code API — يوجد ملفات OpenITI .completed
 */
async function searchGitHub(query) {
    const url = `${GH_SEARCH}?q=${encodeURIComponent(query)}+repo:${REPO}&per_page=100`;
    try {
        const r = await fetch(url, { headers: ghHeaders() });
        if (!r.ok) {
            console.log(`   ⚠️ GitHub API ${r.status} ${r.statusText}`);
            return [];
        }
        const data = await r.json();
        return data.items || [];
    } catch { return []; }
}

/**
 * استخراج الميتاداتا من ملف OpenITI markdown
 * بنية الملف: 0001AbuBakr/0001AbuBakr.JamMu/0001AbuBakr.JamMu.Shamela0001234-ara1.completed
 */
function parseOpenITIFilename(filename) {
    // مثال: 0001AbuBakr.JamMu.Shamela0001234-ara1.completed
    const m = filename.match(/(\d{4})([A-Za-z]+)\.([A-Za-z]+)\.(?:Shamela)?(\d+)?[^.]*-ara\d*/);
    if (!m) return null;
    const [, year, authorTransliterated, workTransliterated, shamelaId] = m;
    return {
        deathYearAH: parseInt(year),
        authorSlug: authorTransliterated,
        workSlug: workTransliterated,
        shamelaId: shamelaId || null
    };
}

function mapBook(item, parsed, id) {
    const githubUrl = `https://github.com/${REPO}/blob/master/${item.path}`;
    const rawUrl = `https://raw.githubusercontent.com/${REPO}/master/${item.path}`;
    return {
        id: 'openiti-' + (parsed?.shamelaId || item.sha.slice(0, 8)),
        numericId: id,
        title: parsed?.workSlug || item.name.replace(/\.[^.]+$/, ''),
        author: parsed?.authorSlug || 'مجهول',
        category: 'الدين والإسلاميات',
        pages: 0,
        cover: '',
        pdf: githubUrl,  // يفتح في iframe حالياً
        description: parsed ? `نصّ عربي أكاديمي من OpenITI. توفي المؤلف: ${parsed.deathYearAH} هـ.` : '',
        views: 0,
        downloads: 0,
        addedDate: new Date().toISOString().slice(0, 10),
        recommended: false,
        source: 'openiti',
        sourceUrl: rawUrl,
        deathYearAH: parsed?.deathYearAH
    };
}

async function loadExisting() {
    try {
        const data = JSON.parse(await fs.readFile(EXTRA_FILE, 'utf8'));
        return data.books || [];
    } catch { return []; }
}

async function main() {
    const target = parseInt(process.argv[2] || '500');
    console.log(`📜 OpenITI importer — هدف: ${target} نصّ إسلامي أكاديمي`);
    console.log(`🔑 GitHub auth: ${GH_TOKEN ? 'enabled (5000/hr)' : 'DISABLED (10/min — set GITHUB_TOKEN)'}\n`);

    const existing = await loadExisting();
    const existingIds = new Set(existing.filter(b => b.source === 'openiti').map(b => b.id));
    console.log(`📊 موجود مسبقاً: ${existingIds.size} من OpenITI\n`);

    // بحث بعدّة أصناف من الملفات
    const fileQueries = [
        'extension:completed',  // النصوص المكتملة
        'extension:mARkdown',
        'extension:inProgress'
    ];

    const fresh = [];
    for (const fq of fileQueries) {
        if (fresh.length >= target) break;
        console.log(`🔍 GitHub: ${fq}`);
        const items = await searchGitHub(fq);
        console.log(`   → ${items.length} ملف`);
        for (const item of items) {
            if (fresh.length >= target) break;
            const parsed = parseOpenITIFilename(item.name);
            const fakeId = 'openiti-' + (parsed?.shamelaId || item.sha.slice(0, 8));
            if (existingIds.has(fakeId)) continue;
            existingIds.add(fakeId);
            fresh.push({ item, parsed });
            if (fresh.length <= 5 || fresh.length % 25 === 0) {
                console.log(`   ✓ [${fresh.length}] ${item.name.slice(0, 60)}`);
            }
        }
        // With auth: 30 search-requests/min. Without: 10/min. Keep a safe gap.
        await sleep(GH_TOKEN ? 2200 : 6500);
    }

    if (!fresh.length) {
        console.log('\n⚠️ لم يتم جلب أي ملفات.');
        if (!GH_TOKEN) {
            console.log('   💡 لرفع الحدّ: صدِّر GITHUB_TOKEN قبل التشغيل (5000/ساعة بدل 10/دقيقة).');
        }
        console.log('   بديل: استنساخ المستودع والبحث محليّاً:');
        console.log('   git clone https://github.com/OpenITI/RELEASE');
        return;
    }

    const maxId = Math.max(217, ...existing.map(b => Number(b.numericId) || 0));
    const newBooks = fresh.map(({ item, parsed }, i) => mapBook(item, parsed, maxId + 1 + i));

    let extra3 = { books: [] };
    try { extra3 = JSON.parse(await fs.readFile(EXTRA_FILE, 'utf8')); } catch {}
    extra3.books.push(...newBooks);
    await fs.writeFile(EXTRA_FILE, JSON.stringify(extra3, null, 2));

    console.log(`\n✅ جلب ${newBooks.length} نصّ من OpenITI`);
    console.log(`📁 extra-3: ${extra3.books.length}`);
}

main().catch(err => { console.error('\n❌', err); process.exit(1); });
