/**
 * js/ask-book.js  —  Wave 4 "اسأل الكتاب" (Ask the Book)
 * Luxury RTL Arabic chat panel for مكتبة ليبيا الطيبة
 *
 * Depends on:
 *   - window.__taybaaReader  (exposed by reader-luxury.js)
 *   - PDF.js loaded on the page
 *   - /api/ask-book  (Cloudflare Pages Function, streaming SSE)
 */

(function AskBookModule() {
  'use strict';

  // ── Constants ───────────────────────────────────────────────────────────────
  const API_ENDPOINT = '/api/ask-book';
  const MAX_HISTORY  = 20; // kept pairs (user + assistant)
  const CONTEXT_RADIUS = 1; // pages before & after current to include

  const STARTER_QUESTIONS = [
    'ما الفكرة الرئيسية لهذه الصفحة؟',
    'اشرح لي هذا المفهوم بكلمات بسيطة.',
    'ما رأي المؤلف في هذا الموضوع؟',
    'أعطني ملخّصاً للفصل الحالي.',
  ];

  // ── State ───────────────────────────────────────────────────────────────────
  let isOpen      = false;
  let isStreaming = false;
  let history     = []; // [{ role, content }, ...]

  // ── DOM refs (populated after build) ───────────────────────────────────────
  let panel, overlay, messagesEl, inputEl, sendBtn, charCountEl, clearBtn;

  // ── Init ────────────────────────────────────────────────────────────────────
  function init() {
    buildUI();
    attachGlobalButton();
    loadHistory();
  }

  // ── Build chat panel HTML ────────────────────────────────────────────────────
  function buildUI() {
    // Overlay (closes panel on click outside)
    overlay = document.createElement('div');
    overlay.id = 'ask-book-overlay';
    overlay.addEventListener('click', closePanel);

    // Main panel
    panel = document.createElement('div');
    panel.id = 'ask-book-panel';
    panel.setAttribute('dir', 'rtl');
    panel.setAttribute('aria-label', 'نافذة اسأل الكتاب');
    panel.setAttribute('role', 'complementary');

    panel.innerHTML = `
      <div id="ask-book-header">
        <div id="ask-book-header-title">
          <span class="ask-book-icon">🤖</span>
          <span>اسأل الكتاب</span>
        </div>
        <div id="ask-book-header-actions">
          <button id="ask-book-clear" title="مسح المحادثة" aria-label="مسح المحادثة">🗑️</button>
          <button id="ask-book-close" title="إغلاق" aria-label="إغلاق النافذة">✕</button>
        </div>
      </div>

      <div id="ask-book-book-info"></div>

      <div id="ask-book-messages" aria-live="polite" aria-relevant="additions"></div>

      <div id="ask-book-starters"></div>

      <div id="ask-book-input-area">
        <div id="ask-book-input-wrap">
          <textarea
            id="ask-book-input"
            placeholder="اسأل عن هذه الصفحة…"
            rows="2"
            maxlength="500"
            dir="rtl"
            aria-label="اكتب سؤالك هنا"
          ></textarea>
          <span id="ask-book-char-count">0 / 500</span>
        </div>
        <button id="ask-book-send" aria-label="إرسال السؤال" disabled>
          <span class="ask-book-send-icon">↩</span>
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    // Cache DOM refs
    messagesEl  = panel.querySelector('#ask-book-messages');
    inputEl     = panel.querySelector('#ask-book-input');
    sendBtn     = panel.querySelector('#ask-book-send');
    charCountEl = panel.querySelector('#ask-book-char-count');
    clearBtn    = panel.querySelector('#ask-book-clear');

    // Starters
    renderStarters();

    // Events
    panel.querySelector('#ask-book-close').addEventListener('click', closePanel);
    clearBtn.addEventListener('click', clearConversation);
    inputEl.addEventListener('input', onInputChange);
    inputEl.addEventListener('keydown', onKeyDown);
    sendBtn.addEventListener('click', sendMessage);
  }

  function renderStarters() {
    const startersEl = panel.querySelector('#ask-book-starters');
    startersEl.innerHTML = '';
    STARTER_QUESTIONS.forEach((q) => {
      const btn = document.createElement('button');
      btn.className = 'ask-book-starter';
      btn.textContent = q;
      btn.addEventListener('click', () => {
        inputEl.value = q;
        onInputChange();
        sendMessage();
      });
      startersEl.appendChild(btn);
    });
  }

  // ── Global button wiring ─────────────────────────────────────────────────────
  function attachGlobalButton() {
    // The button is injected by reader.html; wait for it if needed
    const btn = document.getElementById('ask-book-btn');
    if (btn) {
      btn.addEventListener('click', togglePanel);
    } else {
      // Fallback: wait for DOM ready
      document.addEventListener('DOMContentLoaded', () => {
        const b = document.getElementById('ask-book-btn');
        if (b) b.addEventListener('click', togglePanel);
      });
    }
  }

  // ── Panel open/close ─────────────────────────────────────────────────────────
  function togglePanel() {
    isOpen ? closePanel() : openPanel();
  }

  function openPanel() {
    if (isOpen) return;
    isOpen = true;
    updateBookInfo();
    panel.classList.add('open');
    overlay.classList.add('visible');
    inputEl.focus();

    const btn = document.getElementById('ask-book-btn');
    if (btn) btn.classList.add('active');
  }

  function closePanel() {
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove('open');
    overlay.classList.remove('visible');

    const btn = document.getElementById('ask-book-btn');
    if (btn) btn.classList.remove('active');
  }

  // ── Book info banner ─────────────────────────────────────────────────────────
  function updateBookInfo() {
    const reader = window.__taybaaReader;
    const infoEl = panel.querySelector('#ask-book-book-info');
    if (!reader || !reader.bookTitle) {
      infoEl.textContent = '';
      return;
    }
    infoEl.textContent = `📖 ${reader.bookTitle}${reader.bookAuthor ? ' — ' + reader.bookAuthor : ''}`;
  }

  // ── Input helpers ─────────────────────────────────────────────────────────────
  function onInputChange() {
    const len = inputEl.value.length;
    charCountEl.textContent = `${len} / 500`;
    sendBtn.disabled = len === 0 || isStreaming;
  }

  function onKeyDown(e) {
    // Send on Enter (not Shift+Enter)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) sendMessage();
    }
  }

  // ── Extract PDF text ─────────────────────────────────────────────────────────
  async function extractPageContext() {
    const reader = window.__taybaaReader;
    if (!reader || !reader.pdfDoc) return '';

    const pdfDoc      = reader.pdfDoc;
    const currentPage = reader.currentPage || 1;
    const totalPages  = pdfDoc.numPages;

    const pagesToRead = [];
    for (let i = Math.max(1, currentPage - CONTEXT_RADIUS); i <= Math.min(totalPages, currentPage + CONTEXT_RADIUS); i++) {
      pagesToRead.push(i);
    }

    const texts = await Promise.all(
      pagesToRead.map(async (pageNum) => {
        try {
          const page        = await pdfDoc.getPage(pageNum);
          const textContent = await page.getTextContent();
          return textContent.items.map((item) => item.str).join(' ');
        } catch {
          return '';
        }
      })
    );

    return texts.join('\n\n---\n\n').slice(0, 6000); // cap to ~6k chars
  }

  // ── Send message ─────────────────────────────────────────────────────────────
  async function sendMessage() {
    const question = inputEl.value.trim();
    if (!question || isStreaming) return;

    // UI: show user bubble
    appendMessage('user', question);
    inputEl.value = '';
    onInputChange();

    // Hide starters after first message
    const startersEl = panel.querySelector('#ask-book-starters');
    if (startersEl) startersEl.style.display = 'none';

    // Show typing indicator
    const typingEl = showTyping();

    isStreaming = true;
    sendBtn.disabled = true;

    try {
      const pageContext = await extractPageContext();
      const reader      = window.__taybaaReader || {};

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          history: history.slice(-MAX_HISTORY),
          pageContext,
          bookTitle:  reader.bookTitle  || '',
          bookAuthor: reader.bookAuthor || '',
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Remove typing indicator; prepare assistant bubble
      typingEl.remove();
      const assistantBubble = appendMessage('assistant', '');

      // Stream SSE
      const reader2  = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      let sseBuffer     = '';

      while (true) {
        const { done, value } = await reader2.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          let parsed;
          try { parsed = JSON.parse(data); } catch { continue; }

          if (parsed.error) {
            assistantBubble.textContent = parsed.error;
            break;
          }
          if (parsed.text) {
            assistantText += parsed.text;
            assistantBubble.textContent = assistantText;
            scrollToBottom();
          }
        }
      }

      // Persist turn to history
      if (assistantText) {
        history.push({ role: 'user',      content: question      });
        history.push({ role: 'assistant', content: assistantText });
        saveHistory();
      }

    } catch (err) {
      typingEl.remove();
      appendMessage('assistant', 'حدث خطأ في الاتصال. تحقّق من اتصالك بالإنترنت وحاول مجدّداً.');
      console.error('[AskBook] Error:', err);
    } finally {
      isStreaming = false;
      onInputChange();
      inputEl.focus();
    }
  }

  // ── Chat bubble helpers ───────────────────────────────────────────────────────
  function appendMessage(role, text) {
    const wrap = document.createElement('div');
    wrap.className = `ask-book-msg ask-book-msg--${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'ask-book-bubble';
    bubble.textContent = text;

    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    scrollToBottom();
    return bubble; // return bubble so caller can stream into it
  }

  function showTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'ask-book-msg ask-book-msg--assistant ask-book-typing-wrap';
    wrap.innerHTML = `
      <div class="ask-book-bubble ask-book-typing">
        <span></span><span></span><span></span>
      </div>`;
    messagesEl.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ── Persistence ───────────────────────────────────────────────────────────────
  function storageKey() {
    const reader = window.__taybaaReader;
    const bookId = reader && reader.bookId ? reader.bookId : 'default';
    return `taybaa-chat-${bookId}`;
  }

  function saveHistory() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(history.slice(-MAX_HISTORY)));
    } catch { /* storage full — ignore */ }
  }

  function loadHistory() {
    // Defer until we have bookId (reader may not be ready at init time)
    setTimeout(() => {
      try {
        const raw = localStorage.getItem(storageKey());
        if (!raw) return;
        history = JSON.parse(raw) || [];
        // Replay into UI
        history.forEach(({ role, content }) => appendMessage(role, content));
        if (history.length) {
          const startersEl = panel.querySelector('#ask-book-starters');
          if (startersEl) startersEl.style.display = 'none';
        }
      } catch { history = []; }
    }, 800);
  }

  function clearConversation() {
    history = [];
    messagesEl.innerHTML = '';
    try { localStorage.removeItem(storageKey()); } catch { /* ignore */ }
    renderStarters();
    const startersEl = panel.querySelector('#ask-book-starters');
    if (startersEl) startersEl.style.display = '';
  }

  // ── Kick off ─────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
