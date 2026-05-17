/**
 * نظام الإنجازات — المكتبة الطيبة (Wave 3)
 * =====================================================
 * المخزن: localStorage مفتاح taybaa-achievements-{userId}
 * واجهة عامة: window.ACHIEVEMENTS.trigger(id)
 *
 * لاستدعاء الإنجازات من أي صفحة:
 *   ACHIEVEMENTS.trigger('first-fav');
 *   ACHIEVEMENTS.trigger('first-read');
 *   ... إلخ
 */

const ACHIEVEMENTS = (function () {
  'use strict';

  /* ── Catalogue ─────────────────────────────────────────────── */
  const CATALOGUE = [
    { id: 'first-fav',      icon: '🌱', title: 'أوّل كتاب في المفضّلة',       desc: 'أضفتَ أوّل كتاب لمفضّلتك — بداية مكتبتك الخاصة!' },
    { id: 'first-read',     icon: '📖', title: 'أوّل كتاب مُكتمَل',           desc: 'أنهيتَ قراءة كتاب كاملاً — هنيئاً!' },
    { id: 'streak-3',       icon: '🔥', title: 'ثلاثة أيّام متتالية',         desc: 'قرأتَ ثلاثة أيّام متتالية — استمر!' },
    { id: 'streak-7',       icon: '🌿', title: 'أسبوع كامل من القراءة',       desc: 'سبعة أيّام متتالية — أنتَ قارئ حقيقيّ!' },
    { id: 'five-cats',      icon: '📚', title: 'خمس فئات مختلفة',             desc: 'استكشفتَ خمسة فروع معرفيّة!' },
    { id: 'first-note',     icon: '✍️', title: 'أوّل ملاحظة',                 desc: 'سجّلتَ أوّل فكرة — الكتابة بداية الحكمة.' },
    { id: 'hl-yellow',      icon: '🎨', title: 'التظليل الأصفر',              desc: 'استخدمتَ التظليل الأصفر لأوّل مرّة.' },
    { id: 'hl-green',       icon: '🎨', title: 'التظليل الأخضر',              desc: 'استخدمتَ التظليل الأخضر لأوّل مرّة.' },
    { id: 'hl-blue',        icon: '🎨', title: 'التظليل الأزرق',              desc: 'استخدمتَ التظليل الأزرق لأوّل مرّة.' },
    { id: 'hl-red',         icon: '🎨', title: 'التظليل الأحمر',              desc: 'استخدمتَ التظليل الأحمر لأوّل مرّة.' },
    { id: 'first-review',   icon: '⭐', title: 'أوّل تقييم',                  desc: 'شاركتَ رأيك في كتاب — صوتٌ يُسمع.' },
    { id: 'arch-10',        icon: '🏛️', title: 'قوس طرابلس x10',             desc: 'زرتَ الصفحة الرئيسيّة عشر مرّات!' },
    { id: 'century-19',     icon: '📜', title: 'كنز القرن التاسع عشر',         desc: 'قرأتَ كتاباً صدر قبل عام 1900 — رحلة عبر الزمن.' },
    { id: 'midnight',       icon: '🌙', title: 'قراءة منتصف الليل',           desc: 'فتحتَ كتاباً بعد منتصف الليل — الهدوء يُلهم.' },
    { id: 'predawn',        icon: '☀️', title: 'قراءة قبل الفجر',             desc: 'قرأتَ قبل الفجر — ساعة البركة.' }
  ];

  /* ── Storage ───────────────────────────────────────────────── */
  // TODO (KV): migrate to Cloudflare KV when env.ACHIEVEMENTS_KV available
  function lsKey() {
    const u = (typeof USER !== 'undefined' && USER.current()) || null;
    return `taybaa-achievements-${u ? u.username : 'anon'}`;
  }

  function getEarned() {
    try { return JSON.parse(localStorage.getItem(lsKey()) || '[]'); }
    catch { return []; }
  }

  function markEarned(id) {
    const earned = getEarned();
    if (earned.find(e => e.id === id)) return false; // already earned
    earned.push({ id, earnedAt: new Date().toISOString() });
    try { localStorage.setItem(lsKey(), JSON.stringify(earned)); } catch (_) {}
    return true;
  }

  function hasEarned(id) { return getEarned().some(e => e.id === id); }

  /* ── Toast celebration ─────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('ach-styles')) return;
    const style = document.createElement('style');
    style.id = 'ach-styles';
    style.textContent = `
      .ach-toast {
        position: fixed;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%) translateY(120%);
        z-index: 9999;
        background: linear-gradient(135deg, #2a1810 0%, #1a0f08 100%);
        border: 1.5px solid #B89968;
        border-radius: 20px;
        padding: 1.25rem 1.75rem;
        display: flex;
        align-items: center;
        gap: 1rem;
        box-shadow: 0 12px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(184,153,104,.25);
        min-width: min(90vw, 340px);
        max-width: 400px;
        transition: transform .45s cubic-bezier(.34,1.56,.64,1), opacity .35s ease;
        opacity: 0;
        direction: rtl;
        font-family: 'Cairo', system-ui, sans-serif;
      }
      .ach-toast.show {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }
      @media (prefers-reduced-motion: reduce) {
        .ach-toast { transition: opacity .2s ease; transform: translateX(-50%) !important; }
      }
      .ach-toast-sparkle {
        font-size: 2.2rem;
        flex-shrink: 0;
        filter: drop-shadow(0 0 8px rgba(184,153,104,.8));
        animation: ach-spin 1.2s ease-out 1;
      }
      @keyframes ach-spin {
        0%   { transform: scale(0) rotate(-20deg); }
        60%  { transform: scale(1.3) rotate(10deg); }
        100% { transform: scale(1) rotate(0deg); }
      }
      @media (prefers-reduced-motion: reduce) { .ach-toast-sparkle { animation: none; } }
      .ach-toast-body { flex: 1; }
      .ach-toast-label {
        font-size: .7rem;
        font-weight: 700;
        letter-spacing: .12em;
        color: #B89968;
        margin-bottom: .2rem;
        font-family: 'Reem Kufi', 'Cairo', sans-serif;
      }
      .ach-toast-title {
        font-family: 'Aref Ruqaa', 'Amiri', serif;
        font-size: 1.1rem;
        font-weight: 700;
        color: #FAF6EE;
        margin-bottom: .25rem;
      }
      .ach-toast-desc {
        font-size: .82rem;
        color: rgba(250,246,238,.7);
        line-height: 1.5;
      }
      /* Gold confetti pattern overlay */
      .ach-toast::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 20px;
        background-image:
          radial-gradient(circle, rgba(184,153,104,.18) 1px, transparent 1px);
        background-size: 14px 14px;
        pointer-events: none;
      }
      /* Badge card used in إنجازاتي tab */
      .ach-badge {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: .5rem;
        padding: 1.25rem 1rem;
        background: linear-gradient(135deg, rgba(250,246,238,.06), rgba(184,153,104,.08));
        border: 1px solid rgba(184,153,104,.3);
        border-radius: 16px;
        text-align: center;
        transition: transform .2s, border-color .2s;
      }
      .ach-badge:hover { transform: translateY(-3px); border-color: #B89968; }
      .ach-badge.locked { opacity: .35; filter: grayscale(.8); }
      .ach-badge-icon { font-size: 2rem; }
      .ach-badge-title {
        font-family: 'Aref Ruqaa', 'Amiri', serif;
        font-size: .9rem;
        color: var(--text, #0F1B2D);
        font-weight: 700;
      }
      .ach-badge-desc {
        font-size: .75rem;
        color: var(--text-muted, #5a6a7a);
        line-height: 1.45;
        font-family: 'Cairo', sans-serif;
      }
      .ach-badge-date {
        font-size: .7rem;
        color: #B89968;
        font-family: 'Reem Kufi', sans-serif;
      }
    `;
    document.head.appendChild(style);
  }

  function showToast(achievement) {
    injectStyles();
    // Remove any existing toast
    document.querySelectorAll('.ach-toast').forEach(el => el.remove());

    const toast = document.createElement('div');
    toast.className = 'ach-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
      <span class="ach-toast-sparkle" aria-hidden="true">${achievement.icon}</span>
      <div class="ach-toast-body">
        <div class="ach-toast-label">🏅 إنجاز جديد مُحرَز!</div>
        <div class="ach-toast-title">${achievement.title}</div>
        <div class="ach-toast-desc">${achievement.desc}</div>
      </div>
    `;
    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('show'));
    });

    // Animate out after 4s
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 500);
    }, 4000);
  }

  /* ── Public trigger ─────────────────────────────────────────── */
  function trigger(id) {
    const def = CATALOGUE.find(a => a.id === id);
    if (!def) return;
    const isNew = markEarned(id);
    if (isNew) showToast(def);
  }

  /* ── Automatic readers for reader.html events ───────────────── */
  function hookReaderEvents() {
    /* Midnight / pre-dawn reading */
    const h = new Date().getHours();
    if (h >= 0 && h < 4) trigger('midnight');
    if (h >= 4 && h < 6) trigger('predawn');

    /* Listen for messages from reader-luxury.js */
    window.addEventListener('taybaa:note-saved', () => trigger('first-note'));
    window.addEventListener('taybaa:highlight', e => {
      const color = e.detail?.color;
      if (color === 'yellow') trigger('hl-yellow');
      if (color === 'green')  trigger('hl-green');
      if (color === 'blue')   trigger('hl-blue');
      if (color === 'red')    trigger('hl-red');
    });
    window.addEventListener('taybaa:book-finished', e => {
      trigger('first-read');
      // Check publication year for century-19
      const year = e.detail?.year;
      if (year && Number(year) < 1900) trigger('century-19');
    });
  }

  /* ── Homepage visit counter (arch-10) ──────────────────────── */
  function bumpArchVisit() {
    const k = 'taybaa-arch-visits';
    const n = (Number(localStorage.getItem(k)) || 0) + 1;
    localStorage.setItem(k, String(n));
    if (n >= 10) trigger('arch-10');
  }

  /* ── Streak hook (called from sanctuary.js / reader) ────────── */
  function checkStreak() {
    // Reads sanctuary streak via SANCTUARY global if available
    const streak = (typeof SANCTUARY !== 'undefined' && SANCTUARY.getStreak)
      ? SANCTUARY.getStreak() : 0;
    if (streak >= 3) trigger('streak-3');
    if (streak >= 7) trigger('streak-7');
  }

  /* ── Category explorer ──────────────────────────────────────── */
  function trackCategory(category) {
    if (!category) return;
    const k = 'taybaa-read-categories';
    let cats = [];
    try { cats = JSON.parse(localStorage.getItem(k) || '[]'); } catch { cats = []; }
    if (!cats.includes(category)) {
      cats.push(category);
      localStorage.setItem(k, JSON.stringify(cats));
    }
    if (cats.length >= 5) trigger('five-cats');
  }

  /* ── Render badge grid ──────────────────────────────────────── */
  function renderGrid(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    injectStyles();
    const earned = getEarned();
    const earnedMap = {};
    earned.forEach(e => { earnedMap[e.id] = e.earnedAt; });

    container.innerHTML = CATALOGUE.map(a => {
      const earnedAt = earnedMap[a.id];
      const dateStr = earnedAt
        ? new Date(earnedAt).toLocaleDateString('ar-LY', { year: 'numeric', month: 'long', day: 'numeric' })
        : '';
      return `
        <div class="ach-badge${earnedAt ? '' : ' locked'}" title="${a.desc}">
          <span class="ach-badge-icon" aria-hidden="true">${a.icon}</span>
          <span class="ach-badge-title">${a.title}</span>
          <span class="ach-badge-desc">${a.desc}</span>
          ${earnedAt ? `<span class="ach-badge-date">${dateStr}</span>` : '<span class="ach-badge-date">لم يُحرَز بعد</span>'}
        </div>`;
    }).join('');
  }

  /* ── Init ───────────────────────────────────────────────────── */
  function init() {
    injectStyles();
    // If on reader page, hook events
    if (document.getElementById('pdfCanvas')) hookReaderEvents();
    // If on homepage, bump arch visit
    if (location.pathname.endsWith('v2.html') || location.pathname === '/' || location.pathname.endsWith('index.html')) bumpArchVisit();
  }

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    trigger,
    hasEarned,
    getEarned,
    renderGrid,
    trackCategory,
    checkStreak,
    bumpArchVisit,
    catalogue: CATALOGUE
  };
})();
