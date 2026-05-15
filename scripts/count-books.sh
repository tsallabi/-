#!/usr/bin/env bash
# تقرير سريع عن توزيع الكتب حسب الأقسام

cd "$(dirname "$0")/.."

node -e "
const fs = require('fs');
const files = ['data/books-sample.json', 'data/books-extra-1.json', 'data/books-extra-2.json', 'data/books-extra-3.json'];
const counts = {};
const sources = {};
let total = 0;
const archiveIds = new Set();
const dupIds = [];
const seenIds = new Set();

for (const f of files) {
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const b of (d.books || [])) {
      total++;
      counts[b.category] = (counts[b.category] || 0) + 1;
      sources[b.source || 'sample'] = (sources[b.source || 'sample'] || 0) + 1;
      
      if (seenIds.has(String(b.id))) dupIds.push(b.id);
      else seenIds.add(String(b.id));
      
      if (b.archiveId) {
        if (archiveIds.has(b.archiveId)) dupIds.push('archive:' + b.archiveId);
        else archiveIds.add(b.archiveId);
      }
    }
  } catch (e) { console.error('skip', f, e.message); }
}

const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
console.log('');
console.log('╔════════════════════════════════════════╗');
console.log('║    📊 تقرير توزيع المكتبة الطيبة         ║');
console.log('╚════════════════════════════════════════╝');
console.log('');
console.log('📚 التوزيع حسب الأقسام:');
for (const [cat, n] of sorted) {
  const bar = '█'.repeat(Math.min(40, Math.floor(n/8)));
  const mark = n < 50 ? ' ⚠️' : (n > 200 ? ' ✨' : '');
  console.log('  ' + String(n).padStart(4) + '  ' + bar.padEnd(40) + ' ' + cat + mark);
}
console.log('');
console.log('📁 التوزيع حسب المصدر:');
for (const [src, n] of Object.entries(sources).sort((a,b)=>b[1]-a[1])) {
  console.log('  ' + String(n).padStart(4) + '  ' + src);
}
console.log('');
console.log('🎯 الإجماليات:');
console.log('   إجمالي الكتب:        ' + total);
console.log('   أقسام فريدة:        ' + sorted.length);
console.log('   archive.org IDs:    ' + archiveIds.size);
console.log('   تكرارات الـIDs:    ' + dupIds.length);
if (dupIds.length > 0 && dupIds.length < 20) {
  console.log('     ' + dupIds.slice(0,10).join(', '));
}
console.log('');
"
