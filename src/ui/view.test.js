import { describe, expect, it } from 'vitest';
import {
  axisLabels, axisTicks, dailySeries, dayKeyOf, dayLabel, errorText, formatMetric, halfChange, mixHex,
  nextOccurrence, planProgress, reminderText, seriesDelta, sleepActivityContrast,
} from './view.js';

const at = (year, month, day, hour = 12, minute = 0) => new Date(year, month - 1, day, hour, minute).getTime();
const row = (metric, deviceSampledAt, value, receivedAt = at(2026, 11, 19)) => ({
  metric, device_sampled_at: deviceSampledAt, phone_received_at: receivedAt, value_json: JSON.stringify(value), quality: 'recorded',
});

describe('day of a reading', () => {
  it('uses the band date, not the day the phone received it', () => {
    expect(dayKeyOf(row('steps', '20261117', { step: 1 }, at(2026, 11, 19)))).toBe('2026-11-17');
    expect(dayKeyOf(row('heart_rate', '2026-11-18 07:40:00', { bpm: 60 }))).toBe('2026-11-18');
  });

  it('falls back to the receive day when the band sent no usable date', () => {
    expect(dayKeyOf(row('battery', null, { percent: 80 }, at(2026, 11, 19, 8)))).toBe('2026-11-19');
    expect(dayKeyOf(row('steps', '0000', { step: 1 }, at(2026, 11, 19, 8)))).toBe('2026-11-19');
    expect(dayKeyOf({})).toBe(null);
  });

  it('labels today, yesterday and older days', () => {
    const now = at(2026, 11, 19, 9);
    expect(dayLabel(row('steps', '20261119', { step: 1 }), now)).toBe('今天');
    expect(dayLabel(row('steps', '20261118', { step: 1 }), now)).toBe('昨天');
    expect(dayLabel(row('steps', '20261107', { step: 1 }), now)).toBe('11/7');
  });
});

describe('reading text', () => {
  it('formats each metric in its own unit', () => {
    expect(formatMetric('sleep', row('sleep', '20261119', { totalMinutes: 444 }))).toBe('7 小时 24 分');
    expect(formatMetric('sleep', row('sleep', '20261119', { totalMinutes: 420 }))).toBe('7 小时');
    expect(formatMetric('steps', row('steps', '20261119', { step: 12345 }))).toBe('12,345 步');
    expect(formatMetric('heart_rate', row('heart_rate', '20261119', { bpm: 58 }))).toBe('58 次/分');
    expect(formatMetric('spo2', row('spo2', '20261119', { percent: 98 }))).toBe('98%');
    expect(formatMetric('temperature', row('temperature', '20261119', { body: 36.5 }))).toBe('36.5 ℃');
  });

  it('names every part of a mood reading instead of calling a mood value pressure', () => {
    expect(formatMetric('mood_pressure', row('mood_pressure', '20261119', { mood: 3, fatigue: 40 }))).toBe('情绪 3 · 疲劳 40');
    expect(formatMetric('mood_pressure', row('mood_pressure', '20261119', { pressure: 55 }))).toBe('压力 55');
  });

  it('returns nothing for invalid or implausible device values', () => {
    expect(formatMetric('heart_rate', { ...row('heart_rate', '20261119', { bpm: 0 }), quality: 'invalid_device_value' })).toBe(null);
    expect(formatMetric('temperature', row('temperature', '20261119', { body: 12 }))).toBe(null);
    expect(formatMetric('mood_pressure', row('mood_pressure', '20261119', { moodText: '' }))).toBe(null);
  });
});

describe('native codes', () => {
  it('never shows a known code raw', () => {
    for (const code of ['connect_failed', 'bluetooth_off', 'permission_denied', 'sdk_unavailable', 'callback_failed', 'sync_failed', 'device_busy', 'not_connected']) {
      expect(errorText(code)).not.toMatch(/[a-z_]{4,}/);
    }
    expect(errorText('')).toBe('');
  });

  it('keeps an unknown code visible for reporting', () => {
    expect(errorText('brand_new_code')).toBe('操作没有完成（brand_new_code）');
  });
});

describe('30-day plan', () => {
  it('has not started without a start time', () => {
    expect(planProgress(undefined)).toBe(null);
    expect(planProgress('')).toBe(null);
  });

  it('counts calendar days from the start day', () => {
    const start = at(2026, 11, 19, 23, 50);
    expect(planProgress(start, at(2026, 11, 19, 23, 55))).toMatchObject({ day: 1, percent: 3, finished: false });
    expect(planProgress(start, at(2026, 11, 20, 0, 5)).day).toBe(2);
    expect(planProgress(start, at(2026, 11, 22, 8)).phase.title).toBe('第 4–7 天');
    expect(planProgress(start, at(2026, 12, 18, 8))).toMatchObject({ day: 30, percent: 100, finished: false });
    expect(planProgress(start, at(2026, 12, 19, 8))).toMatchObject({ day: 30, finished: true });
  });
});

describe('daily series', () => {
  const now = at(2026, 11, 19, 20);

  it('orders days oldest first whatever order the rows arrive in', () => {
    const rows = [
      row('steps', '20261119', { step: 900 }, 1),
      row('steps', '20261117', { step: 7000 }, 3),
      row('steps', '20261118', { step: 5000 }, 2),
    ];
    const series = dailySeries(rows, 'steps', 7, now);
    expect(series).toHaveLength(7);
    expect(series.slice(-3).map((item) => item.value)).toEqual([7000, 5000, 900]);
    expect(series.slice(-3).map((item) => item.label)).toEqual(['11/17', '11/18', '11/19']);
    expect(series[0]).toMatchObject({ label: '11/13', value: null });
  });

  it('keeps the largest day total for steps and averages sampled metrics', () => {
    const steps = [row('steps', '20261119', { step: 300 }), row('steps', '20261119', { step: 900 })];
    expect(dailySeries(steps, 'steps', 1, now)[0].value).toBe(900);
    const heart = [row('heart_rate', '20261119080000', { bpm: 60 }), row('heart_rate', '20261119081000', { bpm: 71 })];
    expect(dailySeries(heart, 'heart_rate', 1, now)[0].value).toBe(65.5);
  });

  it('leaves out invalid readings and days outside the range', () => {
    const rows = [
      { ...row('heart_rate', '20261119', { bpm: 0 }), quality: 'invalid_device_value' },
      row('heart_rate', '20261001', { bpm: 70 }),
    ];
    expect(dailySeries(rows, 'heart_rate', 7, now).every((item) => item.value == null)).toBe(true);
  });

  it('compares the two most recent recorded days', () => {
    const series = dailySeries([row('steps', '20261116', { step: 4000 }), row('steps', '20261119', { step: 5200 })], 'steps', 7, now);
    expect(seriesDelta(series)).toMatchObject({ delta: 1200, latest: { label: '11/19' }, previous: { label: '11/16' } });
    expect(seriesDelta(dailySeries([row('steps', '20261119', { step: 1 })], 'steps', 7, now))).toBe(null);
  });
});

describe('chart axis', () => {
  it('covers the peak with rounded steps', () => {
    expect(axisTicks(6842)).toEqual([8000, 6000, 4000, 2000, 0]);
    expect(axisTicks(98)).toEqual([100, 75, 50, 25, 0]);
    expect(axisTicks(444)).toEqual([600, 450, 300, 150, 0]);
    expect(axisTicks(10240)).toEqual([12000, 9000, 6000, 3000, 0]);
    expect(axisTicks(7.4)).toEqual([8, 6, 4, 2, 0]);
    expect(axisTicks(0)[4]).toBe(0);
  });

  it('thins day labels and keeps both ends', () => {
    const series = Array.from({ length: 30 }, (_, index) => ({ label: `d${index}` }));
    expect(axisLabels(series, 5)).toEqual(['d0', 'd7', 'd15', 'd22', 'd29']);
    expect(axisLabels(series.slice(0, 3), 5)).toEqual(['d0', 'd1', 'd2']);
  });
});

describe('record comparisons', () => {
  it('contrasts steps on long and short sleep days only when both exist', () => {
    const sleep = [{ key: 'a', value: 450 }, { key: 'b', value: 300 }, { key: 'c', value: 480 }, { key: 'd', value: null }];
    const steps = [{ key: 'a', value: 8000 }, { key: 'b', value: 3000 }, { key: 'c', value: 6000 }, { key: 'd', value: 1 }];
    expect(sleepActivityContrast(sleep, steps)).toEqual({ longerDays: 2, longerSteps: 7000, shorterDays: 1, shorterSteps: 3000 });
    expect(sleepActivityContrast(sleep.slice(0, 1), steps)).toBe(null);
  });

  it('compares the newer half of a range with the older half', () => {
    const series = [{ value: 400 }, { value: null }, { value: 420 }, { value: 460 }];
    expect(halfChange(series)).toMatchObject({ before: 400, after: 440, delta: 40, beforeDays: 1, afterDays: 2 });
    expect(halfChange([{ value: null }, { value: 3 }])).toBe(null);
  });
});

describe('reminders', () => {
  it('picks today when the time is still ahead and tomorrow otherwise', () => {
    expect(nextOccurrence('22:45', at(2026, 11, 19, 20))).toBe('2026-11-19T22:45');
    expect(nextOccurrence('07:30', at(2026, 11, 19, 20))).toBe('2026-11-20T07:30');
    expect(nextOccurrence('', at(2026, 11, 19, 20))).toBe(null);
  });

  it('describes a stored reminder', () => {
    expect(reminderText({ reminder_enabled: 1, repeat_daily: 1, reminder_local: '22:45' })).toBe('每天 22:45');
    expect(reminderText({ reminder_enabled: 1, repeat_daily: 0, reminder_local: '2026-11-20T07:30' })).toBe('11/20 07:30');
    expect(reminderText({ reminder_enabled: 0, repeat_daily: 1, reminder_local: '22:45' })).toBe('');
  });
});

describe('system bar colour', () => {
  it('mixes two colours by weight', () => {
    expect(mixHex('#ffffff', '#000000', 0.5)).toBe('#808080');
    expect(mixHex('#5d8ed4', '#17254c', 1)).toBe('#5d8ed4');
  });
});
