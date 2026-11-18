/** User-stated expectation. Not a device reading and not a per-metric rule. */
export const USER_SAMPLE_EXPECTATION_MIN = 10;
const LAG_MS = 2 * 60 * 60 * 1000;

export function assess({ observations = [], sync = [], connected = false, now = Date.now() } = {}) {
  const metrics = {};
  for (const row of observations) {
    const metric = row.metric;
    if (!metrics[metric]) metrics[metric] = [];
    metrics[metric].push(row);
  }
  const metricReports = {};
  for (const [metric, rows] of Object.entries(metrics)) {
    const latest = rows.slice().sort((a, b) => received(b) - received(a))[0];
    metricReports[metric] = {
      count: rows.length,
      deviceSampledAt: text(latest.device_sampled_at ?? latest.deviceSampledAt),
      phoneReceivedAt: received(latest),
      resolution: metric === 'steps' || metric === 'steps_hour' || metric === 'sleep' ? 'day_or_session' : 'device_sample',
      usesTenMinuteExpectation: false,
    };
  }
  const successes = sync
    .map((row) => Number(row.last_success_at ?? row.lastSuccessAt ?? 0))
    .filter((value) => value > 0);
  const lastSuccessAt = successes.length ? Math.max(...successes) : null;
  const lagMs = lastSuccessAt == null ? null : Math.max(0, now - lastSuccessAt);
  const pendingSync = !connected || lastSuccessAt == null || lagMs > LAG_MS;
  const notices = [];
  if (!observations.length) notices.push('还没有同步到的健康记录。');
  if (!connected) notices.push('手环未连接。数据会滞后，待你打开应用后同步。');
  if (connected && lagMs != null && lagMs > LAG_MS) notices.push('距离上次成功同步已经较久。');
  notices.push('你说过手环大约每 10 分钟采集一次。这尚未由 SDK 或实机读数证实，也不会套用到每一个指标。');
  notices.push('单次数值不是医疗异常。');
  return {
    hasAnySample: observations.length > 0,
    metrics: metricReports,
    lastSuccessAt,
    lagMs,
    pendingSync,
    userReportedExpectationMin: USER_SAMPLE_EXPECTATION_MIN,
    expectationVerified: false,
    expectationAppliesToAllMetrics: false,
    singlePointIsNotMedical: true,
    notices,
  };
}

function received(row) {
  return Number(row.phone_received_at ?? row.phoneReceivedAt ?? 0);
}

function text(value) {
  return value == null || value === '' ? null : String(value);
}
