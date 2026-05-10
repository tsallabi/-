# 🛠️ دليل الإعداد — مكتبة طيبة

هذا المشروع موقع ثابت (Static) يعمل بدون أي خادم. الإعداد كله يتم في ملف واحد: `js/config.js`.

---

## 1️⃣ التشغيل المحلي (للتجربة)

### على الكمبيوتر (Python):
```bash
python3 -m http.server 8080
```
ثم افتح: <http://localhost:8080>

### على Android (Termux):
```bash
pkg install python -y
termux-setup-storage
cd /sdcard/Download/TAYBAA-LIBRARY
python -m http.server 8080
```
ثم افتح في متصفح الجوال: http://localhost:8080

سيظهر الموقع مع 8 كتب تجريبية فوراً (بدون أي إعداد).

---

## 2️⃣ ربط Google Sheets كقاعدة بيانات

### الخطوة 1: أنشئ جدولاً جديداً
اذهب إلى <https://sheets.new>

### الخطوة 2: أضف الأعمدة في الصف الأول في ورقة اسمها `books`:

| id | title | author | category | pages | cover | pdf | description | introduction | views | downloads | addedDate | recommended |
|----|-------|--------|----------|-------|-------|-----|-------------|--------------|-------|-----------|-----------|-------------|

> 💡 يمكنك أيضاً استخدام أسماء عربية: العنوان، المؤلف، القسم، الصفحات، الغلاف، رابط_pdf، النبذة، المقدمة، إلخ.

### الخطوة 3: أضف كتبك (سطر لكل كتاب)

### الخطوة 4: اجعل الجدول عاماً
- اضغط **مشاركة (Share)** → **أي شخص لديه الرابط — مشاهد**

### الخطوة 5: انسخ معرّف الجدول
من الرابط: `docs.google.com/spreadsheets/d/<SHEET_ID>/edit`

### الخطوة 6: ضعه في `js/config.js`:
```js
useSheets: true,
sheetId: 'SHEET_ID_HERE',
sheetName: 'books',
```

🎉 جاهز!

---

## 3️⃣ إعداد Firebase للعدّاد

### الخطوة 1: أنشئ مشروع
<https://console.firebase.google.com> → **Add project**

### الخطوة 2: فعّل Firestore Database
**Build > Firestore Database > Start in test mode**

### الخطوة 3: أضف تطبيق ويب
⚙️ Project Settings → **Add App** → **Web** → انسخ كائن `firebaseConfig`

### الخطوة 4: ضعه في `js/config.js`:
```js
firebase: {
    enabled: true,
    config: {
        apiKey: "...",
        authDomain: "...",
        projectId: "...",
        storageBucket: "...",
        messagingSenderId: "...",
        appId: "..."
    }
}
```

### الخطوة 5: قواعد الأمان (Firestore Rules):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /bookStats/{bookId} {
      allow read: if true;
      allow write: if request.resource.data.keys().hasOnly(['views','downloads']);
    }
  }
}
```

---

## 4️⃣ النشر على الإنترنت (مجاناً)

### Netlify (الأسهل) ⭐
1. اذهب إلى <https://app.netlify.com/drop>
2. اسحب مجلد المشروع إلى الصفحة
3. جاهز! ستحصل على رابط `https://your-site.netlify.app`

### GitHub Pages
1. **Settings > Pages**
2. Source: branch `main` → `/root`
3. جاهز خلال دقائق

---

## 5️⃣ إضافة كتبك

### للأغلفة:
- ارفعها على [imgur.com](https://imgur.com) أو [Cloudinary](https://cloudinary.com)

### لملفات PDF:
- **Google Drive**: `https://drive.google.com/uc?export=download&id=FILE_ID`
- **archive.org**: روابط مباشرة
- أو في مجلد `books/` داخل المشروع

---

## ❓ مشاكل شائعة

| المشكلة | الحل |
|---------|------|
| لا تظهر الكتب | تأكد أن `useSheets: false` أو Sheet ID صحيح |
| الكتاب لا يفتح | تأكد أن رابط PDF مباشر (ليس صفحة Drive) |
| العدّاد لا يعمل | راجع قواعد Firestore + `firebase.enabled: true` |
