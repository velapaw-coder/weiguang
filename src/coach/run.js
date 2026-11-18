import { runCoach } from './graph.js';
import { localTurns, postCoach } from './proxy-client.js';

export async function runDeviceCoach({ question, snapshot, observations, consent, proxyUrl, proxyToken, online }) {
  const configured = Boolean(proxyUrl && proxyToken);
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
      proxyConfigured: configured,
      online: online !== false,
      turns: localTurns(snapshot?.coachResults),
    }),
    callModel: ({ summary, turns }) => postCoach({ proxyUrl, proxyToken, summary, turns }),
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
