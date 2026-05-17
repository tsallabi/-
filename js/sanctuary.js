/**
 * sanctuary.js — واحة القراءة · مكتبة ليبيا الطيبة
 * Reading Sanctuary wellness layer · RTL Arabic · v=27
 *
 * Features:
 *  A) Reading Goal + gold SVG progress ring
 *  B) Reading Streak tracker
 *  C) Ambient Sounds panel — PROCEDURAL Web Audio (no MP3 files needed)
 *  D) Slow Read / تأمّل auto-scroll mode
 *  E) Breathing Cue (4-7-8 pattern)
 *  F) End-of-Session Reflection overlay
 *  G) Public SANCTUARY API for sanctuary.html dashboard
 *
 * v=27: Replaced HTML <audio> + MP3 placeholders with WebAudio synthesis.
 *       Every ambient track is now generated live in the browser:
 *         - rain     → white noise → lowpass @ 1kHz
 *         - fountain → pink noise  → bandpass @ 800Hz + delay reverb
 *         - breath   → 220Hz sine modulated by 0.25Hz LFO
 *         - page     → short noise burst with decay envelope (loops every 4s)
 *         - silence  → stops everything
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
    if (cur < goalTarget() && next >= goalTarget()) {
      _markGoalMetToday();
    }
    return next;
  }

  function _markGoalMetToday() {
    lsSet(`taybaa-goal-met-${todayKey()}`, true);
    _updateStreak();
  }

  function goalMetToday() { return !!lsGet(`taybaa-goal-met-${todayKey()}`, false); }

  /* SVG Ring rendering */
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
        font-family="Aref Ruqaa,Reem Kufi,sans-serif" font-size="${size * 0.2}px"
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
      else if (i < 0) break;
    }
    lsSet(STREAK_KEY, streak);
    return streak;
  }

  function getStreak() { return lsGet(STREAK_KEY, 0); }

  /* ═══════════════════════════════════════════════════════════════
   * C) AMBIENT SOUNDS — PROCEDURAL via Web Audio API
   * ═══════════════════════════════════════════════════════════════
   * No external MP3 files required. Each track is synthesised at runtime
   * from noise + filter chains. ConvolverNode is avoided in favour of a
   * cheap delay-based pseudo-reverb where helpful.
   */
  const AMBIENT_TRACKS = [
    { id: 'rain',     label: 'مطر هادئ',       icon: '🌧️' },
    { id: 'fountain', label: 'نافورة',          icon: '⛲' },
    { id: 'breath',   label: 'حمام أنفاس',      icon: '🌬️' },
    { id: 'page',     label: 'صفحة تُقلب',      icon: '📜' },
    { id: 'silence',  label: 'صمت',             icon: '🔇' }
  ];

  let _audioCtx = null;
  let _masterGain = null;
  let _activeNodes = []; // every node currently producing sound — easy to tear down
  let _ambientActive = null;
  let _pageInterval = null;

  function _getAudioContext() {
    if (_audioCtx) return _audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    _audioCtx = new Ctx();
    _masterGain = _audioCtx.createGain();
    _masterGain.gain.value = lsGet('taybaa-ambient-vol', 0.35);
    _masterGain.connect(_audioCtx.destination);
    return _audioCtx;
  }

  /* Build a long noise buffer once and reuse */
  let _whiteNoiseBuffer = null;
  function _whiteNoise() {
    const ctx = _getAudioContext();
    if (!ctx) return null;
    if (!_whiteNoiseBuffer) {
      const seconds = 4;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      _whiteNoiseBuffer = buffer;
    }
    const src = ctx.createBufferSource();
    src.buffer = _whiteNoiseBuffer;
    src.loop = true;
    return src;
  }

  /* Paul Kellet pink noise approximation */
  let _pinkNoiseBuffer = null;
  function _pinkNoise() {
    const ctx = _getAudioContext();
    if (!ctx) return null;
    if (!_pinkNoiseBuffer) {
      const seconds = 4;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
      _pinkNoiseBuffer = buffer;
    }
    const src = ctx.createBufferSource();
    src.buffer = _pinkNoiseBuffer;
    src.loop = true;
    return src;
  }

  function _stopAllAudio() {
    _activeNodes.forEach(n => {
      try { if (n.stop) n.stop(); if (n.disconnect) n.disconnect(); } catch (_) {}
    });
    _activeNodes = [];
    if (_pageInterval) { clearInterval(_pageInterval); _pageInterval = null; }
  }

  /* مطر — white noise → lowpass @ 1kHz + slight LFO on the cutoff */
  function _startRain() {
    const ctx = _getAudioContext();
    if (!ctx) return;
    const src = _whiteNoise();
    if (!src) return;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
    filter.Q.value = 0.7;
    // Subtle modulation so it doesn't sound static
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.15;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(filter.frequency);
    const trackGain = ctx.createGain();
    trackGain.gain.value = 0.85;
    src.connect(filter).connect(trackGain).connect(_masterGain);
    src.start();
    lfo.start();
    _activeNodes.push(src, filter, lfo, lfoGain, trackGain);
  }

  /* نافورة — pink noise → bandpass @ 800Hz + simple delay reverb */
  function _startFountain() {
    const ctx = _getAudioContext();
    if (!ctx) return;
    const src = _pinkNoise();
    if (!src) return;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800;
    bp.Q.value = 1.2;
    const trackGain = ctx.createGain();
    trackGain.gain.value = 0.5;
    // Simple delay-based pseudo reverb (cheaper than ConvolverNode)
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.18;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    delay.connect(feedback).connect(delay);
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.4;
    delay.connect(wetGain).connect(_masterGain);
    src.connect(bp);
    bp.connect(trackGain).connect(_masterGain);
    bp.connect(delay);
    src.start();
    _activeNodes.push(src, bp, trackGain, delay, feedback, wetGain);
  }

  /* حمام أنفاس — 220Hz sine, 0.25Hz LFO controlling amplitude (4s breath cycle) */
  function _startBreath() {
    const ctx = _getAudioContext();
    if (!ctx) return;
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = 220;
    const ampGain = ctx.createGain();
    ampGain.gain.value = 0; // controlled by LFO
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.25; // one breath every 4s
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.18; // peak amplitude
    // Add a DC offset so the gain oscillates between ~0 and ~0.36 instead of -0.18..+0.18
    const dc = ctx.createConstantSource();
    dc.offset.value = 0.18;
    lfo.connect(lfoDepth);
    lfoDepth.connect(ampGain.gain);
    dc.connect(ampGain.gain);
    carrier.connect(ampGain).connect(_masterGain);
    carrier.start();
    lfo.start();
    dc.start();
    _activeNodes.push(carrier, ampGain, lfo, lfoDepth, dc);
  }

  /* صفحة تُقلب — short filtered-noise envelope every ~4 seconds */
  function _startPageFlip() {
    const ctx = _getAudioContext();
    if (!ctx) return;
    function fire() {
      const src = _whiteNoise();
      if (!src) return;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1800;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 6000;
      const env = ctx.createGain();
      const t = ctx.currentTime;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      src.connect(hp).connect(lp).connect(env).connect(_masterGain);
      src.start(t);
      src.stop(t + 0.5);
      // Auto-cleanup after this one fires
      setTimeout(() => {
        try { src.disconnect(); hp.disconnect(); lp.disconnect(); env.disconnect(); } catch (_) {}
      }, 600);
    }
    fire(); // first one immediately
    _pageInterval = setInterval(fire, 3500 + Math.random() * 1500);
  }

  function ambientPlay(trackId) {
    // Stop everything currently playing
    _stopAllAudio();
    if (!trackId || trackId === 'silence') {
      _ambientActive = null;
      lsSet('taybaa-ambient', null);
      return;
    }
    // If we re-clicked the same active track, treat as toggle-off
    if (_ambientActive === trackId) {
      _ambientActive = null;
      lsSet('taybaa-ambient', null);
      return;
    }
    _ambientActive = trackId;
    lsSet('taybaa-ambient', trackId);
    // Ensure context resumed (some browsers start it suspended)
    const ctx = _getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    switch (trackId) {
      case 'rain':     _startRain();      break;
      case 'fountain': _startFountain();  break;
      case 'breath':   _startBreath();    break;
      case 'page':     _startPageFlip();  break;
      default: break;
    }
  }

  function ambientSetVolume(v) {
    const ctx = _getAudioContext();
    if (_masterGain && ctx) {
      // Smooth ramp to avoid clicks
      _masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.05);
    }
    lsSet('taybaa-ambient-vol', v);
  }

  /* ═══════════════════════════════════════════════════════════════
   * D) SLOW READ / تأمّل MODE
   * ═══════════════════════════════════════════════════════════════ */
  let _slowReadActive = false;
  let _slowReadSpeed = 1;
  let _slowReadRaf = null;
  let _slowReadLast = null;

  function slowReadToggle() {
    _slowReadActive = !_slowReadActive;
    lsSet('taybaa-slow-read', _slowReadActive);
    if (_slowReadActive) _startSlowRead();
    else _stopSlowRead();
    _updateSlowReadBtn();
  }

  function _startSlowRead() {
    if (REDUCED) return;
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
  const BREATH_EVERY_N_PAGES = 10;

  function maybeShowBreath(pageNum) {
    if (_breathDisabled || _breathShown) return;
    if (pageNum !== 1 && pageNum % BREATH_EVERY_N_PAGES !== 0) return;
    _breathShown = true;
    _showBreathingOverlay();
    setTimeout(() => { _breathShown = false; }, 5 * 60 * 1000);
  }

  function _showBreathingOverlay() {
    if (REDUCED) return;
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
    if (_sessionMinutes < 2) return;
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

    requestAnimationFrame(() => overlay.classList.add('snc-visible'));
  }

  function _hoverStars(n, btns) {
    btns.forEach((b, i) => b.classList.toggle('snc-star-on', i < n));
  }

  /* ═══════════════════════════════════════════════════════════════
   * SESSION MINUTE TRACKING
   * ═══════════════════════════════════════════════════════════════ */
  let _sessionTimer = null;

  function _startSessionTimer() {
    if (_sessionTimer) return;
    _sessionTimer = setInterval(() => {
      if (document.hidden) return;
      _sessionMinutes += 10 / 60;
      const added = goalAddMinutes(10 / 60);
      _updateGoalWidget();
      _updateStreakBadge();
    }, 10000);
  }

  function _stopSessionTimer() {
    if (_sessionTimer) { clearInterval(_sessionTimer); _sessionTimer = null; }
  }

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
    for (let i = 0; i >= -6; i--) total += lsGet(`taybaa-goal-${dayKey(i)}`, 0);
    return total;
  }

  function getMonthMinutes() {
    let total = 0;
    for (let i = 0; i >= -29; i--) total += lsGet(`taybaa-goal-${dayKey(i)}`, 0);
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
   * WIDGET RENDERING
   * ═══════════════════════════════════════════════════════════════ */
  function _buildSanctuaryBar() {
    const bar = document.createElement('div');
    bar.id = 'snc-bar';
    bar.innerHTML = `
      <button class="snc-bar-btn" id="snc-goal-btn" title="هدفي اليومي" aria-label="هدفي اليومي">
        <span id="snc-goal-ring-mini"></span>
      </button>
      <div id="snc-streak-badge" class="snc-streak-badge" aria-live="polite"></div>
      <button class="snc-bar-btn" id="snc-slow-btn"
        title="وضع التأمّل — قراءة بطيئة" aria-label="وضع القراءة البطيئة">
        <span class="snc-lotus" aria-hidden="true">🪷</span>
        <span class="snc-bar-label">تأمّل</span>
      </button>
      <button class="snc-bar-btn" id="snc-ambient-btn"
        title="الأصوات المحيطة" aria-label="الأصوات المحيطة">
        <span aria-hidden="true">🎵</span>
        <span class="snc-bar-label">أصوات</span>
      </button>
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
        <p class="snc-ambient-disclaimer">✨ الأصوات مولّدة محلياً عبر متصفّحك — لا حاجة لأي ملفات.</p>
        <button class="snc-btn snc-btn-ghost snc-panel-close" id="snc-ambient-close">إغلاق</button>
      </div>`;
    return panel;
  }

  /* ─── Update functions ─────────────────────────────────────────── */
  function _updateGoalWidget() {
    const pct = Math.min(1, goalTodayMinutes() / goalTarget());
    const mini = document.getElementById('snc-goal-ring-mini');
    if (mini) mini.innerHTML = buildGoalRing(pct, 32);
    const large = document.getElementById('snc-goal-ring-large');
    if (large) large.innerHTML = buildGoalRing(pct, 120);
    const stat = document.querySelector('#snc-goal-panel .snc-goal-stat');
    if (stat) stat.textContent = `${Math.round(goalTodayMinutes())} / ${goalTarget()} دقيقة`;
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
   * INTEGRATION
   * ═══════════════════════════════════════════════════════════════ */
  function _hookIntoReader() {
    const pageInput = document.getElementById('pageInput');
    if (pageInput) {
      const observer = new MutationObserver(() => {
        const p = parseInt(pageInput.value, 10);
        if (!isNaN(p)) maybeShowBreath(p);
      });
      observer.observe(pageInput, { attributes: true, attributeFilter: ['value'] });
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
    });
  }

  /* ═══════════════════════════════════════════════════════════════
   * DOM INJECTION & EVENT WIRING
   * ═══════════════════════════════════════════════════════════════ */
  function init() {
    if (!document.getElementById('luxBar') && !document.getElementById('pdfCanvas')) return;

    const luxBar = document.getElementById('luxBar');
    const sancBar = _buildSanctuaryBar();
    if (luxBar && luxBar.parentNode) {
      luxBar.parentNode.insertBefore(sancBar, luxBar.nextSibling);
    } else {
      document.body.prepend(sancBar);
    }

    const goalPanel = _buildGoalPanel();
    const ambientPanel = _buildAmbientPanel();
    const slowPanel = _buildSlowReadControls();
    document.body.appendChild(goalPanel);
    document.body.appendChild(ambientPanel);
    document.body.appendChild(slowPanel);

    _updateGoalWidget();
    _updateStreakBadge();
    _updateSlowReadBtn();

    const savedAmbient = lsGet('taybaa-ambient', null);
    if (savedAmbient) {
      const trackBtns = document.querySelectorAll('.snc-track-btn');
      trackBtns.forEach(b => b.classList.toggle('snc-track-active', b.dataset.id === savedAmbient));
    }

    /* Goal panel */
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

    /* Slow read */
    document.getElementById('snc-slow-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const p = document.getElementById('snc-slow-controls');
      if (p.hasAttribute('hidden')) p.removeAttribute('hidden');
      else p.setAttribute('hidden', '');
    });
    document.getElementById('snc-slow-close').addEventListener('click', () =>
      document.getElementById('snc-slow-controls').setAttribute('hidden', '')
    );
    document.getElementById('snc-slow-minus').addEventListener('click', () => {
      _slowReadSpeed = Math.max(0.2, _slowReadSpeed - 0.2);
      document.getElementById('snc-slow-value').textContent = _slowReadSpeed.toFixed(1) + ' px/s';
    });
    document.getElementById('snc-slow-plus').addEventListener('click', () => {
      _slowReadSpeed = Math.min(10, _slowReadSpeed + 0.2);
      document.getElementById('snc-slow-value').textContent = _slowReadSpeed.toFixed(1) + ' px/s';
    });
    document.getElementById('snc-slow-btn').addEventListener('dblclick', slowReadToggle);
    let _slowBtnTimer = null;
    document.getElementById('snc-slow-btn').addEventListener('click', (e) => {
      const p = document.getElementById('snc-slow-controls');
      if (!p.hasAttribute('hidden')) return;
      clearTimeout(_slowBtnTimer);
      _slowBtnTimer = setTimeout(slowReadToggle, 250);
    });
    document.getElementById('snc-slow-btn').addEventListener('dblclick', (e) => {
      clearTimeout(_slowBtnTimer);
    });

    /* Ambient panel */
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
        const targetId = btn.dataset.id;
        const willStop = (_ambientActive === targetId) || targetId === 'silence';
        document.querySelectorAll('.snc-track-btn').forEach(b => b.classList.remove('snc-track-active'));
        if (!willStop) btn.classList.add('snc-track-active');
        ambientPlay(targetId);
      });
    });
    document.getElementById('snc-vol-slider').addEventListener('input', (e) => {
      ambientSetVolume(+e.target.value);
    });

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

    _hookIntoReader();
    if (_bookId) _startSessionTimer();
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
    getDayMinutes:   (offsetDays) => lsGet(`taybaa-goal-${dayKey(offsetDays)}`, 0),
    getDayGoalMet:   (offsetDays) => !!lsGet(`taybaa-goal-met-${dayKey(offsetDays)}`, false),
    lsGet,
    lsSet,
    dayKey,
    /* Audio control (also useful from sanctuary.html if needed) */
    ambientPlay,
    ambientSetVolume
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
