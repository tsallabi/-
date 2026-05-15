#!/usr/bin/env node
/**
 * تطبيق URLs الجديدة من DigitalOcean Spaces على ملفات JSON.
 * يستخدم /tmp/updated-urls.txt التي تولّدت من download-to-spaces.sh
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILES = ['books-sample.json', 'books-extra-1.json', 'books-extra-2.json', 'books-extra-3.json'];
const URLS_FILE = '/tmp/updated-urls.txt';

async function main() {
    let updates;
    try {
        const txt = await fs.readFile(URLS_FILE, 'utf8');
        updates = new Map(txt.trim().split('\n').map(line => {
            const [id, url] = line.split('|');
            return [String(id), url];
        }));
    } catch (e) {
        console.error(`❌ لم يوجد ملف ${URLS_FILE}. شغّل download-to-spaces.sh أولاً.`);
        process.exit(1);
    }

    console.log(`🔄 تحديث ${updates.size} URL في ملفات JSON\n`);

    let totalUpdated = 0;
    for (const f of FILES) {
        let updated = 0;
        try {
            const filePath = path.join(DATA_DIR, f);
            const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
            for (const book of (data.books || [])) {
                const newUrl = updates.get(String(book.id));
                if (newUrl) {
                    book.pdf = newUrl;
                    book._hostedOnSpaces = true;
                    updated++;
                }
            }
            if (updated > 0) {
                await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            }
            console.log(`   ${f}: حدّثت ${updated} URL`);
            totalUpdated += updated;
        } catch {}
    }

    console.log(`\n✅ تمّ تحديث ${totalUpdated} كتاب`);
    console.log(`هذه الكتب الآن تفتح في قارئنا PDF.js!`);
    console.log(`\nadx الخطوة التالية:`);
    console.log(`   git add data/ && git commit -m "feat: ${totalUpdated} books now hosted on DO Spaces" && git push`);
}

main().catch(e => { console.error(e); process.exit(1); });
