import { buildResponsesBody, interpretResponses, modelName, responsesUrl } from '../../server/model-proxy/protocol.mjs';

/** Internal test path for LangGraph. The key stays in the process environment or a caller-supplied string. */
export function readDirectConfig(env = {}, fileText = '') {
  const channel = String(env.WEIGUANG_CHANNEL || 'debug');
  if (channel === 'release') return { channel, configured: false, apiKey: '', model: '', url: '' };
  const fromEnv = String(env.WEIGUANG_VOLC_API_KEY || '').trim();
  const fromFile = String(fileText || '').trim();
  const apiKey = fromEnv || fromFile;
  return {
    channel,
    configured: Boolean(apiKey),
    apiKey,
    model: modelName({ VOLC_ARK_MODEL: env.WEIGUANG_VOLC_MODEL || '' }),
    url: responsesUrl({
      VOLC_ARK_RESPONSES_URL: env.WEIGUANG_VOLC_RESPONSES_URL || '',
      VOLC_ARK_BASE_URL: env.WEIGUANG_VOLC_BASE_URL || '',
    }),
  };
}

export function runtimeEnv() {
  if (typeof process !== 'undefined' && process.env) return process.env;
  return {};
}

export async function postVolcDirect({
  summary,
  turns = [],
  apiKey,
  model,
  url,
  fetchImpl = fetch,
  timeoutMs = 20000,
} = {}) {
  if (!apiKey) return { status: 'model_unconfigured', reason: 'key_not_configured' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildResponsesBody({ summary, turns, model })),
      signal: controller.signal,
    });
    const httpStatus = response.status;
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return interpretResponses(httpStatus, body);
  } catch {
    return { status: 'model_failed', reason: 'timeout' };
  } finally {
    clearTimeout(timer);
  }
}
