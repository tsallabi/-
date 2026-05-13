/* المكتبة الطيبة — ملف الإعدادات */

const CONFIG = {
    siteName: 'المكتبة الطيبة',
    siteTag: 'TAYBAA · LIBRARY',
    publisher: 'دار نشر المكتبة الطيبة',
    publisherShort: 'دار المكتبة الطيبة',

    // 'json' | 'sheets' | 'firestore'
    dataSource: 'json',

    sheetId: '',
    sheetName: 'books',

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

    admin: {
        password: 'taybaa2026',
        allowedEmails: []
    },

    enableUniqueViewCount: true,

    categoryIcons: {
        'الأدب والروايات': '📖',
        'الدين والإسلاميات': '🕌',
        'Islamic Studies (English)': '🌙',
        'التاريخ والتراث': '📜',
        'العلوم والمعرفة': '🔬',
        'التطوير الذاتي': '💼',
        'تطوير الذات والنجاح': '🌱',
        'التحفيز والإلهام': '🔥',
        'ريادة الأعمال': '🚀',
        'إدارة الأعمال': '📊',
        'القيادة والإدارة': '🎯',
        'المال والاستثمار': '💰',
        'الإدارة المالية': '💵',
        'فن البيع': '🤝',
        'التسويق': '📣',
        'علم النفس': '🧠',
        'علم النفس التطبيقي': '🧠',
        'كتب الأطفال': '🧸',
        'التعليم والدراسة': '🎓',
        'الفلسفة والفكر': '🏛️',
        'الشعر': '✒️',
        'السير والتراجم': '👤'
    },
    defaultCategoryIcon: '📚'
};
