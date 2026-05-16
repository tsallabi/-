/**
 * sanctuary.js — واحة القراءة · المكتبة الطيبة
 * Reading Sanctuary wellness layer · RTL Arabic · v=24
 *
 * Features:
 *  A) Reading Goal + gold SVG progress ring
 *  B) Reading Streak tracker
 *  C) Ambient Sounds panel (UI ready — audio assets need CDN URLs)
 *  D) Slow Read / تأمّل auto-scroll mode
 *  E) Breathing Cue (4-7-8 pattern)
 *  F) End-of-Session Reflection overlay
 *  G) Public SANCTUARY API for sanctuary.html dashboard
 *
 * Zero dependencies · Pure vanilla JS · localStorage only
 * Respects prefers-reduced-motion throughout
 */
(function () {
  'use strict';

  /* ─── Reduced-motion detection ──────────────────────────────── */
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ─── localStorage helpers ──────────────────────────────────── */
  function lsGet(key, def) {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : def; }
    catch { return def; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
  }

  /* ─── Date helpers ──────────────────────────────────────────── */
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function dayKey(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /* ─── URL param helpers ─────────────────────────────────────── */
  const _params = new URLSearchParams(location.search);
  const _bookId = _params.get('id') || _params.get('bookId') || '';
  const _bookTitle = decodeURIComponent(_params.get('title') || 'هذا الكتاب');

  /* ═══════════════════════════════════════════════════════════════
   * A) READING GOAL
   * ═══════════════════════════════════════════════════════════════ */
  const GOAL_KEY = 'taybaa-goal-target';
  const GOAL_DEFAULT = 20; // minutes

  function goalTarget() { return lsGet(GOAL_KEY, GOAL_DEFAULT); }
  function goalSetTarget(m) { lsSet(GOAL_KEY, Math.max(1, Math.min(300, m))); }

  function goalTodayKey() { return `taybaa-goal-${todayKey()}`; }
  function goalTodayMinutes() { return lsGet(goalTodayKey(), 0); }
  function goalAddMinutes(m) {
    const cur = goalTodayMinutes();
    const next = cur + m;
    lsSet(goalTodayKey(), next);
    // Check if we just crossed the threshold — mark goal met
    if (cur < goalTarget() && next >= goalTarget()) {
      _markGoalMetToday();
    }
    return next;
  }

  function _markGoalMetToday() {
    lsSet(`taybaa-goal-met-${todayKey()}`, true);
    // Recalculate streak
    _updateStreak();
  }

  function goalMetToday() { return !!lsGet(`taybaa-goal-met-${todayKey()}`, false); }

  /* SVG Ring rendering — pure inline SVG, no external assets */
  function buildGoalRing(pct, size) {
    size = size || 72;
    const r = (size / 2) - 6;
    const circ = 2 * Math.PI * r;
    const filled = Math.min(1, pct) * circ;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img"
      aria-label="تقدم الهدف اليومي: ${Math.round(pct * 100)}%">
      <circle cx="${size/2}" cy="${size/2}" r="${r}"
        fill="none" stroke="rgba(184,153,104,.2)" stroke-width="5"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}"
        fill="none" stroke="#B89968" stroke-width="5"
        stroke-linecap="round"
        stroke-dasharray="${circ}"
        stroke-dashoffset="${circ - filled}"
        transform="rotate(-90 ${size/2} ${size/2})"
        style="transition:stroke-dashoffset .6s ease;"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="Reem Kufi,Cairo,sans-serif" font-size="${size * 0.2}px"
        fill="#B89968" font-weight="700">${Math.round(pct * 100)}%</text>
    </svg>`;
  }

  /* ═══════════════════════════════════════════════════════════════
   * B) READING STREAK
   * ═══════════════════════════════════════════════════════════════ */
  const STREAK_KEY = 'taybaa-streak';

  function _updateStreak() {
    let streak = 0;
    for (let i = 0; i >= -365; i--) {
      const met = lsGet(`taybaa-goal-met-${dayKey(i)}`, false);
      if (met) streak++;
      else if (i < 0) break; // gap — stop counting backwards
    }
    lsSet(STREAK_KEY, streak);
    return streak;
  }

  function getStreak() { return lsGet(STREAK_KEY, 0); }

  /* ═══════════════════════════════════════════════════════════════
   * C) AMBIENT SOUNDS
   * ═══════════════════════════════════════════════════════════════ */
  /*
   * AUDIO ASSETS NOTE:
   * The URLs below are placeholder paths. Replace them with real CDN URLs
   * of royalty-free audio files before deploying to production.
   *
   * Recommended sources (all royalty-free):
   *   - https://freesound.org  (Creative Commons)
   *   - https://pixabay.com/sound-effects/
   *   - Self-hosted in /assets/sounds/
   *
   * TODO (assets team): upload .mp3 files to /assets/sounds/ and update these paths:
   */
  const AMBIENT_TRACKS = [
    { id: 'rain',     label: 'مطر هادئ',       icon: '🌧️', src: '/assets/sounds/rain.mp3' },
    { id: 'fountain', label: 'نافورة',          icon: '⛲', src: '/assets/sounds/fountain.mp3' },
    { id: 'page',     label: 'صفحة تُقلب',      icon: '📜', src: '/assets/sounds/page-turn.mp3' },
    { id: 'doves',    label: 'حمام أندلسي',     icon: '🕊️', src: '/assets/sounds/doves.mp3' },
    { id: 'silence',  label: 'صمت',             icon: '🔇', src: null }
  ];

  let _ambientActive = null; // track id
  const _audioEls = {};

  function _getAudio(trackId) {
    if (!_audioEls[trackId]) {
      const track = AMBIENT_TRACKS.find(t => t.id === trackId);
      if (!track || !track.src) return null;
      const a = document.createElement('audio');
      a.src = track.src;
      a.loop = true;
      a.volume = 0.35;
      a.preload = 'none';
      _audioEls[trackId] = a;
    }
    return _audioEls[trackId];
  }

  function ambientPlay(trackId) {
    // Stop previous
    if (_ambientActive && _ambientActive !== trackId) {
      const prev = _getAudio(_ambientActive);
      if (prev) { prev.pause(); prev.currentTime = 0; }
    }
    _ambientActive = trackId === 'silence' ? null : trackId;
    if (trackId === 'silence' || !trackId) {
      _ambientActive = null;
      lsSet('taybaa-ambient', null);
      return;
    }
    lsSet('taybaa-ambient', trackId);
    const audio = _getAudio(trackId);
    if (audio) {
      audio.play().catch(() => {
        // Autoplay blocked — show a gentle hint
        showSancToast('اضغط مرة أخرى لتشغيل الصوت');
      });
    }
  }

  function ambientSetVolume(v) {
    Object.values(_audioEls).forEach(a => { if (a) a.volume = v; });
    lsSet('taybaa-ambient-vol', v);
  }

  /* ═══════════════════════════════════════════════════════════════
   * D) SLOW READ / تأمّل MODE
   * ═══════════════════════════════════════════════════════════════ */
  let _slowReadActive = false;
  let _slowReadSpeed = 1; // px per second
  let _slowReadRaf = null;
  let _slowReadLast = null;

  function slowReadToggle() {
    _slowReadActive = !_slowReadActive;
    lsSet('taybaa-slow-read', _slowReadActive);
    if (_slowReadActive) {
      _startSlowRead();
    } else {
      _stopSlowRead();
    }
    _updateSlowReadBtn();
  }

  function _startSlowRead() {
    if (REDUCED) return; // respect prefers-reduced-motion — button is still active
    _slowReadLast = null;
    function tick(ts) {
      if (!_slowReadActive) return;
      if (_slowReadLast !== null) {
        const dt = (ts - _slowReadLast) / 1000;
        window.scrollBy({ top: _slowReadSpeed * dt * 60, behavior: 'instant' });
      }
      _slowReadLast = ts;
      _slowReadRaf = requestAnimationFrame(tick);
    }
    _slowReadRaf = requestAnimationFrame(tick);
  }

  function _stopSlowRead() {
    if (_slowReadRaf) { cancelAnimationFrame(_slowReadRaf); _slowReadRaf = null; }
    _slowReadLast = null;
  }

  function _updateSlowReadBtn() {
    const btn = document.getElementById('snc-slow-btn');
    if (!btn) return;
    btn.classList.toggle('snc-active', _slowReadActive);
    btn.title = _slowReadActive ? 'إيقاف وضع التأمّل' : 'وضع التأمّل — قراءة بطيئة';
    const lotus = btn.querySelector('.snc-lotus');
    if (lotus) lotus.classList.toggle('snc-pulse', _slowReadActive);
  }

  /* ═══════════════════════════════════════════════════════════════
   * E) BREATHING CUE (4-7-8 pattern)
   * ═══════════════════════════════════════════════════════════════ */
  let _breathShown = false;
  let _breathDisabled = lsGet('taybaa-breath-disabled', false);
  const BREATH_EVERY_N_PAGES = 10; // Show breathing cue every N pages

  function maybeShowBreath(pageNum) {
    if (_breathDisabled || _breathShown) return;
    if (pageNum !== 1 && pageNum % BREATH_EVERY_N_PAGES !== 0) return;
    _breathShown = true;
    _showBreathingOverlay();
    // Allow re-triggering after 5 min
    setTimeout(() => { _breathShown = false; }, 5 * 60 * 1000);
  }

  function _showBreathingOverlay() {
    if (REDUCED) return; // Honour prefers-reduced-motion
    const existing = document.getElementById('snc-breath-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'snc-breath-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'تمرين التنفس');
    overlay.innerHTML = `
      <div class="snc-breath-box">
        <div class="snc-breath-ring" id="snc-breath-ring"></div>
        <div class="snc-breath-text" id="snc-breath-text">استعدّ...</div>
        <div class="snc-breath-sub">تمرين التنفس ٤-٧-٨</div>
        <div class="snc-breath-actions">
          <button class="snc-btn snc-btn-ghost" id="snc-breath-skip">تخطّي</button>
          <button class="snc-btn snc-btn-ghost snc-breath-disable" id="snc-breath-disable">لا تُظهر مجدداً</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('snc-breath-skip').onclick = () => overlay.remove();
    document.getElementById('snc-breath-disable').onclick = () => {
      _breathDisabled = true;
      lsSet('taybaa-breath-disabled', true);
      overlay.remove();
    };

    // 4-7-8 cycle × 2
    const ring = document.getElementById('snc-breath-ring');
    const text = document.getElementById('snc-breath-text');
    const phases = [
      { label: 'استنشق...', dur: 4000,  cls: 'snc-inhale'  },
      { label: 'أمسك...',   dur: 7000,  cls: 'snc-hold'    },
      { label: 'أطلق...',   dur: 8000,  cls: 'snc-exhale'  },
      { label: 'استنشق...', dur: 4000,  cls: 'snc-inhale'  },
      { label: 'أمسك...',   dur: 7000,  cls: 'snc-hold'    },
      { label: 'أطلق...',   dur: 8000,  cls: 'snc-exhale'  }
    ];

    let delay = 800;
    phases.forEach(phase => {
      setTimeout(() => {
        if (!document.getElementById('snc-breath-overlay')) return;
        text.textContent = phase.label;
        ring.className = 'snc-breath-ring ' + phase.cls;
      }, delay);
      delay += phase.dur;
    });

    // Auto-dismiss after full cycle + small buffer
    setTimeout(() => {
      const el = document.getElementById('snc-breath-overlay');
      if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }
    }, delay + 600);
  }

  /* ═══════════════════════════════════════════════════════════════
   * F) END-OF-SESSION REFLECTION
   * ═══════════════════════════════════════════════════════════════ */
  const JOURNAL_KEY_PREFIX = 'taybaa-journal-';
  let _sessionShown = false;
  let _sessionMinutes = 0;

  function _journalKey() { return JOURNAL_KEY_PREFIX + _bookId + '-' + todayKey(); }

  function getJournal() {
    const entries = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(JOURNAL_KEY_PREFIX)) {
          const v = JSON.parse(localStorage.getItem(k));
          if (v) entries.push(v);
        }
      }
    } catch (_) {}
    return entries.sort((a, b) => b.ts - a.ts);
  }

  function _saveReflection(stars, note) {
    const entry = {
      bookId:    _bookId,
      bookTitle: _bookTitle,
      stars,
      note,
      minutes:   Math.round(_sessionMinutes),
      ts:        Date.now(),
      date:      todayKey()
    };
    lsSet(_journalKey(), entry);
    return entry;
  }

  function _showReflectionOverlay() {
    if (_sessionShown) return;
    if (_sessionMinutes < 2) return; // Only show after ≥ 2 min reading
    _sessionShown = true;

    const overlay = document.createElement('div');
    overlay.id = 'snc-reflect-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'تأمّل ختام الجلسة');

    const mins = Math.round(_sessionMinutes);
    overlay.innerHTML = `
      <div class="snc-reflect-box">
        <div class="snc-reflect-header">
          <span class="snc-reflect-icon">🌿</span>
          <h2 class="snc-reflect-title">جلسة قراءة جميلة</h2>
        </div>
        <p class="snc-reflect-time">قضيتَ <strong>${mins}</strong> دقيقة في كتاب<br><em class="snc-reflect-book">«${_bookTitle}»</em></p>
        <div class="snc-reflect-stars" id="snc-reflect-stars" role="group" aria-label="تقييم الكتاب">
          ${[1,2,3,4,5].map(n => `<button class="snc-star" data-star="${n}" aria-label="${n} نجوم">★</button>`).join('')}
        </div>
        <p class="snc-reflect-prompt">ما الفكرة التي بقيت معك؟</p>
        <textarea class="snc-reflect-ta" id="snc-reflect-ta"
          placeholder="اكتب تأمّلك هنا... (اختياري)"
          rows="3"></textarea>
        <div class="snc-reflect-actions">
          <button class="snc-btn snc-btn-ghost" id="snc-reflect-skip">تخطّي</button>
          <button class="snc-btn snc-btn-primary" id="snc-reflect-save">حفظ في يوميّاتي</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // Star interaction
    let _selectedStars = 0;
    const starBtns = overlay.querySelectorAll('.snc-star');
    starBtns.forEach(btn => {
      btn.addEventListener('mouseenter', () => _hoverStars(+btn.dataset.star, starBtns));
      btn.addEventListener('mouseleave', () => _hoverStars(_selectedStars, starBtns));
      btn.addEventListener('click', () => {
        _selectedStars = +btn.dataset.star;
        _hoverStars(_selectedStars, starBtns);
      });
    });

    document.getElementById('snc-reflect-skip').onclick = () => overlay.remove();
    document.getElementById('snc-reflect-save').onclick = () => {
      const note = document.getElementById('snc-reflect-ta').value.trim();
      _saveReflection(_selectedStars, note);
      overlay.remove();
      showSancToast('تمت إضافة تأمّلك إلى يوميّاتك 🌿');
    };

    // Animate in
    requestAnimationFrame(() => overlay.classList.add('snc-visible'));
  }

  function _hoverStars(n, btns) {
    btns.forEach((b, i) => b.classList.toggle('snc-star-on', i < n));
  }

  /* ═══════════════════════════════════════════════════════════════
   * SESSION MINUTE TRACKING (ties A, F, streak together)
   * ═══════════════════════════════════════════════════════════════ */
  let _sessionTimer = null;

  function _startSessionTimer() {
    if (_sessionTimer) return;
    _sessionTimer = setInterval(() => {
      if (document.hidden) return;
      _sessionMinutes += 10 / 60; // 10-second ticks
      const added = goalAddMinutes(10 / 60);
      _updateGoalWidget();
      _updateStreakBadge();
    }, 10000);
  }

  function _stopSessionTimer() {
    if (_sessionTimer) { clearInterval(_sessionTimer); _sessionTimer = null; }
  }

  /* ─── Total / week / month aggregate minutes ─────────────────── */
  function getTotalMinutes() {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('taybaa-goal-') && !k.includes('-met-') && k !== GOAL_KEY) {
          total += lsGet(k, 0);
        }
      }
    } catch (_) {}
    return total;
  }

  function getWeekMinutes() {
    let total = 0;
    for (let i = 0; i >= -6; i--) {
      total += lsGet(`taybaa-goal-${dayKey(i)}`, 0);
    }
    return total;
  }

  function getMonthMinutes() {
    let total = 0;
    for (let i = 0; i >= -29; i--) {
      total += lsGet(`taybaa-goal-${dayKey(i)}`, 0);
    }
    return total;
  }

  function getCurrentBooks() {
    const books = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('taybaa-page-')) {
          const id = k.replace('taybaa-page-', '');
          const page = lsGet(k, 0);
          if (page > 1) books.push({ id, page });
        }
      }
    } catch (_) {}
    return books;
  }

  /* ═══════════════════════════════════════════════════════════════
   * WIDGET RENDERING — injected into reader.html toolbar
   * ═══════════════════════════════════════════════════════════════ */
  function _buildSanctuaryBar() {
    const bar = document.createElement('div');
    bar.id = 'snc-bar';
    bar.innerHTML = `
      <!-- Goal Ring mini -->
      <button class="snc-bar-btn" id="snc-goal-btn" title="هدفي اليومي" aria-label="هدفي اليومي">
        <span id="snc-goal-ring-mini"></span>
      </button>

      <!-- Streak badge -->
      <div id="snc-streak-badge" class="snc-streak-badge" aria-live="polite"></div>

      <!-- Slow Read toggle -->
      <button class="snc-bar-btn" id="snc-slow-btn"
        title="وضع التأمّل — قراءة بطيئة" aria-label="وضع القراءة البطيئة">
        <span class="snc-lotus" aria-hidden="true">🪷</span>
        <span class="snc-bar-label">تأمّل</span>
      </button>

      <!-- Ambient sound toggle -->
      <button class="snc-bar-btn" id="snc-ambient-btn"
        title="الأصوات المحيطة" aria-label="الأصوات المحيطة">
        <span aria-hidden="true">🎵</span>
        <span class="snc-bar-label">أصوات</span>
      </button>

      <!-- Sanctuary link -->
      <a href="sanctuary.html" class="snc-bar-btn" title="واحتي" aria-label="لوحة الواحة">
        <span aria-hidden="true">🌿</span>
        <span class="snc-bar-label">واحتي</span>
      </a>
    `;
    return bar;
  }

  function _buildGoalPanel() {
    const panel = document.createElement('div');
    panel.id = 'snc-goal-panel';
    panel.setAttribute('hidden', '');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'هدفي اليومي');
    const pct = Math.min(1, goalTodayMinutes() / goalTarget());
    const mins = Math.round(goalTodayMinutes());
    const target = goalTarget();
    panel.innerHTML = `
      <div class="snc-panel-inner">
        <div class="snc-panel-title">🎯 هدفي اليومي</div>
        <div class="snc-goal-ring-wrap" id="snc-goal-ring-large">${buildGoalRing(pct, 120)}</div>
        <p class="snc-goal-stat">${mins} / ${target} دقيقة</p>
        <div class="snc-goal-controls">
          <label class="snc-goal-label">الهدف اليومي (بالدقائق):</label>
          <div class="snc-goal-stepper">
            <button class="snc-step-btn" id="snc-goal-minus" aria-label="تقليل الهدف">−</button>
            <span id="snc-goal-value">${target}</span>
            <button class="snc-step-btn" id="snc-goal-plus" aria-label="زيادة الهدف">+</button>
          </div>
        </div>
        <button class="snc-btn snc-btn-ghost snc-panel-close" id="snc-goal-close">إغلاق</button>
      </div>`;
    return panel;
  }

  function _buildAmbientPanel() {
    const panel = document.createElement('div');
    panel.id = 'snc-ambient-panel';
    panel.setAttribute('hidden', '');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'الأصوات المحيطة');
    const vol = lsGet('taybaa-ambient-vol', 0.35);
    panel.innerHTML = `
      <div class="snc-panel-inner">
        <div class="snc-panel-title">🎵 الأصوات المحيطة</div>
        <p class="snc-ambient-note">اختر صوتاً يُعينك على التركيز والاستجمام الفكري</p>
        <div class="snc-ambient-tracks">
          ${AMBIENT_TRACKS.map(t => `
            <button class="snc-track-btn" data-id="${t.id}" aria-label="${t.label}">
              <span class="snc-track-icon" aria-hidden="true">${t.icon}</span>
              <span class="snc-track-label">${t.label}</span>
            </button>`).join('')}
        </div>
        <div class="snc-vol-wrap">
          <label class="snc-goal-label">🔊 مستوى الصوت</label>
          <input type="range" class="snc-vol-slider" id="snc-vol-slider"
            min="0" max="1" step="0.05" value="${vol}" aria-label="مستوى الصوت">
        </div>
        <p class="snc-ambient-disclaimer">⚠️ ملاحظة: ملفات الصوت تحتاج إلى رفع من فريق المحتوى.</p>
        <button class="snc-btn snc-btn-ghost snc-panel-close" id="snc-ambient-close">إغلاق</button>
      </div>`;
    return panel;
  }

  /* ─── Update functions ─────────────────────────────────────────── */
  function _updateGoalWidget() {
    const pct = Math.min(1, goalTodayMinutes() / goalTarget());
    // Mini ring in bar
    const mini = document.getElementById('snc-goal-ring-mini');
    if (mini) mini.innerHTML = buildGoalRing(pct, 32);
    // Large ring in panel
    const large = document.getElementById('snc-goal-ring-large');
    if (large) large.innerHTML = buildGoalRing(pct, 120);
    // Stat text
    const stat = document.querySelector('#snc-goal-panel .snc-goal-stat');
    if (stat) stat.textContent = `${Math.round(goalTodayMinutes())} / ${goalTarget()} دقيقة`;
    // Goal value display
    const valEl = document.getElementById('snc-goal-value');
    if (valEl) valEl.textContent = goalTarget();
  }

  function _updateStreakBadge() {
    const el = document.getElementById('snc-streak-badge');
    if (!el) return;
    const streak = getStreak();
    if (streak < 1) { el.innerHTML = ''; el.classList.remove('snc-glow'); return; }
    el.innerHTML = `🌿 ${streak} ${streak === 1 ? 'يوم' : 'أيام'} متتالية`;
    el.classList.toggle('snc-glow', streak >= 3);
  }

  /* ─── Slow Read speed controls ─────────────────────────────────── */
  function _buildSlowReadControls() {
    const wrap = document.createElement('div');
    wrap.id = 'snc-slow-controls';
    wrap.setAttribute('hidden', '');
    wrap.innerHTML = `
      <div class="snc-panel-inner snc-slow-inner">
        <div class="snc-panel-title">🪷 وضع التأمّل</div>
        <p class="snc-slow-desc">يُمرّر الصفحة ببطء لخلق جلسة قراءة تأمّليّة هادئة.</p>
        <div class="snc-goal-stepper">
          <button class="snc-step-btn" id="snc-slow-minus" aria-label="إبطاء">−</button>
          <span id="snc-slow-value">${_slowReadSpeed} px/s</span>
          <button class="snc-step-btn" id="snc-slow-plus" aria-label="تسريع">+</button>
        </div>
        ${REDUCED ? '<p class="snc-motion-note">⚠️ تم تعطيل التمرير التلقائي بسبب إعداد تقليل الحركة في جهازك. يمكنك الاستمرار بالتمرير يدويًا.</p>' : ''}
        <button class="snc-btn snc-btn-ghost snc-panel-close" id="snc-slow-close">إغلاق</button>
      </div>`;
    return wrap;
  }

  /* ─── Toast ─────────────────────────────────────────────────────── */
  function showSancToast(msg) {
    const t = document.createElement('div');
    t.className = 'snc-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('snc-toast-in'));
    setTimeout(() => { t.classList.remove('snc-toast-in'); setTimeout(() => t.remove(), 400); }, 3000);
  }

  /* ═══════════════════════════════════════════════════════════════
   * INTEGRATION — hook into reader-luxury.js events
   * ═══════════════════════════════════════════════════════════════ */
  function _hookIntoReader() {
    // Intercept page changes to fire breathing cue
    // We watch for changes to the pageInput value
    const pageInput = document.getElementById('pageInput');
    if (pageInput) {
      const observer = new MutationObserver(() => {
        const p = parseInt(pageInput.value, 10);
        if (!isNaN(p)) maybeShowBreath(p);
      });
      observer.observe(pageInput, { attributes: true, attributeFilter: ['value'] });
      // Also hook value property setter
      const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      const _origSet = proto.set;
      Object.defineProperty(pageInput, 'value', {
        set(v) {
          _origSet.call(this, v);
          const p = parseInt(v, 10);
          if (!isNaN(p)) maybeShowBreath(p);
        },
        get() { return proto.get.call(this); },
        configurable: true
      });
    }

    // Session end detection
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        _stopSessionTimer();
        _showReflectionOverlay();
      } else {
        if (_bookId) _startSessionTimer();
      }
    });

    window.addEventListener('beforeunload', () => {
      _stopSessionTimer();
      // Synchronously save but can't show overlay on beforeunload
    });
  }

  /* ═══════════════════════════════════════════════════════════════
   * DOM INJECTION & EVENT WIRING
   * ═══════════════════════════════════════════════════════════════ */
  function init() {
    // Only inject into reader page
    if (!document.getElementById('luxBar') && !document.getElementById('pdfCanvas')) return;

    // Build sanctuary bar and inject below luxBar
    const luxBar = document.getElementById('luxBar');
    const sancBar = _buildSanctuaryBar();
    if (luxBar && luxBar.parentNode) {
      luxBar.parentNode.insertBefore(sancBar, luxBar.nextSibling);
    } else {
      document.body.prepend(sancBar);
    }

    // Build panels
    const goalPanel = _buildGoalPanel();
    const ambientPanel = _buildAmbientPanel();
    const slowPanel = _buildSlowReadControls();
    document.body.appendChild(goalPanel);
    document.body.appendChild(ambientPanel);
    document.body.appendChild(slowPanel);

    // Initial renders
    _updateGoalWidget();
    _updateStreakBadge();
    _updateSlowReadBtn();

    // Restore ambient state
    const savedAmbient = lsGet('taybaa-ambient', null);
    if (savedAmbient) {
      // Don't auto-play on init (browser policy), just visually mark active
      const trackBtns = document.querySelectorAll('.snc-track-btn');
      trackBtns.forEach(b => b.classList.toggle('snc-track-active', b.dataset.id === savedAmbient));
    }

    // ── Event wiring ────────────────────────────────────────────

    // Goal panel
    document.getElementById('snc-goal-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const p = document.getElementById('snc-goal-panel');
      p.hidden ? p.removeAttribute('hidden') : p.setAttribute('hidden', '');
    });
    document.getElementById('snc-goal-close').addEventListener('click', () =>
      document.getElementById('snc-goal-panel').setAttribute('hidden', '')
    );
    document.getElementById('snc-goal-minus').addEventListener('click', () => {
      goalSetTarget(goalTarget() - 5);
      _updateGoalWidget();
    });
    document.getElementById('snc-goal-plus').addEventListener('click', () => {
      goalSetTarget(goalTarget() + 5);
      _updateGoalWidget();
    });

    // Slow read
    document.getElementById('snc-slow-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const p = document.getElementById('snc-slow-controls');
      if (p.hasAttribute('hidden')) {
        p.removeAttribute('hidden');
      } else {
        p.setAttribute('hidden', '');
      }
    });
    document.getElementById('snc-slow-close').addEventListener('click', () =>
      document.getElementById('snc-slow-controls').setAttribute('hidden', '')
    );
    document.getElementById('snc-slow-minus').addEventListener('click', () => {
      _slowReadSpeed = Math.max(0.2, _slowReadSpeed - 0.2);
      document.getElementById('snc-slow-value').textContent =
        _slowReadSpeed.toFixed(1) + ' px/s';
    });
    document.getElementById('snc-slow-plus').addEventListener('click', () => {
      _slowReadSpeed = Math.min(10, _slowReadSpeed + 0.2);
      document.getElementById('snc-slow-value').textContent =
        _slowReadSpeed.toFixed(1) + ' px/s';
    });
    // Long-press / double-click on slow btn to toggle actual scroll
    document.getElementById('snc-slow-btn').addEventListener('dblclick', slowReadToggle);
    // Single click with panel closed = toggle
    let _slowBtnTimer = null;
    document.getElementById('snc-slow-btn').addEventListener('click', (e) => {
      const p = document.getElementById('snc-slow-controls');
      if (!p.hasAttribute('hidden')) return; // panel opened — don't toggle
      clearTimeout(_slowBtnTimer);
      _slowBtnTimer = setTimeout(slowReadToggle, 250);
    });
    document.getElementById('snc-slow-btn').addEventListener('dblclick', (e) => {
      clearTimeout(_slowBtnTimer); // cancel single-click toggle
    });

    // Ambient panel
    document.getElementById('snc-ambient-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const p = document.getElementById('snc-ambient-panel');
      p.hidden ? p.removeAttribute('hidden') : p.setAttribute('hidden', '');
    });
    document.getElementById('snc-ambient-close').addEventListener('click', () =>
      document.getElementById('snc-ambient-panel').setAttribute('hidden', '')
    );
    document.querySelectorAll('.snc-track-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.snc-track-btn').forEach(b =>
          b.classList.remove('snc-track-active')
        );
        btn.classList.add('snc-track-active');
        ambientPlay(btn.dataset.id);
      });
    });
    document.getElementById('snc-vol-slider').addEventListener('input', (e) => {
      ambientSetVolume(+e.target.value);
    });

    // Close panels on outside click
    document.addEventListener('click', (e) => {
      ['snc-goal-panel', 'snc-ambient-panel', 'snc-slow-controls'].forEach(id => {
        const panel = document.getElementById(id);
        const btn = document.getElementById(
          id === 'snc-goal-panel'    ? 'snc-goal-btn'    :
          id === 'snc-ambient-panel' ? 'snc-ambient-btn' : 'snc-slow-btn'
        );
        if (panel && btn && !panel.hasAttribute('hidden')) {
          if (!panel.contains(e.target) && !btn.contains(e.target)) {
            panel.setAttribute('hidden', '');
          }
        }
      });
    });

    // Hook into reader
    _hookIntoReader();

    // Start session timer if we have a book
    if (_bookId) _startSessionTimer();

    // Breathing cue on page 1
    setTimeout(() => maybeShowBreath(1), 4000);
  }

  /* ═══════════════════════════════════════════════════════════════
   * G) PUBLIC API for sanctuary.html
   * ═══════════════════════════════════════════════════════════════ */
  window.SANCTUARY = {
    getGoal:          goalTarget,
    setGoal:          goalSetTarget,
    getTodayMinutes:  goalTodayMinutes,
    goalMetToday,
    getStreak,
    getJournal,
    getTotalMinutes,
    getWeekMinutes,
    getMonthMinutes,
    getCurrentBooks,
    buildGoalRing,
    /* Helpers used by sanctuary.html heatmap */
    getDayMinutes:   (offsetDays) => lsGet(`taybaa-goal-${dayKey(offsetDays)}`, 0),
    getDayGoalMet:   (offsetDays) => !!lsGet(`taybaa-goal-met-${dayKey(offsetDays)}`, false),
    lsGet,
    lsSet,
    dayKey
  };

  /* ─── Boot ──────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
