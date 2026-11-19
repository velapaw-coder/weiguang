import { newestFirst, primaryValue } from './history.js';

const LIMIT = 1500;

function dayAge(deviceSampledAt, now) {
  const raw = String(deviceSampledAt || '');
  if (raw.length >= 8 && /^\d{8}/.test(raw)) {
    const y = Number(raw.slice(0, 4));
    const m = Number(raw.slice(4, 6)) - 1;
    const d = Number(raw.slice(6, 8));
    const at = new Date(y, m, d).getTime();
    if (!Number.isFinite(at)) return null;
    const stamp = new Date(now);
    const today = new Date(stamp.getFullYear(), stamp.getMonth(), stamp.getDate()).getTime();
    return Math.round((today - at) / 86_400_000);
  }
  return null;
}

function freshness(deviceSampledAt, phoneReceivedAt, now) {
  const ageDays = dayAge(deviceSampledAt, now);
  if (ageDays == null) {
    const received = Number(phoneReceivedAt) || 0;
    if (!received) return { label: 'unknown', ageDays: null };
    const hours = Math.max(0, Math.round((now - received) / 3_600_000));
    return { label: hours <= 24 ? 'recent_receive' : 'older_receive', ageDays: Math.floor(hours / 24) };
  }
  if (ageDays <= 0) return { label: 'today', ageDays: 0 };
  if (ageDays === 1) return { label: 'yesterday', ageDays: 1 };
  return { label: 'older', ageDays };
}

/** Minimal coach payload. No device address, serial number, or raw history dump. */
export function minimalSummary({
  observations = [],
  goals = [],
  tasks = [],
  question = '',
  quality,
  now = Date.now(),
} = {}) {
  const grouped = new Map();
  for (const row of observations) {
    const list = grouped.get(row.metric) || [];
    list.push(row);
    grouped.set(row.metric, list);
  }
  const metrics = [];
  for (const [metric, rows] of grouped) {
    const ordered = rows.slice().sort(newestFirst);
    const report = quality?.metrics?.[metric];
    metrics.push({
      metric,
      support: report?.resolution || 'device_sample',
      points: ordered.slice(0, 3).map((row) => {
        const deviceSampledAt = row.device_sampled_at ?? row.deviceSampledAt ?? null;
        const phoneReceivedAt = Number(row.phone_received_at ?? row.phoneReceivedAt ?? 0);
        return {
          value: primaryValue(row),
          deviceSampledAt,
          phoneReceivedAt,
          quality: row.quality || 'recorded',
          freshness: freshness(deviceSampledAt, phoneReceivedAt, now),
        };
      }),
    });
  }
  const active = tasks.filter((task) => task.status === 'active');
  const done = tasks.filter((task) => task.status === 'done');
  const body = {
    question: String(question || '').slice(0, 240),
    goals: goals.map((goal) => (typeof goal === 'string' ? goal : goal.text)).filter(Boolean).slice(0, 8),
    tasks: {
      active: active.length,
      done: done.length,
      activeTitles: active.map((task) => task.title).filter(Boolean).slice(0, 5),
      recentDone: done.slice(0, 3).map((task) => ({
        title: task.title,
        at: Number(task.updated_at || task.updatedAt || 0) || null,
      })),
    },
    pendingSync: Boolean(quality?.pendingSync),
    metrics,
    boundary: metrics.some((metric) => metric.points.some((point) => point.value != null))
      ? '非诊断。只依据摘要里带 freshness 的点。今天=today，昨天=yesterday，older 不要说成今天。缺数就说明不足。不要安排通知或设备命令。压力/心率变异只报原值，不换算医学单位。'
      : '没有手环数值。不要编造指标，不要假装做了健康分析。可以问候并帮助设定目标。非诊断。不要安排通知或设备命令。',
  };
  let json = JSON.stringify(body);
  while (json.length > LIMIT && body.metrics.some((metric) => metric.points.length > 1)) {
    body.metrics = body.metrics.map((metric) => ({ ...metric, points: metric.points.slice(0, 1) }));
    json = JSON.stringify(body);
  }
  if (json.length > LIMIT) {
    body.question = '';
    body.goals = body.goals.slice(0, 1);
    body.tasks.activeTitles = body.tasks.activeTitles.slice(0, 1);
    body.tasks.recentDone = [];
    json = JSON.stringify(body);
  }
  return { json, body };
}
