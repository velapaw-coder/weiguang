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

export async function runDeviceCoach({ question, snapshot, observations, consent, proxyUrl, proxyToken, online, env = runtimeEnv() }) {
  const proxyConfigured = Boolean(proxyUrl && proxyToken);
  const direct = readDirectConfig(env, await directFileText(env));
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
      proxyConfigured: proxyConfigured || direct.configured,
      online: online !== false,
      turns: localTurns(snapshot?.coachResults),
    }),
    callModel: ({ summary, turns }) => (proxyConfigured
      ? postCoach({ proxyUrl, proxyToken, summary, turns })
      : postVolcDirect({ summary, turns, apiKey: direct.apiKey, model: direct.model, url: direct.url })),
    persist: async ({ values, checkpointJson, summaryJson }) => {
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
          followup: values.followup,
          proposals: values.proposals,
          notices: values.notices,
          modelText: values.modelText,
          stripped: values.stripped,
        }),
      });
    },
  });
}
