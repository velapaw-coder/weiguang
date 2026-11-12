import React, { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, Battery, Bell, Bluetooth, CalendarDays,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, Crown,
  Heart, Home, LockKeyhole, MessageCircle, Mic, Moon, Plus, Send, Settings2,
  ShieldCheck, Sparkles, Sun, Target, TrendingUp, UserRound, Watch, Wind,
} from 'lucide-react';

const ONBOARD = ['welcome', 'connect', 'survey', 'goals', 'generated', 'ready'];
const MAIN = ['home', 'coach', 'plan', 'insights', 'membership', 'profile'];
const nav = [
  ['home', Home, '今日'], ['coach', MessageCircle, '教练'],
  ['plan', CalendarDays, '计划'], ['insights', TrendingUp, '洞察'],
  ['profile', UserRound, '我的'],
];
const BAND_COLORS = [
  ['麦穗色','#a66a48'],['经典黑','#444852'],['浅蓝色','#5d8ed4'],['高级灰','#818894'],
  ['玫红色','#d95776'],['军绿色','#668572'],['蔚蓝色','#475d9e'],['爱马橙','#e48739'],
  ['原野绿','#8eaa3b'],['珍珠粉','#cb8da0'],['风信紫','#a18cc7'],['星光色','#b8aa96']
];
const surveyItems = [
  { icon: Moon, q: '你目前最想改善什么？', sub: '睡眠 / 精力 / 压力 / 作息', options: ['睡眠', '精力', '压力', '作息'] },
  { icon: CalendarDays, q: '你的工作和生活节奏是怎样的？', sub: '上班 / 创业 / 轮班 / 经常出差', options: ['上班', '创业', '轮班', '经常出差'] },
  { icon: Clock3, q: '你的大致作息时间？', sub: '入睡、起床、工作高峰', options: ['22:30 前睡', '23:30 前睡', '凌晨后睡', '不规律'] },
  { icon: Target, q: '你当前的主要困扰？', sub: '入睡困难、易醒、白天疲惫等', options: ['入睡困难', '夜间易醒', '白天疲惫', '注意力不足'] },
];
const baseTasks = [
  { id: 1, title: '23:30 前开始放松', detail: '今晚 22:45 提醒', done: true },
  { id: 2, title: '午后散步 10 分钟', detail: '已完成', done: true },
  { id: 3, title: '睡前 30 分钟远离手机', detail: '今晚 22:30 提醒', done: false },
];
const mockReply = (q) => {
  if (/睡|晚|困/.test(q)) return '可以先连续记录 3 天的入睡时间、夜间醒来次数与醒后感受。今天先把睡前放松提前 15 分钟，观察是否更容易入睡。当前是演示建议，不是医疗判断。';
  if (/精力|累|疲/.test(q)) return '你最近的演示趋势显示，晚睡后的次日上午精力评分较低。建议先固定起床时间，并在午后安排 10 分钟轻活动，再观察一周的变化。';
  return '我会把你的观察和作息记录放在一起看。你可以告诉我发生的时间、持续多久，以及当时的感受，我再帮你整理成可跟进的小步骤。';
};

function IconBubble({ icon: Icon, tone = 'blue', size = 20 }) {
  return <span className={`icon-bubble ${tone}`}><Icon size={size} strokeWidth={2.1} /></span>;
}
function PrimaryButton({ children, onClick, disabled, className = '' }) {
  return <button className={`primary-button ${className}`} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Sprite({size=''}) {
  const [failed, setFailed] = useState(false);
  const video = useRef(null);
  const play = () => { const v=video.current; if(v){v.muted=true; const attempt=v.play(); if(attempt?.catch)attempt.catch(()=>{});} };
  useEffect(()=>{play(); const resume=()=>{if(!document.hidden)play()}; document.addEventListener('visibilitychange',resume); return()=>document.removeEventListener('visibilitychange',resume)},[size]);
  return <div className={`orb sprite ${size}`} role="img" aria-label="微光 AI 精灵" onMouseEnter={play} onTouchStart={play}><img src="/weiguang.png" alt=""/>{!failed && size !== 'tiny' && <video ref={video} className="sprite-video" src="/weiguang.mp4" autoPlay loop muted playsInline preload="auto" onCanPlay={play} onError={()=>setFailed(true)}/>}</div>;
}
function CompanionNote({text, onClick}) {
  return <button className="companion-note" onClick={onClick}><Sprite size="small"/><span><strong>微光陪着你</strong><small>{text}</small></span><ChevronRight size={16}/></button>;
}
function MiniStatus({ children }) { return <span className="mini-status">{children}</span>; }
function SectionTitle({ children, trailing }) { return <div className="section-heading"><h2>{children}</h2>{trailing}</div>; }
function PhoneStatus() { return <div className="phone-status"><strong>9:41</strong><span>●●● ▰ <Battery size={15} fill="currentColor" /></span></div>; }

export default function App() {
  const [screen, setScreen] = useState(() => localStorage.getItem('energy.screen') || 'welcome');
  const [bandIndex, setBandIndex] = useState(() => { const raw=localStorage.getItem('energy.band'); const n=Number(raw); return raw!==null && Number.isInteger(n) && n>=0 && n<BAND_COLORS.length ? n : 2; });
  const [themeIndex, setThemeIndex] = useState(() => { const raw=localStorage.getItem('energy.theme'); const n=Number(raw); return raw!==null && Number.isInteger(n) && n>=0 && n<BAND_COLORS.length ? n : 2; });
  const [followBand, setFollowBand] = useState(() => localStorage.getItem('energy.followBand') !== 'false');
  const touchStart = useRef(null);
  const selectBand = (index) => { const n=(index+BAND_COLORS.length)%BAND_COLORS.length; setBandIndex(n); localStorage.setItem('energy.band',n); if(followBand){setThemeIndex(n);localStorage.setItem('energy.theme',n)} };
  const selectTheme = (index) => {setThemeIndex(index);setFollowBand(false);localStorage.setItem('energy.theme',index);localStorage.setItem('energy.followBand','false')};
  const syncTheme = () => {setFollowBand(true);setThemeIndex(bandIndex);localStorage.setItem('energy.theme',bandIndex);localStorage.setItem('energy.followBand','true')};
  const [connected, setConnected] = useState(() => localStorage.getItem('energy.connected') === 'true');
  const [answers, setAnswers] = useState({});
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [goals, setGoals] = useState(['平均睡眠时长 ≥ 7 小时', '就寝时间 23:30 前', '减少下午疲惫感']);
  const [tasks, setTasks] = useState(baseTasks);
  const [insightTab, setInsightTab] = useState('趋势');
  const [planTab, setPlanTab] = useState('当前计划');
  const [membership, setMembership] = useState('月度会员');
  const [messages, setMessages] = useState([{ who: 'ai', text: '你好，我是你的 AI 精力教练。你可以告诉我今天的睡眠、精力或压力感受，我会结合记录帮你找一个可执行的小步骤。' }]);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [showMetrics, setShowMetrics] = useState(false);
  const [range, setRange] = useState('近 30 天');
  const [reminder, setReminder] = useState(false);
  const history = useRef([]);
  const chatEnd = useRef(null);

  const go = (next) => { if (next !== screen) history.current.push(screen); setScreen(next); localStorage.setItem('energy.screen', next); setNotice(''); };
  const toast = (text) => { setNotice(text); window.setTimeout(() => setNotice(''), 3500); };
  const send = (text = draft) => {
    const q = text.trim(); if (!q) return;
    setMessages((m) => [...m, { who: 'user', text: q }, { who: 'ai', text: mockReply(q) }]);
    setDraft('');
  };
  useEffect(() => { if (screen === 'coach') chatEnd.current?.scrollIntoView({ block: 'end' }); }, [messages, screen]);
  useEffect(() => {
    const update = () => document.documentElement.style.setProperty('--app-height', `${window.visualViewport?.height || window.innerHeight}px`);
    update(); window.visualViewport?.addEventListener('resize', update);
    return () => window.visualViewport?.removeEventListener('resize', update);
  }, []);

  const back = () => { const previous = history.current.pop() || (ONBOARD.indexOf(screen) > 0 ? ONBOARD[ONBOARD.indexOf(screen)-1] : 'home'); setScreen(previous); localStorage.setItem('energy.screen', previous); setNotice(''); };
  const onboarding = ONBOARD.includes(screen);
  return <div className="desktop-stage">
    <aside className="prototype-note"><span className="note-kicker">INTERACTIVE PROTOTYPE</span><h1>AI Energy<br/>Companion</h1><p>无屏手环 · 睡眠与精力管理</p><div className="note-divider"/><p>按手机里的按钮体验完整引导流程。页面数据为演示数据；设备连接也是模拟状态。</p><button onClick={() => go('welcome')}>从引导页开始 <ArrowRight size={16}/></button><button onClick={() => go('home')}>直接查看首页 <ArrowRight size={16}/></button><small>设计参考：用户提供的 12 画面拼贴</small></aside>
    <div style={{"--theme":BAND_COLORS[themeIndex][1]}} className={`phone ${screen === 'welcome' || screen === 'ready' ? 'phone-dark' : ''} ${screen === 'ready' ? 'phone-ready' : ''}`}>
      <PhoneStatus />
      {notice && <div className="toast">{notice}</div>}
      <main className={`phone-main ${screen === 'coach' ? 'chat-main' : ''}`} key={screen}>
        {screen === 'welcome' && <div className="welcome-screen">
          <div className="welcome-glow"/><div className="welcome-content"><div className="brand-mark"><Sparkles size={17}/> 微光 · ENERGY COMPANION</div><h1>睡得更好，<br/>醒来活出精彩。</h1><p>找回舒服的节奏，去过你向往的生活。</p></div>
          <div className="welcome-companion"><Sprite size="welcome-orb"/><div><span>你好，我是微光</span><small>陪你找回舒服的节奏</small></div></div>
          <div className="welcome-bottom"><PrimaryButton onClick={() => go('connect')}>开启我的美好节奏 <ArrowRight size={19}/></PrimaryButton><button className="text-link light" onClick={() => go('home')}>先体验演示版</button></div>
        </div>}
        {screen === 'connect' && <div className="onboard-screen">
          <div className="top-line"><button aria-label="返回" onClick={back}><ArrowLeft/></button><button className="skip" onClick={() => history.current.at(-1)==='device' ? back() : go('survey')}>跳过</button></div>
          <div className="onboard-head"><span className="step-label">01 / 05 · 连接设备</span><h1>连接你的智能手环</h1><p>连接后同步可用的活动、心率和睡眠相关记录。支持项目以实际设备能力为准。</p></div>
          <div className="band-picker"><div className="band-showcase" onTouchStart={e=>{touchStart.current=e.touches[0].clientX}} onTouchEnd={e=>{if(touchStart.current!==null){const delta=e.changedTouches[0].clientX-touchStart.current;if(Math.abs(delta)>35)selectBand(bandIndex+(delta<0?1:-1));touchStart.current=null}}}><button className="band-arrow" aria-label="上一种手环颜色" onClick={()=>selectBand(bandIndex-1)}><ChevronRight className="back-arrow"/></button><div className="band-render" role="img" aria-label={`${BAND_COLORS[bandIndex][0]}无屏手环产品效果图`} style={{backgroundPosition:`${(bandIndex%4)*100/3}% ${Math.floor(bandIndex/4)*50}%`}}/><button className="band-arrow" aria-label="下一种手环颜色" onClick={()=>selectBand(bandIndex+1)}><ChevronRight/></button></div><strong>{BAND_COLORS[bandIndex][0]}</strong><small>左右滑动或点击选择手环颜色 · 演示图片</small><div className="swatches" aria-label="手环颜色">{BAND_COLORS.map(([name,color],i)=><button key={name} className={bandIndex===i?'selected':''} title={name} aria-label={`选择${name}手环`} aria-pressed={bandIndex===i} onClick={()=>selectBand(i)} style={{'--swatch':color}}/>)}</div><div className="theme-picker"><div><strong>界面颜色</strong><button onClick={syncTheme}>{followBand?'已跟随手环':'跟随手环'}</button></div><div className="swatches theme-swatches">{BAND_COLORS.map(([name,color],i)=><button key={name} className={themeIndex===i?'selected':''} title={name} aria-label={`设置${name}界面主题`} aria-pressed={themeIndex===i} onClick={()=>selectTheme(i)} style={{'--swatch':color}}/>)}</div><small>界面颜色可独立设置；仅为本机演示，不涉及购买。</small></div></div>
          <div className="connect-list"><div><Bluetooth size={18}/><strong>{connected ? '演示连接已完成' : '准备搜索设备'}</strong></div><div><Check/> 心率与活动记录</div><div><Check/> 睡眠相关记录</div><div><CircleHelp/> 血压和血糖需兼容的独立设备，暂不模拟采集</div></div>
          <div className="bottom-action"><PrimaryButton onClick={() => { setConnected(true); localStorage.setItem('energy.connected','true'); if(history.current.at(-1)==='device'){back()}else{go('survey')} }}>{connected ? '继续' : '模拟连接手环'}</PrimaryButton><small>原型不进行真实蓝牙配对</small></div>
        </div>}
        {screen === 'survey' && <div className="onboard-screen survey-screen">
          <div className="top-line"><button aria-label="返回" onClick={back}><ArrowLeft/></button><span>02 / 05</span></div>
          <div className="onboard-head"><span className="step-label">了解需求</span><h1>认识你，更好地帮助你</h1></div>
          <Sprite/><div className="ai-intro">你好！我是你的 AI 精力教练。为你定制可执行的睡眠与精力改善计划，我想先了解一下你的情况，可以吗？</div>
          <div className="question-list">{surveyItems.map((item,i) => <div className={`question ${activeQuestion === i ? 'active' : ''}`} key={item.q}><button onClick={() => setActiveQuestion(activeQuestion === i ? -1 : i)}><IconBubble icon={item.icon}/><span><strong>{item.q}</strong><small>{answers[i] || item.sub}</small></span><ChevronDown size={16}/></button>{activeQuestion === i && <div className="question-options">{item.options.map(o => <button className={answers[i] === o ? 'selected' : ''} key={o} onClick={() => { setAnswers({...answers,[i]:o}); setActiveQuestion(i < 3 ? i+1 : -1); }}>{o}</button>)}</div>}</div>)}</div>
          <div className="bottom-action"><PrimaryButton onClick={() => go('goals')} disabled={Object.keys(answers).length < 4}>继续设定目标 <ArrowRight size={17}/></PrimaryButton><small>{Object.keys(answers).length < 4 ? `还需回答 ${4 - Object.keys(answers).length} 个问题` : '你可以稍后修改这些回答'}</small></div>
        </div>}
        {screen === 'goals' && <div className="onboard-screen">
          <div className="top-line"><button aria-label="返回" onClick={back}><ArrowLeft/></button><span>03 / 05</span></div><div className="onboard-head"><span className="step-label">目标确认</span><h1>为你制定专属目标</h1><p>以下是可调整的演示目标。正式版可结合你的回答与记录制定计划。</p></div>
          <div className="goal-card"><div className="goal-title"><IconBubble icon={Target} tone="gold"/><div><strong>核心目标（30 天）</strong><small>改善睡眠规律，提升白天专注与精力</small></div></div><h3>具体目标</h3>{['平均睡眠时长 ≥ 7 小时','就寝时间 23:30 前','减少下午疲惫感'].map(g => <button className="goal-row" key={g} onClick={() => setGoals(goals.includes(g) ? goals.filter(x=>x!==g) : [...goals,g])}><span>{g}</span><span className={`goal-check ${goals.includes(g)?'on':''}`}>{goals.includes(g)&&<Check size={15}/>}</span></button>)}</div>
          <div className="hint-box"><Sparkles size={17}/> 这是起始目标；数据不足时不会把它当作你的个人基线。</div>
          <div className="bottom-action"><PrimaryButton onClick={() => go('generated')} disabled={!goals.length}>确认并查看计划</PrimaryButton><button className="text-link" onClick={() => go('survey')}>我想再调整一下</button></div>
        </div>}
        {screen === 'generated' && <div className="onboard-screen">
          <div className="top-line"><button aria-label="返回" onClick={back}><ArrowLeft/></button><span>04 / 05</span></div><div className="onboard-head"><span className="step-label">计划预览</span><h1>你的 30 天改善计划</h1><p>先建立记录，再根据实际趋势调整。以下是可执行的起始安排。</p></div>
          <div className="timeline">{[
            ['第 1–3 天','建立基线，了解当前状态',Activity,'blue'],['第 4–7 天','优化作息，建立睡前流程',Moon,'purple'],['第 8–21 天','持续执行，动态调整计划',Heart,'green'],['第 22–30 天','回顾变化，形成稳定习惯',Target,'gold'],
          ].map(([phase,detail,Icon,tone]) => <div className="timeline-item" key={phase}><IconBubble icon={Icon} tone={tone}/><span><strong>{phase}</strong><small>{detail}</small></span></div>)}</div>
          <div className="hint-box"><ShieldCheck size={17}/> 计划仅提供日常健康管理建议，不代替诊疗。</div>
          <div className="bottom-action"><PrimaryButton onClick={() => go('ready')}>开始我的 30 天计划</PrimaryButton></div>
        </div>}
        {screen === 'ready' && <div className="ready-screen"><div className="ready-stars">✦ &nbsp; ✧ &nbsp; ✦</div><div className="ready-check"><Check size={43}/></div><h1>准备好了！</h1><p>你的专属睡眠与精力管理之旅已经开始。我会每天跟进你的数据、执行计划，并在关键时刻给你支持与建议。</p><div className="ready-card"><strong>接下来你可以：</strong><span><Activity size={17}/> 查看今日状态</span><span><MessageCircle size={17}/> 和 AI 教练聊一聊</span><span><CalendarDays size={17}/> 执行今天的任务</span><span><Watch size={17}/> 查看设备状态</span></div><PrimaryButton onClick={() => go('home')}>进入首页 <ArrowRight size={18}/></PrimaryButton></div>}
        {screen === 'home' && <div className="app-screen home-screen"><div className="app-header"><div><span className="eyebrow">GOOD MORNING</span><h1>今日状态</h1><small>1 月 26 日 · 周一</small></div><button className="header-icon" aria-label="通知" onClick={() => go('notifications')}><Bell size={21}/></button></div><div className="data-banner"><span>演示数据</span><button onClick={() => go('profile')}>{connected ? '演示设备已连接' : '设备未连接'} <ChevronRight size={14}/></button></div>
          <div className="score-card"><div className="score-ring"><div><small>精力指数</small><strong>82<span>/100</span></strong><em>较前期 +6</em></div></div><p>今天可以保持轻量节奏，注意晚间放松。</p></div>
          <div className="metric-card">{[[Moon,'睡眠','7 小时 24 分','演示'],[Heart,'静息心率','58 次/分','演示'],[Wind,'血氧','98%','演示'],[Activity,'步数','6,842 步','演示']].map(([Icon,label,value,status])=><div className="metric-row" key={label}><Icon size={17}/><span>{label}</span><strong>{value}</strong><MiniStatus>{status}</MiniStatus></div>)}</div>
          <button className="home-companion" onClick={() => go('coach')}><Sprite size="home-orb"/><span className="home-companion-copy"><small>你的 AI 精灵伙伴 · 演示</small><strong>早安，我是微光</strong><span>今天也一起照顾好睡眠和精力。午后可以试试轻活动。</span><b>和微光聊聊 <ArrowRight size={14}/></b></span></button>
          <SectionTitle trailing={<button onClick={()=>go('plan')}>查看计划 <ChevronRight size={15}/></button>}>今天可以做什么</SectionTitle><div className="quick-row"><button onClick={()=>go('plan')}><CalendarDays/> 完成今日任务</button><button onClick={()=>go('insights')}><TrendingUp/> 查看趋势</button></div>
        </div>}
        {screen === 'coach' && <div className="app-screen coach-screen"><div className="coach-header"><Sprite size="small"/><div><h1>AI 精力教练</h1><small>基于演示记录 · 非医疗建议</small></div><button aria-label="更多" onClick={()=>go('coach-info')}><Settings2 size={20}/></button></div><div className="chat-history"><div className="context-card"><Sparkles size={16}/><span>本周重点：固定就寝时间，减少午后疲惫</span></div>{messages.map((m,i)=><div className={`chat-line ${m.who}`} key={i}>{m.who==='ai'&&<Sprite size="tiny"/>}<div className="bubble">{m.text}</div></div>)}<div ref={chatEnd}/></div><div className="suggestions">{['今天为什么有点累？','帮我调整睡前计划','记录我的观察'].map(s=><button key={s} onClick={()=>send(s)}>{s}</button>)}</div><form className="chat-composer" onSubmit={e=>{e.preventDefault();send();}}><button type="button" aria-label="更多操作" onClick={()=>toast('可输入文字记录你的观察')}><Plus size={20}/></button><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="聊聊今天的睡眠与精力…"/><button type="submit" className="send-button" aria-label="发送"><Send size={18}/></button></form></div>}
        {screen === 'plan' && <div className="app-screen"><div className="app-header centered"><h1>我的计划</h1></div><CompanionNote text="一步一步，陪你养成好习惯" onClick={()=>go('coach')}/><div className="segmented">{['当前计划','任务清单','历史计划'].map(t=><button className={planTab===t?'selected':''} key={t} onClick={()=>setPlanTab(t)}>{t}</button>)}</div>{planTab==='当前计划'&&<><div className="plan-hero"><strong>30 天睡眠与精力改善计划</strong><small>第 1 天 / 共 30 天 · 起始计划</small><div className="progress"><span/></div><em>3%</em></div><div className="focus-card"><small>当前重点（第 1–3 天）</small><ul><li>记录睡眠和起床时间</li><li>观察午后精力感受</li><li>建立自己的初始基线</li></ul></div></>}{planTab==='历史计划'&&<div className="empty-card"><CalendarDays/><strong>还没有历史计划</strong><p>完成第一个 30 天计划后，可以在这里回顾。</p></div>}{planTab!=='历史计划'&&<><SectionTitle trailing={<span>{tasks.filter(t=>t.done).length}/{tasks.length} 已完成</span>}>今日任务</SectionTitle><div className="task-card">{tasks.map(t=><button className="task-row" key={t.id} onClick={()=>setTasks(tasks.map(x=>x.id===t.id?{...x,done:!x.done}:x))}><span className={`task-check ${t.done?'done':''}`}>{t.done&&<Check size={14}/>}</span><span><strong>{t.title}</strong><small>{t.done?'已完成':t.detail}</small></span></button>)}</div><button className="inline-action" onClick={()=>go('reminders')}><Bell size={16}/> 设置提醒</button></>}</div>}
        {screen === 'insights' && <div className="app-screen"><div className="app-header centered"><h1>健康洞察</h1></div><CompanionNote text="一起看看你的变化和趋势" onClick={()=>go('coach')}/><div className="segmented four">{['趋势','睡眠','精力','健康'].map(t=><button className={insightTab===t?'selected':''} key={t} onClick={()=>setInsightTab(t)}>{t}</button>)}</div><div className="data-banner"><span>演示数据 · {range}</span><button onClick={()=>setRange(range==='近 30 天'?'近 7 天':'近 30 天')}>{range} <ChevronDown size={14}/></button></div><div className="chart-card"><div className="chart-title"><strong>{insightTab==='趋势'?'精力趋势':insightTab+'趋势'}</strong><span>较前期 +8</span></div><div className="chart"><div className="grid-lines"><span>100</span><span>90</span><span>80</span><span>70</span><span>60</span></div><div className="bars">{(range==='近 7 天'?[48,58,54,64,72,67,70]:[26,30,28,35,43,50,48,58,54,64,72,67]).map((h,i)=><div key={i} style={{height:`${h}%`}}/>)}</div></div><div className="chart-labels">{(range==='近 7 天'?['1/20','1/22','1/24','1/26']:['1/1','1/8','1/15','1/22','1/26']).map(x=><span key={x}>{x}</span>)}</div></div><div className="insight-card"><IconBubble icon={TrendingUp}/><div><strong>睡眠与精力的关联</strong><p>演示记录中，睡眠达到 7 小时的次日精力评分平均更高。仍需更多真实记录确认个人趋势。</p></div></div><div className="insight-card"><IconBubble icon={LockKeyhole} tone="gold"/><div><strong>本月关键变化</strong><p>平均睡眠时长 +38 分钟；晚于 23:30 入睡的天数减少了 5 天。</p></div></div><button className="inline-action" onClick={()=>setShowMetrics(!showMetrics)}><Activity size={16}/> {showMetrics?'收起指标说明':'查看指标说明'}</button>{showMetrics&&<div className="hint-box">精力指数是原型演示分数，不是医疗指标。正式版需明确计算方法、数据来源、更新时间和缺失数据处理。</div>}</div>}
        {screen === 'membership' && <div className="app-screen"><div className="app-header centered"><h1>会员服务</h1></div><CompanionNote text="了解更多陪伴与计划服务" onClick={()=>go('coach')}/><div className="member-hero"><Crown size={34} fill="#ffd670"/><h2>AI 精力管理会员</h2><p>持续 30 天的个性化改善服务</p></div><div className="benefits">{['专属 30 天改善计划与跟进','每日深度分析与个性化建议','每周复盘与动态调整','个人记忆与长期目标管理','优先体验新功能'].map(x=><div key={x}><Check size={17}/>{x}</div>)}</div><div className="price-row">{[['月度会员','$9.99/月'],['年度会员','$79.99/年']].map(([name,price])=><button className={membership===name?'selected':''} key={name} onClick={()=>setMembership(name)}><strong>{name}</strong><span>{price}</span></button>)}</div><button className="gold-button" onClick={()=>go('membership-detail')}>查看会员方案</button><small className="center-note">价格仅复刻参考图；正式定价与权益待确认</small></div>}
        {screen === 'profile' && <div className="app-screen"><div className="app-header centered"><h1>我的</h1></div><CompanionNote text="你的专属睡眠与精力伙伴" onClick={()=>go('coach')}/><div className="profile-card"><div className="avatar">李</div><div><strong>李明</strong><small>AI 精力教练 · 演示账号</small></div><span>演示</span></div><div className="menu-card">{[
          [Target,'我的目标与偏好','查看目标'],[ShieldCheck,'健康档案与记忆','主人输入与系统推断分开'],[Watch,'设备管理',connected?'演示设备已连接':'设备未连接'],[Bell,'通知与提醒','查看提醒设置'],[LockKeyhole,'数据与隐私','数据来源与删除'],[CircleHelp,'帮助与反馈','查看说明'],
        ].map(([Icon,title,sub])=><button className="menu-row" key={title} onClick={()=>go({'我的目标与偏好':'preferences','健康档案与记忆':'memory','设备管理':'device','通知与提醒':'reminders','数据与隐私':'privacy','帮助与反馈':'help'}[title])}><Icon size={19}/><span><strong>{title}</strong><small>{sub}</small></span><ChevronRight size={17}/></button>)}</div><button className="inline-action" onClick={()=>go('membership')}><Crown size={16}/> 了解会员服务</button><button className="reset-link" onClick={()=>{localStorage.removeItem('energy.screen');localStorage.removeItem('energy.connected');setConnected(false);go('welcome');}}>重新体验引导流程</button></div>}
        {['notifications','coach-info','preferences','memory','device','reminders','privacy','help','membership-detail'].includes(screen) && <div className="app-screen detail-screen">
          <div className="detail-top"><button aria-label="返回上一页" onClick={back}><ArrowLeft size={20}/></button><h1>{{notifications:'通知', 'coach-info':'AI 教练说明',preferences:'我的目标与偏好',memory:'健康档案与记忆',device:'设备管理',reminders:'通知与提醒',privacy:'数据与隐私',help:'帮助与反馈','membership-detail':'会员方案'}[screen]}</h1></div>
          {screen==='notifications' && <><div className="detail-panel"><strong>演示通知</strong><p>今晚 22:45 可以开始放松，为就寝做准备。</p><small>示例内容 · 不会发送真实通知</small></div><button className="inline-action" onClick={()=>go('reminders')}>查看提醒设置 <ChevronRight size={16}/></button></>}
          {screen==='coach-info' && <><div className="detail-panel"><strong>你的 AI 精力教练</strong><p>对话使用预设演示回复，不会连接真实 AI，也不替代医疗建议。</p></div><button className="inline-action" onClick={()=>go('memory')}>查看健康记忆 <ChevronRight size={16}/></button></>}
          {screen==='preferences' && <><div className="detail-panel"><strong>当前目标</strong>{goals.map(g=><p key={g}>✓ {g}</p>)}<small>点击下方选项可调整演示目标。</small></div><div className="detail-panel">{['平均睡眠时长 ≥ 7 小时','就寝时间 23:30 前','减少下午疲惫感'].map(g=><button className="detail-choice" key={g} onClick={()=>setGoals(goals.includes(g)?goals.filter(x=>x!==g):[...goals,g])}>{goals.includes(g)?'☑':'☐'} {g}</button>)}</div><button className="inline-action" onClick={()=>go('plan')}>查看我的计划 <ChevronRight size={16}/></button></>}
          {screen==='memory' && <><div className="detail-panel"><strong>你确认的信息</strong><p>关注睡眠规律与白天精力（演示）</p><small>正式版可查看、编辑或删除个人记录。</small></div><div className="detail-panel"><strong>系统观察 · 演示</strong><p>示例数据显示，睡眠达到 7 小时的次日精力评分较高。</p><small>这是一条模拟观察，不是诊断。</small></div><button className="inline-action" onClick={()=>go('privacy')}>查看数据与隐私 <ChevronRight size={16}/></button></>}
          {screen==='device' && <><div className="detail-panel"><strong>{connected?'演示手环已连接':'尚未连接设备'}</strong><p>连接状态、同步时间和数据均为模拟展示。真实蓝牙配对尚未接入。</p>{connected&&<button className="detail-choice" onClick={()=>{setConnected(false);localStorage.setItem('energy.connected','false')}}>断开演示连接</button>}</div><button className="inline-action" onClick={()=>go('connect')}>查看连接手环流程 <ChevronRight size={16}/></button></>}
          {screen==='reminders' && <><div className="detail-panel"><strong>睡前放松提醒</strong><p>每天 22:45 · 演示设置</p><button className="detail-choice" onClick={()=>setReminder(!reminder)}>{reminder?'关闭演示提醒':'开启演示提醒'} · 当前{reminder?'已开启':'已关闭'}</button><small>仅演示页面状态，不会发送系统通知。</small></div><button className="inline-action" onClick={()=>go('plan')}>回到我的计划 <ChevronRight size={16}/></button></>}
          {screen==='privacy' && <><div className="detail-panel"><strong>数据来源</strong><p>当前健康指标、设备和对话均为本机演示。没有连接真实手环或云端账户。</p></div><div className="detail-panel"><strong>记录管理</strong><p>重新体验引导会清除设备演示状态。正式版的数据导出和删除功能尚未接入。</p></div><button className="inline-action" onClick={()=>go('memory')}>查看健康档案与记忆 <ChevronRight size={16}/></button></>}
          {screen==='help' && <><div className="detail-panel"><strong>如何开始？</strong><p>完成引导并模拟连接设备，然后查看每日状态、与教练对话并勾选计划任务。</p></div><div className="detail-panel"><strong>关于数据</strong><p>所有数值与建议均为示例，不能用于医疗判断。反馈渠道将在正式版本中提供。</p></div><button className="inline-action" onClick={()=>go('device')}>查看设备状态 <ChevronRight size={16}/></button></>}
          {screen==='membership-detail' && <><div className="detail-panel"><strong>{membership} · 演示方案</strong><p>包含个性化计划、每周复盘和长期目标管理等示例权益。</p><small>价格及权益待确认，原型不会创建订阅或扣款。</small></div><button className="inline-action" onClick={back}>返回选择方案 <ChevronRight size={16}/></button></>}
        </div>}
      </main>
      {!onboarding && <nav className={`bottom-nav ${screen==='coach'?'chat-nav':''}`}>{nav.map(([id,Icon,label])=><button className={screen===id?'active':''} onClick={()=>go(id)} key={id}><Icon size={21} fill={screen===id&&id==='home'?'currentColor':'none'}/><span>{label}</span></button>)}</nav>}
      <div className="home-indicator"/>
    </div>
  </div>;
}
