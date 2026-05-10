/* ============================================================
   ⚙️  ملف الإعدادات الرئيسي للمكتبة
   عدّل القيم هنا لربط المشروع بـ Google Sheets و Firebase.
   كل شيء يعمل بدون إعدادات أيضاً (يستخدم بيانات تجريبية).
   ============================================================ */

const CONFIG = {
    siteName: 'المكتبة',

    /* ----- مصدر بيانات الكتب ----- */
    useSheets: false,
    sheetId: '',
    sheetName: 'books',

    /* ----- العدّاد (Firebase) ----- */
    firebase: {
        enabled: false,
        config: {
            apiKey: '',
            authDomain: '',
            projectId: '',
            storageBucket: '',
            messagingSenderId: '',
            appId: ''
        }
    },

    booksPerRow: 12,
    enableUniqueViewCount: true,

    categoryIcons: {
        'الأدب والروايات': '📖',
        'الدين والإسلاميات': '🕌',
        'التاريخ والتراث': '📜',
        'العلوم والمعرفة': '🔬',
        'التطوير الذاتي': '💼',
        'كتب الأطفال': '🧸',
        'التعليم والدراسة': '🎓',
        'الفلسفة والفكر': '🏛️',
        'الشعر': '✒️',
        'السير والتراجم': '👤'
    },
    defaultCategoryIcon: '📚'
};
