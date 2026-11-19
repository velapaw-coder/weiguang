import { describe, expect, it } from 'vitest';
import { coachItems, restoreCoachMessages } from './chat.js';

describe('chat restore', () => {
  it('rebuilds user and model turns from saved coach results', () => {
    const rows = [{
      created_at: 2,
      status: 'ok',
      summary_json: JSON.stringify({ question: '今天为什么有点累？' }),
      result_json: JSON.stringify({
        modelText: '先看今天的睡眠记录。',
        proposals: [{ title: '午后散步 10 分钟', detail: '走一走', source: 'langgraph' }],
      }),
    }, {
      created_at: 1,
      status: 'model_unconfigured',
      summary_json: JSON.stringify({ question: '你好' }),
      result_json: JSON.stringify({ modelText: '', notices: ['还没有同步到的健康记录。'], followup: '任务进行中 0，已完成 0。' }),
    }];
    const messages = restoreCoachMessages(rows, '开场');
    expect(messages[0].text).toBe('开场');
    expect(messages.some((item) => item.who === 'user' && item.text === '你好')).toBe(true);
    expect(messages.some((item) => item.who === 'user' && item.text.includes('有点累'))).toBe(true);
    expect(messages.some((item) => item.who === 'ai' && item.text.includes('睡眠'))).toBe(true);
    expect(messages.some((item) => item.who === 'proposal' && item.proposal.title.includes('散步'))).toBe(true);
  });

  it('marks failed replies as retryable', () => {
    const items = coachItems({ modelStatus: 'model_failed', modelReason: 'http_401', notices: [], followup: '', question: '再问一次' });
    expect(items[0].retryable).toBe(true);
    expect(items[0].text).toContain('401');
  });
});
