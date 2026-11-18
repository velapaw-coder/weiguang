/** Live coach path. The loop is NanoMuse when a runtime answers; this file does not reimplement it. */

export async function runDeviceCoach({
  question,
  snapshot,
  observations,
  consent,
  museRuntimeUrl,
  channel,
}) {
  const url = String(museRuntimeUrl || snapshot?.meta?.muse_runtime_url || snapshot?.meta?.proxy_url || '').trim();
  if (!url) {
    const outcome = unavailable();
    await persistCoach(outcome);
    return outcome;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        op: 'turn',
        question,
        observations: observations || [],
        goals: snapshot?.goals || [],
        consent: consent === true,
        channel: channel || '',
        provider: 'auto',
      }),
      signal: controller.signal,
    });
    if (!response.ok) return finish(failed('runtime_http'));
    const payload = await response.json();
    if (!payload?.values) return finish(failed('runtime_shape'));
    return finish(payload);
  } catch {
    return finish(failed('runtime_unreachable'));
  } finally {
    clearTimeout(timer);
  }
}

async function finish(outcome) {
  await persistCoach(outcome);
  return outcome;
}

async function persistCoach(outcome) {
  try {
    const { WeiguangStore, isAndroidApp } = await import('../band/native.js');
    if (!isAndroidApp()) return;
    await WeiguangStore.saveCoachResult({
      threadId: 'coach',
      status: outcome.values.modelStatus,
      summaryJson: '{}',
      resultJson: JSON.stringify({
        followup: outcome.values.followup,
        proposals: outcome.values.proposals,
        notices: outcome.values.notices,
        modelText: outcome.values.modelText,
        stripped: outcome.values.stripped,
      }),
    });
  } catch {
    // The page can still show the turn when the phone database is closed.
  }
}

function unavailable() {
  return {
    values: {
      modelStatus: 'muse_runtime_unavailable',
      modelText: '',
      proposals: [],
      notices: ['教练循环使用本机的 NanoMuse 运行时。当前页面没有配置它，也不会改用另一套编排冒充。'],
      followup: '',
      stripped: [],
    },
  };
}

function failed(reason) {
  return {
    values: {
      modelStatus: 'model_failed',
      modelText: '',
      proposals: [],
      notices: [`教练运行时没有完成（${reason}）。没有保存任务。`],
      followup: '',
      stripped: [],
    },
  };
}
