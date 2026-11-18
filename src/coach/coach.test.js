import { once } from 'node:events';
import { MemorySaver } from '@langchain/langgraph';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createModelProxy } from '../../server/model-proxy/server.mjs';
import { resetCoachRateLimit } from '../../server/model-proxy/protocol.mjs';
import { restoreSaver } from './checkpoint.js';
import { runCoach } from './graph.js';
import { compareSeries } from './history.js';
import { assess } from './quality.js';
import { postCoach } from './proxy-client.js';
import { minimalSummary } from './summary.js';

const steps = [{
  metric: 'steps',
  device_sampled_at: '20261118',
  phone_received_at: 1_700_000_000_000,
  value_json: JSON.stringify({ step: 1200 }),
  quality: 'recorded',
}];

describe('local coach', () => {
  it('does not invent tasks or call the model when no samples exist', async () => {
    let called = false;
    const result = await runCoach({
      observations: [], goals: ['早睡'], tasks: [], sync: [], consent: true, proxyConfigured: true, online: true,
    }, { callModel: async () => { called = true; return { status: 'ok', text: '精力 82', proposals: [{ title: '假任务' }] }; } });
    expect(called).toBe(false);
    expect(result.values.proposals).toEqual([]);
    expect(result.values.followup).toContain('没有足够');
  });

  it('uses a local rule instead of pretending the model replied', async () => {
    let called = false;
    const result = await runCoach({
      observations: steps, goals: [], tasks: [], sync: [], consent: false, proxyConfigured: false, online: false,
    }, { callModel: async () => { called = true; return { status: 'ok' }; } });
    expect(called).toBe(false);
    expect(result.values.modelStatus).toBe('model_unconfigured');
    expect(result.values.proposals[0].source).toBe('local_rule');
    expect(result.values.proposals[0].detail).toContain('1200');
    expect(result.values.proposals[0].schedulesNotification).toBe(false);
  });

  it('drops model output that tries to notify or command the band', async () => {
    const result = await runCoach({
      observations: steps, goals: [], tasks: [{ status: 'active' }], sync: [], consent: true, proxyConfigured: true, online: true,
    }, {
      callModel: async () => ({
        status: 'ok',
        text: '可以走路',
        proposals: [
          { title: '好的任务', detail: '走一走', basedOn: [{ metric: 'steps', value: 1200 }] },
          { title: '坏的任务', schedulesNotification: true, deviceCommands: ['sync'] },
        ],
      }),
    });
    expect(result.values.modelStatus).toBe('ok');
    expect(result.values.proposals.map((item) => item.title)).toEqual(['好的任务']);
    expect(result.values.stripped).toEqual(['坏的任务']);
  });

  it('reports model failure without fabricating a cloud answer', async () => {
    const result = await runCoach({
      observations: steps, goals: [], tasks: [], sync: [], consent: true, proxyConfigured: true, online: true,
    }, { callModel: async () => { throw new Error('down'); } });
    expect(result.values.modelStatus).toBe('model_failed');
    expect(result.values.modelText).toBe('');
    expect(result.values.proposals[0].source).toBe('local_rule');
  });

  it('parses a stubbed Responses reply through the proxy and LangGraph', async () => {
    resetCoachRateLimit();
    const seen = [];
    const server = createModelProxy({
      env: { MODEL_PROXY_TOKEN: 'gate', VOLC_ARK_API_KEY: 'server-key' },
      fetchImpl: async (_url, init) => {
        seen.push(JSON.parse(init.body));
        const text = '先看已同步的步数。\n{"proposals":[{"title":"出门走一走","detail":"对照这次步数"}]}';
        return new Response(JSON.stringify({
          status: 'completed',
          output_text: text,
          output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text }] }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const result = await runCoach({
        observations: steps, goals: [], tasks: [], sync: [], consent: true, proxyConfigured: true, online: true,
        turns: [{ role: 'assistant', text: '上次只是提醒记录' }],
      }, {
        callModel: ({ summary, turns }) => postCoach({ proxyUrl: base, proxyToken: 'gate', summary, turns }),
      });
      expect(seen[0].store).toBe(false);
      expect(seen[0].previous_response_id).toBeUndefined();
      expect(seen[0].tools).toBeUndefined();
      expect(seen[0].model).toBe('doubao-seed-2-1-lite-260915');
      expect(result.values.modelStatus).toBe('ok');
      expect(result.values.modelText).toContain('已同步的步数');
      expect(result.values.proposals[0].title).toBe('出门走一走');
      expect(result.values.proposals[0].source).toBe('langgraph');
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('restores LangGraph checkpoint bytes from JSON', async () => {
    const result = await runCoach({
      observations: steps, goals: [], tasks: [], sync: [], consent: false, proxyConfigured: false,
    }, { callModel: async () => ({ status: 'model_unconfigured' }) });
    const saver = new MemorySaver();
    expect(restoreSaver(saver, result.checkpointJson)).toBe(true);
    const tuple = await saver.getTuple({ configurable: { thread_id: 'coach' } });
    expect(tuple?.checkpoint?.id).toBeTruthy();
  });
});

describe('records', () => {
  it('does not treat one sample or the 10-minute note as a medical trend', () => {
    expect(compareSeries(steps).status).toBe('insufficient');
    const report = assess({ observations: steps, sync: [], connected: false, now: 1_700_000_100_000 });
    expect(report.metrics.steps.usesTenMinuteExpectation).toBe(false);
    expect(report.expectationVerified).toBe(false);
    expect(report.expectationAppliesToAllMetrics).toBe(false);
    expect(report.pendingSync).toBe(true);
    expect(report.singlePointIsNotMedical).toBe(true);
  });

  it('compares two real points and keeps the summary free of device addresses', () => {
    const rows = [
      steps[0],
      { ...steps[0], device_sampled_at: '20261119', phone_received_at: 1_700_086_400_000, value_json: JSON.stringify({ step: 900 }) },
    ];
    const compared = compareSeries(rows);
    expect(compared.status).toBe('compared');
    expect(compared.delta).toBe(-300);
    expect(compared.medical).toBe(false);
    const summary = minimalSummary({ observations: rows, goals: ['早睡'], tasks: [], question: '今天呢' });
    expect(summary.json.includes('AA:BB')).toBe(false);
    expect(summary.body.metrics[0].points).toHaveLength(2);
  });
});

describe('source guard', () => {
  it('does not call device sampling setters, exact alarms, or the demo clock', () => {
    const plugin = readFileSync(new URL('../../android/app/src/main/java/com/weiguang/energy/demo/UteBandPlugin.java', import.meta.url), 'utf8');
    const scheduler = readFileSync(new URL('../../android/app/src/main/java/com/weiguang/energy/demo/ReminderScheduler.java', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
    for (const forbidden of ['oxygenAutomaticTest', 'temperatureAutomaticTest', 'moodPressureFatigueAutoTest', 'setHrvAutoTest', 'autoTestHeartRate', '202203251100', 'YCAPPKEY', 'setExact']) {
      expect(plugin.includes(forbidden)).toBe(false);
      expect(app.includes(forbidden)).toBe(false);
    }
    expect(scheduler.includes('.setExact')).toBe(false);
    expect(scheduler.includes('AlarmManager.RTC')).toBe(true);
    expect(app.includes('李明')).toBe(false);
    expect(app.includes('mockReply')).toBe(false);
  });
});
