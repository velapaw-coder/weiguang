import { newestFirst, primaryValue } from './history.js';

const LIMIT = 1500;

/** Minimal coach payload. No device address, serial number, or raw history dump. */
export function minimalSummary({ observations = [], goals = [], tasks = [], question = '', quality }) {
  const grouped = new Map();
  for (const row of observations) {
    const list = grouped.get(row.metric) || [];
    list.push(row);
    grouped.set(row.metric, list);
  }
  const metrics = [];
  for (const [metric, rows] of grouped) {
    const ordered = rows.slice().sort(newestFirst);
    metrics.push({
      metric,
      points: ordered.slice(0, 3).map((row) => ({
        value: primaryValue(row),
        deviceSampledAt: row.device_sampled_at ?? row.deviceSampledAt ?? null,
        phoneReceivedAt: Number(row.phone_received_at ?? row.phoneReceivedAt ?? 0),
        quality: row.quality || 'recorded',
      })),
    });
  }
  const active = tasks.filter((task) => task.status === 'active').length;
  const done = tasks.filter((task) => task.status === 'done').length;
  const body = {
    question: String(question || '').slice(0, 240),
    goals: goals.map((goal) => (typeof goal === 'string' ? goal : goal.text)).filter(Boolean).slice(0, 8),
    tasks: { active, done },
    pendingSync: Boolean(quality?.pendingSync),
    metrics,
    boundary: metrics.some((metric) => metric.points.some((point) => point.value != null))
      ? '非诊断。不要安排通知或设备命令。缺数就说明不足。'
      : '没有手环数值。不要编造指标，不要把这次回答说成健康分析。非诊断。不要安排通知或设备命令。',
  };
  let json = JSON.stringify(body);
  while (json.length > LIMIT && body.metrics.some((metric) => metric.points.length > 1)) {
    body.metrics = body.metrics.map((metric) => ({ ...metric, points: metric.points.slice(0, 1) }));
    json = JSON.stringify(body);
  }
  if (json.length > LIMIT) {
    body.question = '';
    body.goals = body.goals.slice(0, 1);
    json = JSON.stringify(body);
  }
  return { json, body };
}
