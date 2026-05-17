/**
 * POST /api/admin/hide
 * Stub endpoint for the admin "hide book" action.
 *
 * Body shape: { bookId: string, by: string, action: 'hide' | 'unhide' }
 *
 * Currently this is a no-op acknowledgement returning 202 Accepted so the
 * client doesn't see network errors when admins hide/unhide books. When a
 * Cloudflare KV namespace is wired up (env.ADMIN_KV) replace the body below
 * with a real persistence layer, for example:
 *
 *   const list = (await env.ADMIN_KV.get('hidden-books', 'json')) || [];
 *   if (action === 'hide')   list.push(bookId);
 *   if (action === 'unhide') list = list.filter(x => x !== bookId);
 *   await env.ADMIN_KV.put('hidden-books', JSON.stringify(list));
 *
 * Optionally validate the `by` field against the admin email allowlist that
 * already lives in /data/admin-config.json.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

export async function onRequestPost({ request }) {
  let body = null;
  try { body = await request.json(); } catch (_) {}
  if (!body || !body.bookId) {
    return json({ ok: false, error: 'bookId required' }, 400);
  }
  // TODO (KV): validate body.by is in admin-config.json adminEmails before persisting.
  // For now we accept and acknowledge.
  return json({
    ok: true,
    action: body.action || 'hide',
    bookId: String(body.bookId),
    note: 'Acknowledged client-side only. Wire up env.ADMIN_KV to persist globally.'
  }, 202);
}

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return onRequestOptions();
  if (request.method === 'POST')    return onRequestPost({ request });
  return json({ error: 'Method not allowed' }, 405);
}
