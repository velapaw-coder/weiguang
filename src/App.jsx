import React, { useEffect, useState } from 'react';
import { Bluetooth, Check, ChevronRight, Moon, Heart, Activity, Wind, Watch, Home, MessageCircle, CalendarDays, TrendingUp, UserRound, ArrowRight } from 'lucide-react';
import { isAndroidApp, UteBand, WeiguangStore } from './band/native.js';
import { assess } from './coach/quality.js';
import { compareSeries, metricPresentation, METRIC_STATUS, primaryValue } from './coach/history.js';
import { runDeviceCoach } from './coach/run.js';

const NAV = [
  ['home', Home, '今日'],
  ['coach', MessageCircle, '教练'],
  ['plan', CalendarDays, '计划'],
  ['insights', TrendingUp, '洞察'],
  ['profile', UserRound, '我的'],
];
const METRICS = [
  ['steps', Activity, '步数'],
  ['heart_rate', Heart, '心率'],
  ['spo2', Wind, '血氧'],
  ['sleep', Moon, '睡眠'],
  ['hrv', Activity, 'HRV'],
  ['temperature', Activity, '体温'],
  ['mood_pressure', Activity, '情绪压力'],
];

function formatMs(value) {
  const ms = Number(value);
  if (!ms) return '没有';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

const INSIGHTS = [
  ['steps', '步数'],
  ['heart_rate', '心率'],
  ['spo2', '血氧'],
  ['sleep', '睡眠'],
  ['hrv', 'HRV'],
  ['temperature', '体温'],
  ['mood_pressure', '压力'],
];

function showValue(row) {
  const value = primaryValue(row);
  if (value == null) return METRIC_STATUS.invalid;
  if (row.metric === 'steps') return `${value} 步`;
  if (row.metric === 'heart_rate') return `${value} 次/分`;
  if (row.metric === 'spo2' || row.metric === 'battery') return `${value}%`;
  if (row.metric === 'sleep') return `${value} 分钟`;
  if (row.metric === 'temperature') return `${value} °C`;
  if (row.metric === 'hrv') return `${value}（SDK原值）`;
  if (row.metric === 'mood_pressure') return `压力 ${value}`;
  return String(value);
}

export default function App() {
  const android = isAndroidApp();
  const [screen, setScreen] = useState('welcome');
  const [band, setBand] = useState(null);
  const [snap, setSnap] = useState(null);
  const [scan, setScan] = useState([]);
  const [notice, setNotice] = useState('');
  const [goal, setGoal] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [coach, setCoach] = useState(null);
  const [busy, setBusy] = useState(false);
  const [insightMetric, setInsightMetric] = useState('steps');
  const [series, setSeries] = useState([]);
  const [consent, setConsent] = useState(false);
  const [proxyUrl, setProxyUrl] = useState('');
  const [proxyToken, setProxyToken] = useState('');
  const [debugModel, setDebugModel] = useState({ debug: false, configured: false });
  const [modelKey, setModelKey] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const toast = (text) => { setNotice(text); window.setTimeout(() => setNotice(''), 3200); };

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

  useEffect(() => {
    if (!android || screen !== 'insights') return;
    WeiguangStore.listObservations({ metric: insightMetric, limit: 30 }).then((result) => setSeries(result.rows || []));
  }, [android, screen, insightMetric, snap]);

  const quality = assess({
    observations: Object.values(snap?.latest || {}),
    sync: snap?.sync || [],
    connected: band?.connection === 'connected',
    now: Date.now(),
  });
  const tasks = snap?.tasks || [];
  const activeTasks = tasks.filter((task) => task.status === 'active');

  async function retrySync() {
    const result = await UteBand.syncNow();
    if (result?.error === 'device_busy') toast('手环忙，空闲后会再同步');
    else if (result?.error === 'not_connected') toast('还没有连上，不能同步');
    else toast('开始串行同步');
    refresh();
  }

  async function connect(device, previouslyChosen) {
    const result = await UteBand.connect({ address: device.address, name: device.name || '', previouslyChosen });
    if (result.error) toast(result.error === 'address_not_selected' ? '请从扫描列表里选择设备' : result.error);
    refresh();
  }

  async function askCoach(event) {
    event?.preventDefault();
    if (!android) { toast('教练需要手机上的 SQLite 记录'); return; }
    setBusy(true);
    try {
      const rows = [];
      for (const metric of ['steps', 'heart_rate', 'spo2', 'sleep', 'hrv', 'temperature', 'mood_pressure', 'battery']) {
        const result = await WeiguangStore.listObservations({ metric, limit: 12 });
        rows.push(...(result.rows || []));
      }
      const outcome = await runDeviceCoach({
        question,
        snapshot: { ...snap, connected: band?.connection === 'connected' },
        observations: rows,
        consent,
        proxyUrl,
        proxyToken,
        online: navigator.onLine,
      });
      setCoach(outcome.values);
      setQuestion('');
      await refresh();
    } catch {
      toast('教练没有完成');
    } finally {
      setBusy(false);
    }
  }

  async function acceptProposal(proposal) {
    const saved = await WeiguangStore.createTask({
      title: proposal.title,
      detail: proposal.detail || '',
      source: proposal.source,
      rationaleJson: JSON.stringify(proposal.basedOn || []),
      timezone: zone,
    });
    if (saved.error) toast('任务没有写入手机数据库');
    else toast(proposal.source === 'langgraph' ? '已保存模型建议，提醒仍需你另外确认' : '已保存本地规则建议');
    refresh();
  }

  return <div className="desktop-stage">
    <aside className="prototype-note">
      <span className="note-kicker">WEIGUANG</span>
      <h1>微光</h1>
      <p>手环数据留在这部手机的 SQLite 里。卸载会删除。没有跨手机同步。</p>
      <div className="note-divider" />
      <p>约 10 分钟是你告知的采集预期，不是已验证的设备设置。应用不会每 10 分钟调用模型或发通知，也不会在后台保证准时同步。</p>
    </aside>
    <div className={`phone ${screen === 'welcome' ? 'phone-dark' : ''}`}>
      <div className="phone-status"><strong>{formatMs(Date.now())}</strong><span>{android ? 'Android' : 'Web'}</span></div>
      {notice && <div className="toast">{notice}</div>}
      <main className={`phone-main ${screen === 'coach' ? 'chat-main' : ''}`}>
        {screen === 'welcome' && <div className="welcome-screen">
          <div className="welcome-content"><div className="brand-mark">微光</div><h1>先连接手环，<br/>再看真实记录。</h1><p>没有演示步数、心率或精力分数。</p></div>
          <div className="welcome-bottom">
            <button className="primary-button" onClick={() => setScreen('connect')}>连接手环 <ArrowRight size={18} /></button>
            <button className="text-link light" onClick={() => setScreen('home')}>查看今日</button>
          </div>
        </div>}

        {screen === 'connect' && <div className="onboard-screen">
          <div className="onboard-head"><span className="step-label">设备</span><h1>扫描并手动选择</h1><p>不预设型号或地址。列表来自这一次扫描。</p></div>
          <div className="connect-list">
            <div><Bluetooth size={18} /><strong>{band?.connection === 'connected' ? `已连接 ${band.name || '未命名设备'}` : band?.bluetooth === 'off' ? '手机蓝牙关闭' : '未连接'}</strong></div>
            <div>{band?.error ? `状态：${band.error}` : android ? '等待你的操作' : '浏览器里没有优创 SDK'}</div>
          </div>
          <div className="scan-list">
            {scan.map((device) => <button key={device.address} onClick={() => connect(device, false)}><strong>{device.name}</strong><small>{device.address} · RSSI {device.rssi}</small></button>)}
            {!scan.length && <p>还没有扫描结果。</p>}
          </div>
          <div className="bottom-action">
            <button className="primary-button" disabled={!android} onClick={async () => { setScan([]); await UteBand.requestBlePermissions(); await UteBand.startScan(); refresh(); }}>扫描附近设备</button>
            <button className="text-link" onClick={async () => { await UteBand.stopScan(); refresh(); }}>停止扫描</button>
            {band?.connection === 'connected' && <button className="text-link" onClick={retrySync}>同步手环记录</button>}
            {band?.connection === 'connected' && <button className="text-link" onClick={async () => { await UteBand.disconnect(); refresh(); }}>断开</button>}
            {(snap?.devices || []).map((device) => <button className="text-link" key={device.address} onClick={() => connect(device, true)}>重连上次选择的 {device.name || device.address}</button>)}
          </div>
        </div>}

        {screen === 'home' && <div className="app-screen home-screen">
          <div className="app-header"><div><span className="eyebrow">TODAY</span><h1>今日状态</h1><small>{quality.pendingSync ? '数据滞后 / 待同步' : '已有最近一次同步'}</small></div><button className="header-icon" aria-label="设备" onClick={() => setScreen('connect')}><Watch size={20} /></button></div>
          <div className="data-banner"><span>{band?.connection === 'connected' ? '手环已连接' : '手环未连接'}</span><button onClick={() => setScreen('connect')}>设备 <ChevronRight size={14} /></button></div>
          <div className="hint-box">精力指数没有 SDK 接口，这里不计算分数。10 分钟采集预期未验证，后台也不会按这个间隔轮询。</div>
          <div className="metric-card">
            <div className="metric-row"><Watch size={17} /><span>电量</span><strong>{snap?.latest?.battery ? showValue({ ...snap.latest.battery, metric: 'battery' }) : '未同步'}</strong></div>
            {METRICS.map(([metric, Icon, label]) => {
              const row = snap?.latest?.[metric];
              return <div className="metric-row" key={metric}><Icon size={17} /><span>{label}</span><strong>{metricLabel(snap, metric, row)}</strong><small>{row ? `设备 ${row.device_sampled_at || '无'} · 收到 ${formatMs(row.phone_received_at)}` : syncNote(snap, metric)}</small></div>;
            })}
          </div>
          <div className="hint-box">上次成功同步：{formatMs(quality.lastSuccessAt)}。收到时间、设备时间和同步时间是分开的。<button className="text-link" onClick={retrySync}>再同步一次</button></div>
          <Section tasks={activeTasks} onOpen={() => setScreen('plan')} onToggle={async (task) => { await WeiguangStore.setTaskStatus({ id: task.id, status: task.status === 'done' ? 'active' : 'done' }); refresh(); }} />
        </div>}

        {screen === 'coach' && <div className="app-screen coach-screen">
          <div className="coach-header"><div><h1>教练</h1><small>{coach?.modelStatus || '尚未生成'}</small></div></div>
          <div className="chat-history">
            <div className="context-card"><span>{quality.notices[0] || '先同步记录。'}</span></div>
            {(coach?.notices || []).map((item) => <div className="chat-line ai" key={item}><div className="bubble">{item}</div></div>)}
            {coach?.modelText && <div className="chat-line ai"><div className="bubble">模型表述：{coach.modelText}</div></div>}
            {coach?.followup && <div className="chat-line ai"><div className="bubble">{coach.followup}</div></div>}
            {(coach?.proposals || []).map((proposal) => <div className="detail-panel" key={proposal.title}><strong>{proposal.source === 'langgraph' ? '模型建议，需确认' : '本地规则建议，不是云端模型'}</strong><p>{proposal.title}</p><p>{proposal.detail}</p><button className="detail-choice" onClick={() => acceptProposal(proposal)}>保存为任务</button></div>)}
            {coach && !coach.proposals?.length && <div className="empty-card"><strong>没有新的任务建议</strong><p>可以在计划里自己添加。缺少记录时不会编造依据。</p></div>}
          </div>
          <form className="chat-composer" onSubmit={askCoach}>
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="想让教练对照哪一段记录？" />
            <button className="send-button" disabled={busy} type="submit">{busy ? '…' : '生成'}</button>
          </form>
        </div>}

        {screen === 'plan' && <div className="app-screen">
          <div className="app-header centered"><h1>我的计划</h1></div>
          <p className="center-note">提醒默认关闭。开启后使用不精确闹钟，系统可能推迟。模型不能自己打开通知。</p>
          <form className="detail-panel" onSubmit={async (event) => { event.preventDefault(); const saved = await WeiguangStore.createTask({ title: taskTitle, source: 'user', timezone: zone }); if (saved.error) toast('手机数据库不可用'); setTaskTitle(''); refresh(); }}>
            <strong>自己添加任务</strong>
            <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="例如：今晚提前放下手机" />
            <button className="primary-button" type="submit">添加</button>
          </form>
          <div className="task-card">{tasks.map((task) => <TaskRow key={task.id} task={task} zone={zone} onChanged={refresh} toast={toast} />)}{!tasks.length && <div className="empty-card"><strong>还没有任务</strong><p>同步到记录后，可以在教练里确认建议，或在这里手写。</p></div>}</div>
        </div>}

        {screen === 'insights' && <div className="app-screen">
          <div className="app-header centered"><h1>记录对照</h1></div>
          <div className="segmented">{INSIGHTS.map(([metric, label]) => <button key={metric} className={insightMetric === metric ? 'selected' : ''} onClick={() => setInsightMetric(metric)}>{label}</button>)}</div>
          <Insight series={series} status={metricLabel(snap, insightMetric, snap?.latest?.[insightMetric])} />
        </div>}

        {screen === 'profile' && <div className="app-screen">
          <div className="app-header centered"><h1>我的</h1></div>
          <div className="detail-panel"><strong>这部手机</strong><p>数据库是安卓 SQLite（weiguang.db）。卸载应用会丢掉全部本地记录。不会同步到另一部手机，也没有云端健康档案。</p></div>
          <form className="detail-panel" onSubmit={async (event) => { event.preventDefault(); await WeiguangStore.saveGoal({ text: goal, timezone: zone }); setGoal(''); refresh(); }}>
            <strong>我的目标</strong>
            {(snap?.goals || []).map((item) => <p key={item.id}>{item.text}</p>)}
            <input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="写一个你自己的目标" />
            <button className="detail-choice" type="submit">保存目标</button>
          </form>
          <div className="detail-panel">
            <strong>模型</strong>
            <p>调试安装包可以在本页保存测试密钥，只留在这部手机。正式包没有这项，只走上面的代理。密钥不进源码。</p>
            <label className="detail-choice"><input type="checkbox" checked={consent} onChange={async (event) => { const next = event.target.checked; setConsent(next); if (android) await WeiguangStore.setMeta({ key: 'ai_consent', value: next ? 'yes' : 'no' }); }} /> 允许把最小摘要发给模型</label>
            <input value={proxyUrl} onChange={(event) => setProxyUrl(event.target.value)} placeholder="https://代理地址" />
            <input value={proxyToken} onChange={(event) => setProxyToken(event.target.value)} placeholder="代理令牌，不是火山密钥" />
            <button className="detail-choice" onClick={async () => { await WeiguangStore.setMeta({ key: 'proxy_url', value: proxyUrl }); await WeiguangStore.setMeta({ key: 'proxy_token', value: proxyToken }); toast('已保存在本机'); }}>保存代理设置</button>
            {android && debugModel.debug && <>
              <input type="password" autoComplete="off" value={modelKey} onChange={(event) => setModelKey(event.target.value)} placeholder={debugModel.configured ? '测试密钥已在这部手机，留空则保持' : '内部测试密钥，只留在这部手机'} />
              <button className="detail-choice" type="button" onClick={async () => {
                if (!modelKey.trim()) { toast(debugModel.configured ? '仍使用这部手机上的测试密钥' : '还没有填写测试密钥'); return; }
                const saved = await WeiguangStore.setDebugModelKey({ value: modelKey.trim() });
                setModelKey('');
                setDebugModel({ debug: saved?.debug === true, configured: saved?.configured === true });
                toast(saved?.configured ? '测试密钥只保存在这部手机' : '正式包不能保存测试密钥');
              }}>保存测试密钥</button>
            </>}
          <button className="detail-choice" type="button" onClick={async () => {
              const saved = await UteBand.exportConnectDiagnostic();
              setDiagnostic(saved?.text || '还没有连接诊断');
            }}>查看上次连接诊断</button>
            {diagnostic && <pre className="diagnostic-text">{diagnostic}</pre>}
          </div>
          <button className="reset-link" onClick={async () => { if (!android) { toast('没有本地数据库'); return; } await WeiguangStore.deleteAll({ confirmed: true }); setCoach(null); refresh(); }}>删除这部手机上的微光数据</button>
        </div>}
      </main>
      {screen !== 'welcome' && screen !== 'connect' && <nav className="bottom-nav">{NAV.map(([id, Icon, label]) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => setScreen(id)}><Icon size={21} /><span>{label}</span></button>)}</nav>}
      <div className="home-indicator" />
    </div>
  </div>;
}

function metricLabel(snap, metric, row) {
  const flags = capabilityFlags(snap, metric);
  const sync = (snap?.sync || []).find((item) => item.metric === metric);
  const presentation = metricPresentation({
    row: row ? { ...row, metric } : null,
    known: flags.present ? flags.known : null,
    supported: flags.present ? flags.supported : null,
    syncStatus: sync?.last_status || '',
  });
  if (presentation.kind === 'value') return showValue({ ...row, metric });
  return METRIC_STATUS[presentation.kind];
}

function syncNote(snap, metric) {
  const sync = (snap?.sync || []).find((item) => item.metric === metric);
  if (!sync?.last_attempt_at) return '';
  return `上次尝试 ${formatMs(sync.last_attempt_at)}`;
}

function capabilityFlags(snap, metric) {
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

function Section({ tasks, onOpen, onToggle }) {
  return <>
    <div className="section-heading"><h2>今天的任务</h2><button onClick={onOpen}>计划 <ChevronRight size={15} /></button></div>
    <div className="task-card">{tasks.slice(0, 3).map((task) => <button className="task-row" key={task.id} onClick={() => onToggle(task)}><span className={`task-check ${task.status === 'done' ? 'done' : ''}`}>{task.status === 'done' && <Check size={14} />}</span><span><strong>{task.title}</strong><small>{task.source === 'user' ? '自己添加' : task.source === 'langgraph' ? '已确认的模型建议' : '已确认的本地建议'}</small></span></button>)}{!tasks.length && <div className="empty-card"><strong>没有进行中的任务</strong></div>}</div>
  </>;
}

function TaskRow({ task, zone, onChanged, toast }) {
  const [when, setWhen] = useState('');
  return <div className="task-row"><button onClick={async () => { await WeiguangStore.setTaskStatus({ id: task.id, status: task.status === 'done' ? 'active' : 'done' }); onChanged(); }}><span className={`task-check ${task.status === 'done' ? 'done' : ''}`}>{task.status === 'done' && <Check size={14} />}</span></button><span><strong>{task.title}</strong><small>{task.detail || '没有补充'} · {task.source === 'user' ? '手动' : task.source}</small>{task.status === 'active' && <span className="reminder-line"><input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} /><button type="button" onClick={async () => { await UteBand.requestNotifyPermission(); const saved = await WeiguangStore.setReminder({ id: task.id, enabled: true, userConfirmed: true, reminderLocal: when.replace(' ', 'T'), repeatDaily: false, timezone: zone }); toast(saved.schedule ? '已安排一次不精确提醒' : (saved.reason || '没有安排')); onChanged(); }}>确认提醒一次</button><button type="button" onClick={async () => { await WeiguangStore.setReminder({ id: task.id, enabled: false, userConfirmed: true, timezone: zone }); onChanged(); }}>关闭提醒</button></span>}</span></div>;
}

function Insight({ series, status }) {
  const comparison = compareSeries(series);
  if (comparison.status !== 'compared') {
    return <div className="empty-card"><strong>{status || '无足够数据'}</strong><p>至少需要两条有效记录才能对照。不会用演示曲线填充。睡眠按 SDK 的日期和时间段保存，不把跨天记录拆开。</p></div>;
  }
  return <div className="detail-panel"><strong>最近两条记录</strong><p>上一条 {comparison.previous}，最近 {comparison.latest}，相差 {comparison.delta}。</p><p>设备时间 {comparison.previousDeviceTime || '无'} → {comparison.latestDeviceTime || '无'}。</p><small>这是数值对照，不是医学判断。单点波动不当成异常。</small></div>;
}
