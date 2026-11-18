const VALUE_KEYS = ['step', 'bpm', 'percent', 'hrv', 'body', 'totalMinutes', 'pressure'];

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

export function compareSeries(rows) {
  const points = (rows || [])
    .map((row) => ({
      row,
      at: String(row.device_sampled_at ?? row.deviceSampledAt ?? ''),
      received: Number(row.phone_received_at ?? row.phoneReceivedAt ?? 0),
      value: numericValue(row),
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
