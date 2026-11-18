import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { assess } from './quality.js';
import { numericValue } from './history.js';
import { minimalSummary } from './summary.js';
import { encodeSaver, restoreSaver } from './checkpoint.js';

const CoachState = Annotation.Root({
  question: Annotation({ reducer: (_left, right) => right ?? '', default: () => '' }),
  goals: Annotation({ reducer: (_left, right) => right ?? [], default: () => [] }),
  observations: Annotation({ reducer: (_left, right) => right ?? [], default: () => [] }),
  tasks: Annotation({ reducer: (_left, right) => right ?? [], default: () => [] }),
  sync: Annotation({ reducer: (_left, right) => right ?? [], default: () => [] }),
  connected: Annotation({ reducer: (_left, right) => Boolean(right), default: () => false }),
  consent: Annotation({ reducer: (_left, right) => Boolean(right), default: () => false }),
  proxyConfigured: Annotation({ reducer: (_left, right) => Boolean(right), default: () => false }),
  online: Annotation({ reducer: (_left, right) => right !== false, default: () => true }),
  turns: Annotation({ reducer: (_left, right) => right ?? [], default: () => [] }),
  now: Annotation({ reducer: (_left, right) => right ?? Date.now(), default: () => Date.now() }),
  quality: Annotation({ reducer: (_left, right) => right ?? {}, default: () => ({}) }),
  minimalSummary: Annotation({ reducer: (_left, right) => right ?? '', default: () => '' }),
  modelStatus: Annotation({ reducer: (_left, right) => right ?? 'not_run', default: () => 'not_run' }),
  modelText: Annotation({ reducer: (_left, right) => right ?? '', default: () => '' }),
  proposals: Annotation({ reducer: (_left, right) => right ?? [], default: () => [] }),
  followup: Annotation({ reducer: (_left, right) => right ?? '', default: () => '' }),
  notices: Annotation({ reducer: (_left, right) => right ?? [], default: () => [] }),
  stripped: Annotation({ reducer: (_left, right) => right ?? [], default: () => [] }),
});

function localProposal(observations) {
  const steps = observations.find((row) => row.metric === 'steps' && numericValue(row) != null);
  if (!steps) return [];
  const value = numericValue(steps);
  const deviceSampledAt = steps.device_sampled_at ?? steps.deviceSampledAt ?? null;
  const phoneReceivedAt = Number(steps.phone_received_at ?? steps.phoneReceivedAt ?? 0);
  return [{
    title: '对照已同步的步数，安排一次走路',
    detail: `设备记录步数 ${value}。设备时间 ${deviceSampledAt || '没有'}。手机收到时间 ${phoneReceivedAt || '没有'}。这只是记录对照，不是健康结论。`,
    source: 'local_rule',
    basedOn: [{ metric: 'steps', value, deviceSampledAt, phoneReceivedAt }],
    schedulesNotification: false,
    deviceCommands: [],
  }];
}

function sanitize(proposals) {
  const kept = [];
  const stripped = [];
  for (const proposal of proposals || []) {
    const blob = JSON.stringify(proposal);
    const blocked = proposal.schedulesNotification === true
      || (Array.isArray(proposal.deviceCommands) && proposal.deviceCommands.length > 0)
      || /setExact|oxygenAutomatic|设备命令|立即通知|每隔\s*10\s*分钟/.test(blob);
    if (blocked) {
      stripped.push(proposal.title || 'removed');
      continue;
    }
    kept.push({ ...proposal, schedulesNotification: false, deviceCommands: [] });
  }
  return { kept, stripped };
}

export function buildCoachGraph(deps) {
  const graph = new StateGraph(CoachState)
    .addNode('loadRecords', async (state) => {
      const loaded = deps.load ? await deps.load() : {};
      return {
        goals: loaded.goals ?? state.goals,
        observations: loaded.observations ?? state.observations,
        tasks: loaded.tasks ?? state.tasks,
        sync: loaded.sync ?? state.sync,
        connected: loaded.connected ?? state.connected,
        consent: loaded.consent ?? state.consent,
        proxyConfigured: loaded.proxyConfigured ?? state.proxyConfigured,
        online: loaded.online ?? state.online,
        turns: loaded.turns ?? state.turns,
      };
    })
    .addNode('checkQuality', (state) => {
      const quality = assess(state);
      return { quality, notices: quality.notices };
    })
    .addNode('buildSummary', (state) => {
      const summary = minimalSummary(state);
      return { minimalSummary: summary.json };
    })
    .addNode('askModel', async (state) => {
      try {
        const response = await deps.callModel({ summary: state.minimalSummary, turns: state.turns || [] });
        const status = response?.status || 'model_failed';
        const health = state.quality?.hasAnySample;
        const modelProposals = health && status === 'ok' && Array.isArray(response.proposals)
          ? response.proposals.map((item) => ({ ...item, source: 'langgraph' }))
          : [];
        return {
          modelStatus: status,
          modelText: status === 'ok' ? String(response.text || '') : '',
          proposals: modelProposals.length ? modelProposals : localProposal(state.observations),
        };
      } catch {
        return { modelStatus: 'model_failed', modelText: '', proposals: localProposal(state.observations) };
      }
    })
    .addNode('localDraft', (state) => ({
      modelStatus: state.proxyConfigured ? (state.consent ? (state.online ? 'skipped' : 'offline') : 'consent_required') : 'model_unconfigured',
      proposals: state.quality?.hasAnySample ? localProposal(state.observations) : [],
    }))
    .addNode('review', (state) => {
      const { kept, stripped } = sanitize(state.proposals);
      const active = state.tasks.filter((task) => task.status === 'active').length;
      const done = state.tasks.filter((task) => task.status === 'done').length;
      const dataLine = state.quality?.hasAnySample
        ? '跟进只引用已经同步的记录。'
        : '没有足够的健康记录，不能据此生成依据。';
      return {
        proposals: kept,
        stripped,
        followup: `任务进行中 ${active}，已完成 ${done}。${dataLine}`,
      };
    })
    .addEdge(START, 'loadRecords')
    .addEdge('loadRecords', 'checkQuality')
    .addEdge('checkQuality', 'buildSummary')
    .addConditionalEdges('buildSummary', (state) => {
      const modelReady = state.consent && state.proxyConfigured && state.online;
      const greeting = String(state.question || '').trim().length > 0;
      return modelReady && (state.quality?.hasAnySample || greeting) ? 'askModel' : 'localDraft';
    }, { askModel: 'askModel', localDraft: 'localDraft' })
    .addEdge('askModel', 'review')
    .addEdge('localDraft', 'review')
    .addEdge('review', END);
  return graph;
}

export async function runCoach(input, deps) {
  const saver = new MemorySaver();
  restoreSaver(saver, input.checkpointJson);
  const app = buildCoachGraph(deps).compile({ checkpointer: saver });
  const config = { configurable: { thread_id: input.threadId || 'coach' } };
  const values = await app.invoke({ ...input, checkpointJson: undefined }, config);
  const checkpointJson = encodeSaver(saver);
  if (deps.persist) {
    await deps.persist({
      threadId: config.configurable.thread_id,
      values,
      checkpointJson,
      summaryJson: values.minimalSummary,
    });
  }
  return { values, checkpointJson };
}
