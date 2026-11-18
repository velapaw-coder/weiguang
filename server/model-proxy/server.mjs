import http from 'node:http';
import { handleCoachRequest } from './volc-proxy.mjs';

export function createModelProxy({ env = process.env, fetchImpl = fetch, log = () => {} } = {}) {
  return http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const upstream = new Request(`http://127.0.0.1${request.url}`, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : body,
    });
    const result = await handleCoachRequest(upstream, env, { fetchImpl, log });
    const text = await result.text();
    const headers = {};
    result.headers.forEach((value, key) => { headers[key] = value; });
    response.writeHead(result.status, headers);
    response.end(text);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8787);
  createModelProxy().listen(port, '127.0.0.1');
}
