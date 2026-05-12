/* ============================================================
   💾  GitHub Save — حفظ الكتب مباشرة على المستودع
   يستخدم Personal Access Token من GitHub (يُحفظ محلياً فقط)
   ============================================================ */

const GHSAVE = {
    OWNER: 'tsallabi',
    REPO: 'TAYBAA-LIBRARY',
    FILE: 'data/books-sample.json',
    BRANCH: 'main',
    TOKEN_KEY: 'taybaa-gh-token',

    getToken() {
        return localStorage.getItem(this.TOKEN_KEY);
    },

    setToken(token) {
        if (token) localStorage.setItem(this.TOKEN_KEY, token);
        else localStorage.removeItem(this.TOKEN_KEY);
    },

    hasToken() {
        return !!this.getToken();
    },

    async _api(path, options = {}) {
        const token = this.getToken();
        if (!token) throw new Error('NO_TOKEN');
        const base = `https://api.github.com/repos/${this.OWNER}/${this.REPO}`;
        const url = path ? `${base}/${path}` : base;
        const res = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...(options.headers || {})
            }
        });
        if (!res.ok) {
            const errText = await res.text();
            const err = new Error(`GH_${res.status}`);
            err.status = res.status;
            err.body = errText;
            throw err;
        }
        return await res.json();
    },

    async testToken() {
        try {
            // نختبر بقراءة الملف الذي سنعدّله — هذا يتحقق من Token + الصلاحيات + الوصول للمستودع
            await this._api(`contents/${this.FILE}?ref=${this.BRANCH}`);
            return { ok: true };
        } catch (err) {
            return {
                ok: false,
                status: err.status || 0,
                body: err.body || err.message || ''
            };
        }
    },

    async getBooksFile() {
        const data = await this._api(`contents/${this.FILE}?ref=${this.BRANCH}`);
        const raw = atob(data.content.replace(/\s/g, ''));
        const text = decodeURIComponent(escape(raw));
        return { json: JSON.parse(text), sha: data.sha };
    },

    async saveBooksFile(json, sha, message) {
        const text = JSON.stringify(json, null, 2);
        const content = btoa(unescape(encodeURIComponent(text)));
        return await this._api(`contents/${this.FILE}`, {
            method: 'PUT',
            body: JSON.stringify({
                message: message || 'admin: update books',
                content,
                sha,
                branch: this.BRANCH
            })
        });
    },

    async upsertBook(bookData) {
        const { json, sha } = await this.getBooksFile();
        const id = String(bookData.id || Date.now());
        const newBook = { ...bookData, id };
        const idx = json.books.findIndex(b => String(b.id) === id);
        const isUpdate = idx >= 0;
        if (isUpdate) {
            json.books[idx] = { ...json.books[idx], ...newBook };
        } else {
            json.books.push(newBook);
        }
        const msg = `admin: ${isUpdate ? 'update' : 'add'} "${newBook.title}"`;
        await this.saveBooksFile(json, sha, msg);
        return { ...newBook, action: isUpdate ? 'updated' : 'created' };
    },

    async deleteBook(id) {
        const { json, sha } = await this.getBooksFile();
        const book = json.books.find(b => String(b.id) === String(id));
        if (!book) throw new Error('Book not found');
        json.books = json.books.filter(b => String(b.id) !== String(id));
        await this.saveBooksFile(json, sha, `admin: delete "${book.title}"`);
        return book;
    }
};
