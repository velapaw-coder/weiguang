import React, { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, Bell, CalendarDays, Check, ChevronDown, ChevronRight,
  CircleHelp, Clock3, Crown, Heart, Home, LockKeyhole, MessageCircle, Moon, Plus, Send,
  Settings2, ShieldCheck, Sparkles, Target, TrendingUp, UserRound, Watch, Wind,
} from 'lucide-react';
import { isAndroidApp, UteBand, WeiguangStore } from './band/native.js';
import { assess } from './coach/quality.js';
import { compareSeries, metricPresentation, METRIC_STATUS, primaryValue } from './coach/history.js';
import { runDeviceCoach } from './coach/run.js';

const ONBOARD = ['welcome', 'connect', 'survey', 'goals', 'generated', 'ready'];
const NAV = [
  ['home', Home, '今日'], ['coach', MessageCircle, '教练'],
  ['plan', CalendarDays, '计划'], ['insights', TrendingUp, '洞察'],
  ['profile', UserRound, '我的'],
];
const BAND_COLORS = [
  ['麦穗色', '#a66a48'], ['经典黑', '#444852'], ['浅蓝色', '#5d8ed4'], ['高级灰', '#818894'],
  ['玫红色', '#d95776'], ['军绿色', '#668572'], ['蔚蓝色', '#475d9e'], ['爱马橙', '#e48739'],
  ['原野绿', '#8eaa3b'], ['珍珠粉', '#cb8da0'], ['风信紫', '#a18cc7'], ['星光色', '#b8aa96'],
];
const SURVEY = [
  { icon: Moon, q: '你目前最想改善什么？', sub: '睡眠 / 精力 / 压力 / 作息', options: ['睡眠', '精力', '压力', '作息'] },
  { icon: CalendarDays, q: '你的工作和生活节奏是怎样的？', sub: '上班 / 创业 / 轮班 / 经常出差', options: ['上班', '创业', '轮班', '经常出差'] },
  { icon: Clock3, q: '你的大致作息时间？', sub: '入睡、起床、工作高峰', options: ['22:30 前睡', '23:30 前睡', '凌晨后睡', '不规律'] },
  { icon: Target, q: '你当前的主要困扰？', sub: '入睡困难、易醒、白天疲惫等', options: ['入睡困难', '夜间易醒', '白天疲惫', '注意力不足'] },
];
const GOAL_CHOICES = ['平均睡眠时长 ≥ 7 小时', '就寝时间 23:30 前', '减少下午疲惫感'];
const HOME_METRICS = [
  [Moon, 'sleep', '睡眠'],
  [Heart, 'heart_rate', '心率'],
  [Wind, 'spo2', '血氧'],
  [Activity, 'steps', '步数'],
];
const HEALTH_METRICS = [
  ['heart_rate', '心率'], ['spo2', '血氧'], ['hrv', 'HRV'],
  ['temperature', '体温'], ['mood_pressure', '压力'],
];
const DETAIL = {
  notifications: '通知', 'coach-info': 'AI 教练说明', preferences: '我的目标与偏好',
  memory: '健康档案与记忆', device: '设备管理', reminders: '通知与提醒',
  privacy: '数据与隐私', help: '帮助与反馈', 'membership-detail': '会员方案',
};

function IconBubble({ icon: Icon, tone = 'blue' }) {
  return <span className={`icon-bubble ${tone}`}><Icon size={18} strokeWidth={2.1} /></span>;
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
  return <div className={`orb sprite ${size}`} role="img" aria-label="微光"><img src="/weiguang.png" alt="" />{!failed && size !== 'tiny' && <video ref={video} className="sprite-video" src="/weiguang.mp4" autoPlay loop muted playsInline preload="auto" onCanPlay={play} onError={() => setFailed(true)} />}</div>;
}
function CompanionNote({ text, onClick }) {
  return <button className="companion-note" onClick={onClick}><Sprite size="small" /><span><strong>微光陪着你</strong><small>{text}</small></span><ChevronRight size={16} /></button>;
}

function formatWhen(value) {
  const ms = Number(value);
  if (!ms) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}
function todayLabel() {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
}
function showValue(row, metric) {
  const value = primaryValue({ ...row, metric });
  if (value == null) return null;
  if (metric === 'steps') return `${value} 步`;
  if (metric === 'heart_rate') return `${value} 次/分`;
  if (metric === 'spo2') return `${value}%`;
  if (metric === 'sleep') return `${value} 分钟`;
  if (metric === 'temperature') return `${value} °C`;
  if (metric === 'hrv') return `${value}（SDK原值）`;
  if (metric === 'mood_pressure') return `压力 ${value}`;
  return String(value);
}
function flagsOf(snap, metric) {
  const device = snap?.devices?.[0];
  if (!device?.capabilities_json) return { present: false, known: false, supported: false };
  try {
    const item = JSON.parse(device.capabilities_json)[metric];
    if (!item) return { present: false, known: false, supported: false };
    return { present: true, known: item.known === true, supported: item.supported === true };
  } catch {
    return { present: false, known: false, supported: false };
  }
}
function rowState(snap, metric) {
  const row = snap?.latest?.[metric];
  const flags = flagsOf(snap, metric);
  const sync = (snap?.sync || []).find((item) => item.metric === metric);
  const presentation = metricPresentation({
    row: row ? { ...row, metric } : null,
    known: flags.present ? flags.known : null,
    supported: flags.present ? flags.supported : null,
    syncStatus: sync?.last_status || '',
  });
  const value = presentation.kind === 'value' ? showValue(row, metric) : null;
  return { kind: presentation.kind, label: value || METRIC_STATUS[presentation.kind], when: row?.phone_received_at };
}

export default function App() {
  const android = isAndroidApp();
  const [screen, setScreen] = useState('welcome');
  const [bandIndex, setBandIndex] = useState(2);
  const [themeIndex, setThemeIndex] = useState(2);
  const [followBand, setFollowBand] = useState(true);
  const touchStart = useRef(null);
  const [band, setBand] = useState(null);
  const [snap, setSnap] = useState(null);
  const [scan, setScan] = useState([]);
  const [answers, setAnswers] = useState({});
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [goalChoices, setGoalChoices] = useState(GOAL_CHOICES);
  const [insightTab, setInsightTab] = useState('趋势');
  const [series, setSeries] = useState([]);
  const [showMetrics, setShowMetrics] = useState(false);
  const [planTab, setPlanTab] = useState('当前计划');
  const [membership, setMembership] = useState('月度会员');
  const [messages, setMessages] = useState([{ who: 'ai', text: '你好，我是微光。连接手环并同步之后，可以把睡眠、心率或今天的感受发给我。没有记录时我不会编造数值。' }]);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [proxyUrl, setProxyUrl] = useState('');
  const [proxyToken, setProxyToken] = useState('');
  const [debugModel, setDebugModel] = useState({ debug: false, configured: false });
  const [modelKey, setModelKey] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  const [reminderTask, setReminderTask] = useState('');
  const history = useRef([]);
  const chatEnd = useRef(null);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const go = (next) => {
    if (next !== screen) history.current.push(screen);
    setScreen(next);
    setNotice('');
  };
  const back = () => {
    const previous = history.current.pop() || (ONBOARD.indexOf(screen) > 0 ? ONBOARD[ONBOARD.indexOf(screen) - 1] : 'home');
    setScreen(previous);
  };
  const toast = (text) => { setNotice(text); window.setTimeout(() => setNotice(''), 3200); };
  const selectBand = (index) => {
    const next = (index + BAND_COLORS.length) % BAND_COLORS.length;
    setBandIndex(next);
    if (followBand) setThemeIndex(next);
  };

  async function refresh() {
    if (!android) return;
    const [state, snapshot] = await Promise.all([UteBand.getState(), WeiguangStore.snapshot()]);
    setBand(state);
    setSnap(snapshot);
    setConsent(snapshot.meta?.ai_consent === 'yes');
    setProxyUrl(snapshot.meta?.proxy_url || '');
    setProxyToken(snapshot.meta?.proxy_token || '');
    const model = await WeiguangStore.debugModelStatus();
    setDebugModel({ debug: model?.debug === true, configured: model?.configured === true });
  }
  useEffect(() => {
    refresh();
    let remove = () => {};
    if (android) {
      UteBand.addListener('band', (event) => {
        if (event?.type === 'scanDevice') {
          setScan((list) => {
            const next = list.filter((item) => item.address !== event.address);
            next.push(event);
            return next.sort((a, b) => b.rssi - a.rssi);
          });
        }
        refresh();
      }).then((handle) => { remove = () => handle.remove(); });
    }
    return () => remove();
  }, [android]);
  useEffect(() => { if (screen === 'coach') chatEnd.current?.scrollIntoView({ block: 'end' }); }, [messages, screen]);
  useEffect(() => {
    if (!android || screen !== 'insights') return;
    const metric = insightTab === '睡眠' ? 'sleep' : insightTab === '健康' ? 'heart_rate' : 'steps';
    WeiguangStore.listObservations({ metric, limit: 12 }).then((result) => setSeries(result.rows || []));
  }, [android, screen, insightTab, snap]);

  const tasks = snap?.tasks || [];
  const savedGoals = snap?.goals || [];
  const connected = band?.connection === 'connected';
  const quality = assess({
    observations: Object.values(snap?.latest || {}),
    sync: snap?.sync || [],
    connected,
    now: Date.now(),
  });

  async function connectDevice(device, previouslyChosen) {
    const result = await UteBand.connect({ address: device.address, name: device.name || '', previouslyChosen });
    if (result?.error) toast(result.error === 'address_not_selected' ? '请从这次扫描里选择' : result.error);
    refresh();
  }
  async function retrySync() {
    const result = await UteBand.syncNow();
    if (result?.error === 'device_busy') toast('手环忙，空闲后会再同步');
    else if (result?.error) toast(result.error === 'not_connected' ? '还没有连上' : result.error);
    else toast('开始按顺序同步');
    refresh();
  }
  async function ask(text = draft) {
    const question = text.trim();
    if (!question) return;
    setMessages((items) => [...items, { who: 'user', text: question }]);
    setDraft('');
    if (!android) {
      setMessages((items) => [...items, { who: 'ai', text: '教练需要这部手机上的记录。浏览器里不会编造数值。' }]);
      return;
    }
    setBusy(true);
    try {
      const rows = [];
      for (const metric of ['steps', 'heart_rate', 'spo2', 'sleep', 'hrv', 'temperature', 'mood_pressure', 'battery']) {
        const result = await WeiguangStore.listObservations({ metric, limit: 12 });
        rows.push(...(result.rows || []));
      }
      const outcome = await runDeviceCoach({
        question,
        snapshot: { ...snap, connected },
        observations: rows,
        consent,
        proxyUrl,
        proxyToken,
        online: navigator.onLine,
      });
      const reply = outcome.values?.modelText || outcome.values?.notices?.[0] || outcome.values?.followup || '没有生成新的表述。';
      setMessages((items) => [...items, { who: 'ai', text: reply }]);
      await refresh();
    } catch {
      setMessages((items) => [...items, { who: 'ai', text: '这次没有完成。记录仍留在手机上。' }]);
    } finally {
      setBusy(false);
    }
  }

  const onboarding = ONBOARD.includes(screen);
  return <div className="desktop-stage">
    <aside className="prototype-note">
      <span className="note-kicker">WEIGUANG</span>
      <h1>微光</h1>
      <p>圆形首页和原来的页面还在。演示分数没有当成手环读数。</p>
      <div className="note-divider" />
      <p>记录留在这部手机的 SQLite。卸载会删除。</p>
    </aside>
    <div style={{ '--theme': BAND_COLORS[themeIndex][1] }} className={`phone ${screen === 'welcome' || screen === 'ready' ? 'phone-dark' : ''} ${screen === 'ready' ? 'phone-ready' : ''}`}>
      <div className="phone-status"><strong>9:41</strong><span>{android ? 'Android' : 'Web'}</span></div>
      {notice && <div className="toast">{notice}</div>}
      <main className={`phone-main ${screen === 'coach' ? 'chat-main' : ''}`}>
        {screen === 'welcome' && <div className="welcome-screen">
          <div className="welcome-glow" /><div className="welcome-content"><div className="brand-mark"><Sparkles size={17} /> 微光 · ENERGY COMPANION</div><h1>睡得更好，<br />醒来活出精彩。</h1><p>找回舒服的节奏，去过你向往的生活。</p></div>
          <div className="welcome-companion"><Sprite size="welcome-orb" /><div><span>你好，我是微光</span><small>陪你找回舒服的节奏</small></div></div>
          <div className="welcome-bottom"><button className="primary-button" onClick={() => go('connect')}>开启我的美好节奏 <ArrowRight size={19} /></button><button className="text-link light" onClick={() => go('home')}>先进入首页</button></div>
        </div>}

        {screen === 'connect' && <div className="onboard-screen">
          <div className="top-line"><button aria-label="返回" onClick={back}><ArrowLeft /></button><button className="skip" onClick={() => go('survey')}>跳过</button></div>
          <div className="onboard-head"><span className="step-label">01 / 05 · 连接设备</span><h1>连接你的智能手环</h1><p>连接后同步可用的活动、心率和睡眠。支持项目以设备能力位为准。</p></div>
          <div className="band-picker">
            <div className="band-showcase" onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; }} onTouchEnd={(event) => { if (touchStart.current == null) return; const delta = event.changedTouches[0].clientX - touchStart.current; if (Math.abs(delta) > 35) selectBand(bandIndex + (delta < 0 ? 1 : -1)); touchStart.current = null; }}>
              <button className="band-arrow" aria-label="上一种颜色" onClick={() => selectBand(bandIndex - 1)}><ChevronRight className="back-arrow" /></button>
              <div className="band-render" role="img" aria-label={`${BAND_COLORS[bandIndex][0]}外观示意`} style={{ backgroundPosition: `${(bandIndex % 4) * 100 / 3}% ${Math.floor(bandIndex / 4) * 50}%` }} />
              <button className="band-arrow" aria-label="下一种颜色" onClick={() => selectBand(bandIndex + 1)}><ChevronRight /></button>
            </div>
            <strong>{BAND_COLORS[bandIndex][0]}</strong>
            <small>圆形色点只选择界面外观，不代表已经连上。</small>
            <div className="swatches" aria-label="手环颜色">{BAND_COLORS.map(([name, color], index) => <button key={name} className={bandIndex === index ? 'selected' : ''} aria-label={name} style={{ '--swatch': color }} onClick={() => selectBand(index)} />)}</div>
            <div className="theme-picker"><div><strong>界面颜色</strong><button type="button" onClick={() => { setFollowBand(true); setThemeIndex(bandIndex); }}>跟随外观</button></div><div className="swatches theme-swatches">{BAND_COLORS.map(([name, color], index) => <button key={name} className={themeIndex === index ? 'selected' : ''} aria-label={`${name}界面`} style={{ '--swatch': color }} onClick={() => { setThemeIndex(index); setFollowBand(false); }} />)}</div></div>
          </div>
          <div className="connect-list"><div><strong>{connected ? `已连接 ${band?.name || '手环'}` : band?.bluetooth === 'off' ? '手机蓝牙关闭' : '未连接'}</strong></div><div>{band?.error || (android ? '从下面的扫描结果里选择' : '浏览器里没有手环 SDK')}</div></div>
          <div className="scan-list">{scan.map((device) => <button key={device.address} onClick={() => connectDevice(device, false)}><strong>{device.name}</strong><small>{device.address}</small></button>)}{!scan.length && <p>还没有扫描结果。</p>}</div>
          {(snap?.devices || []).map((device) => <button className="text-link" key={device.address} onClick={() => connectDevice(device, true)}>重连上次的 {device.name || '手环'}</button>)}
          <div className="bottom-action">
            <button className="primary-button" disabled={!android} onClick={async () => { setScan([]); await UteBand.requestBlePermissions(); await UteBand.startScan(); refresh(); }}>扫描附近设备</button>
            {connected && <button className="text-link" onClick={retrySync}>同步手环记录</button>}
            {connected && <button className="text-link" onClick={async () => { await UteBand.disconnect(); refresh(); }}>断开</button>}
            <button className="text-link" onClick={() => go('survey')}>继续</button>
          </div>
        </div>}

        {screen === 'survey' && <div className="onboard-screen survey-screen">
          <div className="top-line"><button aria-label="返回" onClick={back}><ArrowLeft /></button><span>02 / 05</span></div>
          <div className="onboard-head"><span className="step-label">了解需求</span><h1>认识你，更好地帮助你</h1></div>
          <Sprite /><div className="ai-intro">先选你在意的方向。这些回答存在这次打开里，不会被写成手环读数。</div>
          <div className="question-list">{SURVEY.map((item, index) => <div className={`question ${activeQuestion === index ? 'active' : ''}`} key={item.q}><button onClick={() => setActiveQuestion(activeQuestion === index ? -1 : index)}><IconBubble icon={item.icon} /><span><strong>{item.q}</strong><small>{answers[index] || item.sub}</small></span><ChevronDown size={16} /></button>{activeQuestion === index && <div className="question-options">{item.options.map((option) => <button className={answers[index] === option ? 'selected' : ''} key={option} onClick={() => { setAnswers({ ...answers, [index]: option }); setActiveQuestion(index < 3 ? index + 1 : -1); }}>{option}</button>)}</div>}</div>)}</div>
          <div className="bottom-action"><button className="primary-button" disabled={Object.keys(answers).length < 4} onClick={() => go('goals')}>继续设定目标 <ArrowRight size={17} /></button></div>
        </div>}

        {screen === 'goals' && <div className="onboard-screen">
          <div className="top-line"><button aria-label="返回" onClick={back}><ArrowLeft /></button><span>03 / 05</span></div>
          <div className="onboard-head"><span className="step-label">目标确认</span><h1>为你制定专属目标</h1><p>选中的句子会写成你的目标，不会变成健康分数。</p></div>
          <div className="goal-card"><div className="goal-title"><IconBubble icon={Target} tone="gold" /><div><strong>可选目标</strong><small>确认后保存在这部手机</small></div></div>{GOAL_CHOICES.map((goal) => <button className="goal-row" key={goal} onClick={() => setGoalChoices(goalChoices.includes(goal) ? goalChoices.filter((item) => item !== goal) : [...goalChoices, goal])}><span>{goal}</span><span className={`goal-check ${goalChoices.includes(goal) ? 'on' : ''}`}>{goalChoices.includes(goal) && <Check size={15} />}</span></button>)}</div>
          <div className="bottom-action"><button className="primary-button" disabled={!goalChoices.length} onClick={async () => { if (android) { for (const text of goalChoices) await WeiguangStore.saveGoal({ text, timezone: zone }); await refresh(); } go('generated'); }}>确认并查看计划</button></div>
        </div>}

        {screen === 'generated' && <div className="onboard-screen">
          <div className="top-line"><button aria-label="返回" onClick={back}><ArrowLeft /></button><span>04 / 05</span></div>
          <div className="onboard-head"><span className="step-label">计划预览</span><h1>起始安排</h1><p>这是页面上的阶段说明，不是已经测到的完成度。</p></div>
          <div className="timeline">{[
            ['第 1–3 天', '先同步睡眠、心率和步数', Activity, 'blue'],
            ['第 4–7 天', '看你自己确认的目标', Moon, 'purple'],
            ['之后', '有两条以上记录再看趋势', Heart, 'green'],
          ].map(([phase, detail, Icon, tone]) => <div className="timeline-item" key={phase}><IconBubble icon={Icon} tone={tone} /><span><strong>{phase}</strong><small>{detail}</small></span></div>)}</div>
          <div className="hint-box"><ShieldCheck size={17} /> 不代替诊疗，也不生成精力分数。</div>
          <div className="bottom-action"><button className="primary-button" onClick={() => go('ready')}>进入准备页</button></div>
        </div>}

        {screen === 'ready' && <div className="ready-screen"><div className="ready-stars">✦ ✧ ✦</div><div className="ready-check"><Check size={43} /></div><h1>准备好了</h1><p>首页会显示圆形入口。有手环记录才出现数值。</p><div className="ready-card"><strong>接下来可以</strong><span><Activity size={17} /> 查看今日状态</span><span><MessageCircle size={17} /> 和教练聊聊</span><span><Watch size={17} /> 查看设备</span></div><button className="primary-button" onClick={() => go('home')}>进入首页 <ArrowRight size={18} /></button></div>}

        {screen === 'home' && <div className="app-screen home-screen">
          <div className="app-header"><div><span className="eyebrow">TODAY</span><h1>今日状态</h1><small>{todayLabel()}</small></div><button className="header-icon" aria-label="通知" onClick={() => go('notifications')}><Bell size={21} /></button></div>
          <div className="data-banner"><span>{connected ? '手环已连接' : '手环未连接'}</span><button onClick={() => go('device')}>{band?.error || '设备'} <ChevronRight size={14} /></button></div>
          <div className="score-card"><div className="score-ring empty"><div><small>精力指数</small><strong>—<span /></strong><em>没有接口</em></div></div><p>SDK 没有精力指数，这里不填演示分数。</p></div>
          <div className="metric-card">{HOME_METRICS.map(([Icon, metric, label]) => {
            const state = rowState(snap, metric);
            return <div className="metric-row" key={metric}><Icon size={17} /><span>{label}</span><strong>{state.kind === 'value' ? state.label : '—'}</strong><span className="mini-status">{state.kind === 'value' ? '记录' : state.label}</span></div>;
          })}</div>
          <button className="home-companion" onClick={() => go('coach')}><Sprite size="home-orb" /><span className="home-companion-copy"><small>你的 AI 精灵伙伴</small><strong>微光在这里</strong><span>{quality.notices[0] || '同步之后再看记录。'}</span><b>和微光聊聊 <ArrowRight size={14} /></b></span></button>
          <div className="section-heading"><h2>今天可以做什么</h2><button onClick={() => go('plan')}>查看计划 <ChevronRight size={15} /></button></div>
          <div className="quick-row"><button onClick={() => go('plan')}><CalendarDays /> 今日任务</button><button onClick={() => go('insights')}><TrendingUp /> 查看趋势</button></div>
        </div>}

        {screen === 'coach' && <div className="app-screen coach-screen">
          <div className="coach-header"><Sprite size="small" /><div><h1>AI 精力教练</h1><small>{busy ? '正在整理记录' : '非医疗建议'}</small></div><button aria-label="说明" onClick={() => go('coach-info')}><Settings2 size={20} /></button></div>
          <div className="chat-history"><div className="context-card"><Sparkles size={16} /><span>{quality.notices[0] || '先同步记录。'}</span></div>{messages.map((item, index) => <div className={`chat-line ${item.who}`} key={`${item.who}-${index}`}>{item.who === 'ai' && <Sprite size="tiny" />}<div className="bubble">{item.text}</div></div>)}<div ref={chatEnd} /></div>
          <div className="suggestions">{['今天的睡眠记录怎么看？', '有心率记录吗？', '先别安排任务'].map((item) => <button key={item} onClick={() => ask(item)}>{item}</button>)}</div>
          <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); ask(); }}><button type="button" aria-label="更多" onClick={() => toast('直接输入你想对照的记录')}><Plus size={20} /></button><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="聊聊今天的睡眠与精力…" /><button type="submit" className="send-button" aria-label="发送" disabled={busy}><Send size={18} /></button></form>
        </div>}

        {screen === 'plan' && <div className="app-screen">
          <div className="app-header centered"><h1>我的计划</h1></div>
          <CompanionNote text="一步一步，陪你养成好习惯" onClick={() => go('coach')} />
          <div className="segmented">{['当前计划', '任务清单', '历史计划'].map((tab) => <button className={planTab === tab ? 'selected' : ''} key={tab} onClick={() => setPlanTab(tab)}>{tab}</button>)}</div>
          {planTab === '当前计划' && <><div className="plan-hero"><strong>30 天睡眠与精力改善计划</strong><small>起始安排 · 完成度只按已保存任务计算</small><div className="progress"><span style={{ width: tasks.length ? `${Math.round((tasks.filter((task) => task.status === 'done').length / tasks.length) * 100)}%` : '0%' }} /></div><em>{tasks.filter((task) => task.status === 'done').length}/{tasks.length || 0}</em></div><div className="focus-card"><small>当前重点（第 1–3 天）</small><ul><li>记录睡眠和起床时间</li><li>观察午后精力感受</li><li>建立自己的初始基线</li></ul></div></>}
          {planTab === '历史计划' && <div className="empty-card"><CalendarDays /><strong>还没有历史计划</strong><p>已完成的任务仍留在任务清单里。</p></div>}
          {planTab !== '历史计划' && <><div className="section-heading"><h2>今日任务</h2><span>{tasks.filter((task) => task.status === 'done').length}/{tasks.length}</span></div><div className="task-card">{tasks.map((task) => <button className="task-row" key={task.id} onClick={async () => { await WeiguangStore.setTaskStatus({ id: task.id, status: task.status === 'done' ? 'active' : 'done' }); refresh(); }}><span className={`task-check ${task.status === 'done' ? 'done' : ''}`}>{task.status === 'done' && <Check size={14} />}</span><span><strong>{task.title}</strong><small>{task.detail || task.source}</small></span></button>)}{!tasks.length && <div className="empty-card"><strong>还没有任务</strong><p>可以在教练里确认建议，或在下面自己写。</p></div>}</div><TaskForm zone={zone} onSaved={refresh} toast={toast} /><button className="inline-action" onClick={() => go('reminders')}><Bell size={16} /> 设置提醒</button></>}
        </div>}

        {screen === 'insights' && <div className="app-screen">
          <div className="app-header centered"><h1>健康洞察</h1></div>
          <CompanionNote text="一起看看你的变化和趋势" onClick={() => go('coach')} />
          <div className="segmented four">{['趋势', '睡眠', '精力', '健康'].map((tab) => <button className={insightTab === tab ? 'selected' : ''} key={tab} onClick={() => setInsightTab(tab)}>{tab}</button>)}</div>
          {insightTab === '趋势' && <Trend rows={series} />}
          {insightTab === '睡眠' && <MetricBlock snap={snap} metric="sleep" title="睡眠" />}
          {insightTab === '精力' && <div className="insight-card"><IconBubble icon={TrendingUp} /><div><strong>精力指数没有接口</strong><p>首页保留原来的指数位置，但不填分数，也不把心率或睡眠换算成精力。</p></div></div>}
          {insightTab === '健康' && <div className="metric-card">{HEALTH_METRICS.map(([metric, label]) => { const state = rowState(snap, metric); return <div className="metric-row" key={metric}><span>{label}</span><strong>{state.kind === 'value' ? state.label : '—'}</strong><span className="mini-status">{state.label}</span></div>; })}</div>}
          {insightTab !== '健康' && <><div className="insight-card"><IconBubble icon={TrendingUp} /><div><strong>睡眠与精力的关联</strong><p>还没有足够的真实记录，不会在这里写演示结论。</p></div></div><div className="insight-card"><IconBubble icon={LockKeyhole} tone="gold" /><div><strong>本月关键变化</strong><p>没有可计算的变化。同步到至少两条记录后再对照。</p></div></div></>}
          <button className="inline-action" onClick={() => setShowMetrics(!showMetrics)}><Activity size={16} /> {showMetrics ? '收起指标说明' : '查看指标说明'}</button>
          {showMetrics && <div className="hint-box">精力指数没有 SDK 接口。心率、血氧、体温、HRV 和压力在「健康」里，有设备能力位才读取。10 分钟只是采集预期，不是手机同步间隔。</div>}
          <button className="inline-action" onClick={retrySync}>再同步一次</button>
        </div>}

        {screen === 'membership' && <div className="app-screen">
          <div className="app-header centered"><h1>会员服务</h1></div>
          <CompanionNote text="了解更多陪伴与计划服务" onClick={() => go('coach')} />
          <div className="member-hero"><Crown size={34} /><h2>AI 精力管理会员</h2><p>持续 30 天的个性化改善服务</p></div>
          <div className="benefits">{['专属 30 天改善计划与跟进', '每日深度分析与个性化建议', '每周复盘与动态调整', '个人记忆与长期目标管理', '优先体验新功能'].map((item) => <div key={item}><Check size={17} />{item}</div>)}</div>
          <div className="price-row">{[['月度会员', '$9.99/月'], ['年度会员', '$79.99/年']].map(([name, price]) => <button className={membership === name ? 'selected' : ''} key={name} onClick={() => setMembership(name)}><strong>{name}</strong><span>{price}</span></button>)}</div>
          <button className="gold-button" onClick={() => go('membership-detail')}>查看会员方案</button>
          <small className="center-note">价格仅复刻参考图；不会创建订阅或扣款</small>
        </div>}

        {screen === 'profile' && <div className="app-screen">
          <div className="app-header centered"><h1>我的</h1></div>
          <CompanionNote text="记录只在这部手机" onClick={() => go('coach')} />
          <div className="profile-card"><div className="avatar">微</div><div><strong>这部手机</strong><small>{connected ? '手环已连接' : '手环未连接'}</small></div><span>本地</span></div>
          <div className="menu-card">{[
            [Target, '我的目标与偏好', '查看目标', 'preferences'],
            [ShieldCheck, '健康档案与记忆', '已同步的记录', 'memory'],
            [Watch, '设备管理', connected ? '已连接' : '未连接', 'device'],
            [Bell, '通知与提醒', '需你确认后才安排', 'reminders'],
            [LockKeyhole, '数据与隐私', '诊断与删除', 'privacy'],
            [CircleHelp, '帮助与反馈', '连接后若退出看这里', 'help'],
          ].map(([Icon, title, sub, id]) => <button className="menu-row" key={id} onClick={() => go(id)}><Icon size={19} /><span><strong>{title}</strong><small>{sub}</small></span><ChevronRight size={17} /></button>)}</div>
          <button className="inline-action" onClick={() => go('membership')}><Crown size={16} /> 会员说明</button>
          <button className="reset-link" onClick={() => go('welcome')}>回到欢迎页</button>
        </div>}

        {DETAIL[screen] && <div className="app-screen detail-screen">
          <div className="detail-top"><button aria-label="返回" onClick={back}><ArrowLeft size={20} /></button><h1>{DETAIL[screen]}</h1></div>
          {screen === 'notifications' && <div className="detail-panel"><strong>还没有系统通知</strong><p>提醒要在任务里由你确认，使用不精确闹钟。</p><button className="inline-action" onClick={() => go('reminders')}>去设置 <ChevronRight size={16} /></button></div>}
          {screen === 'coach-info' && <div className="detail-panel"><strong>教练使用已同步的摘要</strong><p>没有记录时不会编造心率、睡眠或精力分数。</p></div>}
          {screen === 'preferences' && <div className="detail-panel"><strong>已保存的目标</strong>{savedGoals.map((goal) => <p key={goal.id}>{goal.text}</p>)}{!savedGoals.length && <p>还没有目标。</p>}<button className="inline-action" onClick={() => go('goals')}>去选择 <ChevronRight size={16} /></button></div>}
          {screen === 'memory' && <div className="detail-panel"><strong>最近记录</strong>{HOME_METRICS.map(([, metric, label]) => <p key={metric}>{label}：{rowState(snap, metric).label}</p>)}<small>心率、血氧、体温、HRV 和压力的细项在洞察的健康页。</small></div>}
          {screen === 'device' && <div className="detail-panel"><strong>{connected ? '手环已连接' : '尚未连接'}</strong><p>{band?.error || band?.phase || '等待操作'}。上次成功同步 {formatWhen(quality.lastSuccessAt) || '没有'}。</p>{connected && <button className="detail-choice" onClick={retrySync}>再同步一次</button>}{connected && <button className="detail-choice" onClick={async () => { await UteBand.disconnect(); refresh(); }}>断开</button>}<button className="inline-action" onClick={() => go('connect')}>去扫描 <ChevronRight size={16} /></button></div>}
          {screen === 'reminders' && <div className="detail-panel"><strong>选择一个未完成任务</strong>{tasks.filter((task) => task.status === 'active').map((task) => <button className="detail-choice" key={task.id} onClick={() => setReminderTask(task.id)}>{task.title}</button>)}{!tasks.some((task) => task.status === 'active') && <p>没有进行中的任务。</p>}<ReminderForm taskId={reminderTask} zone={zone} toast={toast} onDone={refresh} /></div>}
          {screen === 'privacy' && <div className="detail-panel"><strong>数据留在这部手机</strong><p>卸载会删除 SQLite。诊断只保留异常类型和系统退出原因，不含密钥、地址和健康数值。</p>
            <label className="detail-choice"><input type="checkbox" checked={consent} onChange={async (event) => { const next = event.target.checked; setConsent(next); if (android) await WeiguangStore.setMeta({ key: 'ai_consent', value: next ? 'yes' : 'no' }); }} /> 允许把最小摘要发给模型</label>
            <input value={proxyUrl} onChange={(event) => setProxyUrl(event.target.value)} placeholder="https://代理地址" />
            <input value={proxyToken} onChange={(event) => setProxyToken(event.target.value)} placeholder="代理令牌" />
            <button className="detail-choice" type="button" onClick={async () => { await WeiguangStore.setMeta({ key: 'proxy_url', value: proxyUrl }); await WeiguangStore.setMeta({ key: 'proxy_token', value: proxyToken }); toast('已保存在本机'); }}>保存代理</button>
            {android && debugModel.debug && <><input type="password" autoComplete="off" value={modelKey} onChange={(event) => setModelKey(event.target.value)} placeholder={debugModel.configured ? '测试密钥已在这部手机' : '内部测试密钥'} /><button className="detail-choice" type="button" onClick={async () => { if (!modelKey.trim()) { toast(debugModel.configured ? '仍使用这部手机上的测试密钥' : '还没有填写'); return; } const saved = await WeiguangStore.setDebugModelKey({ value: modelKey.trim() }); setModelKey(''); setDebugModel({ debug: saved?.debug === true, configured: saved?.configured === true }); toast(saved?.configured ? '只保存在这部手机' : '正式包不能保存'); }}>保存测试密钥</button></>}
            <button className="detail-choice" type="button" onClick={async () => { const saved = await UteBand.exportConnectDiagnostic(); setDiagnostic(saved?.text || '还没有连接诊断。若进程退出，下次打开会尝试读取系统退出原因。'); }}>查看连接诊断</button>
            {diagnostic && <pre className="diagnostic-text">{diagnostic}</pre>}
            <button className="reset-link" onClick={async () => { if (!android) { toast('没有本地数据库'); return; } await WeiguangStore.deleteAll({ confirmed: true }); refresh(); }}>删除这部手机上的微光数据</button>
          </div>}
          {screen === 'help' && <div className="detail-panel"><strong>显示已连接后如果退出</strong><p>重新打开后到「数据与隐私」查看诊断。需要系统退出原因或 logcat，版本页本身不能说明原因。</p><button className="inline-action" onClick={() => go('privacy')}>打开诊断 <ChevronRight size={16} /></button></div>}
          {screen === 'membership-detail' && <div className="detail-panel"><strong>{membership}</strong><p>没有价格，也不会扣款。本地记录和教练不依赖这项。</p><button className="inline-action" onClick={back}>返回</button></div>}
        </div>}
      </main>
      {!onboarding && !DETAIL[screen] && <nav className="bottom-nav">{NAV.map(([id, Icon, label]) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => go(id)}><Icon size={21} /><span>{label}</span></button>)}</nav>}
      <div className="home-indicator" />
    </div>
  </div>;
}

function Trend({ rows }) {
  const compared = compareSeries(rows);
  const values = (rows || []).map((row) => primaryValue({ ...row, metric: row.metric || 'steps' })).filter((value) => value != null).slice(-8);
  const max = values.length ? Math.max(...values) : 0;
  if (compared.status !== 'compared' || !max) {
    return <div className="chart-card"><div className="chart-title"><strong>记录趋势</strong><span>记录不足</span></div><div className="empty-card"><strong>还不能画趋势</strong><p>至少两条有效记录才会出现在这张图里。不会用演示柱填充。</p></div></div>;
  }
  return <div className="chart-card"><div className="chart-title"><strong>记录趋势</strong><span>相差 {compared.delta}</span></div><div className="chart"><div className="bars">{values.map((value, index) => <div key={index} style={{ height: `${Math.max(8, Math.round((value / max) * 100))}%` }} />)}</div></div><p>上一条 {compared.previous}，最近 {compared.latest}。这不是医学判断。</p></div>;
}
function MetricBlock({ snap, metric, title }) {
  const state = rowState(snap, metric);
  return <div className="insight-card"><IconBubble icon={Moon} /><div><strong>{title}</strong><p>{state.label}{state.when ? ` · ${formatWhen(state.when)}` : ''}</p></div></div>;
}
function TaskForm({ zone, onSaved, toast }) {
  const [title, setTitle] = useState('');
  return <form className="detail-panel" onSubmit={async (event) => { event.preventDefault(); const saved = await WeiguangStore.createTask({ title, source: 'user', timezone: zone }); if (saved?.error) toast('手机数据库不可用'); setTitle(''); onSaved(); }}><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="自己添加一个任务" /><button className="primary-button" type="submit">添加</button></form>;
}
function ReminderForm({ taskId, zone, toast, onDone }) {
  const [when, setWhen] = useState('');
  if (!taskId) return null;
  return <div className="reminder-line"><input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} /><button type="button" onClick={async () => { await UteBand.requestNotifyPermission(); const saved = await WeiguangStore.setReminder({ id: taskId, enabled: true, userConfirmed: true, reminderLocal: when.replace(' ', 'T'), repeatDaily: false, timezone: zone }); toast(saved?.schedule ? '已安排一次不精确提醒' : (saved?.reason || '没有安排')); onDone(); }}>确认提醒一次</button></div>;
}
