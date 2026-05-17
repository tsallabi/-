# 🛠️ دليل الإعداد — مكتبة ليبيا الطيبة

موقع مكتبة إلكتروني حديث، يعمل بدون خادم. الإعداد كله في ملف واحد: `js/config.js`.

---

## 🚀 البدء السريع

### على الكمبيوتر:
```bash
python3 -m http.server 8080
```
ثم افتح: <http://localhost:8080>

### على Android (Termux):
```bash
pkg install python git -y
git clone https://github.com/tsallabi/TAYBAA-LIBRARY.git
cd TAYBAA-LIBRARY
python -m http.server 8080
```
ثم في متصفح الجوال: **http://localhost:8080**

---

## 🤖 إعداد ميزة "اسأل الكتاب" (Wave 4)

تتيح هذه الميزة للقارئ إجراء محادثة ذكية مع الكتاب الذي يقرأه عبر نموذج Claude.

### الخطوة 1: احصل على مفتاح API من Anthropic
انتقل إلى: <https://console.anthropic.com/settings/keys>  
اضغط **Create Key** — انسخ المفتاح فوراً (لن يُعرض مجدداً).

### الخطوة 2: أضف المفتاح إلى Cloudflare Pages

1. افتح لوحة تحكم مشروعك على: <https://dash.cloudflare.com>
2. اختر **Workers & Pages** → اختر موقع مكتبة ليبيا الطيبة
3. انتقل إلى: **Settings → Environment Variables**
4. اضغط **Add variable** وأدخل:

| الحقل | القيمة |
|-------|--------|
| Variable name | `ANTHROPIC_API_KEY` |
| Value | مفتاح API الذي نسخته |

5. اختر **Production** (وكذلك **Preview** إن أردت)
6. اضغط **Save**

### الخطوة 3: أعد نشر الموقع
بعد حفظ المتغير، اضغط **Retry deployment** أو ادفع commit جديداً لتفعيل المتغير.

### ملاحظات أمنية مهمة
- **لا تضع المفتاح أبداً** داخل الكود أو ملفات `js/` أو أي ملف يصل إليه المتصفح مباشرةً.
- المفتاح يُقرأ فقط من الخادم (Cloudflare Pages Function) عبر `env.ANTHROPIC_API_KEY`.
- إذا اشتبهت بتسريب المفتاح، ارجع إلى console.anthropic.com وأبطله فوراً ثم أنشئ مفتاحاً جديداً.

### اختبار الميزة
بعد النشر، افتح أي كتاب في القارئ وانقر على زر **🤖 اسأل** في شريط الأدوات.  
إذا لم يعمل، افتح Developer Tools → Network وتحقق من استجابة `/api/ask-book`.

---

## 🔐 لوحة الإدارة (الأدمن)

### كيف يدخل الأدمن؟
1. افتح: **https://your-site/admin.html**
   - مثلاً: `https://tsallabi.github.io/TAYBAA-LIBRARY/admin.html`
2. أدخل كلمة المرور (الافتراضية: `taybaa2026`)

### تغيير كلمة مرور الأدمن:
في `js/config.js`:
```js
admin: {
    password: 'كلمة_مرور_قوية_هنا'
}
```

### ⚠️ ملاحظة أمنية:
- كلمة المرور في `config.js` ظاهرة في كود الموقع — مناسبة للمكتبات الخاصة فقط
- **للحماية الكاملة**: استخدم Firebase Authentication

---

## 📚 إضافة الكتب من لوحة الإدارة

### 1️⃣ اضغط **➕ أضف كتاباً**
تظهر نافذة بـ **3 خطوات**:

### 2️⃣ الخطوة 1: المعلومات
- العنوان، المؤلف، القسم
- عدد الصفحات
- ⭐ موصى به (اختياري)

### 3️⃣ الخطوة 2: المحتوى
- 🖼️ **صورة الغلاف**: اسحب الصورة أو الصق رابطها
- 📄 **ملف الكتاب** (3 خيارات):
  - **PDF**: ارفع ملف PDF مباشرة
  - **📝 Word (.docx)**: ارفع ملف Word — يتم تحويله تلقائياً لكتاب منسّق
  - **🔗 رابط**: الصق رابط PDF خارجي

### 4️⃣ الخطوة 3: النصوص
- نبذة مختصرة
- المقدمة

> 💡 **عند رفع ملف Word**: يستخرج النظام العنوان والنبذة والمقدمة تلقائياً.

### اضغط 💾 حفظ — الكتاب يصبح متاحاً للجميع فوراً!

---

## 📝 محرّر الكتب من Word

### كيف يحوّل الملف لكتاب؟
1. اختر تبويب **Word (.docx)**
2. اسحب ملف `.docx`
3. النظام يقوم تلقائياً بـ:
   - استخراج النص + العناوين + الصور
   - تنسيقها بشكل كتاب (خط Amiri، تباعد مناسب، RTL)
   - عرض **معاينة مباشرة**
   - استخراج العنوان والنبذة والمقدمة

### من Google Docs:
1. افتح المستند في Google Docs
2. **File → Download → Microsoft Word (.docx)**
3. ارفع الملف في لوحة الإدارة

---

## 🔥 إعداد Firebase (للحفظ الدائم + العداد)

بدون Firebase، الكتب التي تضيفها لن تُحفظ.

### الخطوة 1: أنشئ مشروع Firebase
<https://console.firebase.google.com> → **Add project**

### الخطوة 2: فعّل Firestore Database
- **Build > Firestore Database** → Start in test mode
- اختر منطقة قريبة

### الخطوة 3: فعّل Storage
- **Build > Storage** → ابدأ في وضع التجربة

### الخطوة 4: أضف تطبيق ويب
- ⚙️ Project Settings → Your apps → أيقونة `</>`
- انسخ كائن `firebaseConfig`

### الخطوة 5: ضعه في `js/config.js`
```js
dataSource: 'firestore',
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

### الخطوة 6: قواعد Firestore
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /books/{bookId} {
      allow read: if true;
      allow write: if true;
    }
    match /bookStats/{bookId} {
      allow read: if true;
      allow write: if request.resource.data.keys().hasOnly(['views','downloads']);
    }
  }
}
```

### الخطوة 7: قواعد Storage
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
      allow write: if true;
    }
  }
}
```

🎉 جاهز!

---

## 🌐 النشر مجاناً

### GitHub Pages:
**Settings → Pages → Source: branch `main` / root**

### Netlify:
<https://app.netlify.com> → New site from Git → GitHub → TAYBAA-LIBRARY

---

## ❓ مشاكل شائعة

| المشكلة | الحل |
|---------|------|
| لا أستطيع الدخول للأدمن | تأكد من `admin.password` في config.js |
| الكتب التي أضفتها اختفت | فعّل Firebase — بدونه لا تُحفظ |
| ملف Word لا يتحوّل | تأكد أنه `.docx` (ليس `.doc`) |
| الصور لا تظهر | تأكد من تفعيل Firebase Storage |
| زر "اسأل الكتاب" لا يرد | تأكد من إضافة `ANTHROPIC_API_KEY` في Cloudflare Pages → Settings → Environment Variables |
| رسالة "مفتاح API غير صحيح" | أعد إنشاء المفتاح من console.anthropic.com وحدّثه في Cloudflare |
