#!/usr/bin/env bash
# دفعة واحدة تجلب 200 كتاب من كل قسم رئيسيّ
# Usage: bash scripts/bulk-all.sh

set -e
cd "$(dirname "$0")"

COUNT=${1:-100}

echo "📚 جلب ${COUNT} كتاب من كل قسم...\n"

declare -a CATS=(
    "تطوير الذات والنجاح"
    "التحفيز والإلهام"
    "القيادة والإدارة"
    "إدارة الأعمال"
    "ريادة الأعمال"
    "فن البيع"
    "التسويق"
    "الإدارة المالية"
    "المال والاستثمار"
    "علم النفس"
    "الفلسفة والفكر"
    "الأدب والروايات"
    "التاريخ والتراث"
    "العلوم والمعرفة"
    "الدين والإسلاميات"
    "كتب الأطفال"
    "الشعر"
)

for cat in "${CATS[@]}"; do
    echo "\n▶ ${cat}"
    node bulk-import-archive.mjs "${cat}" "${COUNT}" || echo "⚠️  ${cat} failed"
    sleep 2  # لطف لـarchive.org
done

echo "\n✅ انتهى. راجع data/books-extra-3.json"
