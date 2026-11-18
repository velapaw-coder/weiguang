import http from 'node:http';

const MAX_BYTES = 8000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

export function createModelProxy({ env = process.env, fetchImpl = fetch, log = () => {} } = {}) {
  const hits = [];
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/coach') {
      respond(response, 404, { status: 'not_found' });
      return;
    }
    if (!env.MODEL_PROXY_TOKEN) {
      respond(response, 503, { status: 'proxy_unconfigured' });
      return;
    }
    if (request.headers.authorization !== `Bearer ${env.MODEL_PROXY_TOKEN}`) {
      respond(response, 401, { status: 'unauthorized' });
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (Buffer.byteLength(raw) > MAX_BYTES) {
      respond(response, 413, { status: 'too_large' });
      return;
    }
    const now = Date.now();
    hits.push(now);
    while (hits.length && now - hits[0] > WINDOW_MS) hits.shift();
    if (hits.length > MAX_REQUESTS) {
      respond(response, 429, { status: 'rate_limited' });
      return;
    }
    log(`coach_request bytes=${Buffer.byteLength(raw)}`);
    const model = env.VOLC_ARK_MODEL || env.VOLC_ARK_ENDPOINT_ID;
    if (!env.VOLC_ARK_API_KEY || !env.VOLC_ARK_BASE_URL || !model) {
      respond(response, 200, { status: 'model_unconfigured' });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const upstream = await fetchImpl(`${env.VOLC_ARK_BASE_URL.replace(/\/$/, '')}/api/v3/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${env.VOLC_ARK_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: '只根据摘要回答。不要诊断或治疗。不要发通知，不要控制设备。缺数据就说明不足。返回 JSON：{"text":"","proposals":[{"title":"","detail":"","basedOn":[]}]}' },
            { role: 'user', content: raw.slice(0, 2000) },
          ],
        }),
      });
      const payload = await upstream.json();
      const content = payload?.choices?.[0]?.message?.content || '';
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        respond(response, 200, { status: 'model_unparsed' });
        return;
      }
      const proposals = Array.isArray(parsed.proposals) ? parsed.proposals.filter((item) => !item?.schedulesNotification && !(item?.deviceCommands || []).length) : [];
      respond(response, 200, { status: 'ok', text: String(parsed.text || ''), proposals });
    } catch (error) {
      log(`model_failed ${error?.name || 'Error'}`);
      respond(response, 200, { status: 'model_failed' });
    } finally {
      clearTimeout(timer);
    }
  });
  return server;
}

function respond(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8787);
  createModelProxy().listen(port, '127.0.0.1');
}
