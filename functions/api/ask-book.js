/**
 * functions/api/ask-book.js
 * Wave 4 — "اسأل الكتاب" (Ask the Book)
 * Cloudflare Pages Function: POST /api/ask-book
 *
 * Receives { question, history, pageContext, bookTitle, bookAuthor }
 * Streams back Server-Sent Events from Claude claude-sonnet-4-6
 * Uses prompt caching on the system message to reduce cost.
 *
 * NEVER hard-code the API key. Set ANTHROPIC_API_KEY in Cloudflare Pages
 * Settings → Environment Variables.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest({ request, env }) {
  // ── Pre-flight ──────────────────────────────────────────────────────────────
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // ── API key guard ───────────────────────────────────────────────────────────
  if (!env.ANTHROPIC_API_KEY) {
    return new Response(
      sseError(
        'مفتاح API غير مُهيَّأ. يرجى إضافة ANTHROPIC_API_KEY في إعدادات Cloudflare Pages.'
      ),
      {
        status: 200, // keep 200 so the client SSE parser fires
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8' },
      }
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const { question, history = [], pageContext = '', bookTitle = '', bookAuthor = '' } = body;

  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'question is required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // ── Build system prompt ─────────────────────────────────────────────────────
  const systemPrompt = `أنت مساعد قراءة ذكيّ في المكتبة الطيبة من ليبيا. تساعد القارئ على فهم الكتاب الذي يقرأه. أجِب بالعربية الفصحى المُسهّلة. كُنْ مُختصراً ودقيقاً. إذا لم تجد الإجابة في السياق المُعطى من الكتاب، اعترف بذلك. لا تختلق. السياق من الكتاب '${bookTitle}' للمؤلف '${bookAuthor}': ${pageContext}`;

  // ── Sanitise history (keep last 10 turns to stay within context) ────────────
  const safeHistory = (Array.isArray(history) ? history : [])
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    )
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content }));

  // ── Call Anthropic ──────────────────────────────────────────────────────────
  let anthropicResp;
  try {
    anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        stream: true,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: safeHistory.concat([
          { role: 'user', content: question.trim() },
        ]),
      }),
    });
  } catch (fetchErr) {
    return new Response(
      sseError('تعذّر الاتصال بخادم الذكاء الاصطناعي. حاول مجدّداً.'),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8' },
      }
    );
  }

  if (!anthropicResp.ok) {
    const errText = await anthropicResp.text().catch(() => '');
    console.error('Anthropic error', anthropicResp.status, errText);
    const msg =
      anthropicResp.status === 401
        ? 'مفتاح API غير صحيح أو منتهي الصلاحية.'
        : anthropicResp.status === 429
        ? 'تجاوزت الحدّ المسموح به من الطلبات. انتظر لحظة ثم حاول.'
        : 'حدث خطأ في خدمة الذكاء الاصطناعي. حاول مجدّداً.';
    return new Response(sseError(msg), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8' },
    });
  }

  // ── Pipe Anthropic SSE → client SSE ────────────────────────────────────────
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Stream the Anthropic response body, extract text deltas, re-emit as SSE
  (async () => {
    const reader = anthropicResp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }

          // Extract text delta from claude streaming format
          if (
            parsed.type === 'content_block_delta' &&
            parsed.delta?.type === 'text_delta' &&
            parsed.delta.text
          ) {
            const chunk = JSON.stringify({ text: parsed.delta.text });
            await writer.write(encoder.encode(`data: ${chunk}\n\n`));
          }

          // Signal completion
          if (parsed.type === 'message_stop') {
            await writer.write(encoder.encode('data: [DONE]\n\n'));
          }
        }
      }
    } catch (streamErr) {
      console.error('Stream error:', streamErr);
      const errChunk = JSON.stringify({ error: 'انقطع الاتصال أثناء البث.' });
      await writer.write(encoder.encode(`data: ${errChunk}\n\n`));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sseError(message) {
  return `data: ${JSON.stringify({ error: message })}\n\ndata: [DONE]\n\n`;
}
