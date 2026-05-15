#!/usr/bin/env bash
# تثبيت TAYBAA LIBRARY على Ubuntu VPS
# تشغيل: bash <(curl -sSL https://raw.githubusercontent.com/tsallabi/TAYBAA-LIBRARY/main/scripts/install-vps.sh)

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="/opt/taybaa-library"
BRANCH="claude/online-library-design-ROC6E"
REPO="https://github.com/tsallabi/TAYBAA-LIBRARY.git"

echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    🌴  TAYBAA LIBRARY — VPS Setup       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo

# 1. Node.js 20
if command -v node &> /dev/null && [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -ge 18 ]; then
    echo -e "${GREEN}✓${NC} Node.js مثبّت: $(node -v)"
else
    echo -e "${YELLOW}⏳${NC} تثبيت Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# 2. Git + curl
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}⏳${NC} تثبيت git..."
    apt-get install -y git
fi

# 3. Clone or update
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}⏳${NC} تحديث $INSTALL_DIR..."
    cd "$INSTALL_DIR"
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
else
    echo -e "${YELLOW}⏳${NC} استنساخ إلى $INSTALL_DIR..."
    mkdir -p /opt
    cd /opt
    git clone "$REPO" taybaa-library
    cd taybaa-library
    git checkout "$BRANCH"
fi

echo -e "${GREEN}✓${NC} المستودع جاهز في $INSTALL_DIR"

# 4. SSH key for GitHub push
if [ ! -f ~/.ssh/id_ed25519 ]; then
    echo
    echo -e "${YELLOW}🔑${NC} إنشاء SSH key للدفع إلى GitHub..."
    mkdir -p ~/.ssh
    ssh-keygen -t ed25519 -C "taybaa-vps@$(hostname)" -N "" -f ~/.ssh/id_ed25519
fi

echo
echo -e "${BLUE}┌─────────────────────────────────────────────┐${NC}"
echo -e "${BLUE}│  أضف هذا الـ SSH key إلى GitHub:                  │${NC}"
echo -e "${BLUE}│  https://github.com/settings/keys              │${NC}"
echo -e "${BLUE}└─────────────────────────────────────────────┘${NC}"
echo
cat ~/.ssh/id_ed25519.pub
echo

# 5. Git config
if [ -z "$(git -C $INSTALL_DIR config user.email)" ]; then
    git -C $INSTALL_DIR config user.email "taybaa-bot@$(hostname)"
    git -C $INSTALL_DIR config user.name "Taybaa Library Bot"
fi

# 6. Switch remote to SSH (for push without token)
git -C $INSTALL_DIR remote set-url origin git@github.com:tsallabi/TAYBAA-LIBRARY.git 2>/dev/null || true

echo -e "${GREEN}✅ التثبيت اكتمل!${NC}"
echo
echo "الأوامر المتاحة (من $INSTALL_DIR):"
echo "  bash scripts/run-all.sh              # جلب كل المصادر (ساعة)"
echo "  node scripts/hindawi-import.mjs 200  # هنداوي فقط"
echo "  node scripts/shamela-categorical.mjs # شاملة فقط"
echo "  bash scripts/bulk-all.sh 200         # archive.org بدفعة عبر كل الأقسام"
echo
echo "لجدولة تلقائيّة يوميّة (3 صباحاً):"
echo "  echo '0 3 * * * cd $INSTALL_DIR && bash scripts/run-all.sh >> /var/log/taybaa.log 2>&1' | crontab -"
echo
