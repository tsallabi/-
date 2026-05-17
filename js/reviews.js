/**
 * نظام التقييمات — المكتبة الطيبة (Wave 3)
 * =====================================================
 * المخزن الحالي: localStorage مفتاح taybaa-reviews-{bookId}
 * خطة الترقية: نقل إلى Cloudflare KV عند توفّر متغيّر البيئة
 *
 * شكل البيانات:
 * { id, bookId, userId, userName, rating: 1-5, text, createdAt }
 */

const REVIEWS = (function () {
  'use strict';

  /* ── Storage helpers ──────────────────────────────────────── */
  // TODO (KV): replace lsKey reads/writes with fetch('/api/reviews/:bookId')
  function lsKey(bookId) { return `taybaa-reviews-${bookId}`; }

  function getAll(bookId) {
    try { return JSON.parse(localStorage.getItem(lsKey(bookId)) || '[]'); }
    catch { return []; }
  }

  function save(bookId, arr) {
    localStorage.setItem(lsKey(bookId), JSON.stringify(arr));
  }

  function addReview(bookId, rating, text) {
    const user = (typeof USER !== 'undefined' && USER.current()) || null;
    if (!user) return null;
    const review = {
      id: `rv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      bookId: String(bookId),
      userId: user.username,
      userName: user.displayName || user.username,
      rating: Math.min(5, Math.max(1, Number(rating))),
      text: String(text).trim(),
      createdAt: new Date().toISOString()
    };
    const all = getAll(bookId);
    // One review per user per book
    const idx = all.findIndex(r => r.userId === user.username);
    if (idx >= 0) all[idx] = review; else all.push(review);
    save(bookId, all);

    // Fire achievement on first-ever review
    try {
      const anyPrior = Object.keys(localStorage)
        .filter(k => k.startsWith('taybaa-reviews-'))
        .map(k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } })
        .flat()
        .filter(r => r.userId === user.username);
      if (anyPrior.length <= 1 && typeof ACHIEVEMENTS !== 'undefined') {
        ACHIEVEMENTS.trigger('first-review');
      }
    } catch (_) {}

    return review;
  }

  function average(bookId) {
    const reviews = getAll(bookId);
    if (!reviews.length) return { avg: 0, count: 0 };
    const sum = reviews.reduce((s, r) => s + (r.rating || 0), 0);
    return { avg: Math.round((sum / reviews.length) * 10) / 10, count: reviews.length };
  }

  /* ── Render helpers ───────────────────────────────────────── */
  function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  function renderStars(n, interactive, name) {
    n = Number(n) || 0;
    if (interactive) {
      return [1, 2, 3, 4, 5].map(i => `
        <button type="button" class="rv-star-btn" data-val="${i}"
          aria-label="${i} نجوم" aria-pressed="${i <= n}"
          style="color:${i <= n ? '#B89968' : '#c8b89a'};">
          ★
        </button>`).join('');
    }
    const full = Math.round(n);
    return [1, 2, 3, 4, 5].map(i =>
      `<span style="color:${i <= full ? '#B89968' : '#c8b89a'};">★</span>`
    ).join('');
  }

  function avatarHtml(name) {
    const letter = (name || '؟')[0] || '؟';
    const colors = ['#B1373F','#5a7a3a','#2a5298','#7a4a1e','#3a6a7a'];
    const color = colors[name.charCodeAt(0) % colors.length];
    return `<div class="rv-avatar" style="background:${color};" aria-hidden="true">${escHtml(letter)}</div>`;
  }

  function renderReview(r) {
    const date = r.createdAt
      ? new Date(r.createdAt).toLocaleDateString('ar-LY', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';
    return `
      <div class="rv-item" data-review-id="${escHtml(r.id)}">
        <div class="rv-item-header">
          ${avatarHtml(r.userName)}
          <div class="rv-item-meta">
            <span class="rv-item-name">${escHtml(r.userName)}</span>
            <span class="rv-item-stars">${renderStars(r.rating, false)}</span>
          </div>
          <span class="rv-item-date">${escHtml(date)}</span>
        </div>
        ${r.text ? `<p class="rv-item-text">${escHtml(r.text)}</p>` : ''}
      </div>`;
  }

  /* ── Main render function ─────────────────────────────────── */
  function render(containerId, bookId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const user = (typeof USER !== 'undefined' && USER.current()) || null;
    const reviews = getAll(bookId);
    const { avg, count } = average(bookId);
    const userReview = user ? reviews.find(r => r.userId === user.username) : null;

    container.innerHTML = `
      <section class="rv-panel" aria-labelledby="rv-heading">

        <!-- Header -->
        <div class="rv-header">
          <h2 class="rv-heading" id="rv-heading">ماذا قال القرّاء عن هذا الكتاب؟</h2>
          ${count > 0 ? `
            <div class="rv-avg" aria-label="متوسط التقييم ${avg} من 5 بناء على ${count} تقييم">
              <span class="rv-avg-score">${avg}</span>
              <span class="rv-avg-stars">${renderStars(avg, false)}</span>
              <span class="rv-avg-count">من ${count} تقييم</span>
            </div>` : ''}
        </div>

        <!-- Review list -->
        <div class="rv-list" id="rv-list-${bookId}">
          ${reviews.length
            ? reviews.slice().reverse().map(renderReview).join('')
            : '<p class="rv-empty">لم يُكتب أيّ تقييم بعد. كن أوّل من يُشارك رأيه!</p>'}
        </div>

        <!-- Write form -->
        ${user ? `
          <div class="rv-form-wrap" id="rv-form-wrap">
            <h3 class="rv-form-title">اكتب رأيك</h3>
            ${userReview ? '<p class="rv-edit-note">لقد قيّمت هذا الكتاب من قبل — يمكنك تحديث تقييمك أدناه.</p>' : ''}
            <form class="rv-form" id="rv-form" novalidate>
              <div class="rv-star-picker" role="group" aria-label="اختر عدد النجوم">
                ${renderStars(userReview?.rating || 0, true)}
              </div>
              <p class="rv-star-hint" id="rv-star-hint">اختر تقييمك</p>
              <textarea class="rv-textarea" id="rv-textarea" rows="4"
                placeholder="شاركنا رأيك في الكتاب..." maxlength="2000"
                aria-label="نص تقييمك">${escHtml(userReview?.text || '')}</textarea>
              <div class="rv-form-footer">
                <span class="rv-char-count" id="rv-char-count">0 / 2000</span>
                <button type="submit" class="rv-submit-btn" id="rv-submit-btn" disabled>
                  ${userReview ? '✏️ تحديث التقييم' : '⭐ نشر التقييم'}
                </button>
              </div>
              <p class="rv-form-error" id="rv-form-error" hidden></p>
            </form>
          </div>` : `
          <p class="rv-login-prompt">
            <a href="#" class="rv-login-link" id="rv-login-link">سجّل دخولك</a>
            لتتمكّن من كتابة تقييمك.
          </p>`
        }
      </section>
    `;

    /* ── Bind star picker ───────────────────────────────────── */
    let selectedRating = userReview?.rating || 0;
    const submitBtn = container.querySelector('#rv-submit-btn');
    const starHint = container.querySelector('#rv-star-hint');
    const textarea = container.querySelector('#rv-textarea');
    const charCount = container.querySelector('#rv-char-count');
    const formError = container.querySelector('#rv-form-error');
    const LABELS = ['', 'ضعيف', 'مقبول', 'جيّد', 'ممتاز', 'رائع!'];

    function refreshStarUI() {
      container.querySelectorAll('.rv-star-btn').forEach(btn => {
        const v = Number(btn.dataset.val);
        btn.style.color = v <= selectedRating ? '#B89968' : '#c8b89a';
        btn.setAttribute('aria-pressed', v <= selectedRating ? 'true' : 'false');
      });
      if (starHint) starHint.textContent = selectedRating ? LABELS[selectedRating] : 'اختر تقييمك';
      updateSubmitState();
    }

    function updateSubmitState() {
      if (!submitBtn) return;
      const hasText = textarea ? textarea.value.trim().length > 0 : false;
      submitBtn.disabled = selectedRating === 0 || !hasText;
    }

    container.querySelectorAll('.rv-star-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedRating = Number(btn.dataset.val);
        refreshStarUI();
      });
      btn.addEventListener('mouseenter', () => {
        const v = Number(btn.dataset.val);
        container.querySelectorAll('.rv-star-btn').forEach(b => {
          b.style.color = Number(b.dataset.val) <= v ? '#d4af37' : '#c8b89a';
        });
      });
      btn.addEventListener('mouseleave', refreshStarUI);
      btn.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectedRating = Number(btn.dataset.val); refreshStarUI(); }
      });
    });

    if (selectedRating) refreshStarUI();

    if (textarea) {
      textarea.addEventListener('input', () => {
        const len = textarea.value.length;
        if (charCount) charCount.textContent = `${len} / 2000`;
        updateSubmitState();
      });
      // Init char count
      if (charCount) charCount.textContent = `${textarea.value.length} / 2000`;
    }

    /* ── Form submit ────────────────────────────────────────── */
    const form = container.querySelector('#rv-form');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        if (!selectedRating) { if (formError) { formError.textContent = 'الرجاء اختيار عدد النجوم.'; formError.hidden = false; } return; }
        const text = textarea?.value.trim() || '';
        if (!text) { if (formError) { formError.textContent = 'الرجاء كتابة نص التقييم.'; formError.hidden = false; } return; }

        const rev = addReview(bookId, selectedRating, text);
        if (rev) {
          // Re-render with updated data
          render(containerId, bookId);
          // Scroll to new review
          setTimeout(() => {
            const el = document.getElementById(`rv-list-${bookId}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 80);
        }
      });
    }

    /* ── Login link ─────────────────────────────────────────── */
    const loginLink = container.querySelector('#rv-login-link');
    if (loginLink) {
      loginLink.addEventListener('click', e => {
        e.preventDefault();
        // Try to open the profile menu on the page if it exists
        const profileBtn = document.getElementById('profileBtn');
        if (profileBtn) profileBtn.click();
      });
    }
  }

  /* ── Public API ───────────────────────────────────────────── */
  return { render, getAll, addReview, average };
})();
