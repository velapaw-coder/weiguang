const VALUE_KEYS = ['step', 'bpm', 'percent', 'hrv', 'body', 'totalMinutes', 'pressure', 'mood', 'fatigue'];

export function numericValue(row) {
  const raw = row?.value_json ?? row?.valueJson ?? row?.value;
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof parsed === 'number') return parsed;
  if (!parsed || typeof parsed !== 'object') return null;
  for (const key of VALUE_KEYS) {
    if (typeof parsed[key] === 'number' && Number.isFinite(parsed[key])) return parsed[key];
  }
  return null;
}

/** Newest first by the band's own clock; rows without one rank last, then by receive time. */
export function newestFirst(a, b) {
  const left = String(a?.device_sampled_at ?? a?.deviceSampledAt ?? '');
  const right = String(b?.device_sampled_at ?? b?.deviceSampledAt ?? '');
  if (left !== right) {
    if (!left) return 1;
    if (!right) return -1;
    return right.localeCompare(left);
  }
  return Number(b?.phone_received_at ?? b?.phoneReceivedAt ?? 0) - Number(a?.phone_received_at ?? a?.phoneReceivedAt ?? 0);
}

export function primaryValue(row) {
  const value = numericValue(row);
  if (row?.quality === 'invalid_device_value') return null;
  if (row?.metric === 'temperature' && (value == null || value < 30 || value > 45)) return null;
  return value;
}

export function metricPresentation({ row, known = null, supported = null, syncStatus = '' } = {}) {
  if (primaryValue(row) != null) return { kind: 'value' };
  if (row?.quality === 'invalid_device_value' || (row?.metric === 'temperature' && numericValue(row) != null)) {
    return { kind: 'invalid' };
  }
  if (known === false) return { kind: 'unknown' };
  if (supported === false) return { kind: 'unsupported' };
  if (syncStatus === 'failed') return { kind: 'failed' };
  if (syncStatus === 'success' || syncStatus === 'skipped') return { kind: 'empty' };
  if (syncStatus === 'running') return { kind: 'running' };
  if (syncStatus === 'not_read' || syncStatus === 'unsupported') {
    return { kind: syncStatus === 'unsupported' ? 'unsupported' : 'unknown' };
  }
  return { kind: 'idle' };
}

export const METRIC_STATUS = {
  invalid: '读数无效',
  unsupported: '设备不支持',
  unknown: '能力未读到',
  failed: '同步失败',
  empty: '没有记录',
  running: '同步中',
  idle: '未同步',
};

export function compareSeries(rows) {
  const points = (rows || [])
    .map((row) => ({
      row,
      at: String(row.device_sampled_at ?? row.deviceSampledAt ?? ''),
      received: Number(row.phone_received_at ?? row.phoneReceivedAt ?? 0),
      value: primaryValue(row),
    }))
    .filter((point) => point.value != null)
    .sort((a, b) => (a.at || String(a.received)).localeCompare(b.at || String(b.received)) || a.received - b.received);
  if (points.length < 2) {
    return { status: 'insufficient', points: points.length, medical: false };
  }
  const previous = points[points.length - 2];
  const latest = points[points.length - 1];
  return {
    status: 'compared',
    previous: previous.value,
    latest: latest.value,
    delta: latest.value - previous.value,
    previousDeviceTime: previous.at || null,
    latestDeviceTime: latest.at || null,
    medical: false,
  };
}
