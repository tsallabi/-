# مكتبة ليبيا الطيبة — Backend API

Node.js + Express server لتوفير endpoints للواجهة الأماميّة.

## التثبيت على VPS

```bash
ssh root@104.248.118.96
cd /opt/taybaa-library/server
bash install-backend.sh
```

الخادم سيعمل على:
- `http://104.248.118.96:3000/api/...`

## Endpoints

| Method | Path | الوصف |
|--------|------|---------|
| GET | `/api/health` | فحص حالة |
| GET | `/api/stats` | إحصائيّات المكتبة |
| GET | `/api/categories` | الأقسام وأعداد الكتب |
| GET | `/api/books?q=...&category=...&limit=50` | بحث وفلترة |
| GET | `/api/books/:id` | تفاصيل كتاب + مقترحات مشابهة |
| GET | `/api/books/random` | كتاب عشوائي (مفاجأتني) |
| GET | `/api/quote` | اقتباس اليوم |
| GET | `/api/featured` | أفضل 20 كتاب |
| GET | `/api/journeys` | الرحلات القرائيّة المنسّقة |

## التطوير المحلّي

```bash
npm install
PORT=3000 npm run dev
```

الخيار `--watch` يعيد التحميل تلقائيّاً عند تغيير الأكواد.

## إضافة HTTPS (للإنتاج)

خيار 1: Cloudflare Tunnel (الأسهل والأرخص)
خيار 2: Nginx + Let's Encrypt

انظر `install-cloudflare-tunnel.sh` لاحقاً.
