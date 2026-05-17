# Scripts — أدوات إثراء المكتبة

أدوات Node.js تجلب آلاف الكتب العربية بالتحقّق من وجودها فعلياً. تعمل في 3 بيئات:
1. **GitHub Actions** (مجاناً، بدون أي إعداد — الأسهل)
2. **VPS DigitalOcean** (للجلب المستمر + Shamela)
3. **جهاز محلّي** (Node.js 18+)

---

## 1️⃣ GitHub Actions — الأسهل والمجانيّ

### لجلب كتب دفعة واحدة

1. اذهب إلى: https://github.com/tsallabi/TAYBAA-LIBRARY/actions/workflows/bulk-import.yml
2. اضغط **Run workflow** (أعلى يمين)
3. اختر:
   - **Category**: القسم المطلوب من القائمة
   - **Count**: 50-500 كتاب
4. اضغط **Run workflow**
5. انتظر 5-10 دقائق (حسب العدد)
6. Cloudflare سيعيد البناء تلقائياً · الكتب ستظهر في الموقع

**توصية**: ابدأ بـ 50 لفحص النتائج، ثمّ زد لـ500.

---

## 2️⃣ VPS DigitalOcean — للجلب المستمر ولـShamela

### التثبيت على VPS

```bash
# 1. دخول على الـVPS
ssh root@YOUR-DROPLET-IP

# 2. تثبيت Node.js (لو غير مثبّت)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git

# 3. استنساخ المستودع
cd /opt
git clone https://github.com/tsallabi/TAYBAA-LIBRARY.git library
cd library

# 4. تبديل للفرع المطلوب للتطوير
git checkout claude/online-library-design-ROC6E

# 5. جرّب السكربت
cd scripts
node bulk-import-archive.mjs "تطوير الذات والنجاح" 20
```

### جلب دفعة كبيرة (من كل الأقسام)

```bash
bash bulk-all.sh 200
# يجلب 200 كتاب من كل قسم (~3400 كتاب إجمالي)
```

### رفع النتائج لـGitHub تلقائياً

```bash
# إعداد Git (مرّة واحدة)
git config --global user.email "bot@taybaa-library.com"
git config --global user.name "Taybaa Libya Library Bot"

# إنشاء SSH key لـGitHub
ssh-keygen -t ed25519 -C "vps@taybaa"
cat ~/.ssh/id_ed25519.pub
# انسخ الناتج إلى: https://github.com/settings/keys → New SSH key

# بعد كل جلب ادفع لـGitHub
cd /opt/library
git add data/books-extra-3.json
git commit -m "feat: bulk import from VPS"
git push origin claude/online-library-design-ROC6E
```

### تشغيل تلقائي (Cron)

```bash
crontab -e
# أضف هذا: كل يوم 3 صباحاً يجلب 50 كتاب جديد ويرفعها
0 3 * * * cd /opt/library/scripts && node bulk-import-archive.mjs "الدين والإسلاميات" 50 >> /var/log/taybaa-import.log 2>&1 && cd .. && git add . && git commit -m "auto: nightly import" && git push
```

---

## 3️⃣ Shamela — مشروع أكبر

shamela.ws تحتوي حوالي 6000 كتاب إسلامي. السكربت يجلب الميتاداتا
(عنوان + مؤلف + رابط).

```bash
# على VPS فقط (لأنّ Shamela تحجب CORS في المتصفّح)
node shamela-scraper.mjs --start 1 --end 500
```

يدخل النتائج في `data/shamela-books.json`.

**ملاحظة**: الكتب ستفتح في iframe من shamela.ws حالياً. في المستقبل:
- تحميل محتوى HTML لكل كتاب
- تخزين على R2 / DO Spaces
- عرض في قارئنا بوضع HTML (يحتاج توسيع reader.html)

---

## 4️⃣ رفع PDFs إلى DigitalOcean Spaces (R2 التابع لـDO)

لو أردت استضافة الـPDFs بنفسك (بدل archive.org iframe):

```bash
# تثبيت s3cmd
apt install s3cmd -y
s3cmd --configure
# Access Key + Secret Key من: DO → API → Spaces Keys
# Endpoint: nyc3.digitaloceanspaces.com (أو حسب منطقتك)

# رفع PDF
s3cmd put book.pdf s3://your-space-name/books/book-1.pdf --acl-public
# URL: https://your-space-name.nyc3.digitaloceanspaces.com/books/book-1.pdf
```

---

## الخطوات الموصى بها (الترتيب الأمثل)

1. ⚡ **GitHub Actions**: جرّب جلب 50 كتاب في الدين (دقيقة)
2. 🔬 **افحص النتائج** في الموقع
3. 🚀 **بدفعة أكبر**: 500 لكل قسم (عبر GitHub Actions)
4. 🖥️ **VPS**: ابدأ Shamela لجلب 6000 كتاب إسلامي
5. ☁️ **R2/Spaces**: ارفع أهمّ الـPDFs لتعمل في قارئنا
