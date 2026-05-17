/**
 * admin-role.js — Admin role detection + per-book hide list + restricted-category gate
 *
 * v=27. Loaded on v2.html, book.html, category.html.
 *
 * NOTE: This module is intentionally NAMED admin-role.js (not admin.js) because
 * /js/admin.js is already used by /admin.html as the dashboard logic. Naming
 * collides break the existing dashboard.
 *
 * Public globals exposed on window:
 *   window.IS_ADMIN                  — boolean (set asynchronously)
 *   window.ADMIN_ROLE.ready          — Promise that resolves once config has loaded
 *   window.adminHideBook(bookId)     — adds bookId to user's local hidden list + POSTs to /api/admin/hide
 *   window.adminUnhideBook(bookId)   — removes from local hidden list
 *   window.isBookHidden(bookId)      — true if bookId is in user list OR global hiddenBooks from config
 *   window.canSeeRestrictedCategory(catName) — true for admins / allowlisted emails
 *
 * Data sources:
 *   /data/admin-config.json   — { adminEmails, hiddenBooks, restrictedCategories, categoryAllowedEmails }
 *   localStorage['taybaa-hidden-books']  — Array<string> of book IDs hidden per-device
 */
(function () {
  'use strict';

  const CONFIG_PATH = '/data/admin-config.json';
  const LS_KEY = 'taybaa-hidden-books';

  /* ─── Local hidden-list helpers ───────────────────────────────── */
  function getLocalHiddenSet() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch (_) { return new Set(); }
  }
  function saveLocalHiddenSet(set) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(Array.from(set)));
    } catch (_) {}
  }

  /* ─── Current Firebase / local user email helper ──────────────── */
  function getCurrentEmail() {
    try {
      if (typeof firebase !== 'undefined' &&
          firebase.auth &&
          firebase.auth().currentUser &&
          firebase.auth().currentUser.email) {
        return String(firebase.auth().currentUser.email).toLowerCase();
      }
    } catch (_) {}
    try {
      if (typeof USER !== 'undefined' && USER.current) {
        const u = USER.current();
        if (u && u.email) return String(u.email).toLowerCase();
      }
    } catch (_) {}
    return '';
  }

  /* ─── Module state ────────────────────────────────────────────── */
  let _config = {
    adminEmails: [],
    hiddenBooks: [],
    restrictedCategories: [],
    categoryAllowedEmails: []
  };

  /* ─── Fetch config + decide admin status ──────────────────────── */
  async function loadConfig() {
    try {
      const r = await fetch(CONFIG_PATH + '?t=' + Date.now());
      if (!r.ok) return;
      const data = await r.json();
      _config.adminEmails = (data.adminEmails || []).map(e => String(e).toLowerCase());
      _config.hiddenBooks = (data.hiddenBooks || []).map(String);
      _config.restrictedCategories = data.restrictedCategories || [];
      _config.categoryAllowedEmails = (data.categoryAllowedEmails || []).map(e => String(e).toLowerCase());
    } catch (err) {
      console.warn('[admin-role] could not load admin-config.json', err);
    }
    const email = getCurrentEmail();
    window.IS_ADMIN = email && _config.adminEmails.includes(email);
  }

  const ready = loadConfig();

  /* ─── Public hide/unhide helpers ──────────────────────────────── */
  function isBookHidden(bookId) {
    if (!bookId) return false;
    const id = String(bookId);
    if (_config.hiddenBooks.includes(id)) return true;
    const local = getLocalHiddenSet();
    return local.has(id);
  }

  function adminHideBook(bookId) {
    if (!bookId) return;
    const id = String(bookId);
    const set = getLocalHiddenSet();
    if (set.has(id)) return; // already hidden
    set.add(id);
    saveLocalHiddenSet(set);

    // Fire-and-forget POST to admin API stub
    try {
      fetch('/api/admin/hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: id, by: getCurrentEmail() || 'unknown', action: 'hide' })
      }).catch(() => {});
    } catch (_) {}
  }

  function adminUnhideBook(bookId) {
    if (!bookId) return;
    const id = String(bookId);
    const set = getLocalHiddenSet();
    if (!set.has(id)) return;
    set.delete(id);
    saveLocalHiddenSet(set);
    try {
      fetch('/api/admin/hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: id, by: getCurrentEmail() || 'unknown', action: 'unhide' })
      }).catch(() => {});
    } catch (_) {}
  }

  /* ─── Restricted category gate ────────────────────────────────── */
  function canSeeRestrictedCategory(catName) {
    if (!catName) return true;
    // If the category isn't restricted at all, everyone can see it
    if (!_config.restrictedCategories.includes(catName)) return true;
    if (window.IS_ADMIN) return true;
    const email = getCurrentEmail();
    if (email && _config.categoryAllowedEmails.includes(email)) return true;
    return false;
  }

  /* ─── Convenience: filter a list of books for the current user ─ */
  function filterBooksForCurrentUser(books) {
    if (!Array.isArray(books)) return [];
    const isAdmin = !!window.IS_ADMIN;
    return books.filter(b => {
      if (!b) return false;
      // Restricted category gate
      if (b.category && !canSeeRestrictedCategory(b.category)) return false;
      // Hidden books — admins still see them (so they can unhide), others don't
      if (!isAdmin && isBookHidden(b.id)) return false;
      return true;
    });
  }

  /* ─── Expose globals ──────────────────────────────────────────── */
  window.IS_ADMIN = false;
  window.ADMIN_ROLE = {
    ready,
    config: () => Object.assign({}, _config),
    refresh: loadConfig,
    filterBooksForCurrentUser
  };
  window.adminHideBook = adminHideBook;
  window.adminUnhideBook = adminUnhideBook;
  window.isBookHidden = isBookHidden;
  window.canSeeRestrictedCategory = canSeeRestrictedCategory;
  window.filterBooksForCurrentUser = filterBooksForCurrentUser;

  /* ─── Indicate readiness via a custom event for late listeners ─ */
  ready.then(() => {
    try {
      document.dispatchEvent(new CustomEvent('admin-role:ready', {
        detail: { isAdmin: !!window.IS_ADMIN }
      }));
    } catch (_) {}
  });
})();
