#!/usr/bin/env bash
# تثبيت Taybaa Library Backend على VPS macchina-direct
# IP: 104.248.118.96

set -e
cd "$(dirname "$0")"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════╗${NC}"
echo -e "${BLUE}║    📚 Taybaa API Setup            ║${NC}"
echo -e "${BLUE}╚══════════════════════════╝${NC}"
echo

# 1. تثبيت npm dependencies
echo -e "${YELLOW}⏳${NC} تثبيت dependencies..."
npm install --omit=dev

# 2. تثبيت PM2 (مدير العمليّات الدائم)
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⏳${NC} تثبيت PM2..."
    npm install -g pm2
fi

# 3. فتح بورت 3000 في جدار الحماية (إن وجد)
if command -v ufw &> /dev/null; then
    ufw allow 3000/tcp comment 'Taybaa API' 2>/dev/null || true
fi

# 4. تشغيل الخادم
if pm2 describe taybaa-api &>/dev/null; then
    echo -e "${YELLOW}⟲${NC} إعادة تشغيل الخادم..."
    pm2 restart taybaa-api
else
    echo -e "${YELLOW}▶${NC} بدء الخادم..."
    PORT=3000 pm2 start index.mjs --name taybaa-api
fi

pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo
echo -e "${GREEN}✅ الخادم يعمل!${NC}"
echo
echo "اختبر محليّاً:"
echo "  curl http://localhost:3000/api/health"
echo "  curl http://localhost:3000/api/stats"
echo
echo "من الإنترنت (VPS IP العام):"
echo "  curl http://104.248.118.96:3000/api/health"
echo
echo "أوامر PM2 مفيدة:"
echo "  pm2 status              # حالة كل الخدمات"
echo "  pm2 logs taybaa-api     # لوغات حيّة"
echo "  pm2 restart taybaa-api  # إعادة تشغيل"
echo "  pm2 stop taybaa-api     # إيقاف"
echo
echo -e "${YELLOW}💡 الخطوة التالية (لو أردت HTTPS إنتاجي):${NC}"
echo "  1. أضف nginx reverse proxy + Let's Encrypt SSL"
echo "  2. أو استخدم Cloudflare Tunnel (مجاناً، بلا IP عام):"
echo "     bash install-cloudflare-tunnel.sh"
