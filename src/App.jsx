import React, { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, Battery, Bell, Bluetooth, CalendarDays,
  Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Crown, Gauge,
  Heart, HeartPulse, Home, LockKeyhole, MessageCircle, Moon, Plus, Send, Settings2,
  ShieldCheck, Sparkles, Target, Thermometer, TrendingUp, UserRound, Watch, Wind,
} from 'lucide-react';
import { AppShell, isAndroidApp, UteBand, WeiguangStore } from './band/native.js';
import { assess } from './coach/quality.js';
import { metricPresentation, METRIC_STATUS } from './coach/history.js';
import { runDeviceCoach } from './coach/run.js';
import {
  axisLabels, axisTicks, dailySeries, dayLabel, errorText, formatMetric, formatMinutes, halfChange, mixHex,
  nextOccurrence, PLAN_DAYS, PLAN_PHASES, planProgress, reminderText, seriesDelta, sleepActivityContrast,
} from './ui/view.js';

const ONBOARD = ['welcome', 'connect', 'survey', 'goals', 'generated', 'ready'];
const MAIN = ['home', 'coach', 'plan', 'insights', 'membership', 'profile'];
const DETAIL = {
  notifications: '通知', 'coach-info': 'AI 教练说明', preferences: '我的目标与偏好',
  memory: '健康档案与记忆', device: '设备管理', reminders: '通知与提醒',
  privacy: '数据与隐私', help: '帮助与反馈', 'membership-detail': '会员方案',
};
const DETAIL_PARENT = { notifications: 'home', 'coach-info': 'coach', 'membership-detail': 'membership' };
const SCREENS = [...ONBOARD, ...MAIN, ...Object.keys(DETAIL)];
const nav = [
  ['home', Home, '今日'], ['coach', MessageCircle, '教练'],
  ['plan', CalendarDays, '计划'], ['insights', TrendingUp, '洞察'],
  ['profile', UserRound, '我的'],
];
const BAND_COLORS = [
  ['麦穗色', '#a66a48'], ['经典黑', '#444852'], ['浅蓝色', '#5d8ed4'], ['高级灰', '#818894'],
  ['玫红色', '#d95776'], ['军绿色', '#668572'], ['蔚蓝色', '#475d9e'], ['爱马橙', '#e48739'],
  ['原野绿', '#8eaa3b'], ['珍珠粉', '#cb8da0'], ['风信紫', '#a18cc7'], ['星光色', '#b8aa96'],
];
const surveyItems = [
  { icon: Moon, q: '你目前最想改善什么？', sub: '睡眠 / 精力 / 压力 / 作息', options: ['睡眠', '精力', '压力', '作息'] },
  { icon: CalendarDays, q: '你的工作和生活节奏是怎样的？', sub: '上班 / 创业 / 轮班 / 经常出差', options: ['上班', '创业', '轮班', '经常出差'] },
  { icon: Clock3, q: '你的大致作息时间？', sub: '入睡、起床、工作高峰', options: ['22:30 前睡', '23:30 前睡', '凌晨后睡', '不规律'] },
  { icon: Target, q: '你当前的主要困扰？', sub: '入睡困难、易醒、白天疲惫等', options: ['入睡困难', '夜间易醒', '白天疲惫', '注意力不足'] },
];
const GOAL_CHOICES = ['平均睡眠时长 ≥ 7 小时', '就寝时间 23:30 前', '减少下午疲惫感'];
const TASK_IDEAS = ['23:30 前开始放松', '午后散步 10 分钟', '睡前 30 分钟远离手机'];
const HOME_METRICS = [
  [Moon, 'sleep', '睡眠'], [Heart, 'heart_rate', '心率'], [Wind, 'spo2', '血氧'], [Activity, 'steps', '步数'],
];
const HEALTH_METRICS = [
  [Heart, 'heart_rate', '心率'], [Wind, 'spo2', '血氧'], [HeartPulse, 'hrv', '心率变异'],
  [Thermometer, 'temperature', '体温'], [Gauge, 'mood_pressure', '压力'],
];
const METRIC_NAMES = {
  steps: '步数', sleep: '睡眠', heart_rate: '心率', spo2: '血氧', hrv: '心率变异', temperature: '体温', mood_pressure: '压力',
};
const SYNC_NAMES = { ...METRIC_NAMES, battery: '电量', steps_hour: '步数' };
const CHART_UNITS = {
  steps: '步', sleep: '小时', heart_rate: '次/分 · 日均', spo2: '% · 日均', hrv: '日均', temperature: '℃ · 日均', mood_pressure: '日均',
};
const COACH_METRICS = ['steps', 'heart_rate', 'spo2', 'sleep', 'hrv', 'temperature', 'mood_pressure', 'battery'];
const TASK_SOURCES = { user: '自己添加', langgraph: '教练建议 · 已确认', local_rule: '记录对照 · 已确认' };
const MODEL_NOTES = {
  model_unconfigured: '云端模型还没有配置，这次是本机整理的内容。',
  consent_required: '你还没有允许把记录摘要发给云端模型，这次是本机整理的内容。可以在「数据与隐私」里开启。',
  offline: '现在没有网络，这次是本机整理的内容。',
  skipped: '这次没有调用云端模型，是本机整理的内容。',
};
const OPENING = '你好，我是你的 AI 精力教练。你可以告诉我今天的睡眠、精力或压力感受，我会结合记录帮你找一个可执行的小步骤。';
const ENERGY_QUESTION = '结合已同步的记录，帮我看看今天的精力状态';

function stored(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function store(key, value) {
  try { window.localStorage.setItem(key, String(value)); } catch { /* private mode: the choice lasts for this session */ }
}
function storedIndex(key) {
  const raw = stored(key);
  const index = Number(raw);
  return raw !== null && Number.isInteger(index) && index >= 0 && index < BAND_COLORS.length ? index : 2;
}
function formatWhen(value, now = Date.now()) {
  const ms = Number(value);
  if (!ms) return '';
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
  const day = dayLabel({ phone_received_at: ms }, now);
  return `${day} ${time}`;
}
function todayLabel() {
  const now = new Date();
  return `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(now)}`;
}
function dayPart() {
  const hour = new Date().getHours();
  if (hour < 5) return ['GOOD NIGHT', '夜深了'];
  if (hour < 12) return ['GOOD MORNING', '早安'];
  if (hour < 18) return ['GOOD AFTERNOON', '午安'];
  return ['GOOD EVENING', '晚上好'];
}
function parseJson(text, fallback) {
  try {
    const value = JSON.parse(text);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}
function capability(snap, metric) {
  const device = snap?.devices?.[0];
  const item = device?.capabilities_json ? parseJson(device.capabilities_json, {})[metric] : null;
  if (!item) return { known: null, supported: null };
  return { known: item.known === true, supported: item.supported === true };
}
/** What one metric row should show: a formatted reading with its day, or the reason there is none. */
function rowState(snap, metric) {
  const row = snap?.latest?.[metric];
  const flags = capability(snap, metric);
  const sync = (snap?.sync || []).find((item) => item.metric === metric);
  const presentation = metricPresentation({
    row: row ? { ...row, metric } : null,
    known: flags.known,
    supported: flags.supported,
    syncStatus: sync?.last_status || '',
  });
  const text = row ? formatMetric(metric, row) : null;
  if (text) return { kind: 'value', text, pill: dayLabel(row) || '已同步', tone: dayLabel(row) === '今天' ? '' : 'muted' };
  const kind = presentation.kind === 'value' ? 'invalid' : presentation.kind;
  return { kind, text: '—', pill: METRIC_STATUS[kind] || '未同步', tone: kind === 'failed' || kind === 'invalid' ? 'warn' : 'muted' };
}
function signalText(rssi) {
  const value = Number(rssi);
  if (!Number.isFinite(value) || value === 0) return '';
  if (value >= -65) return '信号强';
  if (value >= -80) return '信号中';
  return '信号弱';
}
function proposalDetail(proposal) {
  if (proposal.source !== 'local_rule') return proposal.detail || '';
  const basis = proposal.basedOn?.[0];
  if (!basis) return '这只是记录对照，不是健康结论。';
  const day = dayLabel({ device_sampled_at: basis.deviceSampledAt, phone_received_at: basis.phoneReceivedAt });
  return `依据：${day || '最近一次'}同步的步数 ${Math.round(basis.value).toLocaleString('en-US')} 步。这只是记录对照，不是健康结论。`;
}
/** Chat items for one finished coach run: the reply text, then any proposals awaiting the user's confirmation. */
function coachItems(values) {
  const items = [];
  const status = values?.modelStatus;
  if (status === 'ok' && values.modelText) {
    items.push({ who: 'ai', text: values.modelText });
  } else {
    const lines = [MODEL_NOTES[status] || '云端模型这次没有返回，下面是本机整理的内容。'];
    for (const notice of values?.notices || []) {
      if (!/SDK/.test(notice)) lines.push(notice);
    }
    if (values?.followup) lines.push(values.followup);
    items.push({ who: 'ai', text: lines.join('\n') });
  }
  for (const proposal of values?.proposals || []) items.push({ who: 'proposal', proposal, saved: false });
  return items;
}

function IconBubble({ icon: Icon, tone = 'blue', size = 20 }) {
  return <span className={`icon-bubble ${tone}`}><Icon size={size} strokeWidth={2.1} /></span>;
}
function PrimaryButton({ children, onClick, disabled, className = '' }) {
  return <button className={`primary-button ${className}`} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Sprite({ size = '' }) {
  const [failed, setFailed] = useState(false);
  const video = useRef(null);
  const play = () => {
    const node = video.current;
    if (!node) return;
    node.muted = true;
    const attempt = node.play();
    if (attempt?.catch) attempt.catch(() => {});
  };
  useEffect(() => {
    play();
    const resume = () => { if (!document.hidden) play(); };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, [size]);
  return <div className={`orb sprite ${size}`} role="img" aria-label="微光 AI 精灵" onMouseEnter={play} onTouchStart={play}>
    <img src="/weiguang.png" alt="" />
    {!failed && size !== 'tiny' && <video ref={video} className="sprite-video" src="/weiguang.mp4" poster="/weiguang.png" autoPlay loop muted playsInline preload="auto" onCanPlay={play} onError={() => setFailed(true)} />}
  </div>;
}
function CompanionNote({ text, onClick }) {
  return <button className="companion-note" onClick={onClick}><Sprite size="small" /><span><strong>微光陪着你</strong><small>{text}</small></span><ChevronRight size={16} /></button>;
}
function MiniStatus({ children, tone = '' }) { return <span className={`mini-status ${tone}`}>{children}</span>; }
function SectionTitle({ children, trailing }) { return <div className="section-heading"><h2>{children}</h2>{trailing}</div>; }
function PhoneStatus() { return <div className="phone-status"><strong>9:41</strong><span>●●● ▰ <Battery size={15} fill="currentColor" /></span></div>; }

function BarChart({ series, metric }) {
  const scale = metric === 'sleep' ? 1 / 60 : 1;
  const values = series.map((item) => (item.value == null ? null : item.value * scale));
  const peak = Math.max(0, ...values.filter((value) => value != null));
  if (!peak) return null;
  const ticks = axisTicks(peak);
  return <>
    <div className="chart">
      <div className="grid-lines">{ticks.map((tick) => <span key={tick}>{tick}</span>)}</div>
      <div className={`bars ${series.length > 12 ? 'dense' : ''}`}>{values.map((value, index) => <div key={series[index].key} className={value == null ? 'none' : ''} style={{ height: value == null ? 0 : `${Math.max(2, (value / ticks[0]) * 100)}%` }} />)}</div>
    </div>
    <div className="chart-labels">{axisLabels(series, series.length > 12 ? 5 : 4).map((label) => <span key={label}>{label}</span>)}</div>
  </>;
}
function AddRow({ placeholder, label, onAdd }) {
  const [text, setText] = useState('');
  return <form className="add-row" onSubmit={async (event) => { event.preventDefault(); const value = text.trim(); if (!value) return; setText(''); await onAdd(value); }}>
    <input value={text} onChange={(event) => setText(event.target.value)} placeholder={placeholder} maxLength={60} />
    <button type="submit" disabled={!text.trim()}>{label}</button>
  </form>;
}
function ReminderPanel({ task, onEnable, onDisable }) {
  const enabled = Number(task.reminder_enabled) === 1;
  const savedDaily = Number(task.repeat_daily) === 1;
  const [time, setTime] = useState(() => (enabled && savedDaily ? String(task.reminder_local) : '22:45'));
  const [daily, setDaily] = useState(() => (enabled ? savedDaily : true));
  return <div className="detail-panel">
    <strong>{task.title}</strong>
    <p>{enabled ? `${reminderText(task)} · 已开启` : '未开启提醒'}</p>
    <div className="panel-row"><input type="time" aria-label="提醒时间" value={time} onChange={(event) => setTime(event.target.value)} /><button type="button" className={`pill-toggle ${daily ? 'on' : ''}`} onClick={() => setDaily(!daily)}>{daily ? '每天' : '仅一次'}</button></div>
    <button className="detail-choice" onClick={() => onEnable(task, time, daily)}>{enabled ? '更新提醒时间' : '开启提醒'}</button>
    {enabled && <button className="detail-choice" onClick={() => onDisable(task)}>关闭提醒</button>}
  </div>;
}

export default function App() {
  const android = isAndroidApp();
  const [screen, setScreen] = useState(() => { const saved = stored('energy.screen'); return SCREENS.includes(saved) ? saved : 'welcome'; });
  const [bandIndex, setBandIndex] = useState(() => storedIndex('energy.band'));
  const [themeIndex, setThemeIndex] = useState(() => storedIndex('energy.theme'));
  const [followBand, setFollowBand] = useState(() => stored('energy.followBand') !== 'false');
  const touchStart = useRef(null);
  const [band, setBand] = useState(null);
  const [snap, setSnap] = useState(null);
  const [scan, setScan] = useState([]);
  const [scanNote, setScanNote] = useState('');
  const [answers, setAnswers] = useState({});
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [goalDraft, setGoalDraft] = useState(null);
  const [insightTab, setInsightTab] = useState('趋势');
  const [healthMetric, setHealthMetric] = useState('heart_rate');
  const [range, setRange] = useState('近 30 天');
  const [rows, setRows] = useState({});
  const [showMetrics, setShowMetrics] = useState(false);
  const [planTab, setPlanTab] = useState('当前计划');
  const [membership, setMembership] = useState('月度会员');
  const [messages, setMessages] = useState([{ who: 'ai', text: OPENING }]);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [proxyUrl, setProxyUrl] = useState('');
  const [proxyToken, setProxyToken] = useState('');
  const [debugModel, setDebugModel] = useState({ debug: false, configured: false });
  const [modelKey, setModelKey] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const history = useRef([]);
  const chatEnd = useRef(null);
  const scanList = useRef(null);
  const scanWatch = useRef(false);
  const noticeTimer = useRef(0);
  const refreshTimer = useRef(0);
  const loadedMeta = useRef(false);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const go = (next) => { if (next !== screen) history.current.push(screen); setScreen(next); store('energy.screen', next); setNotice(''); };
  const back = () => {
    const previous = history.current.pop() || (ONBOARD.indexOf(screen) > 0 ? ONBOARD[ONBOARD.indexOf(screen) - 1] : DETAIL[screen] ? DETAIL_PARENT[screen] || 'profile' : 'home');
    setScreen(previous); store('energy.screen', previous); setNotice('');
  };
  const toast = (text) => { window.clearTimeout(noticeTimer.current); setNotice(text); noticeTimer.current = window.setTimeout(() => setNotice(''), 3500); };
  const selectBand = (index) => { const next = (index + BAND_COLORS.length) % BAND_COLORS.length; setBandIndex(next); store('energy.band', next); if (followBand) { setThemeIndex(next); store('energy.theme', next); } };
  const selectTheme = (index) => { setThemeIndex(index); setFollowBand(false); store('energy.theme', index); store('energy.followBand', 'false'); };
  const syncTheme = () => { setFollowBand(true); setThemeIndex(bandIndex); store('energy.theme', bandIndex); store('energy.followBand', 'true'); };

  async function refresh() {
    if (!android) return;
    const [state, snapshot, model] = await Promise.all([UteBand.getState(), WeiguangStore.snapshot(), WeiguangStore.debugModelStatus()]);
    setBand(state);
    setSnap(snapshot);
    setDebugModel({ debug: model?.debug === true, configured: model?.configured === true });
    if (!loadedMeta.current) {
      loadedMeta.current = true;
      setProxyUrl(snapshot.meta?.proxy_url || '');
      setProxyToken(snapshot.meta?.proxy_token || '');
      setAnswers(parseJson(snapshot.meta?.survey_answers || '{}', {}));
    }
  }
  // A sync emits an event per packet; one trailing reload covers a burst.
  const refreshSoon = () => { window.clearTimeout(refreshTimer.current); refreshTimer.current = window.setTimeout(refresh, 250); };

  useEffect(() => {
    refresh();
    if (!android) return undefined;
    let remove = () => {};
    let stopped = false;
    UteBand.addListener('band', (event) => {
      if (event?.type === 'scanDevice') {
        setScan((list) => [...list.filter((item) => item.address !== event.address), event].sort((a, b) => Number(b.named) - Number(a.named) || b.rssi - a.rssi));
      }
      refreshSoon();
    }).then((handle) => { if (stopped) handle.remove(); else remove = () => handle.remove(); });
    const resume = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', resume);
    return () => { stopped = true; remove(); document.removeEventListener('visibilitychange', resume); window.clearTimeout(refreshTimer.current); };
  }, [android]);

  const backRef = useRef(() => {});
  backRef.current = () => {
    if (screen === 'home' || screen === 'welcome') { AppShell.minimize(); return; }
    if (MAIN.includes(screen) && !history.current.length) { go('home'); history.current = []; return; }
    back();
  };
  useEffect(() => {
    if (!android) return undefined;
    let remove = () => {};
    let stopped = false;
    AppShell.addListener('backButton', () => backRef.current()).then((handle) => { if (stopped) handle.remove(); else remove = () => handle.remove(); });
    return () => { stopped = true; remove(); };
  }, [android]);

  const theme = BAND_COLORS[themeIndex][1];
  const onboarding = ONBOARD.includes(screen);
  useEffect(() => {
    if (!android) return;
    if (screen === 'welcome') AppShell.setBars({ status: '#1c2954', navigation: '#151e3a', darkIcons: false });
    else if (screen === 'ready') AppShell.setBars({ status: mixHex(theme, '#17254c', 0.62), navigation: mixHex(theme, '#ffffff', 0.62), darkIcons: false });
    else AppShell.setBars({ status: '#ffffff', navigation: onboarding ? '#ffffff' : '#fbfcff', darkIcons: true });
  }, [android, screen, theme, onboarding]);

  useEffect(() => { if (screen === 'coach') chatEnd.current?.scrollIntoView({ block: 'end' }); }, [messages, screen, busy]);
  useEffect(() => {
    const update = () => document.documentElement.style.setProperty('--app-height', `${window.visualViewport?.height || window.innerHeight}px`);
    update();
    window.visualViewport?.addEventListener('resize', update);
    return () => window.visualViewport?.removeEventListener('resize', update);
  }, []);

  const chartMetric = insightTab === '睡眠' ? 'sleep' : insightTab === '健康' ? healthMetric : 'steps';
  const lastReceived = Math.max(0, ...Object.values(snap?.latest || {}).map((row) => Number(row.phone_received_at) || 0));
  useEffect(() => {
    if (!android || screen !== 'insights') return undefined;
    let current = true;
    const wanted = [...new Set(['steps', 'sleep', chartMetric])];
    Promise.all(wanted.map((metric) => WeiguangStore.listObservations({ metric, limit: metric === 'steps' || metric === 'sleep' ? 400 : 5000 })))
      .then((results) => { if (current) setRows(Object.fromEntries(wanted.map((metric, index) => [metric, results[index].rows || []]))); });
    return () => { current = false; };
  }, [android, screen, chartMetric, lastReceived]);

  const tasks = (snap?.tasks || []).filter((task) => task.status !== 'dismissed').sort((a, b) => Number(a.created_at) - Number(b.created_at));
  const openTasks = tasks.filter((task) => task.status === 'active');
  const doneTasks = tasks.filter((task) => task.status === 'done');
  const goals = [...new Set((snap?.goals || []).map((goal) => goal.text))];
  const consent = snap?.meta?.ai_consent === 'yes';
  const connected = band?.connection === 'connected';
  const connecting = !connected && band?.phase === 'opening';
  const scanning = band?.scanning === true;
  const savedDevice = snap?.devices?.[0];
  const deviceName = band?.name || savedDevice?.name || '手环';
  const quality = assess({ observations: Object.values(snap?.latest || {}), sync: snap?.sync || [], connected, now: Date.now() });
  const lastSync = formatWhen(quality.lastSuccessAt);
  const plan = planProgress(snap?.meta?.plan_started_at);
  const planHistory = parseJson(snap?.meta?.plan_history || '[]', []);
  const homeStates = HOME_METRICS.map(([Icon, metric, label]) => ({ Icon, metric, label, state: rowState(snap, metric) }));
  const todayNames = homeStates.filter((item) => item.state.kind === 'value' && item.state.pill === '今天').map((item) => item.label);
  const hasAnyReading = quality.hasAnySample;
  const battery = Number(band?.batteryPercent) >= 0 ? Number(band.batteryPercent) : null;
  const bandError = !connected && band?.error ? errorText(band.error) : '';
  const syncingName = connected && band?.activeCommand ? SYNC_NAMES[band.activeCommand] || '' : '';
  const [eyebrow, greeting] = dayPart();
  const days = range === '近 7 天' ? 7 : 30;
  const connectStatus = !android ? '浏览器预览不能连接手环'
    : band?.sdk === 'unavailable' ? '这个安装包不含手环连接组件'
      : connected ? `已连接 ${deviceName}`
        : connecting ? '正在连接…'
          : scanning ? '正在搜索附近的手环…'
            : band?.bluetooth === 'off' ? '手机蓝牙没有打开' : '准备搜索设备';

  useEffect(() => {
    if (scanWatch.current && !scanning && !scan.length && !connected && !connecting) {
      setScanNote('没有找到手环。请确认手环有电、离手机近一些，并且没有连着别的手机。');
    }
    scanWatch.current = scanning;
  }, [scanning]);

  async function setMeta(key, value) {
    const saved = await WeiguangStore.setMeta({ key, value });
    if (saved?.error) { toast(errorText(saved.error)); return false; }
    await refresh();
    return true;
  }
  async function startScan() {
    setScan([]);
    setScanNote('');
    const state = await UteBand.requestBlePermissions();
    if (state?.permissions === false) { setScanNote(`${errorText('permission_denied')}。请在系统设置里允许“附近的设备”后再搜索。`); refresh(); return; }
    const started = await UteBand.startScan();
    if (started?.error) toast(errorText(started.error));
    else window.setTimeout(() => scanList.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 150);
    refresh();
  }
  async function stopScan() { scanWatch.current = false; await UteBand.stopScan(); refresh(); }
  async function connectDevice(device, previouslyChosen) {
    if (connecting) return;
    const result = await UteBand.connect({ address: device.address, name: device.name || '', previouslyChosen });
    if (result?.error) toast(errorText(result.error));
    refresh();
  }
  async function syncNow() {
    const result = await UteBand.syncNow();
    toast(result?.error ? errorText(result.error) : '开始同步手环记录');
    refresh();
  }
  async function disconnect() { await UteBand.disconnect(); refresh(); }
  async function toggleGoal(text) {
    const saved = goals.includes(text) ? await WeiguangStore.removeGoal({ text }) : await WeiguangStore.saveGoal({ id: `goal:${text}`, text, timezone: zone });
    if (saved?.error) toast(errorText(saved.error));
    refresh();
  }
  async function confirmGoals(selected) {
    if (android) {
      for (const text of GOAL_CHOICES) {
        if (selected.includes(text) && !goals.includes(text)) await WeiguangStore.saveGoal({ id: `goal:${text}`, text, timezone: zone });
        if (!selected.includes(text) && goals.includes(text)) await WeiguangStore.removeGoal({ text });
      }
      await refresh();
    }
    setGoalDraft(null);
    go('generated');
  }
  async function startPlan() {
    if (android && !plan) await setMeta('plan_started_at', String(Date.now()));
  }
  async function restartPlan() {
    const entry = { startedAt: Number(snap?.meta?.plan_started_at) || 0, endedAt: Date.now(), done: doneTasks.length };
    if (await setMeta('plan_history', JSON.stringify([...planHistory, entry].slice(-12)))) await setMeta('plan_started_at', String(Date.now()));
  }
  async function addTask(title) {
    const saved = await WeiguangStore.createTask({ title, source: 'user', timezone: zone });
    if (saved?.error) toast(errorText(saved.error));
    refresh();
  }
  async function setTaskStatus(task, status) {
    const saved = await WeiguangStore.setTaskStatus({ id: task.id, status });
    if (saved?.error) toast(errorText(saved.error));
    refresh();
  }
  async function enableReminder(task, time, daily) {
    const local = daily ? time : nextOccurrence(time);
    if (!/^\d{2}:\d{2}$/.test(time) || !local) { toast(errorText('bad_local_time')); return; }
    await UteBand.requestNotifyPermission();
    const saved = await WeiguangStore.setReminder({ id: task.id, enabled: true, userConfirmed: true, reminderLocal: local, repeatDaily: daily, timezone: zone });
    if (saved?.schedule) toast('提醒已安排。系统可能会比设定时间稍晚一点弹出');
    else toast(errorText(saved?.reason === 'permission_denied' ? 'notify_denied' : saved?.reason || saved?.error || 'store_failed'));
    refresh();
  }
  async function disableReminder(task) {
    const saved = await WeiguangStore.setReminder({ id: task.id, enabled: false, userConfirmed: true, reminderLocal: task.reminder_local || '', repeatDaily: Number(task.repeat_daily) === 1, timezone: zone });
    toast(saved?.error ? errorText(saved.error) : '提醒已关闭');
    refresh();
  }
  async function send(text = draft) {
    const question = text.trim();
    if (!question || busy) return;
    setMessages((items) => [...items, { who: 'user', text: question }]);
    setDraft('');
    if (!android) {
      setMessages((items) => [...items, { who: 'ai', text: '浏览器预览里没有手环记录，教练需要在安卓客户端里使用。这里不会编造数值。' }]);
      return;
    }
    setBusy(true);
    try {
      const observations = [];
      for (const metric of COACH_METRICS) {
        const result = await WeiguangStore.listObservations({ metric, limit: 12 });
        observations.push(...(result.rows || []));
      }
      const outcome = await runDeviceCoach({ question, snapshot: { ...snap, connected }, observations, consent, proxyUrl, proxyToken, online: navigator.onLine });
      setMessages((items) => [...items, ...coachItems(outcome.values)]);
      await refresh();
    } catch {
      setMessages((items) => [...items, { who: 'ai', text: '这次没有完成，记录仍留在手机上。可以稍后再试。' }]);
    } finally {
      setBusy(false);
    }
  }
  async function saveProposal(index) {
    const proposal = messages[index].proposal;
    const saved = await WeiguangStore.createTask({ title: proposal.title, detail: proposalDetail(proposal), source: proposal.source, rationaleJson: JSON.stringify(proposal.basedOn || []), timezone: zone });
    if (saved?.error) { toast(errorText(saved.error)); return; }
    setMessages((items) => items.map((item, position) => (position === index ? { ...item, saved: true } : item)));
    toast('已保存到计划。需要提醒的话，可以在计划里另外开启');
    refresh();
  }
  async function deleteEverything() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setConfirmDelete(false);
    const removed = await WeiguangStore.deleteAll({ confirmed: true });
    if (removed?.error) { toast(errorText(removed.error)); return; }
    setMessages([{ who: 'ai', text: OPENING }]);
    setAnswers({});
    toast('这部手机上的微光数据已删除');
    refresh();
  }

  const taskSubtitle = (task) => (task.status === 'done' ? '已完成' : reminderText(task) ? `${reminderText(task)} 提醒` : task.detail || TASK_SOURCES[task.source] || '');
  const series = dailySeries(rows[chartMetric], chartMetric, days);
  const sleepSeries = dailySeries(rows.sleep, 'sleep', days);
  const stepSeries = dailySeries(rows.steps, 'steps', days);
  const delta = seriesDelta(series);
  const contrast = sleepActivityContrast(sleepSeries, stepSeries);
  const sleepChange = halfChange(sleepSeries);
  const stepChange = halfChange(stepSeries);
  const chartHasData = series.some((item) => item.value != null);
  const deltaText = !delta ? '' : chartMetric === 'sleep'
    ? `较上次记录 ${delta.delta >= 0 ? '+' : '−'}${formatMinutes(Math.abs(delta.delta))}`
    : `较上次记录 ${delta.delta >= 0 ? '+' : '−'}${Math.abs(delta.delta).toLocaleString('en-US')}`;
  const selectedDraft = goalDraft ?? (goals.length ? GOAL_CHOICES.filter((text) => goals.includes(text)) : GOAL_CHOICES);
  const answered = Object.keys(answers).length;
  const reminderTasks = tasks.filter((task) => Number(task.reminder_enabled) === 1 && task.status === 'active');

  return <div className="desktop-stage">
    <aside className="prototype-note">
      <span className="note-kicker">WEIGUANG · 微光</span><h1>AI Energy<br />Companion</h1><p>无屏手环 · 睡眠与精力管理</p><div className="note-divider" />
      <p>按手机里的按钮查看完整流程。浏览器预览只展示界面，手环连接和健康记录需要安卓客户端；没有记录的地方不会填入演示数值。</p>
      <button onClick={() => go('welcome')}>从引导页开始 <ArrowRight size={16} /></button><button onClick={() => go('home')}>直接查看首页 <ArrowRight size={16} /></button>
    </aside>
    <div style={{ '--theme': theme }} className={`phone ${android ? 'native' : ''} ${screen === 'welcome' || screen === 'ready' ? 'phone-dark' : ''} ${screen === 'ready' ? 'phone-ready' : ''}`}>
      <PhoneStatus />
      {notice && <div className="toast" role="status">{notice}</div>}
      <main className={`phone-main ${screen === 'coach' ? 'chat-main' : ''}`} key={screen}>
        {screen === 'welcome' && <div className="welcome-screen">
          <div className="welcome-glow" /><div className="welcome-content"><div className="brand-mark"><Sparkles size={17} /> 微光 · ENERGY COMPANION</div><h1>睡得更好，<br />醒来活出精彩。</h1><p>找回舒服的节奏，去过你向往的生活。</p></div>
          <div className="welcome-companion"><Sprite size="welcome-orb" /><div><span>你好，我是微光</span><small>陪你找回舒服的节奏</small></div></div>
          <div className="welcome-bottom"><PrimaryButton onClick={() => go('connect')}>开启我的美好节奏 <ArrowRight size={19} /></PrimaryButton><button className="text-link light" onClick={() => go('home')}>暂不连接，先看看首页</button></div>
        </div>}

        {screen === 'connect' && <div className="onboard-screen">
          <div className="top-line"><button aria-label="返回" onClick={back}><ArrowLeft /></button><button className="skip" onClick={() => (history.current.at(-1) === 'device' ? back() : go('survey'))}>跳过</button></div>
          <div className="onboard-head"><span className="step-label">01 / 05 · 连接设备</span><h1>连接你的智能手环</h1><p>连接后同步可用的活动、心率和睡眠相关记录。支持项目以实际设备能力为准。</p></div>
          <div className="band-picker">
            <div className="band-showcase" onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; }} onTouchEnd={(event) => { if (touchStart.current !== null) { const moved = event.changedTouches[0].clientX - touchStart.current; if (Math.abs(moved) > 35) selectBand(bandIndex + (moved < 0 ? 1 : -1)); touchStart.current = null; } }}>
              <button className="band-arrow" aria-label="上一种手环颜色" onClick={() => selectBand(bandIndex - 1)}><ChevronRight className="back-arrow" /></button>
              <div className="band-render" role="img" aria-label={`${BAND_COLORS[bandIndex][0]}无屏手环产品效果图`} style={{ backgroundPosition: `${(bandIndex % 4) * 100 / 3}% ${Math.floor(bandIndex / 4) * 50}%` }} />
              <button className="band-arrow" aria-label="下一种手环颜色" onClick={() => selectBand(bandIndex + 1)}><ChevronRight /></button>
            </div>
            <strong>{BAND_COLORS[bandIndex][0]}</strong><small>左右滑动或点击选择手环颜色 · 示意图片</small>
            <div className="swatches" aria-label="手环颜色">{BAND_COLORS.map(([name, color], index) => <button key={name} className={bandIndex === index ? 'selected' : ''} title={name} aria-label={`选择${name}手环`} aria-pressed={bandIndex === index} onClick={() => selectBand(index)} style={{ '--swatch': color }} />)}</div>
            <div className="theme-picker"><div><strong>界面颜色</strong><button onClick={syncTheme}>{followBand ? '已跟随手环' : '跟随手环'}</button></div><div className="swatches theme-swatches">{BAND_COLORS.map(([name, color], index) => <button key={name} className={themeIndex === index ? 'selected' : ''} title={name} aria-label={`设置${name}界面主题`} aria-pressed={themeIndex === index} onClick={() => selectTheme(index)} style={{ '--swatch': color }} />)}</div><small>界面颜色可独立设置，只保存在这部手机。</small></div>
          </div>
          <div className="connect-list"><div><Bluetooth size={18} /><strong>{connectStatus}</strong></div><div><Check /> 心率与活动记录</div><div><Check /> 睡眠相关记录</div><div><CircleHelp /> 血压和血糖需兼容的独立设备，微光不采集</div></div>
          {(scanning || scan.length > 0) && !connected && <div className="scan-list" ref={scanList}>
            {scan.map((device) => <button key={device.address} disabled={connecting} onClick={() => connectDevice(device, false)}><Watch size={18} /><span><strong>{device.name}</strong><small>{[signalText(device.rssi), `尾号 ${String(device.address).slice(-5)}`].filter(Boolean).join(' · ')}</small></span><em>连接</em></button>)}
            {!scan.length && <p>正在搜索，请让手环靠近手机…</p>}
          </div>}
          <div className="bottom-action">
            {connected
              ? <PrimaryButton onClick={() => (history.current.at(-1) === 'device' ? back() : go('survey'))}>继续</PrimaryButton>
              : scanning
                ? <PrimaryButton onClick={stopScan}>停止搜索</PrimaryButton>
                : <PrimaryButton onClick={startScan} disabled={!android || connecting || band?.sdk === 'unavailable'}>{connecting ? '正在连接…' : scan.length || scanNote ? '重新搜索' : '搜索附近手环'}</PrimaryButton>}
            {!connected && !scanning && !connecting && savedDevice && <button className="text-link" onClick={() => connectDevice(savedDevice, true)}>重新连接上次的 {savedDevice.name || '手环'}</button>}
            <small>{connected ? (syncingName ? `正在同步${syncingName}记录…` : lastSync ? `上次同步 ${lastSync}` : '已连接，记录会按顺序同步') : bandError || scanNote || (android ? '搜索前请打开手机蓝牙，并让手环靠近手机' : '请在安卓客户端里连接手环')}</small>
          </div>
        </div>}

        {screen === 'survey' && <div className="onboard-screen survey-screen">
          <div className="top-line"><button aria-label="返回" onClick={back}><ArrowLeft /></button><span>02 / 05</span></div>
          <div className="onboard-head"><span className="step-label">了解需求</span><h1>认识你，更好地帮助你</h1></div>
          <Sprite /><div className="ai-intro">你好！我是你的 AI 精力教练。为你定制可执行的睡眠与精力改善计划，我想先了解一下你的情况，可以吗？</div>
          <div className="question-list">{surveyItems.map((item, index) => <div className={`question ${activeQuestion === index ? 'active' : ''}`} key={item.q}><button onClick={() => setActiveQuestion(activeQuestion === index ? -1 : index)}><IconBubble icon={item.icon} /><span><strong>{item.q}</strong><small>{answers[index] || item.sub}</small></span><ChevronDown size={16} /></button>{activeQuestion === index && <div className="question-options">{item.options.map((option) => <button className={answers[index] === option ? 'selected' : ''} key={option} onClick={() => { setAnswers({ ...answers, [index]: option }); setActiveQuestion(index < 3 ? index + 1 : -1); }}>{option}</button>)}</div>}</div>)}</div>
          <div className="bottom-action"><PrimaryButton onClick={async () => { if (android) await WeiguangStore.setMeta({ key: 'survey_answers', value: JSON.stringify(answers) }); go('goals'); }} disabled={answered < 4}>继续设定目标 <ArrowRight size={17} /></PrimaryButton><small>{answered < 4 ? `还需回答 ${4 - answered} 个问题` : '你可以稍后修改这些回答'}</small></div>
        </div>}

        {screen === 'goals' && <div className="onboard-screen">
          <div className="top-line"><button aria-label="返回" onClick={back}><ArrowLeft /></button><span>03 / 05</span></div>
          <div className="onboard-head"><span className="step-label">目标确认</span><h1>为你制定专属目标</h1><p>以下是可调整的起始目标。确认后保存在这部手机，之后可以在「我的」里修改。</p></div>
          <div className="goal-card"><div className="goal-title"><IconBubble icon={Target} tone="gold" /><div><strong>核心目标（30 天）</strong><small>改善睡眠规律，提升白天专注与精力</small></div></div><h3>具体目标</h3>{GOAL_CHOICES.map((text) => <button className="goal-row" key={text} onClick={() => setGoalDraft(selectedDraft.includes(text) ? selectedDraft.filter((item) => item !== text) : [...selectedDraft, text])}><span>{text}</span><span className={`goal-check ${selectedDraft.includes(text) ? 'on' : ''}`}>{selectedDraft.includes(text) && <Check size={15} />}</span></button>)}</div>
          <div className="hint-box"><Sparkles size={17} /> 这是起始目标；数据不足时不会把它当作你的个人基线。</div>
          <div className="bottom-action"><PrimaryButton onClick={() => confirmGoals(selectedDraft)} disabled={!selectedDraft.length}>确认并查看计划</PrimaryButton><button className="text-link" onClick={() => go('survey')}>我想再调整一下</button></div>
        </div>}

        {screen === 'generated' && <div className="onboard-screen">
          <div className="top-line"><button aria-label="返回" onClick={back}><ArrowLeft /></button><span>04 / 05</span></div>
          <div className="onboard-head"><span className="step-label">计划预览</span><h1>你的 30 天改善计划</h1><p>先建立记录，再根据实际趋势调整。以下是可执行的起始安排。</p></div>
          <div className="timeline">{PLAN_PHASES.map((phase, index) => <div className="timeline-item" key={phase.title}><IconBubble icon={[Activity, Moon, Heart, Target][index]} tone={['blue', 'purple', 'green', 'gold'][index]} /><span><strong>{phase.title}</strong><small>{phase.detail}</small></span></div>)}</div>
          <div className="hint-box"><ShieldCheck size={17} /> 计划仅提供日常健康管理建议，不代替诊疗。</div>
          <div className="bottom-action"><PrimaryButton onClick={async () => { await startPlan(); go('ready'); }}>{plan ? '继续我的 30 天计划' : '开始我的 30 天计划'}</PrimaryButton></div>
        </div>}

        {screen === 'ready' && <div className="ready-screen"><div className="ready-stars">✦ &nbsp; ✧ &nbsp; ✦</div><div className="ready-check"><Check size={43} /></div><h1>准备好了！</h1><p>你的专属睡眠与精力管理之旅已经开始。手环同步到记录后，我会结合记录和你的计划，在你需要时给出支持与建议。</p><div className="ready-card"><strong>接下来你可以：</strong><span><Activity size={17} /> 查看今日状态</span><span><MessageCircle size={17} /> 和 AI 教练聊一聊</span><span><CalendarDays size={17} /> 执行今天的任务</span><span><Watch size={17} /> 查看设备状态</span></div><PrimaryButton onClick={() => { history.current = []; go('home'); }}>进入首页 <ArrowRight size={18} /></PrimaryButton></div>}

        {screen === 'home' && <div className="app-screen home-screen">
          <div className="app-header"><div><span className="eyebrow">{eyebrow}</span><h1>今日状态</h1><small>{todayLabel()}</small></div><button className="header-icon" aria-label="通知" onClick={() => go('notifications')}><Bell size={21} /></button></div>
          <div className="data-banner"><span>{syncingName ? `正在同步${syncingName}…` : lastSync ? `上次同步 ${lastSync}` : '还没有同步记录'}</span><button onClick={() => go(connected || savedDevice ? 'device' : 'connect')}>{connected ? `${deviceName} 已连接` : '设备未连接'} <ChevronRight size={14} /></button></div>
          <div className="score-card"><div className="score-ring empty"><div><small>精力指数</small><strong>—</strong><em>暂无评分</em></div></div><p>{todayNames.length ? `今天已同步${todayNames.join('、')}记录，可以让微光帮你解读。` : hasAnyReading ? '今天还没有新的记录，下面是最近一次同步的内容。' : '连接手环并同步后，这里会显示今天的记录概况。'}</p></div>
          <div className="metric-card">{homeStates.map(({ Icon, metric, label, state }) => <div className="metric-row" key={metric}><Icon size={17} /><span>{label}</span><strong>{state.text}</strong><MiniStatus tone={state.tone}>{state.pill}</MiniStatus></div>)}</div>
          <button className="home-companion" onClick={() => go('coach')}><Sprite size="home-orb" /><span className="home-companion-copy"><small>你的 AI 精灵伙伴</small><strong>{greeting}，我是微光</strong><span>{hasAnyReading ? '今天也一起照顾好睡眠和精力。有了记录，随时可以问我。' : '今天也一起照顾好睡眠和精力。同步手环后，我可以结合记录陪你看。'}</span><b>和微光聊聊 <ArrowRight size={14} /></b></span></button>
          <SectionTitle trailing={<button onClick={() => go('plan')}>查看计划 <ChevronRight size={15} /></button>}>今天可以做什么</SectionTitle>
          <div className="quick-row"><button onClick={() => go('plan')}><CalendarDays /> {openTasks.length ? `完成今日任务（${openTasks.length}）` : '完成今日任务'}</button><button onClick={() => go('insights')}><TrendingUp /> 查看趋势</button></div>
        </div>}

        {screen === 'coach' && <div className="app-screen coach-screen">
          <div className="coach-header"><Sprite size="small" /><div><h1>AI 精力教练</h1><small>{busy ? '正在整理记录…' : hasAnyReading ? '基于已同步记录 · 非医疗建议' : '还没有同步记录 · 非医疗建议'}</small></div><button aria-label="更多" onClick={() => go('coach-info')}><Settings2 size={20} /></button></div>
          <div className="chat-history">
            <div className="context-card"><Sparkles size={16} /><span>{goals.length ? `你的目标：${goals.slice(0, 2).join('，')}` : plan ? `当前重点：${plan.phase.focus[0]}` : '还没有设定目标，可以在「我的」里添加'}</span></div>
            {messages.map((item, index) => (item.who === 'proposal'
              ? <div className="proposal-card" key={index}><small>{item.proposal.source === 'langgraph' ? '教练建议 · 需要你确认' : '记录对照 · 需要你确认'}</small><strong>{item.proposal.title}</strong><p>{proposalDetail(item.proposal)}</p><button disabled={item.saved} onClick={() => saveProposal(index)}>{item.saved ? '已保存到计划' : '保存为任务'}</button></div>
              : <div className={`chat-line ${item.who}`} key={index}>{item.who === 'ai' && <Sprite size="tiny" />}<div className="bubble">{item.text}</div></div>))}
            {busy && <div className="chat-line ai"><Sprite size="tiny" /><div className="bubble typing">微光正在整理记录…</div></div>}
            <div ref={chatEnd} />
          </div>
          <div className="suggestions">{['今天为什么有点累？', '帮我调整睡前计划', '记录我的观察'].map((text) => <button key={text} disabled={busy} onClick={() => send(text)}>{text}</button>)}</div>
          <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); send(); }}><button type="button" aria-label="更多操作" onClick={() => toast('可输入文字记录你的观察')}><Plus size={20} /></button><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="聊聊今天的睡眠与精力…" /><button type="submit" className="send-button" aria-label="发送" disabled={busy}><Send size={18} /></button></form>
        </div>}

        {screen === 'plan' && <div className="app-screen">
          <div className="app-header centered"><h1>我的计划</h1></div>
          <CompanionNote text="一步一步，陪你养成好习惯" onClick={() => go('coach')} />
          <div className="segmented">{['当前计划', '任务清单', '历史计划'].map((tab) => <button className={planTab === tab ? 'selected' : ''} key={tab} onClick={() => setPlanTab(tab)}>{tab}</button>)}</div>
          {planTab === '当前计划' && <>
            <div className="plan-hero"><strong>30 天睡眠与精力改善计划</strong><small>{!plan ? '还没有开始 · 开始后从第 1 天计' : plan.finished ? `已完成 ${PLAN_DAYS} 天 · 可以回顾后开始下一轮` : `第 ${plan.day} 天 / 共 ${PLAN_DAYS} 天 · ${plan.phase.detail}`}</small><div className="progress"><span style={{ width: `${plan ? plan.percent : 0}%` }} /></div><em>{plan ? plan.percent : 0}%</em></div>
            {!plan && <PrimaryButton className="compact" disabled={!android} onClick={startPlan}>开始我的 30 天计划</PrimaryButton>}
            {plan?.finished && <PrimaryButton className="compact" onClick={restartPlan}>开始新的 30 天计划</PrimaryButton>}
            <div className="focus-card"><small>当前重点（{(plan?.phase || PLAN_PHASES[0]).title}）</small><ul>{(plan?.phase || PLAN_PHASES[0]).focus.map((text) => <li key={text}>{text}</li>)}</ul></div>
          </>}
          {planTab === '历史计划' && <>
            {!planHistory.length && !doneTasks.length && <div className="empty-card"><CalendarDays /><strong>还没有历史计划</strong><p>完成第一个 30 天计划后，可以在这里回顾。</p></div>}
            {planHistory.map((entry) => <div className="insight-card" key={entry.startedAt}><IconBubble icon={CalendarDays} /><div><strong>30 天计划 · {formatWhen(entry.startedAt).split(' ')[0]} 开始</strong><p>结束时已完成 {entry.done} 个任务。</p></div></div>)}
            {doneTasks.length > 0 && <><SectionTitle trailing={<span>{doneTasks.length} 个</span>}>已完成的任务</SectionTitle><div className="task-card">{doneTasks.map((task) => <div className="task-line" key={task.id}><button className="task-row" onClick={() => setTaskStatus(task, 'active')}><span className="task-check done"><Check size={14} /></span><span><strong>{task.title}</strong><small>完成于 {formatWhen(task.updated_at)}</small></span></button></div>)}</div></>}
          </>}
          {planTab !== '历史计划' && <>
            <SectionTitle trailing={<span>{doneTasks.length}/{tasks.length} 已完成</span>}>{planTab === '当前计划' ? '今日任务' : '全部任务'}</SectionTitle>
            <div className="task-card">
              {(planTab === '当前计划' ? [...openTasks, ...doneTasks.filter((task) => dayLabel({ phone_received_at: task.updated_at }) === '今天')] : tasks).map((task) => <div className="task-line" key={task.id}><button className="task-row" onClick={() => setTaskStatus(task, task.status === 'done' ? 'active' : 'done')}><span className={`task-check ${task.status === 'done' ? 'done' : ''}`}>{task.status === 'done' && <Check size={14} />}</span><span><strong>{task.title}</strong><small>{taskSubtitle(task)}</small></span></button>{planTab === '任务清单' && <button className="task-remove" onClick={() => setTaskStatus(task, 'dismissed')}>移除</button>}</div>)}
              {!tasks.length && <p className="task-empty">还没有任务。可以从下面的建议开始，也可以自己添加；教练给出的建议要你确认后才会进来。</p>}
            </div>
            {android && TASK_IDEAS.some((text) => !tasks.some((task) => task.title === text)) && <div className="suggestions idea-row">{TASK_IDEAS.filter((text) => !tasks.some((task) => task.title === text)).map((text) => <button key={text} onClick={() => addTask(text)}><Plus size={11} /> {text}</button>)}</div>}
            {android && <AddRow placeholder="自己添加一个任务" label="添加" onAdd={addTask} />}
            <button className="inline-action" onClick={() => go('reminders')}><Bell size={16} /> 设置提醒</button>
          </>}
        </div>}

        {screen === 'insights' && <div className="app-screen">
          <div className="app-header centered"><h1>健康洞察</h1></div>
          <CompanionNote text="一起看看你的变化和趋势" onClick={() => go('coach')} />
          <div className="segmented four">{['趋势', '睡眠', '精力', '健康'].map((tab) => <button className={insightTab === tab ? 'selected' : ''} key={tab} onClick={() => setInsightTab(tab)}>{tab}</button>)}</div>
          <div className="data-banner"><span>手环记录 · {range}</span><button onClick={() => setRange(range === '近 30 天' ? '近 7 天' : '近 30 天')}>{range} <ChevronDown size={14} /></button></div>
          {insightTab === '精力' ? <>
            <div className="insight-card"><IconBubble icon={Sparkles} /><div><strong>精力指数暂未提供</strong><p>手环本身不输出精力评分，微光也不会用睡眠或心率自行估算一个分数。现在可以让微光结合已同步的记录做文字解读。</p></div></div>
            <div className="metric-card">{[...HOME_METRICS, [Gauge, 'mood_pressure', '压力']].map(([Icon, metric, label]) => { const state = rowState(snap, metric); return <div className="metric-row" key={metric}><Icon size={17} /><span>{label}</span><strong>{state.text}</strong><MiniStatus tone={state.tone}>{state.pill}</MiniStatus></div>; })}</div>
            <button className="inline-action" onClick={() => { go('coach'); send(ENERGY_QUESTION); }}><MessageCircle size={16} /> 让微光解读今天的记录</button>
          </> : <>
            <div className="chart-card">
              <div className="chart-title"><strong>{METRIC_NAMES[chartMetric]}趋势<i>{CHART_UNITS[chartMetric]}</i></strong><span>{deltaText}</span></div>
              {chartHasData ? <BarChart series={series} metric={chartMetric} /> : <div className="chart-empty"><strong>{range}还没有{METRIC_NAMES[chartMetric]}记录</strong><span>{android ? '连接手环并同步后会显示在这里' : '浏览器预览里没有手环记录'}</span></div>}
            </div>
            {insightTab === '健康' && <div className="metric-card">{HEALTH_METRICS.map(([Icon, metric, label]) => { const state = rowState(snap, metric); return <button className={`metric-row ${healthMetric === metric ? 'selected' : ''}`} key={metric} onClick={() => setHealthMetric(metric)}><Icon size={17} /><span>{label}</span><strong>{state.text}</strong><MiniStatus tone={state.tone}>{state.pill}</MiniStatus></button>; })}</div>}
            <div className="insight-card"><IconBubble icon={TrendingUp} /><div><strong>睡眠与精力的关联</strong><p>{contrast
              ? `精力暂无评分，先对照睡眠和白天步数：${range}里睡满 7 小时的 ${contrast.longerDays} 天，日均 ${contrast.longerSteps.toLocaleString('en-US')} 步；不足 7 小时的 ${contrast.shorterDays} 天，日均 ${contrast.shorterSteps.toLocaleString('en-US')} 步。这只是记录对照，不是因果结论。`
              : '记录还不够做对照。需要有几天同时同步到睡眠和步数。'}</p></div></div>
            <div className="insight-card"><IconBubble icon={LockKeyhole} tone="gold" /><div><strong>{days === 7 ? '本周关键变化' : '本月关键变化'}</strong><p>{sleepChange || stepChange
              ? [sleepChange && `后半段平均睡眠 ${formatMinutes(sleepChange.after)}，比前半段${sleepChange.delta >= 0 ? '多' : '少'} ${formatMinutes(Math.abs(sleepChange.delta))}`, stepChange && `后半段日均 ${Math.round(stepChange.after).toLocaleString('en-US')} 步，比前半段${stepChange.delta >= 0 ? '多' : '少'} ${Math.round(Math.abs(stepChange.delta)).toLocaleString('en-US')} 步`].filter(Boolean).join('；') + '。'
              : `记录还不够比较前后变化。${range}里已同步睡眠 ${sleepSeries.filter((item) => item.value != null).length} 天、步数 ${stepSeries.filter((item) => item.value != null).length} 天。`}</p></div></div>
          </>}
          <button className="inline-action" onClick={() => setShowMetrics(!showMetrics)}><Activity size={16} /> {showMetrics ? '收起指标说明' : '查看指标说明'}</button>
          {showMetrics && <div className="hint-box">这里只显示手环同步到的记录，都不是医疗指标。步数和睡眠按天统计；心率、血氧、体温、心率变异和压力是当天各次读数的平均。精力指数暂未提供，不会用其他读数估算。手环不支持或没有同步到的项目会直接注明。</div>}
          {android && <button className="inline-action" onClick={() => (connected ? syncNow() : go(savedDevice ? 'device' : 'connect'))}><Watch size={16} /> {connected ? '同步手环记录' : '去连接手环'}</button>}
        </div>}

        {screen === 'membership' && <div className="app-screen">
          <div className="app-header centered"><h1>会员服务</h1></div>
          <CompanionNote text="了解更多陪伴与计划服务" onClick={() => go('coach')} />
          <div className="member-hero"><Crown size={34} fill="#ffd670" /><h2>AI 精力管理会员</h2><p>持续 30 天的个性化改善服务</p></div>
          <div className="benefits">{['专属 30 天改善计划与跟进', '每日深度分析与个性化建议', '每周复盘与动态调整', '个人记忆与长期目标管理', '优先体验新功能'].map((text) => <div key={text}><Check size={17} />{text}</div>)}</div>
          <div className="price-row">{[['月度会员', '$9.99/月'], ['年度会员', '$79.99/年']].map(([name, price]) => <button className={membership === name ? 'selected' : ''} key={name} onClick={() => setMembership(name)}><strong>{name}</strong><span>{price}</span></button>)}</div>
          <button className="gold-button" onClick={() => go('membership-detail')}>查看会员方案</button>
          <small className="center-note">价格仅为参考；正式定价与权益待确认，当前不会扣款</small>
        </div>}

        {screen === 'profile' && <div className="app-screen">
          <div className="app-header centered"><h1>我的</h1></div>
          <CompanionNote text="你的专属睡眠与精力伙伴" onClick={() => go('coach')} />
          <div className="profile-card"><div className="avatar">微</div><div><strong>我的微光</strong><small>AI 精力教练 · 记录保存在这部手机</small></div><span>本机</span></div>
          <div className="menu-card">{[
            [Target, '我的目标与偏好', goals.length ? `已设定 ${goals.length} 个目标` : '查看目标', 'preferences'],
            [ShieldCheck, '健康档案与记忆', '你确认的信息与手环记录分开', 'memory'],
            [Watch, '设备管理', connected ? `${deviceName} 已连接` : '设备未连接', 'device'],
            [Bell, '通知与提醒', reminderTasks.length ? `已开启 ${reminderTasks.length} 个提醒` : '查看提醒设置', 'reminders'],
            [LockKeyhole, '数据与隐私', '数据来源与删除', 'privacy'],
            [CircleHelp, '帮助与反馈', '查看说明', 'help'],
          ].map(([Icon, title, sub, target]) => <button className="menu-row" key={target} onClick={() => go(target)}><Icon size={19} /><span><strong>{title}</strong><small>{sub}</small></span><ChevronRight size={17} /></button>)}</div>
          <button className="inline-action" onClick={() => go('membership')}><Crown size={16} /> 了解会员服务</button>
          <button className="reset-link" onClick={() => { history.current = []; go('welcome'); }}>重新体验引导流程</button>
        </div>}

        {DETAIL[screen] && <div className="app-screen detail-screen">
          <div className="detail-top"><button aria-label="返回上一页" onClick={back}><ArrowLeft size={20} /></button><h1>{DETAIL[screen]}</h1></div>

          {screen === 'notifications' && <>
            {reminderTasks.map((task) => <div className="detail-panel" key={task.id}><strong>{task.title}</strong><p>{reminderText(task)} 提醒</p><small>到点前后由系统弹出通知，可能稍有延迟。</small></div>)}
            {!reminderTasks.length && <div className="detail-panel"><strong>还没有提醒</strong><p>给任务开启提醒后，会在这里列出。微光不会自行发送通知。</p></div>}
            <button className="inline-action" onClick={() => go('reminders')}>查看提醒设置 <ChevronRight size={16} /></button>
          </>}

          {screen === 'coach-info' && <>
            <div className="detail-panel"><strong>你的 AI 精力教练</strong><p>教练只使用这部手机上已同步的记录摘要、你的目标和任务完成情况。没有记录时不会编造数值，也不替代医疗建议。</p><small>教练给出的任务建议，需要你点「保存为任务」才会进入计划；提醒要你另外开启。</small></div>
            <div className="detail-panel"><strong>云端模型</strong><div className="kv"><span>摘要授权</span><b>{consent ? '已允许' : '未允许'}</b></div><div className="kv"><span>模型连接</span><b>{debugModel.configured || (proxyUrl && proxyToken) ? '已配置' : '未配置'}</b></div><small>未允许或未配置时，教练只在本机整理记录，不会联网。</small></div>
            <button className="inline-action" onClick={() => go('privacy')}>查看数据与隐私 <ChevronRight size={16} /></button>
            <button className="inline-action" onClick={() => go('memory')}>查看健康记忆 <ChevronRight size={16} /></button>
          </>}

          {screen === 'preferences' && <>
            <div className="detail-panel"><strong>当前目标</strong>{goals.map((text) => <p key={text}>✓ {text}</p>)}{!goals.length && <p>还没有设定目标。</p>}<small>点击下方选项可调整目标，改动保存在这部手机。</small></div>
            <div className="detail-panel">{[...GOAL_CHOICES, ...goals.filter((text) => !GOAL_CHOICES.includes(text))].map((text) => <button className="detail-choice" key={text} disabled={!android} onClick={() => toggleGoal(text)}>{goals.includes(text) ? '☑' : '☐'} {text}</button>)}{android && <AddRow placeholder="写一个自己的目标" label="添加" onAdd={(text) => toggleGoal(text)} />}</div>
            {answered > 0 && <div className="detail-panel"><strong>你的回答</strong>{surveyItems.map((item, index) => answers[index] && <div className="kv" key={item.q}><span>{item.q.replace(/[？?]$/, '')}</span><b>{answers[index]}</b></div>)}<button className="detail-choice" onClick={() => go('survey')}>重新回答</button></div>}
            <button className="inline-action" onClick={() => go('plan')}>查看我的计划 <ChevronRight size={16} /></button>
          </>}

          {screen === 'memory' && <>
            <div className="detail-panel"><strong>你确认的信息</strong>{goals.map((text) => <p key={text}>✓ {text}</p>)}{surveyItems.map((item, index) => answers[index] && <div className="kv" key={item.q}><span>{item.q.replace(/[？?]$/, '')}</span><b>{answers[index]}</b></div>)}{!goals.length && !answered && <p>还没有记录。完成引导或在「我的目标与偏好」里设定后会出现在这里。</p>}<small>这些是你自己填写或确认的内容。</small></div>
            <div className="detail-panel"><strong>手环同步的记录</strong>{Object.entries(METRIC_NAMES).map(([metric, label]) => { const state = rowState(snap, metric); return <div className="kv" key={metric}><span>{label}</span><b>{state.kind === 'value' ? `${state.text} · ${state.pill}` : state.pill}</b></div>; })}<small>这些是手环读数的原值，不是诊断，也没有经过换算。</small></div>
            <button className="inline-action" onClick={() => go('privacy')}>查看数据与隐私 <ChevronRight size={16} /></button>
          </>}

          {screen === 'device' && <>
            <div className="detail-panel"><strong>{connected ? `${deviceName} 已连接` : connecting ? '正在连接…' : '尚未连接设备'}</strong>
              <div className="kv"><span>手机蓝牙</span><b>{!android ? '浏览器预览' : band?.bluetooth === 'on' ? '已打开' : '未打开'}</b></div>
              <div className="kv"><span>电量</span><b>{connected && battery != null ? `${battery}%` : '—'}</b></div>
              <div className="kv"><span>上次同步</span><b>{lastSync || '还没有'}</b></div>
              {syncingName && <div className="kv"><span>同步进度</span><b>正在同步{syncingName}</b></div>}
              {bandError && <small className="warn-text">{bandError}</small>}
              {connected && <button className="detail-choice" onClick={syncNow}>同步手环记录</button>}
              {connected && <button className="detail-choice" onClick={disconnect}>断开连接</button>}
              {!connected && !connecting && savedDevice && android && <button className="detail-choice" onClick={() => connectDevice(savedDevice, true)}>重新连接 {savedDevice.name || '手环'}</button>}
            </div>
            {(snap?.sync || []).some((item) => SYNC_NAMES[item.metric] && item.metric !== 'steps_hour') && <div className="detail-panel"><strong>各项记录</strong>{(snap?.sync || []).filter((item) => SYNC_NAMES[item.metric] && item.metric !== 'steps_hour').map((item) => <div className="kv" key={item.metric}><span>{SYNC_NAMES[item.metric]}</span><b>{{ success: '已同步', running: '同步中', failed: '同步失败', skipped: '没有新记录', unsupported: '设备不支持', not_read: '能力未读到' }[item.last_status] || '未同步'}</b></div>)}<small>支持的项目以手环自己上报的能力为准。</small></div>}
            <button className="inline-action" onClick={() => go('connect')}>查看连接手环流程 <ChevronRight size={16} /></button>
          </>}

          {screen === 'reminders' && <>
            {openTasks.map((task) => <ReminderPanel key={`${task.id}:${task.reminder_enabled}:${task.reminder_local}`} task={task} onEnable={enableReminder} onDisable={disableReminder} />)}
            {!openTasks.length && <div className="detail-panel"><strong>还没有可提醒的任务</strong><p>先在计划里添加任务，再回到这里为它开启提醒。</p></div>}
            {android && openTasks.length > 0 && band?.notifications === false && <div className="hint-box"><Bell size={17} /> 还没有允许通知权限。开启提醒时系统会询问，拒绝后提醒不会弹出。</div>}
            <button className="inline-action" onClick={() => go('plan')}>回到我的计划 <ChevronRight size={16} /></button>
          </>}

          {screen === 'privacy' && <>
            <div className="detail-panel"><strong>数据来源</strong><p>健康记录只来自你连接的手环，保存在这部手机上，不会同步到其他设备。卸载应用会一并删除。</p></div>
            <div className="detail-panel"><strong>AI 教练授权</strong><p>允许后，提问时会把一份不含设备地址的记录摘要发给云端模型；不允许时教练只在本机整理。</p><button className="detail-choice" disabled={!android} onClick={() => setMeta('ai_consent', consent ? 'no' : 'yes')}>{consent ? '☑' : '☐'} 允许把记录摘要发给云端模型</button></div>
            <div className="detail-panel"><strong>连接诊断</strong><p>手环连接后如果应用意外退出，重新打开后可以在这里查看原因摘要。不含密钥、设备地址和健康数值。</p><button className="detail-choice" onClick={async () => { const saved = await UteBand.exportConnectDiagnostic(); setDiagnostic(saved?.text || '还没有诊断记录。'); }}>查看连接诊断</button>{diagnostic && <pre className="diagnostic-text">{diagnostic}</pre>}</div>
            <div className="detail-panel"><strong>记录管理</strong><p>可以删除这部手机上的全部微光数据，包括手环记录、目标、任务和提醒。删除后无法恢复。</p><button className="detail-choice danger" disabled={!android} onClick={deleteEverything}>{confirmDelete ? '再点一次，确认删除全部数据' : '删除这部手机上的微光数据'}</button>{confirmDelete && <button className="detail-choice" onClick={() => setConfirmDelete(false)}>先不删除</button>}</div>
            {android && <div className="detail-panel"><button className="panel-toggle" onClick={() => setShowAdvanced(!showAdvanced)}><strong>高级设置</strong><ChevronDown size={16} className={showAdvanced ? 'open' : ''} /></button>{showAdvanced && <>
              <small>模型代理地址和令牌，仅在自建代理时填写。</small>
              <input type="url" value={proxyUrl} onChange={(event) => setProxyUrl(event.target.value)} placeholder="https://代理地址" />
              <input type="text" autoComplete="off" value={proxyToken} onChange={(event) => setProxyToken(event.target.value)} placeholder="代理令牌" />
              <button className="detail-choice" onClick={async () => { if (await setMeta('proxy_url', proxyUrl.trim()) && await setMeta('proxy_token', proxyToken.trim())) toast('已保存在这部手机'); }}>保存代理设置</button>
              {debugModel.debug && <>
                <small>{debugModel.configured ? '内部测试密钥已在这部手机上。' : '内部测试包可以在这里填写测试密钥。'}</small>
                <input type="password" autoComplete="off" value={modelKey} onChange={(event) => setModelKey(event.target.value)} placeholder={debugModel.configured ? '填写新的密钥可替换' : '内部测试密钥'} />
                <button className="detail-choice" onClick={async () => { if (!modelKey.trim()) { toast(debugModel.configured ? '仍使用这部手机上的测试密钥' : '还没有填写'); return; } const saved = await WeiguangStore.setDebugModelKey({ value: modelKey.trim() }); setModelKey(''); setDebugModel({ debug: saved?.debug === true, configured: saved?.configured === true }); toast(saved?.configured ? '只保存在这部手机' : '正式包不能保存'); }}>保存测试密钥</button>
              </>}
            </>}</div>}
            <button className="inline-action" onClick={() => go('memory')}>查看健康档案与记忆 <ChevronRight size={16} /></button>
          </>}

          {screen === 'help' && <>
            <div className="detail-panel"><strong>如何开始？</strong><p>完成引导并连接手环，等记录同步后查看每日状态、与教练对话，并勾选计划里的任务。</p></div>
            <div className="detail-panel"><strong>关于数据</strong><p>页面上的数值都来自手环同步的记录，没有同步到的项目会注明原因，不会用示例数值代替。所有内容都不能用于医疗判断。</p></div>
            <div className="detail-panel"><strong>连接后应用退出了？</strong><p>重新打开应用，到「数据与隐私」里查看连接诊断，把里面的文字发给我们，有助于定位原因。</p><button className="detail-choice" onClick={() => go('privacy')}>打开连接诊断</button></div>
            <button className="inline-action" onClick={() => go('device')}>查看设备状态 <ChevronRight size={16} /></button>
          </>}

          {screen === 'membership-detail' && <>
            <div className="detail-panel"><strong>{membership} · 方案说明</strong><p>包含个性化计划、每周复盘和长期目标管理等权益。</p><small>价格及权益待确认，当前版本不会创建订阅或扣款。</small></div>
            <button className="inline-action" onClick={back}>返回选择方案 <ChevronRight size={16} /></button>
          </>}
        </div>}
      </main>
      {!onboarding && <nav className={`bottom-nav ${screen === 'coach' ? 'chat-nav' : ''}`}>{nav.map(([id, Icon, label]) => <button className={screen === id ? 'active' : ''} onClick={() => go(id)} key={id}><Icon size={21} fill={screen === id && id === 'home' ? 'currentColor' : 'none'} /><span>{label}</span></button>)}</nav>}
      <div className="home-indicator" />
    </div>
  </div>;
}
