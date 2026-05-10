/* المكتبة الطيبة — ملف الإعدادات */

const CONFIG = {
    siteName: 'المكتبة الطيبة',
    siteTag: 'TAYBAA · LIBRARY',

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
