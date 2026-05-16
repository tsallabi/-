/**
 * reader-luxury.js — المكتبة الطيبة Wave 2
 * Luxury reading sanctuary features · RTL Arabic · v=23
 *
 * Features:
 *  1. 4-colour text highlights (localStorage)
 *  2. Sticky notes with Markdown preview (localStorage)
 *  3. Bookmarks with thumbnail (localStorage)
 *  4. 4 reading themes (cycle)
 *  5. Focus mode (F)
 *  6. Keyboard shortcuts overlay (?)
 *  7. Reading progress bar
 *  8. Reading time tracker
 *  9. Zoom control
 * 10. RTL Arabic typography
 */

(function() {
  'use strict';

  /* ─── Constants ────────────────────────────────────────────── */
  const THEMES = [
    { id: 'parchment', label: 'رق طبيعي',  dot: '#B89968' },
    { id: 'sepia',     label: 'سيبيا حنين', dot: '#c4a97a' },
    { id: 'dark',      label: 'حبر ليلي',   dot: '#4a5068' },
    { id: 'oled',      label: 'سواد عميق',  dot: '#222' }
  ];

  const HL_COLORS = [
    { id: 'yellow', hex: '#FBE16C', label: 'أصفر مخطوطات — مهم',  alpha: 'rgba(251,225,108,.5)' },
    { id: 'green',  hex: '#9CCBA0', label: 'أخضر نعنع — للحفظ',   alpha: 'rgba(156,203,160,.5)' },
    { id: 'blue',   hex: '#9CC2E3', label: 'أزرق سماوي — تساؤل',  alpha: 'rgba(156,194,227,.5)' },
    { id: 'red',    hex: '#E3786B', label: 'أحمر فاقع — اعتراض',  alpha: 'rgba(227,120,107,.5)' }
  ];

  const PDFJS_SRC    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  /* ─── State ────────────────────────────────────────────────── */
  let pdfDoc        = null;
  let currentPage   = 1;
  let totalPages    = 0;
  let scale         = 1.5;
  let rendering     = false;
  let bookId        = '';
  let bookTitle     = '';
  let bookAuthor    = '';
  let themeIdx      = 0;
  let focusMode     = false;
  let pendingSelection = null;
  let pendingNoteCtx   = null;
  let readingTimer  = null;
  let sidebarOpen   = false;
  let activeSideTab = 'bookmarks';

  /* ─── DOM refs ─────────────────────────────────────────────── */
  let canvas, ctx, textLayerDiv, pdfWrapper;
  let progressBar, barTitle, barAuthor, pageInput, totalPagesEl;
  let prevBtn, nextBtn, zoomInBtn, zoomOutBtn, zoomLabel;
  let themeBtn, bookmarkBtn, hlToggleBtn, notesToggleBtn, focusBtn;
  let sidebarPanel, sidebarTabs, sidebarPanes;
  let hlPalette, noteModal, noteTextarea, shortcutsOverlay;
  let readingTimeBadge, focusHint;
  let readerMessage, statusLine;

  /* ─── localStorage helpers ─────────────────────────────────── */
  function lsGet(key, def) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
    catch { return def; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(_) {}
  }

  /* ─── Bookmarks ─────────────────────────────────────────────── */
  function bmKey()    { return `taybaa-bm-${bookId}`; }
  function bmGetAll() { return lsGet(bmKey(), []); }
  function bmHas(p)   { return bmGetAll().some(b => b.page === p); }
  function bmAdd(p, thumb) {
    const bms = bmGetAll();
    if (bmHas(p)) return;
    bms.push({ page: p, thumb, ts: Date.now() });
    lsSet(bmKey(), bms);
  }
  function bmRemove(p) {
    lsSet(bmKey(), bmGetAll().filter(b => b.page !== p));
  }
  function bmToggle(p) {
    if (bmHas(p)) { bmRemove(p); return false; }
    else { bmAdd(p, getThumbDataURL()); return true; }
  }

  function getThumbDataURL() {
    if (!canvas) return '';
    try {
      const th = document.createElement('canvas');
      const sc = 38 / canvas.width;
      th.width  = 38;
      th.height = Math.round(canvas.height * sc);
      th.getContext('2d').drawImage(canvas, 0, 0, th.width, th.height);
      return th.toDataURL('image/jpeg', .6);
    } catch { return ''; }
  }

  /* ─── Highlights ─────────────────────────────────────────────── */
  function hlKey()    { return `taybaa-hl-${bookId}`; }
  function hlGetAll() { return lsGet(hlKey(), []); }
  function hlAdd(entry) { const a = hlGetAll(); a.push(entry); lsSet(hlKey(), a); }
  function hlRemove(id) { lsSet(hlKey(), hlGetAll().filter(h => h.id !== id)); }

  /* ─── Notes ──────────────────────────────────────────────────── */
  function noteKey()    { return `taybaa-notes-${bookId}`; }
  function noteGetAll() { return lsGet(noteKey(), []); }
  function noteAdd(entry) { const a = noteGetAll(); a.push(entry); lsSet(noteKey(), a); }
  function noteRemove(id) { lsSet(noteKey(), noteGetAll().filter(n => n.id !== id)); }

  /* ─── Reading time ───────────────────────────────────────────── */
  function rtKey() { return `taybaa-reading-time-${bookId}`; }
  function rtGet() { return lsGet(rtKey(), 0); }
  function rtAdd(s) { lsSet(rtKey(), rtGet() + s); }
  function rtFmt(s) {
    const m = Math.floor(s / 60);
    return m < 1 ? 'أقل من دقيقة' : `${m} دقيقة`;
  }

  function startReadingTimer() {
    if (readingTimer) return;
    readingTimer = setInterval(() => {
      if (document.hidden) return;
      rtAdd(10);
      updateTimeBadge();
    }, 10000);
  }
  function stopReadingTimer() {
    if (readingTimer) { clearInterval(readingTimer); readingTimer = null; }
  }

  function updateTimeBadge() {
    const secs = rtGet();
    if (secs < 60 || !readingTimeBadge) return;
    readingTimeBadge.textContent = `قضيت ${rtFmt(secs)} في هذا الكتاب`;
    readingTimeBadge.classList.add('visible');
  }

  /* ─── Theme ──────────────────────────────────────────────────── */
  function applyTheme(idx) {
    themeIdx = ((idx % THEMES.length) + THEMES.length) % THEMES.length;
    const t = THEMES[themeIdx];
    document.documentElement.dataset.theme = t.id === 'parchment' ? '' : t.id;
    lsSet('taybaa-reader-theme', themeIdx);
    if (themeBtn) {
      const dot = themeBtn.querySelector('.theme-dot');
      if (dot) dot.style.background = t.dot;
      themeBtn.title = t.label;
    }
  }

  /* ─── Progress bar ───────────────────────────────────────────── */
  function updateProgress() {
    if (!progressBar || !totalPages) return;
    const pct = totalPages > 1 ? ((currentPage - 1) / (totalPages - 1)) * 100 : 100;
    progressBar.style.width = pct + '%';
    const tip = `صفحة ${currentPage} من ${totalPages}`;
    progressBar.parentElement.setAttribute('data-tip', tip);
    progressBar.parentElement.title = tip;
  }

  /* ─── Page navigation ────────────────────────────────────────── */
  function goToPage(num) {
    if (!pdfDoc || rendering) return;
    currentPage = Math.max(1, Math.min(totalPages, num));
    renderPage(currentPage);
  }

  /* ─── Render ─────────────────────────────────────────────────── */
  function renderPage(num) {
    if (!pdfDoc || rendering) return;
    rendering = true;

    pdfDoc.getPage(num).then(page => {
      const vp = page.getViewport({ scale });
      canvas.width  = vp.width;
      canvas.height = vp.height;
      if (pdfWrapper) {
        pdfWrapper.style.width  = vp.width  + 'px';
        pdfWrapper.style.height = vp.height + 'px';
      }
      return page.render({ canvasContext: ctx, viewport: vp }).promise
        .then(() => ({ page, vp }));
    }).then(({ page, vp }) => {
      rendering = false;
      updatePageUI();
      updateProgress();
      if (bookId && typeof READING !== 'undefined') READING.setPage(bookId, num);
      buildTextLayer(page, vp);
      drawHighlightsForPage(num);
      drawNoteMarkersForPage(num);
      updateBookmarkBtn();
    }).catch(err => {
      rendering = false;
      console.error('PDF render error:', err);
    });
  }

  function buildTextLayer(page, viewport) {
    if (!textLayerDiv) return;
    textLayerDiv.innerHTML = '';
    textLayerDiv.style.width  = viewport.width  + 'px';
    textLayerDiv.style.height = viewport.height + 'px';
    page.getTextContent().then(tc => {
      if (typeof pdfjsLib === 'undefined') return;
      pdfjsLib.renderTextLayer({
        textContentSource: tc,
        container: textLayerDiv,
        viewport,
        textDivs: []
      });
    });
  }

  /* ─── Highlights rendering ───────────────────────────────────── */
  function drawHighlightsForPage(pageNum) {
    if (pdfWrapper) pdfWrapper.querySelectorAll('.hl-overlay').forEach(el => el.remove());
    hlGetAll().filter(h => h.page === pageNum).forEach(renderHlOverlay);
  }

  function renderHlOverlay(h) {
    if (!pdfWrapper || !canvas) return;
    const color = HL_COLORS.find(c => c.id === h.colorId);
    if (!color) return;
    const sx = canvas.width  / h.vpWidth;
    const sy = canvas.height / h.vpHeight;
    (h.rects || []).forEach(r => {
      const d = document.createElement('div');
      d.className = 'hl-overlay';
      d.dataset.hlId = h.id;
      d.style.left   = (r.x * sx) + 'px';
      d.style.top    = (r.y * sy) + 'px';
      d.style.width  = (r.w * sx) + 'px';
      d.style.height = (r.h * sy) + 'px';
      d.style.background = color.alpha;
      pdfWrapper.appendChild(d);
    });
  }

  /* ─── Note markers ───────────────────────────────────────────── */
  function drawNoteMarkersForPage(pageNum) {
    if (pdfWrapper) pdfWrapper.querySelectorAll('.note-marker').forEach(el => el.remove());
    noteGetAll().filter(n => n.page === pageNum).forEach(renderNoteMarker);
  }

  function renderNoteMarker(n) {
    if (!pdfWrapper || !canvas) return;
    const sx = canvas.width  / (n.vpWidth  || canvas.width);
    const sy = canvas.height / (n.vpHeight || canvas.height);
    const m  = document.createElement('div');
    m.className   = 'note-marker';
    m.textContent = '◆';
    m.title = n.text.slice(0, 60);
    m.style.right = Math.max(0, (n.x || 10) * sx) + 'px';
    m.style.top   = (n.y || 20) * sy + 'px';
    m.addEventListener('click', e => { e.stopPropagation(); showNotePopup(n, m); });
    pdfWrapper.appendChild(m);
  }

  function showNotePopup(note, anchor) {
    document.querySelectorAll('.note-popup').forEach(el => el.remove());
    const popup = document.createElement('div');
    popup.className = 'note-popup lux-toast';
    popup.style.cssText = 'max-width:280px;white-space:pre-wrap;font-family:Amiri,Cairo,serif;font-size:.88rem;pointer-events:auto;cursor:default;';
    popup.innerHTML = simpleMarkdown(note.text);
    const del = document.createElement('button');
    del.textContent = 'حذف الملاحظة';
    del.style.cssText = 'display:block;margin-top:.6rem;background:none;border:1px solid #B1373F;color:#B1373F;border-radius:8px;padding:.3rem .7rem;cursor:pointer;font-family:Cairo,sans-serif;font-size:.78rem;';
    del.onclick = () => {
      noteRemove(note.id); popup.remove();
      drawNoteMarkersForPage(currentPage); refreshSidebarNotes();
    };
    popup.appendChild(del);
    document.body.appendChild(popup);
    const r = anchor.getBoundingClientRect();
    Object.assign(popup.style, {
      position: 'fixed',
      top:       (r.bottom + 6) + 'px',
      right:     (window.innerWidth - r.right) + 'px',
      left:      'auto',
      transform: 'none',
      bottom:    'auto',
      animation: 'luxToastIn .3s ease both'
    });
    setTimeout(() => {
      document.addEventListener('click', () => popup.remove(), { once: true });
    }, 100);
  }

  /* ─── Highlight palette ──────────────────────────────────────── */
  function showHlPalette(x, y) {
    if (!hlPalette) return;
    hlPalette.style.top  = y + 'px';
    hlPalette.style.right = 'auto';
    hlPalette.style.left  = x + 'px';
    hlPalette.classList.add('visible');
  }
  function hideHlPalette() {
    if (hlPalette) hlPalette.classList.remove('visible');
    pendingSelection = null;
  }

  function captureSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;
    const text = sel.toString().trim();
    if (!pdfWrapper) return null;
    const wr = pdfWrapper.getBoundingClientRect();
    const rects = [];
    for (let i = 0; i < sel.rangeCount; i++) {
      Array.from(sel.getRangeAt(i).getClientRects()).forEach(b => {
        if (b.width < 2 || b.height < 2) return;
        rects.push({ x: b.left - wr.left, y: b.top - wr.top, w: b.width, h: b.height });
      });
    }
    return rects.length ? { text, rects } : null;
  }

  /* ─── Apply highlight ────────────────────────────────────────── */
  function applyHighlight(colorId) {
    if (!pendingSelection) return;
    const entry = {
      id:       Date.now() + '-' + Math.random().toString(36).slice(2,7),
      page:     currentPage,
      colorId,
      text:     pendingSelection.text,
      rects:    pendingSelection.rects,
      vpWidth:  canvas ? canvas.width  : 800,
      vpHeight: canvas ? canvas.height : 1100,
      ts:       Date.now()
    };
    hlAdd(entry);
    renderHlOverlay(entry);
    window.getSelection()?.removeAllRanges();
    hideHlPalette();
    refreshSidebarHighlights();
    showToast('تم التظليل');
  }

  /* ─── Note modal ─────────────────────────────────────────────── */
  function openNoteModal(selCtx) {
    pendingNoteCtx = selCtx;
    if (!noteModal || !noteTextarea) return;
    noteTextarea.value = '';
    noteModal.classList.add('visible');
    noteTextarea.focus();
    hideHlPalette();
  }

  function saveNote() {
    if (!noteTextarea || !pendingNoteCtx) return;
    const text = noteTextarea.value.trim();
    if (!text) { closeNoteModal(); return; }
    const pos = pendingNoteCtx.rects?.[0]
      ? { x: pendingNoteCtx.rects[0].x, y: pendingNoteCtx.rects[0].y }
      : { x: 20, y: 100 };
    const entry = {
      id:           Date.now() + '-' + Math.random().toString(36).slice(2,7),
      page:         currentPage,
      text,
      x:            pos.x,
      y:            pos.y,
      vpWidth:      canvas ? canvas.width  : 800,
      vpHeight:     canvas ? canvas.height : 1100,
      selectedText: pendingNoteCtx.text || '',
      ts:           Date.now()
    };
    noteAdd(entry);
    renderNoteMarker(entry);
    closeNoteModal();
    refreshSidebarNotes();
    showToast('تمت إضافة الملاحظة');
  }

  function closeNoteModal() {
    if (noteModal) noteModal.classList.remove('visible');
    pendingNoteCtx = null;
    window.getSelection()?.removeAllRanges();
  }

  /* ─── Simple Markdown ─────────────────────────────────────────── */
  function simpleMarkdown(text) {
    return text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>')
      .replace(/`(.+?)`/g,'<code>$1</code>')
      .replace(/\n/g,'<br>');
  }

  /* ─── Bookmarks UI ───────────────────────────────────────────── */
  function updateBookmarkBtn() {
    if (!bookmarkBtn) return;
    const has = bmHas(currentPage);
    bookmarkBtn.classList.toggle('active', has);
    bookmarkBtn.title = has ? 'إزالة الإشارة المرجعية' : 'إضافة إشارة مرجعية';
  }

  function toggleBookmark() {
    const added = bmToggle(currentPage);
    updateBookmarkBtn();
    refreshSidebarBookmarks();
    showToast(added ? 'تمت إضافة الإشارة المرجعية' : 'تمت إزالة الإشارة المرجعية');
  }

  /* ─── Sidebar ─────────────────────────────────────────────────── */
  function toggleSidebar(tab) {
    if (!sidebarPanel) return;
    const mobile = window.innerWidth < 640;
    if (sidebarOpen && activeSideTab === tab) {
      sidebarOpen = false;
      mobile ? sidebarPanel.classList.remove('open')
             : sidebarPanel.classList.add('collapsed');
    } else {
      sidebarOpen = true;
      activeSideTab = tab;
      if (mobile) { sidebarPanel.classList.add('open'); sidebarPanel.classList.remove('collapsed'); }
      else          sidebarPanel.classList.remove('collapsed');
      switchSideTab(tab);
    }
  }

  function switchSideTab(tab) {
    activeSideTab = tab;
    sidebarTabs?.forEach(bt => bt.classList.toggle('active', bt.dataset.tab === tab));
    sidebarPanes?.forEach(pn => pn.classList.toggle('active', pn.dataset.pane === tab));
    if (tab === 'bookmarks')  refreshSidebarBookmarks();
    if (tab === 'notes')      refreshSidebarNotes();
    if (tab === 'highlights') refreshSidebarHighlights();
  }

  function refreshSidebarBookmarks() {
    const pane = document.querySelector('.sidebar-pane[data-pane="bookmarks"]');
    if (!pane) return;
    const bms = bmGetAll().sort((a,b) => a.page - b.page);
    if (!bms.length) {
      pane.innerHTML = '<div class="empty-state"><span class="empty-icon">🔖</span>لا توجد إشارات مرجعية بعد.<br>اضغط B لإضافة الصفحة الحالية.</div>';
      return;
    }
    pane.innerHTML = bms.map(b => `
      <div class="bookmark-item" data-page="${b.page}">
        <div class="bookmark-thumb">${b.thumb ? `<img src="${b.thumb}" style="width:100%;height:100%;object-fit:cover;" alt="">` : ''}</div>
        <div class="bookmark-info">
          <div class="bookmark-page">صفحة ${b.page}</div>
          <div class="bookmark-date">${fmtDate(b.ts)}</div>
        </div>
        <button class="bookmark-del" data-page="${b.page}" title="حذف" aria-label="حذف الإشارة">✕</button>
      </div>`).join('');
    pane.querySelectorAll('.bookmark-item').forEach(el => {
      el.addEventListener('click', e => { if (!e.target.classList.contains('bookmark-del')) goToPage(+el.dataset.page); });
    });
    pane.querySelectorAll('.bookmark-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        bmRemove(+btn.dataset.page);
        updateBookmarkBtn();
        refreshSidebarBookmarks();
      });
    });
  }

  function refreshSidebarNotes() {
    const pane = document.querySelector('.sidebar-pane[data-pane="notes"]');
    if (!pane) return;
    const notes = noteGetAll().sort((a,b) => a.page - b.page);
    if (!notes.length) {
      pane.innerHTML = '<div class="empty-state"><span class="empty-icon">✏️</span>لا توجد ملاحظات بعد.<br>حدّد نصاً ثم اضغط ✏️ لإضافة ملاحظة.</div>';
      return;
    }
    pane.innerHTML = notes.map(n => `
      <div class="note-item" data-page="${n.page}" data-id="${n.id}">
        <div class="note-header">
          <span class="note-diamond">◆</span>
          <span class="note-page">صفحة ${n.page}</span>
          <button class="note-del" data-id="${n.id}" title="حذف" aria-label="حذف الملاحظة">✕</button>
        </div>
        <div class="note-content">${simpleMarkdown(n.text.slice(0,200))}</div>
      </div>`).join('');
    pane.querySelectorAll('.note-item').forEach(el => {
      el.addEventListener('click', e => { if (!e.target.classList.contains('note-del')) goToPage(+el.dataset.page); });
    });
    pane.querySelectorAll('.note-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        noteRemove(btn.dataset.id);
        drawNoteMarkersForPage(currentPage);
        refreshSidebarNotes();
      });
    });
  }

  function refreshSidebarHighlights() {
    const pane = document.querySelector('.sidebar-pane[data-pane="highlights"]');
    if (!pane) return;
    const items = hlGetAll().sort((a,b) => a.page - b.page || a.ts - b.ts);
    if (!items.length) {
      pane.innerHTML = '<div class="empty-state"><span class="empty-icon">🖊</span>لا توجد تظليلات بعد.<br>حدّد أي نص في الكتاب لتظليله.</div>';
      return;
    }
    pane.innerHTML = items.map(h => {
      const color = HL_COLORS.find(c => c.id === h.colorId) || HL_COLORS[0];
      return `
        <div class="hl-item" data-page="${h.page}" data-id="${h.id}">
          <span class="hl-swatch" style="background:${color.hex}"></span>
          <span class="hl-text">${escHtml(h.text.slice(0,120))}</span>
          <span class="hl-page">ص${h.page}</span>
          <button class="hl-del" data-id="${h.id}" title="حذف">✕</button>
        </div>`;
    }).join('');
    pane.querySelectorAll('.hl-item').forEach(el => {
      el.addEventListener('click', e => { if (!e.target.classList.contains('hl-del')) goToPage(+el.dataset.page); });
    });
    pane.querySelectorAll('.hl-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        hlRemove(btn.dataset.id);
        drawHighlightsForPage(currentPage);
        refreshSidebarHighlights();
      });
    });
  }

  /* ─── Focus mode ──────────────────────────────────────────────── */
  function toggleFocusMode() {
    focusMode = !focusMode;
    document.body.classList.toggle('focus-mode', focusMode);
    if (focusMode && focusHint) {
      focusHint.classList.add('visible');
      setTimeout(() => focusHint?.classList.remove('visible'), 3000);
    }
  }

  /* ─── Keyboard shortcuts ──────────────────────────────────────── */
  function handleKey(e) {
    if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;

    if (e.key === 'Escape') {
      if (shortcutsOverlay?.classList.contains('visible')) { shortcutsOverlay.classList.remove('visible'); return; }
      if (noteModal?.classList.contains('visible'))        { closeNoteModal(); return; }
      if (focusMode)                                        { toggleFocusMode(); return; }
      hideHlPalette();
      return;
    }
    if (e.key === '?' || e.key === '/') { shortcutsOverlay?.classList.toggle('visible'); return; }

    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp':
        e.preventDefault(); goToPage(currentPage - 1); break;
      case 'ArrowLeft':  case 'ArrowDown':
        e.preventDefault(); goToPage(currentPage + 1); break;
      case '+': case '=': e.preventDefault(); changeZoom(+0.25); break;
      case '-':           e.preventDefault(); changeZoom(-0.25); break;
      case 'f': case 'F': toggleFocusMode();  break;
      case 't': case 'T': applyTheme(themeIdx + 1); break;
      case 'b': case 'B': toggleBookmark(); break;
    }
  }

  /* ─── Zoom ────────────────────────────────────────────────────── */
  function changeZoom(delta) {
    scale = Math.max(0.75, Math.min(4, scale + delta));
    if (zoomLabel) zoomLabel.textContent = Math.round(scale * 100) + '%';
    lsSet('taybaa-reader-zoom', scale);
    renderPage(currentPage);
  }

  /* ─── Page UI update ─────────────────────────────────────────── */
  function updatePageUI() {
    if (pageInput)    pageInput.value          = currentPage;
    if (totalPagesEl) totalPagesEl.textContent = totalPages;
    if (prevBtn)      prevBtn.disabled  = currentPage <= 1;
    if (nextBtn)      nextBtn.disabled  = currentPage >= totalPages;
    updateBookmarkBtn();
  }

  /* ─── Toast ───────────────────────────────────────────────────── */
  let toastTimer = null;
  function showToast(msg) {
    document.querySelectorAll('.lux-toast:not(.note-popup)').forEach(el => el.remove());
    const t = document.createElement('div');
    t.className   = 'lux-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2400);
  }

  /* ─── Helpers ─────────────────────────────────────────────────── */
  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString('ar-LY', { month: 'short', day: 'numeric' });
  }
  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ─── Main init ───────────────────────────────────────────────── */
  function init() {
    canvas           = document.getElementById('pdfCanvas');
    textLayerDiv     = document.getElementById('pdfTextLayer');
    pdfWrapper       = document.getElementById('pdfWrapper');
    progressBar      = document.getElementById('progressBarInner');
    barTitle         = document.getElementById('barTitle');
    barAuthor        = document.getElementById('barAuthor');
    pageInput        = document.getElementById('pageInput');
    totalPagesEl     = document.getElementById('totalPages');
    prevBtn          = document.getElementById('prevPage');
    nextBtn          = document.getElementById('nextPage');
    zoomInBtn        = document.getElementById('zoomIn');
    zoomOutBtn       = document.getElementById('zoomOut');
    zoomLabel        = document.getElementById('zoomLabel');
    themeBtn         = document.getElementById('themeBtn');
    bookmarkBtn      = document.getElementById('bookmarkBtn');
    hlToggleBtn      = document.getElementById('hlToggleBtn');
    notesToggleBtn   = document.getElementById('notesToggleBtn');
    focusBtn         = document.getElementById('focusBtn');
    sidebarPanel     = document.getElementById('sidebarPanel');
    hlPalette        = document.getElementById('hlPalette');
    noteModal        = document.getElementById('noteModal');
    noteTextarea     = document.getElementById('noteTextarea');
    shortcutsOverlay = document.getElementById('shortcutsOverlay');
    readingTimeBadge = document.getElementById('readingTimeBadge');
    focusHint        = document.getElementById('focusHint');
    readerMessage    = document.getElementById('readerMessage');
    statusLine       = document.getElementById('statusLine');

    ctx = canvas ? canvas.getContext('2d') : null;

    sidebarTabs  = Array.from(document.querySelectorAll('.sidebar-tab'));
    sidebarPanes = Array.from(document.querySelectorAll('.sidebar-pane'));

    // Restore preferences
    themeIdx = lsGet('taybaa-reader-theme', 0);
    applyTheme(themeIdx);
    scale = lsGet('taybaa-reader-zoom', 1.5);
    if (zoomLabel) zoomLabel.textContent = Math.round(scale * 100) + '%';

    // URL params
    const params   = new URLSearchParams(location.search);
    const rawId    = params.get('id') || params.get('bookId') || '';
    const pdfParam = params.get('pdf');
    bookTitle  = params.get('title')  || '';
    bookAuthor = params.get('author') || '';
    bookId     = rawId;

    if (barTitle)  barTitle.textContent  = bookTitle  || 'جارٍ التحميل...';
    if (barAuthor) barAuthor.textContent = bookAuthor || '';
    document.title = (bookTitle || 'قارئ') + ' — المكتبة الطيبة';

    // ── Toolbar wiring ──────────────────────────────────────────
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    prevBtn?.addEventListener('click', () => goToPage(currentPage - 1));
    nextBtn?.addEventListener('click', () => goToPage(currentPage + 1));

    pageInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const v = parseInt(pageInput.value, 10); if (!isNaN(v)) goToPage(v); }
    });
    pageInput?.addEventListener('blur', () => { if (pageInput) pageInput.value = currentPage; });

    zoomInBtn?.addEventListener('click',  () => changeZoom(+0.25));
    zoomOutBtn?.addEventListener('click', () => changeZoom(-0.25));
    themeBtn?.addEventListener('click',   () => applyTheme(themeIdx + 1));
    bookmarkBtn?.addEventListener('click', toggleBookmark);
    bookmarkBtn?.addEventListener('dblclick', () => toggleSidebar('bookmarks'));

    document.getElementById('bmPanelBtn')?.addEventListener('click',   () => toggleSidebar('bookmarks'));
    hlToggleBtn?.addEventListener('click',    () => toggleSidebar('highlights'));
    notesToggleBtn?.addEventListener('click', () => toggleSidebar('notes'));
    focusBtn?.addEventListener('click', toggleFocusMode);

    document.getElementById('fsBtn')?.addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    });

    sidebarTabs.forEach(bt => bt.addEventListener('click', () => switchSideTab(bt.dataset.tab)));

    document.querySelectorAll('.hl-color-btn').forEach(btn =>
      btn.addEventListener('click', () => applyHighlight(btn.dataset.colorId))
    );
    document.getElementById('hlNoteBtn')?.addEventListener('click', () => {
      if (pendingSelection) openNoteModal(pendingSelection);
    });
    document.getElementById('hlDismissBtn')?.addEventListener('click', hideHlPalette);

    document.getElementById('noteSaveBtn')?.addEventListener('click', saveNote);
    document.getElementById('noteCancelBtn')?.addEventListener('click', closeNoteModal);
    noteTextarea?.addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) saveNote(); });
    noteModal?.addEventListener('click', e => { if (e.target === noteModal) closeNoteModal(); });

    document.getElementById('shortcutsCloseBtn')?.addEventListener('click', () =>
      shortcutsOverlay?.classList.remove('visible')
    );
    shortcutsOverlay?.addEventListener('click', e => {
      if (e.target === shortcutsOverlay) shortcutsOverlay.classList.remove('visible');
    });

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchend', onMouseUp);

    pdfWrapper?.addEventListener('contextmenu', e => {
      const sel = captureSelection();
      if (sel) { e.preventDefault(); pendingSelection = sel; openNoteModal(sel); }
    });

    document.addEventListener('keydown', handleKey);

    // Reading time
    updateTimeBadge();
    document.addEventListener('visibilitychange', () => {
      document.hidden ? stopReadingTimer() : (bookId && startReadingTimer());
    });

    // ── Load PDF ────────────────────────────────────────────────
    if (!pdfParam && !bookId) {
      showError('لم يتم تحديد كتاب. تأكد من وجود معامل id في الرابط.');
      return;
    }

    if (pdfParam) {
      // Direct PDF URL — load immediately
      startPdfLoad(pdfParam);
    } else {
      // Book ID — fetch metadata first, then load PDF from API response
      if (statusLine) statusLine.textContent = 'جارٍ تحميل بيانات الكتاب...';
      fetch(`/api/books/${bookId}`)
        .then(r => r.ok ? r.json() : Promise.reject('not-ok'))
        .then(data => {
          bookTitle  = data.title  || bookTitle;
          bookAuthor = data.author || bookAuthor;
          if (barTitle)  barTitle.textContent  = bookTitle;
          if (barAuthor) barAuthor.textContent = bookAuthor;
          document.title = bookTitle + ' — المكتبة الطيبة';
          if (data.pdf) startPdfLoad(data.pdf);
          else showError('لا يوجد ملف PDF مرتبط بهذا الكتاب.');
        })
        .catch(() => showError('تعذّر تحميل بيانات الكتاب من الخادم.'));
    }
  }

  /* ─── Selection handler ───────────────────────────────────────── */
  function onMouseUp(e) {
    setTimeout(() => {
      if (noteModal?.classList.contains('visible')) return;
      const sel = captureSelection();
      if (sel) {
        pendingSelection = sel;
        const x = e.clientX ?? e.touches?.[0]?.clientX ?? 80;
        const y = (e.clientY ?? e.touches?.[0]?.clientY ?? 80) + 14;
        showHlPalette(x, y);
      } else {
        hideHlPalette();
      }
    }, 60);
  }

  /* ─── PDF loading ─────────────────────────────────────────────── */
  function startPdfLoad(url) {
    if (!url) return;
    const archMatch = /archive\.org\/(?:embed|details|download)\/([^/?#]+)/.exec(url);
    const archSlug  = archMatch ? archMatch[1] : null;
    const directUrl = archSlug ? `https://archive.org/download/${archSlug}/${archSlug}.pdf` : url;

    if (statusLine) statusLine.textContent = 'جارٍ تحميل PDF.js...';

    loadPdfjsScript().then(ok => {
      if (!ok) { useFallback(url, archSlug, 'فشل تحميل PDF.js'); return; }
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      if (statusLine) statusLine.textContent = 'جارٍ تحميل الكتاب...';
      pdfjsLib.getDocument({ url: directUrl, withCredentials: false }).promise
        .then(doc => onPdfLoaded(doc))
        .catch(err => useFallback(url, archSlug, err.message || 'CORS'));
    });
  }

  function loadPdfjsScript() {
    return new Promise(resolve => {
      if (typeof pdfjsLib !== 'undefined') { resolve(true); return; }
      const s = document.createElement('script');
      s.src     = PDFJS_SRC;
      s.onload  = () => resolve(typeof pdfjsLib !== 'undefined');
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  function onPdfLoaded(doc) {
    pdfDoc     = doc;
    totalPages = doc.numPages;

    // Show the canvas wrapper, hide loading message
    if (readerMessage) readerMessage.style.display = 'none';
    if (pdfWrapper)    pdfWrapper.style.display     = 'inline-block';

    // Show nav controls
    [prevBtn, nextBtn].forEach(b => { if (b) b.hidden = false; });
    if (pageInput) pageInput.hidden = false;
    document.querySelector('.page-sep')?.removeAttribute('hidden');
    if (totalPagesEl) { totalPagesEl.textContent = totalPages; totalPagesEl.hidden = false; }

    // Resume position
    if (bookId && typeof READING !== 'undefined') {
      const saved = Math.min(READING.getPage(bookId), totalPages);
      if (saved > 1) { currentPage = saved; showToast(`استئنفناك من الصفحة ${saved}`); }
    }

    renderPage(currentPage);
    if (bookId) startReadingTimer();
  }

  function useFallback(url, archSlug, reason) {
    console.log('Fallback because:', reason);
    if (statusLine) statusLine.textContent = `تعذّر الفتح المباشر (${reason}) · يتم فتحه ببديل...`;
    const stage = document.getElementById('readerMain');
    if (!stage) return;
    if (readerMessage) readerMessage.style.display = 'none';
    const iframe = document.createElement('iframe');
    iframe.className = 'iframe-stage';
    iframe.allow = 'fullscreen';
    iframe.allowFullscreen = true;
    iframe.src = archSlug
      ? `https://archive.org/embed/${archSlug}`
      : `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
    stage.appendChild(iframe);
  }

  function showError(msg) {
    if (!readerMessage) return;
    readerMessage.innerHTML = `
      <h2>الكتاب غير متاح</h2>
      <p>${msg}</p>
      <p><a href="index.html">العودة إلى الصفحة الرئيسية</a></p>`;
    readerMessage.style.display = 'block';
  }

  /* ─── Boot ────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
