import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createModelProxy } from './server.mjs';

async function withServer(options, run) {
  const logs = [];
  const server = createModelProxy({ ...options, log: (line) => logs.push(line) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`, logs);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('missing proxy token and missing volcano config do not call upstream', async () => {
  let called = false;
  await withServer({ env: {}, fetchImpl: async () => { called = true; } }, async (base) => {
    const response = await fetch(`${base}/v1/coach`, { method: 'POST', body: '{"summary":"secret-marker"}' });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).status, 'proxy_unconfigured');
    assert.equal(called, false);
  });
  await withServer({
    env: { MODEL_PROXY_TOKEN: 'proxy-token' },
    fetchImpl: async () => { called = true; },
  }, async (base, logs) => {
    const response = await fetch(`${base}/v1/coach`, {
      method: 'POST',
      headers: { authorization: 'Bearer proxy-token', 'content-type': 'application/json' },
      body: JSON.stringify({ summary: 'steps 1200 secret-marker' }),
    });
    assert.equal((await response.json()).status, 'model_unconfigured');
    assert.equal(called, false);
    assert.equal(logs.some((line) => line.includes('secret-marker')), false);
  });
});

test('rejects a wrong token, a huge body, and a failed model without storing health text', async () => {
  const logs = [];
  const server = createModelProxy({
    env: {
      MODEL_PROXY_TOKEN: 'proxy-token',
      VOLC_ARK_API_KEY: 'server-key',
      VOLC_ARK_BASE_URL: 'https://ark.example',
      VOLC_ARK_MODEL: 'ep-test',
    },
    fetchImpl: async () => { throw new Error('upstream down secret-marker'); },
    log: (line) => logs.push(line),
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const denied = await fetch(`${base}/v1/coach`, { method: 'POST', headers: { authorization: 'Bearer wrong' }, body: '{}' });
  assert.equal(denied.status, 401);
  const huge = await fetch(`${base}/v1/coach`, {
    method: 'POST',
    headers: { authorization: 'Bearer proxy-token' },
    body: 'x'.repeat(9000),
  });
  assert.equal(huge.status, 413);
  const failed = await fetch(`${base}/v1/coach`, {
    method: 'POST',
    headers: { authorization: 'Bearer proxy-token' },
    body: JSON.stringify({ summary: 'secret-marker' }),
  });
  assert.equal((await failed.json()).status, 'model_failed');
  assert.equal(logs.some((line) => line.includes('secret-marker')), false);
  server.close();
  await once(server, 'close');
});
