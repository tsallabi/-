# رفع PDFs إلى DigitalOcean Spaces

## الفكرة

أي ملف PDF تضعه في هذا المجلد وترفعه إلى GitHub → يرفع تلقائياً إلى DigitalOcean Spaces عبر GitHub Action.

## الإعداد لمرّة واحدة

اذهب إلى: **Settings → Secrets and variables → Actions → New repository secret**

أضف أربعة أسرار:

| الاسم | القيمة |
|---|---|
| `DO_SPACES_KEY` | Access Key من DigitalOcean |
| `DO_SPACES_SECRET` | Secret Key |
| `DO_SPACES_REGION` | مثل `ams3` أو `fra1` أو `nyc3` |
| `DO_SPACES_BUCKET` | اسم الـ Space |

للحصول على الـ Keys: DigitalOcean → API → Tokens/Keys → Spaces Keys → Generate New Key

## الاستخدام

1. ضع ملفات `.pdf` في هذا المجلد
2. ارفعها إلى GitHub (`git push` أو عبر واجهة GitHub)
3. تلقائياً ترتفع إلى DO Spaces
4. روابطها تصبح: `https://YOUR_BUCKET.REGION.cdn.digitaloceanspaces.com/books/FILENAME.pdf`
5. تضعها في حقل `pdf` للكتاب في JSON

## فوائد DigitalOcean Spaces

- 250 GB مجاناً أول 60 يوم · ثم $5/شهر لـ 250GB
- 1 TB Bandwidth/شهر مجاناً
- CDN عالمي سريع في ليبيا والمنطقة العربية
- متوافق مع S3 API
