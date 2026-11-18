import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createModelProxy } from './server.mjs';
import {
  DEFAULT_MODEL,
  DEFAULT_RESPONSES_URL,
  buildResponsesBody,
  handleCoachRequest,
  interpretResponses,
  resetCoachRateLimit,
} from './volc-proxy.mjs';

const env = {
  MODEL_PROXY_TOKEN: 'proxy-token',
  VOLC_ARK_API_KEY: 'server-key',
};

function completedBody(text) {
  return {
    id: 'resp_test',
    object: 'response',
    status: 'completed',
    error: null,
    output_text: text,
    output: [{
      type: 'message',
      status: 'completed',
      content: [{ type: 'output_text', text }],
    }],
  };
}

async function withServer(options, run) {
  resetCoachRateLimit();
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

test('request uses Responses API without stored session or tools', () => {
  const body = buildResponsesBody({
    model: DEFAULT_MODEL,
    summary: '步数 1200',
    turns: [{ role: 'assistant', text: '上次建议走路' }],
  });
  assert.equal(body.model, 'doubao-seed-2-1-lite-260915');
  assert.equal(body.stream, false);
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 256);
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(body.previous_response_id, undefined);
  assert.equal(body.tools, undefined);
  assert.equal(body.input[0].type, 'message');
  assert.equal(body.input[0].role, 'assistant');
  assert.equal(body.input[0].content[0].type, 'output_text');
  assert.equal(body.input.at(-1).content[0].type, 'input_text');
});

test('completed output_text is accepted and incomplete or empty is not', () => {
  const ok = interpretResponses(200, completedBody('可以先散步'));
  assert.equal(ok.status, 'ok');
  assert.equal(ok.text, '可以先散步');
  assert.equal(interpretResponses(200, { status: 'incomplete', output_text: '半句' }).status, 'model_incomplete');
  assert.equal(interpretResponses(200, { status: 'failed', output_text: '失败' }).status, 'model_failed');
  assert.equal(interpretResponses(200, { status: 'completed', error: { code: 'x' }, output_text: '不该用' }).status, 'model_failed');
  assert.equal(interpretResponses(200, { status: 'completed', output: [] }).status, 'model_empty');
  assert.equal(interpretResponses(200, null).status, 'model_failed');
  assert.equal(interpretResponses(500, { status: 'completed', output_text: '忽略' }).status, 'model_failed');
  assert.equal(interpretResponses(0, null).reason, 'timeout');
  const structured = interpretResponses(200, {
    status: 'completed',
    output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text: '只有结构字段' }] }],
  });
  assert.equal(structured.text, '只有结构字段');
});

test('proxy posts the documented endpoint and does not log the key or summary', async () => {
  let called = false;
  const seen = [];
  await withServer({
    env,
    fetchImpl: async (url, init) => {
      called = true;
      seen.push({ url, body: JSON.parse(init.body), authorization: init.headers.authorization });
      return new Response(JSON.stringify(completedBody('{"proposals":[{"title":"散步","detail":"对照步数"}]}')), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  }, async (base, logs) => {
    const response = await fetch(`${base}/v1/coach`, {
      method: 'POST',
      headers: { authorization: 'Bearer proxy-token', 'content-type': 'application/json' },
      body: JSON.stringify({ summary: 'steps 1200 secret-marker', turns: [] }),
    });
    const body = await response.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.proposals[0].title, '散步');
    assert.equal(seen[0].url, DEFAULT_RESPONSES_URL);
    assert.equal(seen[0].body.store, false);
    assert.equal(seen[0].authorization, 'Bearer server-key');
    assert.equal(logs.some((line) => line.includes('secret-marker') || line.includes('server-key')), false);
    assert.equal(called, true);
  });
});

test('missing gate, missing key, wrong token, oversized body, and upstream timeout', async () => {
  await withServer({ env: {}, fetchImpl: async () => { throw new Error('should not run'); } }, async (base) => {
    const response = await fetch(`${base}/v1/coach`, { method: 'POST', body: '{"summary":"x"}' });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).status, 'proxy_unconfigured');
  });
  await withServer({ env: { MODEL_PROXY_TOKEN: 'proxy-token' }, fetchImpl: async () => { throw new Error('should not run'); } }, async (base) => {
    const response = await fetch(`${base}/v1/coach`, {
      method: 'POST',
      headers: { authorization: 'Bearer proxy-token' },
      body: JSON.stringify({ summary: 'secret-marker' }),
    });
    assert.equal((await response.json()).status, 'model_unconfigured');
  });
  await withServer({
    env,
    fetchImpl: async () => { throw Object.assign(new Error('slow'), { name: 'AbortError' }); },
  }, async (base, logs) => {
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
    assert.equal(logs.some((line) => line.includes('secret-marker') || line.includes('server-key')), false);
  });
});

test('worker entry returns the same decision without a node server', async () => {
  resetCoachRateLimit();
  const response = await handleCoachRequest(new Request('https://proxy.example/v1/coach', {
    method: 'POST',
    headers: { authorization: 'Bearer proxy-token', 'content-type': 'application/json' },
    body: JSON.stringify({ summary: '步数 10' }),
  }), env, {
    fetchImpl: async () => new Response(JSON.stringify({ status: 'incomplete', output_text: '截断' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  assert.equal((await response.json()).status, 'model_incomplete');
});
