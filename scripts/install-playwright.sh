#!/usr/bin/env bash
# تثبيت Playwright + Chromium على VPS لتشغيل shamela-playwright.mjs

set -e
cd "$(dirname "$0")/.."

echo "📅 تثبيت Playwright و Chromium..."
echo "   (حوالي 300MB من المتصفّح والـdependencies)"
echo

# احتاجات Chromium على Ubuntu
apt-get update
apt-get install -y \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2t64 \
    libatspi2.0-0 libwayland-client0 fonts-noto-color-emoji \
    fonts-noto-cjk fonts-arabeyes

# Playwright
npm install playwright
npx playwright install chromium

echo
echo "✅ تمّ التثبيت!"
echo
echo "الآن جرّب:"
echo "  node scripts/shamela-playwright.mjs 100"
