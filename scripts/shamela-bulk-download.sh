#!/usr/bin/env bash
# تحميل كامل لقاعدة بيانات المكتبة الشاملة + تحويلها لصيغتنا
# يعمل على VPS مع 5GB قرص حرّ على الأقل

set -e
cd "$(dirname "$0")/.."

WORK_DIR="/tmp/shamela-data"
SQLITE_DB="$WORK_DIR/master.db"

echo "🌍 ═══════════════════════════════════════"
echo "   📚 تحميل المكتبة الشاملة كاملةً       "
echo "════════════════════════════════════════"
echo

# 1. التحضير
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

# 2. ثبّت الأدوات اللازمة
echo "⏳ تثبيت sqlite3 + curl..."
apt-get install -y sqlite3 curl unzip jq 2>/dev/null || true

# 3. حاول عدّة مصادر معروفة لقاعدة الشاملة
echo
echo "📥 محاولة تحميل قاعدة Shamela من المصادر المتاحة..."
echo

# قائمة بمصادر معروفة (URLs قد تتغيّر — جرّب كلّها)
SOURCES=(
    # GitHub mirrors (most reliable)
    "https://github.com/ojaobi/shamela-books-list/raw/main/books.json"
    "https://raw.githubusercontent.com/maktaba-shamela/data/main/master.json"
    "https://raw.githubusercontent.com/OpenITI/RELEASE/master/data/0001AbuBakr/index.json"
    # Shamela's own master_patch endpoint (requires API key now, may fail)
    "https://shamela.ws/api/master_patch"
    # Wayback Machine snapshot
    "https://web.archive.org/web/2024/https://shamela.ws/files/master.zip"
)

DOWNLOADED=""
for SRC in "${SOURCES[@]}"; do
    FILENAME=$(basename "$SRC")
    echo "🔍 جرّب: $SRC"
    if curl -sSL --max-time 30 -o "$FILENAME" "$SRC" 2>/dev/null; then
        SIZE=$(stat -c%s "$FILENAME" 2>/dev/null || echo 0)
        if [ "$SIZE" -gt 1000 ]; then
            echo "✅ نجح! الحجم: $(numfmt --to=iec $SIZE)"
            DOWNLOADED="$FILENAME"
            break
        fi
    fi
    echo "❌ فشل أو حجم صغير"
done

if [ -z "$DOWNLOADED" ]; then
    echo
    echo "⚠️  لم أستطع تحميل قاعدة Shamela تلقائياً."
    echo
    echo "🔧 الحلّ اليدوي:"
    echo "   1. حمّل قاعدة Shamela يدويّاً من:"
    echo "      https://shamela.ws/index.php/page/download"
    echo "   2. ارفعها إلى VPS عبر scp:"
    echo "      scp shamela-master.zip root@VPS_IP:/tmp/shamela-data/"
    echo "   3. اكتب: unzip /tmp/shamela-data/shamela-master.zip"
    echo "   4. شغّل هذا السكربت مرّة أخرى"
    echo
    echo "أو استخدم الحلّ البديل: shamela-via-archive.mjs (لا يحتاج تحميل)"
    echo "  node /opt/taybaa-library/scripts/shamela-via-archive.mjs 2000"
    exit 1
fi

# 4. لو الملف JSON، نمرّره لسكربت Node لمعالجته
echo
echo "🔄 معالجة البيانات..."

if [[ "$DOWNLOADED" == *.json ]]; then
    node /opt/taybaa-library/scripts/shamela-import-json.mjs "$WORK_DIR/$DOWNLOADED"
elif [[ "$DOWNLOADED" == *.zip ]]; then
    unzip -o "$DOWNLOADED" -d "$WORK_DIR/extracted"
    # ابحث عن قاعدة SQLite داخل المضغوط
    SQLITE_FILE=$(find "$WORK_DIR/extracted" -name "*.db" -o -name "*.sqlite" | head -1)
    if [ -n "$SQLITE_FILE" ]; then
        node /opt/taybaa-library/scripts/shamela-import-sqlite.mjs "$SQLITE_FILE"
    fi
fi

echo
echo "✅ تمّ!"
