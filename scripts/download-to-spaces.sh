#!/usr/bin/env bash
# تنزيل PDFs من archive.org إلى DigitalOcean Spaces
# يجعل الكتب تفتح في قارئنا PDF.js بدل iframe من archive.org
#
# متطلبات:
#   1. حساب DigitalOcean Spaces ($5/شهر)
#   2. Access Key + Secret Key من: DO → API → Spaces Keys
#   3. s3cmd مثبّت
#
# Usage:
#   bash scripts/download-to-spaces.sh 500       # أفضل 500 كتاب
#   bash scripts/download-to-spaces.sh all       # كل المكتبة

set -e
cd "$(dirname "$0")/.."

LIMIT=${1:-500}
SPACE_NAME="${SPACES_BUCKET:-taybaa-library}"
REGION="${SPACES_REGION:-nyc3}"
LOCAL_DIR="/tmp/taybaa-pdfs"

echo "╔════════════════════════════════╗"
echo "║  📥 تنزيل PDFs إلى Spaces  ║"
echo "╚════════════════════════════════╝"
echo

# 1. تحقّق من s3cmd
if ! command -v s3cmd &> /dev/null; then
    echo "⏳ تثبيت s3cmd..."
    apt-get install -y s3cmd
fi

# 2. تحقّق من الإعداد
if [ ! -f ~/.s3cfg ]; then
    echo "⚠️ s3cmd غير مضبوط. سنضبطه الآن."
    echo "   تحتاج للإجابة على 4 أسئلة:"
    echo "   1. Access Key  → من DO API"
    echo "   2. Secret Key  → من DO API"
    echo "   3. Default Region: nyc3"
    echo "   4. S3 Endpoint: nyc3.digitaloceanspaces.com"
    echo "   (اترك الباقي فارغاً)"
    echo
    s3cmd --configure
fi

mkdir -p "$LOCAL_DIR"

# 3. استخراج أفضل $LIMIT كتاب (حسب التحميلات) من الـJSON
echo "📊 استخراج أفضل ${LIMIT} كتاب من archive.org..."

node -e "
const fs = require('fs');
const path = require('path');
const DATA = 'data';
const files = ['books-sample.json', 'books-extra-1.json', 'books-extra-2.json', 'books-extra-3.json'];
const all = [];
for (const f of files) {
    try {
        const d = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
        for (const b of (d.books || [])) {
            if (!b.pdf) continue;
            const m = String(b.pdf).match(/archive\.org\/(?:embed|details|download)\/([^/?#]+)/);
            if (m) all.push({ slug: m[1], id: b.id, title: b.title, views: b.views || 0 });
        }
    } catch {}
}
const limit = '${LIMIT}' === 'all' ? all.length : parseInt('${LIMIT}');
all.sort((a, b) => b.views - a.views);
const pick = all.slice(0, limit);
const out = pick.map(p => p.id + '|' + p.slug + '|' + (p.title || '').replace(/\\|/g, ' ').slice(0, 80)).join('\n');
fs.writeFileSync('/tmp/download-queue.txt', out);
console.log('   → جائز لـ' + pick.length + ' كتاب');
"

# 4. تنزيل ورفع لكل كتاب
TOTAL=$(wc -l < /tmp/download-queue.txt)
DOWNLOADED=0
FAILED=0
DECLARE -a UPDATED_URLS

echo
echo "📥 بدء التنزيل والرفع..."
echo

while IFS='|' read -r BOOK_ID SLUG TITLE; do
    DOWNLOADED=$((DOWNLOADED + 1))
    PDF_URL="https://archive.org/download/${SLUG}/${SLUG}.pdf"
    LOCAL_FILE="$LOCAL_DIR/${BOOK_ID}.pdf"
    SPACES_KEY="books/${BOOK_ID}.pdf"

    # فحص إن كان في Spaces بالفعل
    if s3cmd info "s3://${SPACE_NAME}/${SPACES_KEY}" &>/dev/null; then
        echo "[${DOWNLOADED}/${TOTAL}] ✓ ${TITLE:0:50} (موجود)"
        SPACES_URL="https://${SPACE_NAME}.${REGION}.cdn.digitaloceanspaces.com/${SPACES_KEY}"
        echo "${BOOK_ID}|${SPACES_URL}" >> /tmp/updated-urls.txt
        continue
    fi

    # تنزيل
    if curl -sSL --max-time 60 -o "$LOCAL_FILE" "$PDF_URL" 2>/dev/null; then
        SIZE=$(stat -c%s "$LOCAL_FILE" 2>/dev/null || echo 0)
        if [ "$SIZE" -gt 50000 ]; then
            # رفع
            if s3cmd put "$LOCAL_FILE" "s3://${SPACE_NAME}/${SPACES_KEY}" --acl-public --quiet 2>/dev/null; then
                SPACES_URL="https://${SPACE_NAME}.${REGION}.cdn.digitaloceanspaces.com/${SPACES_KEY}"
                echo "${BOOK_ID}|${SPACES_URL}" >> /tmp/updated-urls.txt
                echo "[${DOWNLOADED}/${TOTAL}] ✅ ${TITLE:0:50} ($(numfmt --to=iec $SIZE))"
            else
                FAILED=$((FAILED + 1))
                echo "[${DOWNLOADED}/${TOTAL}] ❌ فشل الرفع: ${TITLE:0:40}"
            fi
            rm -f "$LOCAL_FILE"
        else
            FAILED=$((FAILED + 1))
            echo "[${DOWNLOADED}/${TOTAL}] ⚠️ حجم صغير: ${TITLE:0:40}"
            rm -f "$LOCAL_FILE"
        fi
    else
        FAILED=$((FAILED + 1))
        echo "[${DOWNLOADED}/${TOTAL}] ❌ فشل التنزيل: ${TITLE:0:40}"
    fi

    # بطيء لتجنّب الإرهاق
    sleep 1
done < /tmp/download-queue.txt

echo
echo "✅ انتهى!"
echo "   تمّ رفع: $((DOWNLOADED - FAILED))"
echo "   فشل: ${FAILED}"
echo
echo "📝 الخطوة التالية: تحديث URLs في JSON"
echo "   node scripts/apply-spaces-urls.mjs"
