import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runMuseProcess } from './muse-client.js';
import { runDeviceCoach } from './run.js';

const script = [
  { tool_calls: [{ name: 'read_health', arguments: {} }] },
  { tool_calls: [{ name: 'terminate', arguments: { status: 'success', summary: '没有已同步的数值。' } }] },
];

describe('nanomuse coach process', () => {
  it('keeps the page path fail-closed until a runtime URL exists', async () => {
    const result = await runDeviceCoach({ question: '你好', observations: [], consent: true });
    expect(result.values.modelStatus).toBe('muse_runtime_unavailable');
    expect(result.values.proposals).toEqual([]);
  });

  it('runs the real loop without printing a local key', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wg-muse-'));
    const previous = process.env.WEIGUANG_VOLC_API_KEY;
    process.env.WEIGUANG_VOLC_API_KEY = 'local-test-key-should-not-appear';
    try {
      const result = await runMuseProcess({
        op: 'turn',
        question: '今天呢',
        dataDir: dir,
        consent: true,
        provider: 'mock',
        channel: 'debug',
        script,
      });
      const encoded = JSON.stringify(result);
      expect(result.values.modelStatus).toBe('ok');
      expect(result.values.proposals).toEqual([]);
      expect(encoded).not.toContain('local-test-key-should-not-appear');
      expect(encoded).not.toContain('SECRETADDR');
    } finally {
      if (previous === undefined) delete process.env.WEIGUANG_VOLC_API_KEY;
      else process.env.WEIGUANG_VOLC_API_KEY = previous;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
