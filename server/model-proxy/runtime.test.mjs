import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { unstable_dev } = require('wrangler');
const root = new URL('.', import.meta.url);

test('workerd serves the module entry without a volcano key', async () => {
  const worker = await unstable_dev(new URL('./volc-proxy.mjs', root).pathname, {
    config: new URL('./wrangler.jsonc', root).pathname,
    local: true,
    ip: '127.0.0.1',
    port: 0,
    vars: { MODEL_PROXY_TOKEN: 'local-test-gate' },
    experimental: { disableExperimentalWarning: true },
  });
  try {
    const open = await worker.fetch('/');
    assert.equal(open.status, 401);
    assert.equal((await open.json()).status, 'unauthorized');
    const denied = await worker.fetch('/v1/coach', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ summary: 'should-not-be-logged' }),
    });
    assert.equal(denied.status, 401);
    const authedGet = await worker.fetch('/', { headers: { authorization: 'Bearer local-test-gate' } });
    assert.equal(authedGet.status, 200);
    assert.equal((await authedGet.json()).status, 'model_unconfigured');
    const coach = await worker.fetch('/v1/coach', {
      method: 'POST',
      headers: {
        authorization: 'Bearer local-test-gate',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ summary: '步数 1' }),
    });
    assert.equal(coach.status, 200);
    assert.equal((await coach.json()).status, 'model_unconfigured');
  } finally {
    await worker.stop();
  }
});

test('wrangler bundle exports only the fetch handler and answers in workerd', async () => {
  const out = mkdtempSync(join(tmpdir(), 'weiguang-wrangler-'));
  const result = spawnSync(process.execPath, [
    new URL('../../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname,
    'deploy',
    '--dry-run',
    '--outdir',
    out,
  ], { cwd: root.pathname, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const bundlePath = join(out, 'volc-proxy.js');
  const bundled = readFileSync(bundlePath, 'utf8');
  const exportBlock = bundled.slice(bundled.lastIndexOf('export {'));
  assert.match(exportBlock, /as default/);
  assert.equal(exportBlock.includes('DEFAULT_MODEL'), false);
  assert.equal(exportBlock.includes('handleCoachRequest'), false);
  const worker = await unstable_dev(bundlePath, {
    local: true,
    ip: '127.0.0.1',
    port: 0,
    compatibilityDate: '2026-11-18',
    vars: {
      MODEL_PROXY_TOKEN: 'local-test-gate',
      VOLC_ARK_MODEL: 'doubao-seed-2-1-lite-260915',
      VOLC_ARK_RESPONSES_URL: 'https://ark.cn-beijing.volces.com/api/v3/responses',
    },
    experimental: { disableExperimentalWarning: true },
  });
  try {
    const coach = await worker.fetch('/v1/coach', {
      method: 'POST',
      headers: {
        authorization: 'Bearer local-test-gate',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ summary: '步数 1' }),
    });
    assert.equal(coach.status, 200);
    assert.equal((await coach.json()).status, 'model_unconfigured');
  } finally {
    await worker.stop();
  }
});
