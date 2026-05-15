#!/usr/bin/env bash
# تشغيل كل المستوردات بعد الآخر ودفعها لـGitHub

set -e
cd "$(dirname "$0")"
LIBRARY_DIR=$(cd .. && pwd)

echo "📚 جلب كل المصادر — $LIBRARY_DIR"
echo "وقت البدء: $(date)"
echo "═══════════════════════════════"
echo

# تحديث المستودع أولاً
cd "$LIBRARY_DIR"
git pull origin claude/online-library-design-ROC6E 2>/dev/null || echo "⚠️ git pull فشل (ربّما بدون SSH key)"
cd scripts

# 1️⃣ هنداوي (أفضل جودة للكتب الحديثة)
echo
echo "1️⃣  مؤسّسة هنداوي — كتب عربيّة حديثة حرّة (أدب · فلسفة · علوم · تاريخ)"
echo "   المدّة المتوقّعة: ~10-15 دقيقة"
node hindawi-import.mjs 500 || echo "⚠️ هنداوي فشل"

# 2️⃣ المكتبة الشاملة (إسلامي)
echo
echo "2️⃣  المكتبة الشاملة — علوم إسلاميّة كلاسيكيّة"
echo "   المدّة المتوقّعة: ~30-45 دقيقة"
node shamela-categorical.mjs || echo "⚠️ شاملة فشلت"

# 3️⃣ archive.org (بجودة عالية)
echo
echo "3️⃣  archive.org — دفعة 200 لكلّ قسم (بفلتر جودة)"
echo "   المدّة المتوقّعة: ~30 دقيقة لـ 17 قسماً"
bash bulk-all.sh 200 || echo "⚠️ archive.org فشل"

# دفع النتائج
echo
echo "═══════════════════════════════"
echo "📤 دفع التغييرات إلى GitHub..."
cd "$LIBRARY_DIR"

# استخدم git stash إن حدث conflict مع تغييرات سابقة
git add data/

if git diff --staged --quiet; then
    echo "ℹ️  لا تغييرات جديدة للدفع"
else
    git commit -m "feat(vps): import «$(date +'%Y-%m-%d')» — hindawi + shamela + archive.org"
    git push origin claude/online-library-design-ROC6E 2>&1 || {
        echo "❌ فشل الدفع. تحقّق من SSH key في:"
        echo "   https://github.com/settings/keys"
        echo "   أو أضف origin remote بـ: git remote set-url origin git@github.com:tsallabi/TAYBAA-LIBRARY.git"
    }
fi

echo
echo "✅ التشغيل اكتمل في: $(date)"
echo "Cloudflare سيعيد البناء تلقائيّاً خلال ~60 ثانية."
