import { runCoach } from './graph.js';

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
    }),
    callModel: async (summary) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(`${proxyUrl.replace(/\/$/, '')}/v1/coach`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${proxyToken}`,
          },
          body: JSON.stringify({ summary }),
          signal: controller.signal,
        });
        return response.json();
      } finally {
        clearTimeout(timer);
      }
    },
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
