/* ============================================================
   📊  عدّاد المشاهدات والتحميلات (Firebase Firestore — مجاني)
   ============================================================ */

const COUNTER = (function() {
    let db = null;
    let firestoreModule = null;
    let ready = null;

    function initialize() {
        if (!CONFIG.firebase.enabled || ready) return ready;

        ready = (async () => {
            const [{ initializeApp }, fs] = await Promise.all([
                import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
                import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
            ]);
            const app = initializeApp(CONFIG.firebase.config);
            db = fs.getFirestore(app);
            firestoreModule = fs;
        })();
        return ready;
    }

    async function getCounts(bookId) {
        if (!CONFIG.firebase.enabled) return null;
        try {
            await initialize();
            const ref = firestoreModule.doc(db, 'bookStats', String(bookId));
            const snap = await firestoreModule.getDoc(ref);
            return snap.exists() ? snap.data() : { views: 0, downloads: 0 };
        } catch (err) {
            console.warn('تعذّر جلب الإحصائيات:', err);
            return null;
        }
    }

    async function increment(bookId, field) {
        if (!CONFIG.firebase.enabled) return;
        if (!['views', 'downloads'].includes(field)) return;

        if (CONFIG.enableUniqueViewCount && field === 'views') {
            const key = `viewed_${bookId}`;
            if (sessionStorage.getItem(key)) return;
            sessionStorage.setItem(key, '1');
        }

        try {
            await initialize();
            const ref = firestoreModule.doc(db, 'bookStats', String(bookId));
            await firestoreModule.setDoc(
                ref,
                { [field]: firestoreModule.increment(1) },
                { merge: true }
            );
        } catch (err) {
            console.warn('تعذّر تحديث العدّاد:', err);
        }
    }

    return { getCounts, increment };
})();
