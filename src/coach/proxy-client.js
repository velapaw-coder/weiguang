export async function postCoach({ proxyUrl, proxyToken, summary, turns = [], fetchImpl = fetch, timeoutMs = 20000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${proxyUrl.replace(/\/$/, '')}/v1/coach`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${proxyToken}`,
      },
      body: JSON.stringify({ summary, turns }),
      signal: controller.signal,
    });
    try {
      const body = await response.json();
      if (!body || typeof body.status !== 'string') return { status: 'model_failed', reason: 'bad_proxy' };
      return body;
    } catch {
      return { status: 'model_failed', reason: 'bad_proxy' };
    }
  } catch {
    return { status: 'model_failed', reason: 'timeout' };
  } finally {
    clearTimeout(timer);
  }
}

export function localTurns(coachResults) {
  const rows = [...(coachResults || [])].reverse().slice(-3);
  const turns = [];
  for (const row of rows) {
    let summary = {};
    let result = {};
    try { summary = JSON.parse(row.summary_json || '{}'); } catch { summary = {}; }
    try { result = JSON.parse(row.result_json || '{}'); } catch { result = {}; }
    if (summary.question) turns.push({ role: 'user', text: String(summary.question).slice(0, 240) });
    if (result.modelText) turns.push({ role: 'assistant', text: String(result.modelText).slice(0, 500) });
  }
  return turns;
}
