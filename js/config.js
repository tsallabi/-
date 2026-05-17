/* مكتبة ليبيا الطيبة — إعدادات */

const CONFIG = {
    siteName: 'مكتبة ليبيا الطيبة',
    siteTag: 'TAYBAA · LIBRARY',
    publisher: 'دار نشر مكتبة ليبيا الطيبة',
    publisherShort: 'دار مكتبة ليبيا الطيبة',

    dataSource: 'json',
    sheetId: '',
    sheetName: 'books',

    /* ☄️ Firebase Authentication — لدخول جوجل وفيسبوك والإيميل
       خطوات التفعيل:
       1) https://console.firebase.google.com → أنشئ مشروعاً
       2) Authentication → Sign-in method → فعّل Google + Facebook + Email/Password
       3) Project Settings → General → Your apps → Web (</>) → Register app
       4) انسخ الـ firebaseConfig إلى أدناه واضبط enabled: true
       5) لفيسبوك: https://developers.facebook.com → أنشئ تطبيقاً → أدخل
          App ID و App Secret في Firebase Console */
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

    admin: { password: 'taybaa2026', allowedEmails: [] },

    vipPassword: 'taybaa-vip-2026',
    enableUniqueViewCount: true,

    hiddenCategories: ['الدين والإسلاميات', 'Islamic Studies (English)'],

    categoryOrder: [
        'تطوير الذات والنجاح',
        'التحفيز والإلهام',
        'القيادة والإدارة',
        'إدارة الأعمال',
        'ريادة الأعمال',
        'فن البيع',
        'التسويق',
        'الإدارة المالية',
        'المال والاستثمار',
        'علم النفس',
        'علم النفس التطبيقي',
        'الفلسفة والفكر',
        'الأدب والروايات',
        'السير والتراجم',
        'التاريخ والتراث',
        'العلوم والمعرفة',
        'التعليم والدراسة',
        'الشعر',
        'كتب الأطفال',
        'التطوير الذاتي',
        'الدين والإسلاميات',
        'Islamic Studies (English)'
    ],

    categoryIcons: {
        'تطوير الذات والنجاح': '🌱',
        'التحفيز والإلهام': '🔥',
        'القيادة والإدارة': '🎯',
        'إدارة الأعمال': '📊',
        'ريادة الأعمال': '🚀',
        'فن البيع': '🤝',
        'التسويق': '📣',
        'الإدارة المالية': '💵',
        'المال والاستثمار': '💰',
        'علم النفس': '🧠',
        'علم النفس التطبيقي': '🧠',
        'الفلسفة والفكر': '🏛️',
        'الأدب والروايات': '📖',
        'السير والتراجم': '👤',
        'التاريخ والتراث': '📜',
        'العلوم والمعرفة': '🔬',
        'التعليم والدراسة': '🎓',
        'الشعر': '✍️',
        'كتب الأطفال': '🧸',
        'التطوير الذاتي': '💼',
        'الدين والإسلاميات': '🕌',
        'Islamic Studies (English)': '🌙'
    },
    defaultCategoryIcon: '📚'
};
