import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { buildResponsesBody } from '../../server/model-proxy/protocol.mjs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCoach } from './graph.js';
import { runDeviceCoach } from './run.js';
import { postVolcDirect, readDirectConfig } from './volc-direct.js';

const steps = [{
  metric: 'steps',
  device_sampled_at: '20261118',
  phone_received_at: 1_700_000_000_000,
  value_json: JSON.stringify({ step: 1200 }),
  quality: 'recorded',
}];

function listen(handler) {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

describe('langgraph volcano direct', () => {
  it('release ignores a key and does not call the endpoint', async () => {
    let called = false;
    const config = readDirectConfig({ WEIGUANG_CHANNEL: 'release', WEIGUANG_VOLC_API_KEY: 'secret-key-value' });
    expect(config.configured).toBe(false);
    const result = await postVolcDirect({
      summary: '{}',
      apiKey: config.apiKey,
      fetchImpl: async () => { called = true; throw new Error('called'); },
    });
    expect(called).toBe(false);
    expect(result.status).toBe('model_unconfigured');
    expect(JSON.stringify(result)).not.toContain('secret-key-value');
  });

  it('posts the minimal summary with store false and keeps the key out of the result', async () => {
    const seen = {};
    const server = await listen(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      seen.body = Buffer.concat(chunks).toString('utf8');
      seen.authorization = request.headers.authorization;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: '可以走一走。\n{"proposals":[{"title":"出门走一走","detail":"对照步数"}]}' }] }],
      }));
    });
    const { port } = server.address();
    try {
      const result = await postVolcDirect({
        summary: JSON.stringify({ metrics: [{ metric: 'steps', points: [{ value: 1200 }] }] }),
        apiKey: 'secret-key-value',
        model: 'doubao-seed-2-1-lite-260915',
        url: `http://127.0.0.1:${port}/api/v3/responses`,
      });
      const body = JSON.parse(seen.body);
      expect(body.store).toBe(false);
      expect(body.thinking).toEqual({ type: 'disabled' });
      expect(body.max_output_tokens).toBe(256);
      expect(body.model).toBe('doubao-seed-2-1-lite-260915');
      expect(seen.body).not.toContain('secret-key-value');
      expect(seen.authorization).toBe('Bearer secret-key-value');
      expect(result.status).toBe('ok');
      expect(result.proposals[0].title).toBe('出门走一走');
      expect(JSON.stringify(result)).not.toContain('secret-key-value');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('langgraph asks the direct client only when a sample and consent exist', async () => {
    const calls = [];
    const shared = {
      observations: steps,
      goals: [],
      tasks: [],
      sync: [],
      consent: true,
      proxyConfigured: true,
      online: true,
    };
    const result = await runCoach(shared, {
      callModel: async ({ summary }) => {
        calls.push(summary);
        return postVolcDirect({
          summary,
          apiKey: 'secret-key-value',
          model: 'doubao-seed-2-1-lite-260915',
          url: 'http://127.0.0.1:9/unused',
          fetchImpl: async (_url, init) => {
            const body = JSON.parse(init.body);
            expect(body).toEqual(buildResponsesBody({ summary, turns: [], model: 'doubao-seed-2-1-lite-260915' }));
            expect(init.body).not.toContain('secret-key-value');
            return {
              status: 200,
              json: async () => ({
                status: 'completed',
                output: [{ type: 'message', content: [{ type: 'output_text', text: '对照已同步的步数。' }] }],
              }),
            };
          },
        });
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('steps');
    expect(calls[0]).not.toContain('SECRET');
    expect(result.values.modelStatus).toBe('ok');
    expect(result.values.modelText).toContain('步数');
  });

  it('the device coach stays on langgraph and uses a local key file without printing it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wg-key-'));
    const keyFile = join(dir, 'key.txt');
    await writeFile(keyFile, 'file-secret-key\n');
    const previous = globalThis.fetch;
    let authorization = '';
    globalThis.fetch = async (_url, init) => {
      authorization = init.headers.authorization;
      return { status: 200, json: async () => ({ status: 'completed', output_text: '已对照步数。' }) };
    };
    try {
      const result = await runDeviceCoach({
        question: '看步数',
        observations: steps,
        consent: true,
        online: true,
        env: { WEIGUANG_CHANNEL: 'debug', WEIGUANG_VOLC_KEY_FILE: keyFile },
      });
      expect(result.values.modelStatus).toBe('ok');
      expect(result.values.modelText).toContain('步数');
      expect(authorization).toBe('Bearer file-secret-key');
      expect(JSON.stringify(result)).not.toContain('file-secret-key');
    } finally {
      globalThis.fetch = previous;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('android langgraph calls the native adapter and keeps store false', async () => {
    const seen = [];
    const result = await runDeviceCoach({
      question: '看步数',
      observations: steps,
      consent: true,
      online: true,
      env: {},
      androidBridge: {
        async debugModelStatus() {
          return { debug: true, configured: true };
        },
        async postDebugModel({ body, url }) {
          seen.push({ body: JSON.parse(body), url });
          return { sent: true, httpStatus: 200, bodyText: JSON.stringify({ status: 'completed', output_text: '已对照步数。\n{"proposals":[{"title":"出门走一走","detail":"对照这次步数"}]}' }) };
        },
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('https://ark.cn-beijing.volces.com/api/v3/responses');
    expect(seen[0].body.store).toBe(false);
    expect(seen[0].body.thinking).toEqual({ type: 'disabled' });
    expect(seen[0].body.max_output_tokens).toBe(256);
    expect(seen[0].body.input.at(-1).content[0].text).toContain('steps');
    expect(JSON.stringify(seen[0].body)).not.toContain('SECRET');
    expect(result.values.modelStatus).toBe('ok');
    expect(result.values.modelText).toContain('步数');
    expect(result.values.proposals[0].source).toBe('langgraph');
  });

  it('android adapter keeps http and incomplete failures', async () => {
    const http = await runDeviceCoach({
      observations: steps,
      consent: true,
      online: true,
      env: {},
      androidBridge: {
        async debugModelStatus() { return { debug: true, configured: true }; },
        async postDebugModel() { return { sent: true, httpStatus: 500, bodyText: '{"error":{"message":"no"}}' }; },
      },
    });
    const incomplete = await runDeviceCoach({
      observations: steps,
      consent: true,
      online: true,
      env: {},
      androidBridge: {
        async debugModelStatus() { return { debug: true, configured: true }; },
        async postDebugModel() { return { sent: true, httpStatus: 200, bodyText: '{"status":"incomplete","incomplete_details":{"reason":"length"}}' }; },
      },
    });
    expect(http.values.modelStatus).toBe('model_failed');
    expect(incomplete.values.modelStatus).toBe('model_incomplete');
  });

  it('a release phone and an empty sample do not call the model', async () => {
    let posts = 0;
    const release = await runDeviceCoach({
      observations: steps,
      consent: true,
      online: true,
      env: { WEIGUANG_VOLC_API_KEY: 'secret-key-value', WEIGUANG_CHANNEL: 'release' },
      androidBridge: {
        async debugModelStatus() { return { debug: false, configured: false }; },
        async postDebugModel() { posts += 1; return { sent: false }; },
      },
    });
    const empty = await runDeviceCoach({
      observations: [],
      consent: true,
      online: true,
      env: {},
      androidBridge: {
        async debugModelStatus() { return { debug: true, configured: true }; },
        async postDebugModel() { posts += 1; return { sent: true, httpStatus: 200, bodyText: '{"status":"completed","output_text":"不该出现"}' }; },
      },
    });
    expect(posts).toBe(0);
    expect(release.values.modelStatus).toBe('model_unconfigured');
    expect(release.values.proposals[0].source).toBe('local_rule');
    expect(empty.values.proposals).toEqual([]);
    expect(JSON.stringify(release)).not.toContain('secret-key-value');
  });

  it('without a proxy or key the graph stays local and does not invent a model reply', async () => {
    const result = await runDeviceCoach({
      question: '看步数',
      observations: steps,
      consent: true,
      online: true,
      env: {},
    });
    expect(result.values.modelStatus).toBe('model_unconfigured');
    expect(result.values.proposals[0].source).toBe('local_rule');
  });
});
