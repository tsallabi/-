#!/usr/bin/env node
/**
 * فحص شامل لكل كتاب في المكتبة.
 *
 * لكل كتاب يتم التحقّق من:
 * 1. العنوان حقيقي وعربي (ليس أرقام أو فارغ)
 * 2. archive.org metadata API يؤكّد وجود الكتاب
 * 3. يوجد ملف PDF حقيقي في archive.org
 * 4. اللغة عربية (أو فارغة — لا تعجميّة)
 * 5. الغلاف متاح (HEAD request → 200)
 *
 * يحلّ URL إلى download مباشر بدل embed → يفتح في PDF.js (قارئنا)
 *
 * حفظ تقرير في /tmp/audit-report.json + تنظيف الملفات.
 *
 * Usage:
 *   node scripts/full-audit.mjs             # فحص كل الكتب
 *   node scripts/full-audit.mjs 500         # فحص 500 فقط
 *   node scripts/full-audit.mjs --dry-run   # تقرير دون حذف
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILES = ['books-sample.json', 'books-extra-1.json', 'books-extra-2.json', 'books-extra-3.json'];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limit = parseInt(args.find(a => !isNaN(a)) || '99999');

async function check(url, method = 'HEAD') {
    try {
        const r = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(8000) });
        return r.status;
    } catch { return 0; }
}

async function auditArchive(slug) {
    try {
        const r = await fetch(`https://archive.org/metadata/${slug}`, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) return { ok: false, reason: 'metadata-http-' + r.status };
        const d = await r.json();
        if (!d.metadata || Object.keys(d.metadata).length === 0) return { ok: false, reason: 'not-found' };
        if (d.is_dark) return { ok: false, reason: 'dark' };

        // Filter by language
        const lang = String(d.metadata.language || '').toLowerCase();
        if (lang && !/ara|arabic|eng|english/i.test(lang)) {
            return { ok: false, reason: 'wrong-lang:' + lang.slice(0, 20) };
        }

        // Find actual PDF file
        const files = d.files || [];
        const pdfFile = files.find(f =>
            f.name && /\.pdf$/i.test(f.name) &&
            !/(_text|_djvu|_scandata|abbyy)/i.test(f.name)
        );
        if (!pdfFile) return { ok: false, reason: 'no-pdf' };

        // Size check (لتجنب الـPDFs الفارغة)
        const size = Number(pdfFile.size) || 0;
        if (size < 50000) return { ok: false, reason: 'pdf-too-small:' + size };

        return {
            ok: true,
            title: d.metadata.title || '',
            author: (Array.isArray(d.metadata.creator) ? d.metadata.creator[0] : d.metadata.creator) || '',
            directPdf: `https://archive.org/download/${slug}/${pdfFile.name}`,
            size,
            language: lang || 'unknown',
            downloads: Number(d.metadata.downloads) || 0
        };
    } catch (e) { return { ok: false, reason: 'error:' + e.message.slice(0, 40) }; }
}

/**
 * فحص العنوان: حقيقي أم رقمي أم فارغ؟
 */
function titleQuality(title) {
    if (!title || title.length < 3) return 'too-short';
    if (/^\d+$/.test(title.trim())) return 'numeric-only';
    if (/^[\d\s\-_.]+$/.test(title)) return 'no-letters';
    if (/^(test|sample|example|untitled|new|book|file)/i.test(title.trim())) return 'placeholder';
    return 'ok';
}

async function auditBook(book) {
    const issues = [];
    const fixes = {};

    // 1. Title quality
    const titleResult = titleQuality(book.title);
    if (titleResult !== 'ok') issues.push('title:' + titleResult);

    // 2. PDF link
    if (!book.pdf) {
        issues.push('no-pdf-link');
    } else {
        const m = book.pdf.match(/archive\.org\/(?:embed|details|download)\/([^/?#]+)/);
        if (m) {
            const r = await auditArchive(m[1]);
            if (!r.ok) issues.push('archive:' + r.reason);
            else {
                fixes.pdf = r.directPdf;
                fixes._verifiedSize = r.size;
                if (titleResult === 'ok' && (!book.title || book.title.length < r.title.length)) {
                    // Update with archive's title if better
                    fixes.title = r.title;
                }
                if (!book.author && r.author) fixes.author = r.author;
            }
        } else if (book.pdf.startsWith('http')) {
            // Direct PDF URL
            const s = await check(book.pdf);
            if (s !== 200 && s !== 302) issues.push('pdf-http-' + s);
        }
    }

    // 3. Cover (skip for sample books which have nice fallback)
    if (book.cover) {
        const s = await check(book.cover);
        if (s !== 200 && s !== 302) {
            // Cover broken, but not fatal
            fixes.cover = '';  // Remove broken cover, will use fallback
        }
    }

    return { valid: issues.length === 0, issues, fixes };
}

async function main() {
    console.log(`🔍 فحص شامل للمكتبة${dryRun ? ' (dry-run)' : ''}\n`);

    let allBooks = [];
    for (const f of FILES) {
        try {
            const d = JSON.parse(await fs.readFile(path.join(DATA_DIR, f), 'utf8'));
            (d.books || []).forEach(b => allBooks.push({ ...b, _file: f }));
        } catch {}
    }
    console.log(`📚 إجمالي الكتب: ${allBooks.length}\n`);

    const target = Math.min(limit, allBooks.length);
    const cleaned = {}; const broken = [];
    for (const f of FILES) cleaned[f] = { books: [] };

    let valid = 0, invalid = 0;
    const startTime = Date.now();

    for (let i = 0; i < target; i++) {
        const book = allBooks[i];
        const r = await auditBook(book);
        if (r.valid) {
            valid++;
            const { _file, ...clean } = book;
            Object.assign(clean, r.fixes);  // Apply fixes
            cleaned[_file].books.push(clean);
        } else {
            invalid++;
            broken.push({ id: book.id, title: book.title?.slice(0, 60), issues: r.issues, file: book._file });
        }

        if ((i + 1) % 25 === 0 || i + 1 === target) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = (i + 1) / elapsed;
            const eta = Math.round((target - i - 1) / rate);
            const pct = Math.round(valid / (valid + invalid) * 100);
            console.log(`[${i+1}/${target}] ✓${valid} ✗${invalid} (${pct}% جودة) · ETA: ${Math.floor(eta/60)}m ${eta%60}s`);
        }
        await new Promise(r => setTimeout(r, 80));
    }

    // Save report
    const report = {
        timestamp: new Date().toISOString(),
        total: target,
        valid,
        invalid,
        validRate: (valid / target * 100).toFixed(1) + '%',
        durationSec: Math.round((Date.now() - startTime) / 1000),
        brokenBooks: broken
    };
    await fs.writeFile('/tmp/audit-report.json', JSON.stringify(report, null, 2));

    // Save cleaned data (unless dry-run)
    if (!dryRun) {
        for (const f of FILES) {
            await fs.writeFile(path.join(DATA_DIR, f), JSON.stringify(cleaned[f], null, 2));
        }
    }

    // Print summary
    console.log('\n══════════════════════════════');
    console.log(`✅ صالح: ${valid} (${report.validRate})`);
    console.log(`❌ معطّل: ${invalid}`);
    console.log(`⏱️ المدّة: ${Math.floor(report.durationSec/60)} دقيقة`);
    console.log(`📄 التقرير: /tmp/audit-report.json`);

    if (!dryRun) {
        console.log(`\n💾 الملفات تمّ تحديثها:`);
        for (const f of FILES) {
            console.log(`   ${f}: ${cleaned[f].books.length} كتاب`);
        }
        console.log(`\n✨ الخطوة التالية:`);
        console.log(`   git add data/ && git commit -m "audit: remove ${invalid} broken books" && git push`);
    } else {
        console.log(`\n✨ دل dry-run — لم تتغيّر الملفات. إعادة التشغيل بدون --dry-run لحفظ التغييرات.`);
    }

    // Show top issue types
    const issueCounts = {};
    for (const b of broken) for (const i of b.issues) {
        const type = i.split(':')[0];
        issueCounts[type] = (issueCounts[type] || 0) + 1;
    }
    console.log(`\n📊 أبرز أسباب الرفض:`);
    for (const [type, n] of Object.entries(issueCounts).sort((a,b) => b[1]-a[1]).slice(0, 8)) {
        console.log(`   ${String(n).padStart(4)}  ${type}`);
    }
}

main().catch(e => { console.error('\n❌', e); process.exit(1); });
