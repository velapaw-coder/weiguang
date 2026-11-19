import { buildResponsesBody, interpretResponses } from '../../server/model-proxy/protocol.mjs';
import { runCoach } from './graph.js';
import { localTurns, postCoach } from './proxy-client.js';
import { postVolcDirect, readDirectConfig, runtimeEnv } from './volc-direct.js';

async function directFileText(env) {
  const location = env.WEIGUANG_VOLC_KEY_FILE;
  if (!location || typeof process === 'undefined' || !process.versions?.node) return '';
  try {
    const { readFile } = await import(/* @vite-ignore */ 'node:fs/promises');
    return await readFile(location, 'utf8');
  } catch {
    return '';
  }
}

async function androidStatus(androidBridge) {
  if (androidBridge?.debugModelStatus) return androidBridge.debugModelStatus();
  const { WeiguangStore, isAndroidApp } = await import('../band/native.js');
  if (!isAndroidApp()) return { debug: false, configured: false };
  try {
    return await WeiguangStore.debugModelStatus();
  } catch {
    return { debug: false, configured: false };
  }
}

async function postAndroidDebug({ summary, turns, androidBridge, model, url, signal }) {
  if (signal?.aborted) return { status: 'model_failed', reason: 'cancelled' };
  const body = JSON.stringify(buildResponsesBody({ summary, turns, model }));
  const bridge = androidBridge?.postDebugModel
    ? androidBridge
    : (await import('../band/native.js')).WeiguangStore;
  let posted;
  try {
    posted = await bridge.postDebugModel({ body, url });
  } catch {
    return { status: 'model_failed', reason: 'transport' };
  }
  if (signal?.aborted) return { status: 'model_failed', reason: 'cancelled' };
  if (!posted?.sent) return { status: 'model_unconfigured', reason: posted?.reason || 'key_not_configured' };
  let json = null;
  try {
    json = posted.bodyText ? JSON.parse(posted.bodyText) : null;
  } catch {
    json = null;
  }
  return interpretResponses(posted.httpStatus, json);
}

export async function runDeviceCoach({
  question,
  snapshot,
  observations,
  consent,
  proxyUrl,
  proxyToken,
  online,
  env = runtimeEnv(),
  androidBridge,
  signal,
}) {
  const proxyConfigured = Boolean(proxyUrl && proxyToken);
  const direct = readDirectConfig(env, await directFileText(env));
  const phone = await androidStatus(androidBridge);
  const phoneDirect = phone.debug === true && phone.configured === true;
  return runCoach({
    question,
    threadId: 'coach',
    checkpointJson: snapshot?.graphCheckpoint || '',
  }, {
    load: async () => ({
      goals: snapshot?.goals || [],
      observations,
      tasks: snapshot?.tasks || [],
      sync: snapshot?.sync || [],
      connected: snapshot?.connected === true,
      consent: consent === true,
      proxyConfigured: proxyConfigured || direct.configured || phoneDirect,
      online: online !== false,
      turns: localTurns(snapshot?.coachResults),
    }),
    callModel: ({ summary, turns }) => {
      if (signal?.aborted) return Promise.resolve({ status: 'model_failed', reason: 'cancelled' });
      if (proxyConfigured) return postCoach({ proxyUrl, proxyToken, summary, turns });
      if (phoneDirect) return postAndroidDebug({ summary, turns, androidBridge, model: direct.model, url: direct.url, signal });
      return postVolcDirect({ summary, turns, apiKey: direct.apiKey, model: direct.model, url: direct.url });
    },
    persist: async ({ values, checkpointJson, summaryJson }) => {
      if (signal?.aborted) return;
      const { WeiguangStore, isAndroidApp } = await import('../band/native.js');
      if (!isAndroidApp()) return;
      await WeiguangStore.saveGraphSnapshot({
        threadId: 'coach',
        valuesJson: JSON.stringify(values),
        checkpointJson,
      });
      await WeiguangStore.saveCoachResult({
        threadId: 'coach',
        status: values.modelStatus,
        summaryJson: summaryJson || '{}',
        resultJson: JSON.stringify({
          question: values.question || question || '',
          followup: values.followup,
          proposals: values.proposals,
          notices: values.notices,
          modelText: values.modelText,
          modelReason: values.modelReason || '',
          stripped: values.stripped,
        }),
      });
    },
  });
}
