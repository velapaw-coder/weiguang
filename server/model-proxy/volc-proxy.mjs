/** Volcengine Responses proxy. No database. No provider-side conversation store. */

export const DEFAULT_MODEL = 'doubao-seed-2-1-lite-260915';
export const DEFAULT_RESPONSES_URL = 'https://ark.cn-beijing.volces.com/api/v3/responses';
const MAX_BYTES = 8000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const hits = [];
export function resetCoachRateLimit() {
  hits.length = 0;
}

const INSTRUCTIONS = '你是作息教练。只根据这次输入里的摘要回答，不要诊断或治疗，不要安排通知，不要控制设备或手环。数据不够就直接说不够。用简短中文。若要提议一个任务，在正文后另起一行只给一个 JSON：{"proposals":[{"title":"","detail":""}]}。没有合适任务就不要写 JSON。';

export function responsesUrl(env) {
  const explicit = env.VOLC_ARK_RESPONSES_URL;
  if (explicit) return explicit;
  if (env.VOLC_ARK_BASE_URL) return `${env.VOLC_ARK_BASE_URL.replace(/\/$/, '')}/api/v3/responses`;
  return DEFAULT_RESPONSES_URL;
}

export function modelName(env) {
  return env.VOLC_ARK_MODEL || env.VOLC_ARK_ENDPOINT_ID || DEFAULT_MODEL;
}

export function buildResponsesBody({ summary, turns = [], model }) {
  const input = [];
  for (const turn of turns.slice(-6)) {
    const text = String(turn?.text || '').slice(0, 500);
    if (!text) continue;
    if (turn.role === 'assistant') {
      input.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] });
    } else {
      input.push({ type: 'message', role: 'user', content: [{ type: 'input_text', text }] });
    }
  }
  input.push({ type: 'message', role: 'user', content: [{ type: 'input_text', text: String(summary || '').slice(0, 2000) }] });
  return {
    model,
    instructions: INSTRUCTIONS,
    input,
    stream: false,
    store: false,
    max_output_tokens: 256,
    thinking: { type: 'disabled' },
  };
}

export function extractOutputText(body) {
  if (typeof body?.output_text === 'string' && body.output_text.trim()) return body.output_text.trim();
  const parts = [];
  for (const item of body?.output || []) {
    if (item?.type !== 'message') continue;
    for (const block of item.content || []) {
      if (block?.type === 'output_text' && typeof block.text === 'string' && block.text.trim()) parts.push(block.text.trim());
    }
  }
  return parts.join('\n').trim();
}

export function interpretResponses(httpStatus, body) {
  if (!httpStatus) return { status: 'model_failed', reason: 'timeout' };
  if (httpStatus < 200 || httpStatus >= 300) return { status: 'model_failed', reason: `http_${httpStatus}` };
  if (!body || typeof body !== 'object') return { status: 'model_failed', reason: 'not_json' };
  if (body.error) return { status: 'model_failed', reason: 'error' };
  if (body.status === 'incomplete') return { status: 'model_incomplete', reason: body.incomplete_details?.reason || 'incomplete' };
  if (body.status === 'failed') return { status: 'model_failed', reason: 'failed' };
  if (body.status !== 'completed') return { status: 'model_failed', reason: `status_${body.status || 'missing'}` };
  const message = (body.output || []).find((item) => item?.type === 'message');
  if (message?.status === 'incomplete') return { status: 'model_incomplete', reason: 'message_incomplete' };
  if (message?.status === 'failed') return { status: 'model_failed', reason: 'message_failed' };
  const raw = extractOutputText(body);
  if (!raw) return { status: 'model_empty' };
  return { status: 'ok', ...splitCoachText(raw) };
}

export function splitCoachText(raw) {
  const match = raw.match(/\{[\s\S]*"proposals"[\s\S]*\}\s*$/);
  if (!match) return { text: raw, proposals: [] };
  try {
    const parsed = JSON.parse(match[0]);
    const proposals = Array.isArray(parsed.proposals)
      ? parsed.proposals.filter((item) => item && !item.schedulesNotification && !(item.deviceCommands || []).length)
      : [];
    const text = String(parsed.text || raw.slice(0, match.index).trim() || raw);
    return { text, proposals };
  } catch {
    return { text: raw, proposals: [] };
  }
}

function sameSecret(left, right) {
  const encoder = new TextEncoder();
  const a = encoder.encode(String(left ?? ''));
  const b = encoder.encode(String(right ?? ''));
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0 && a.length > 0;
}

function allow(request) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  return headers;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

function limited(now) {
  hits.push(now);
  while (hits.length && now - hits[0] > WINDOW_MS) hits.shift();
  return hits.length > MAX_REQUESTS;
}

export async function handleCoachRequest(request, env = {}, deps = {}) {
  const headers = allow(request);
  if (request.method === 'OPTIONS') return headers;
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/v1/coach') return json({ status: 'not_found' }, 404, headers);
  if (!env.MODEL_PROXY_TOKEN) return json({ status: 'proxy_unconfigured' }, 503, headers);
  const presented = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!sameSecret(presented, env.MODEL_PROXY_TOKEN)) return json({ status: 'unauthorized' }, 401, headers);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return json({ status: 'too_large' }, 413, headers);
  if (limited(deps.now ? deps.now() : Date.now())) return json({ status: 'rate_limited' }, 429, headers);
  (deps.log || (() => {}))(`coach_request bytes=${new TextEncoder().encode(raw).byteLength}`);
  if (!env.VOLC_ARK_API_KEY) return json({ status: 'model_unconfigured' }, 200, headers);
  let payload;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    return json({ status: 'model_failed', reason: 'bad_request' }, 400, headers);
  }
  const summary = typeof payload.summary === 'string' ? payload.summary : JSON.stringify(payload.summary || {});
  const body = buildResponsesBody({ summary, turns: Array.isArray(payload.turns) ? payload.turns : [], model: modelName(env) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs || 20_000);
  try {
    const fetchImpl = deps.fetchImpl || fetch;
    const upstream = await fetchImpl(responsesUrl(env), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${env.VOLC_ARK_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    let parsed = null;
    try {
      parsed = await upstream.json();
    } catch {
      parsed = null;
    }
    return json(interpretResponses(upstream.status, parsed), 200, headers);
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : 'model_failed';
    (deps.log || (() => {}))(`model_failed ${reason}`);
    return json({ status: 'model_failed', reason }, 200, headers);
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request, env) {
    return handleCoachRequest(request, env);
  },
};
