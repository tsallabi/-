/* Firebase Auth wrapper — Google + Facebook + Email/Password */

const FBAUTH = (function() {
    let auth = null;
    let mod = null;
    let providers = {};
    let ready = false;
    let pending = null;

    async function init() {
        if (ready) return;
        if (pending) return pending;
        if (!isConfigured()) throw new Error('Firebase Auth غير مهيأ في config.js');

        pending = (async () => {
            const [appMod, authMod] = await Promise.all([
                import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
                import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js')
            ]);
            const app = appMod.initializeApp(CONFIG.firebase.config);
            auth = authMod.getAuth(app);
            mod = authMod;
            providers.google = new authMod.GoogleAuthProvider();
            providers.facebook = new authMod.FacebookAuthProvider();
            ready = true;
        })();
        return pending;
    }

    function isConfigured() {
        return !!(typeof CONFIG !== 'undefined' &&
            CONFIG.firebase &&
            CONFIG.firebase.enabled &&
            CONFIG.firebase.config &&
            CONFIG.firebase.config.apiKey);
    }

    async function signInGoogle() {
        await init();
        const r = await mod.signInWithPopup(auth, providers.google);
        return mapUser(r.user, 'google');
    }
    async function signInFacebook() {
        await init();
        const r = await mod.signInWithPopup(auth, providers.facebook);
        return mapUser(r.user, 'facebook');
    }
    async function signInEmail(email, password) {
        await init();
        const r = await mod.signInWithEmailAndPassword(auth, email, password);
        return mapUser(r.user, 'email');
    }
    async function signUpEmail(email, password, displayName) {
        await init();
        const r = await mod.createUserWithEmailAndPassword(auth, email, password);
        if (displayName) {
            try { await mod.updateProfile(r.user, { displayName }); } catch (_) {}
        }
        return mapUser(r.user, 'email');
    }
    async function resetPassword(email) {
        await init();
        await mod.sendPasswordResetEmail(auth, email);
    }
    async function signOut() {
        if (!ready) return;
        try { await mod.signOut(auth); } catch (_) {}
    }

    function mapUser(u, providerKey) {
        return {
            username: u.email || u.uid,
            displayName: u.displayName || (u.email ? u.email.split('@')[0] : 'مستخدم'),
            email: u.email || '',
            photoURL: u.photoURL || '',
            uid: u.uid,
            provider: providerKey,
            source: 'firebase',
            allowedCategories: [],
            loginAt: new Date().toISOString()
        };
    }

    return { init, signInGoogle, signInFacebook, signInEmail, signUpEmail, resetPassword, signOut, isConfigured };
})();
