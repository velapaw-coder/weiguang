import { primaryValue } from '../coach/history.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function parsed(row) {
  const raw = row?.value_json ?? row?.valueJson ?? row?.value;
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function pad(number) {
  return String(number).padStart(2, '0');
}

function localKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Calendar day of a row: the band's own date when it sent one, otherwise the phone receive date. */
export function dayKeyOf(row) {
  const digits = String(row?.device_sampled_at ?? row?.deviceSampledAt ?? '').replace(/\D/g, '');
  if (digits.length >= 8) {
    const year = Number(digits.slice(0, 4));
    const month = Number(digits.slice(4, 6));
    const day = Number(digits.slice(6, 8));
    if (year >= 2000 && year < 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }
  const received = Number(row?.phone_received_at ?? row?.phoneReceivedAt ?? 0);
  return received > 0 ? localKey(new Date(received)) : null;
}

/** "今天", "昨天" or "11/17" for the day a row belongs to. */
export function dayLabel(row, now = Date.now()) {
  const key = dayKeyOf(row);
  if (!key) return '';
  if (key === localKey(new Date(now))) return '今天';
  if (key === localKey(new Date(now - DAY_MS))) return '昨天';
  const [, month, day] = key.split('-');
  return `${Number(month)}/${Number(day)}`;
}

export function formatMinutes(total) {
  const minutes = Math.round(Number(total));
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} 分`;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

/** Text for one stored reading, or null when the row holds no usable value. */
export function formatMetric(metric, row) {
  if (metric === 'mood_pressure') {
    if (row?.quality === 'invalid_device_value') return null;
    const value = parsed(row);
    const parts = [];
    if (Number.isFinite(value?.pressure)) parts.push(`压力 ${value.pressure}`);
    if (Number.isFinite(value?.mood)) parts.push(`情绪 ${value.mood}`);
    if (Number.isFinite(value?.fatigue)) parts.push(`疲劳 ${value.fatigue}`);
    return parts.length ? parts.join(' · ') : null;
  }
  const value = primaryValue({ ...row, metric });
  if (value == null) return null;
  if (metric === 'steps') return `${Math.round(value).toLocaleString('en-US')} 步`;
  if (metric === 'heart_rate') return `${value} 次/分`;
  if (metric === 'spo2' || metric === 'battery') return `${value}%`;
  if (metric === 'sleep') return formatMinutes(value);
  if (metric === 'temperature') return `${Number(value).toFixed(1)} ℃`;
  return String(value);
}

const ERRORS = {
  bluetooth_off: '手机蓝牙没有打开',
  permission_denied: '还没有允许蓝牙权限',
  bluetooth_connect_denied: '还没有允许蓝牙连接权限',
  sdk_unavailable: '这个安装包不含手环连接组件',
  connect_failed: '连接没有成功，请让手环靠近手机后重试',
  connection_unavailable: '手环连接暂时不可用，请重试',
  callback_failed: '手环返回了无法处理的数据，连接已断开',
  bind_failed: '手环绑定没有完成，请重试',
  sync_failed: '同步没有完成',
  device_busy: '手环正忙，空闲后会继续同步',
  not_connected: '手环还没有连接',
  address_not_selected: '请从这次搜索到的设备里选择',
  bad_address: '请从这次搜索到的设备里选择',
  stop_scan_failed: '停止搜索没有成功',
  disconnect_failed: '断开没有成功',
  web_unavailable: '浏览器预览不能连接手环，请在安卓客户端里操作',
  sqlite_android_only: '浏览器预览不保存记录，请在安卓客户端里操作',
  store_failed: '没有写入手机上的记录库',
  missing_task: '这个任务已经不存在',
  empty_task: '任务内容是空的',
  empty_goal: '目标内容是空的',
  unconfirmed: '需要你确认后才会安排',
  disabled: '提醒已关闭',
  inactive: '任务已完成或已移除，不再提醒',
  notify_denied: '还没有允许通知权限，提醒不会弹出',
  bad_local_time: '提醒时间没有填对',
  bad_timezone: '读不到手机时区',
  past: '这个时间已经过去了',
  deduped: '同一时间的提醒已经安排过',
  cooldown: '刚提醒过，稍后才会再次提醒',
};

/** Chinese sentence for a native result code. Unknown codes stay visible so they can be reported. */
export function errorText(code) {
  if (!code) return '';
  return ERRORS[code] || `操作没有完成（${code}）`;
}

export const PLAN_DAYS = 30;
export const PLAN_PHASES = [
  { from: 1, to: 3, title: '第 1–3 天', detail: '建立基线，了解当前状态', focus: ['记录睡眠和起床时间', '观察午后精力感受', '建立自己的初始基线'] },
  { from: 4, to: 7, title: '第 4–7 天', detail: '优化作息，建立睡前流程', focus: ['固定睡前 30 分钟的放松流程', '尽量在相近的时间上床', '继续记录醒来后的感受'] },
  { from: 8, to: 21, title: '第 8–21 天', detail: '持续执行，动态调整计划', focus: ['按任务清单持续执行', '每周和微光回顾一次记录', '根据同步到的记录调整任务'] },
  { from: 22, to: 30, title: '第 22–30 天', detail: '回顾变化，形成稳定习惯', focus: ['对照 30 天里的记录变化', '保留对你有效的习惯', '想一想下一阶段的目标'] },
];

function startOfDay(ms) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Day counter of the 30-day plan from the moment the user started it. Null before it starts. */
export function planProgress(startedAt, now = Date.now()) {
  const start = Number(startedAt);
  if (!Number.isFinite(start) || start <= 0) return null;
  const elapsed = Math.round((startOfDay(now) - startOfDay(start)) / DAY_MS) + 1;
  const finished = elapsed > PLAN_DAYS;
  const day = Math.min(Math.max(elapsed, 1), PLAN_DAYS);
  const phase = PLAN_PHASES.find((item) => day >= item.from && day <= item.to) || PLAN_PHASES[PLAN_PHASES.length - 1];
  return { day, finished, percent: Math.round((day / PLAN_DAYS) * 100), phase };
}

const DAY_TOTAL = new Set(['steps', 'sleep']);

/**
 * One bucket per calendar day, oldest first. Steps and sleep keep the largest value of the day
 * (the band re-sends a growing day total); sampled metrics show the day's average.
 */
export function dailySeries(rows, metric, days, now = Date.now()) {
  const buckets = new Map();
  for (const row of rows || []) {
    const value = primaryValue({ ...row, metric });
    const key = dayKeyOf(row);
    if (value == null || !key) continue;
    const bucket = buckets.get(key) || { sum: 0, count: 0, max: -Infinity };
    bucket.sum += value;
    bucket.count += 1;
    bucket.max = Math.max(bucket.max, value);
    buckets.set(key, bucket);
  }
  const series = [];
  const today = startOfDay(now);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    const key = localKey(date);
    const bucket = buckets.get(key);
    let value = null;
    if (bucket) {
      const average = bucket.sum / bucket.count;
      value = DAY_TOTAL.has(metric) ? bucket.max : Math.round(average * 10) / 10;
    }
    series.push({ key, label: `${date.getMonth() + 1}/${date.getDate()}`, value });
  }
  return series;
}

/** Latest and previous recorded day of a series, or null when fewer than two days have values. */
export function seriesDelta(series) {
  const recorded = (series || []).filter((item) => item.value != null);
  if (recorded.length < 2) return null;
  const latest = recorded[recorded.length - 1];
  const previous = recorded[recorded.length - 2];
  return { latest, previous, delta: Math.round((latest.value - previous.value) * 10) / 10 };
}

export function seriesAverage(series) {
  const recorded = (series || []).filter((item) => item.value != null);
  if (!recorded.length) return null;
  return { days: recorded.length, average: recorded.reduce((sum, item) => sum + item.value, 0) / recorded.length };
}

/** Five axis labels, top first, on a rounded scale that covers the largest value. */
export function axisTicks(max) {
  const peak = Number(max) > 0 ? Number(max) : 1;
  const rough = peak / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const ratio = rough / power;
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((candidate) => ratio <= candidate) * power;
  return [4, 3, 2, 1, 0].map((index) => Math.round(index * step * 10) / 10);
}

/** Evenly spread subset of day labels so a 30-day axis stays readable. */
export function axisLabels(series, count) {
  const list = series || [];
  if (list.length <= count) return list.map((item) => item.label);
  const labels = [];
  for (let index = 0; index < count; index += 1) {
    labels.push(list[Math.round((index * (list.length - 1)) / (count - 1))].label);
  }
  return labels;
}

/**
 * Days with at least seven hours of recorded sleep against shorter nights, by that day's steps.
 * A record comparison only; null until both groups have a day.
 */
export function sleepActivityContrast(sleepSeries, stepSeries) {
  const steps = new Map((stepSeries || []).filter((item) => item.value != null).map((item) => [item.key, item.value]));
  const longer = [];
  const shorter = [];
  for (const item of sleepSeries || []) {
    if (item.value == null || !steps.has(item.key)) continue;
    (item.value >= 420 ? longer : shorter).push(steps.get(item.key));
  }
  if (!longer.length || !shorter.length) return null;
  const mean = (list) => Math.round(list.reduce((sum, value) => sum + value, 0) / list.length);
  return { longerDays: longer.length, longerSteps: mean(longer), shorterDays: shorter.length, shorterSteps: mean(shorter) };
}

/** Average of the newer half of a series against the older half. Null unless both halves have values. */
export function halfChange(series) {
  const list = series || [];
  const middle = Math.floor(list.length / 2);
  const before = seriesAverage(list.slice(0, middle));
  const after = seriesAverage(list.slice(middle));
  if (!before || !after) return null;
  return { before: before.average, after: after.average, delta: after.average - before.average, beforeDays: before.days, afterDays: after.days };
}

/** Next wall-clock occurrence of HH:mm as yyyy-MM-ddTHH:mm, for a one-shot reminder. */
export function nextOccurrence(time, now = Date.now()) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time || ''));
  if (!match) return null;
  const date = new Date(now);
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (date.getTime() <= now) date.setDate(date.getDate() + 1);
  return `${localKey(date)}T${match[1]}:${match[2]}`;
}

/** "每天 22:45" or "11/20 22:45" for a task's stored reminder; empty when it has none. */
export function reminderText(task) {
  if (!task || !Number(task.reminder_enabled) || !task.reminder_local) return '';
  const local = String(task.reminder_local);
  if (Number(task.repeat_daily)) return `每天 ${local}`;
  const match = /^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(local);
  return match ? `${Number(match[1])}/${Number(match[2])} ${match[3]}` : local;
}

function channel(hex, index) {
  return parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
}

/** Opaque mix of two #rrggbb colours; `weight` is the share of the first. */
export function mixHex(first, second, weight) {
  const parts = [0, 1, 2].map((index) => Math.round(channel(first, index) * weight + channel(second, index) * (1 - weight)));
  return `#${parts.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}
