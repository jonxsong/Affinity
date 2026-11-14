"use client";

import { useMemo, useState } from "react";
import {
  Activity, ArrowRight, Beaker, Boxes, BrainCircuit, ChartNoAxesCombined,
  Check, ChevronDown, CircleDot, Code2, Database, ExternalLink, GitCompareArrows,
  Gauge, Github, Layers3, Menu, Network, Play, Search, Settings2, Sparkles,
  Users, X, Zap,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Cell, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  embeddingPoints, interests, metrics, models, recommendations, services,
  throughput, timeline, users, type NavId,
} from "@/lib/demo-data";

const nav: { id: NavId; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: ChartNoAxesCombined },
  { id: "users", label: "User explorer", icon: Users },
  { id: "embeddings", label: "Embeddings", icon: Network },
  { id: "playground", label: "Playground", icon: Sparkles },
  { id: "models", label: "Model registry", icon: Boxes },
  { id: "experiments", label: "Experiments", icon: Beaker },
  { id: "observability", label: "Observability", icon: Activity },
];

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "green" | "amber" | "muted" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function SectionTitle({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: React.ReactNode }) {
  return (
    <div className="section-title">
      <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2>{detail && <p>{detail}</p>}</div>
      {action}
    </div>
  );
}

function DemoNotice() {
  return <div className="demo-notice"><Beaker size={14} /><span>Exploring deterministic demo data. No metrics below are presented as measured production results.</span></div>;
}

function Overview() {
  return <>
    <DemoNotice />
    <SectionTitle eyebrow="Workspace / Production" title="Recommendation intelligence" detail="One place to understand behavior, inspect representations, and debug every ranked result." action={<button className="button primary"><Play size={15} fill="currentColor" /> Run playground</button>} />
    <div className="metric-grid">
      {metrics.map((metric) => <div className="metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small className={metric.tone}>{metric.delta}</small></div>)}
    </div>
    <div className="overview-grid">
      <section className="card chart-card">
        <div className="card-head"><div><h3>Traffic preview</h3><p>Synthetic events · last 60 minutes</p></div><Badge tone="muted">Illustrative</Badge></div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={throughput} margin={{ left: -22, right: 8, top: 10 }}>
            <defs><linearGradient id="eventFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9df7d2" stopOpacity={0.28}/><stop offset="100%" stopColor="#9df7d2" stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="#232728" /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: "#707979", fontSize: 11 }} interval={2}/><YAxis tickLine={false} axisLine={false} tick={{ fill: "#707979", fontSize: 11 }}/><Tooltip contentStyle={{ background: "#171a1a", border: "1px solid #303535", borderRadius: 8, fontSize: 12 }}/><Area dataKey="events" stroke="#9df7d2" fill="url(#eventFill)" strokeWidth={2}/><Area dataKey="recommendations" stroke="#8d91ff" fill="transparent" strokeWidth={1.5}/>
          </AreaChart></ResponsiveContainer>
        </div>
        <div className="legend"><span><i className="mint" />Events</span><span><i className="purple" />Recommendation requests</span></div>
      </section>
      <section className="card service-card">
        <div className="card-head"><div><h3>Service health</h3><p>Local infrastructure adapters</p></div><Settings2 size={17}/></div>
        <div className="service-list">{services.map(service => <div className="service" key={service.name}><div><CircleDot size={15} className={service.status}/><span>{service.name}</span></div><div><small>{service.note}</small><Badge tone={service.status === "demo" ? "amber" : "muted"}>{service.status}</Badge></div></div>)}</div>
      </section>
    </div>
    <div className="overview-grid lower">
      <section className="card">
        <div className="card-head"><div><h3>Active model</h3><p>Configured serving policy</p></div><Badge tone="green">deployed locally</Badge></div>
        <div className="model-hero"><div className="model-icon"><BrainCircuit size={22}/></div><div><strong>als-v1</strong><span>Implicit matrix factorization</span></div><div className="model-meta"><span>Fallback</span><strong>Popularity</strong></div></div>
        <div className="empty-metrics"><Gauge size={18}/><div><strong>Evaluation pending</strong><span>Run <code>make evaluate</code> to populate actual metrics.</span></div></div>
      </section>
      <section className="card">
        <div className="card-head"><div><h3>Recent pipeline activity</h3><p>Reproducible jobs and artifacts</p></div><button className="text-button">View all <ArrowRight size={13}/></button></div>
        <div className="jobs"><div><Check size={15}/><span><strong>demo-data.seed</strong><small>Deterministic fixture · seed 42</small></span><time>ready</time></div><div><CircleDot size={15}/><span><strong>movielens.prepare</strong><small>Requires explicit download</small></span><time>not run</time></div><div><CircleDot size={15}/><span><strong>models.compare</strong><small>Temporal holdout protocol</small></span><time>not run</time></div></div>
      </section>
    </div>
  </>;
}

function UserExplorer() {
  const [selected, setSelected] = useState(users[0]);
  return <><DemoNotice/><SectionTitle eyebrow="Inspect / Users" title="User explorer" detail="Separate observed behavior from inferred interests and trace every representation update." action={<div className="searchbox"><Search size={15}/><input aria-label="Search users" placeholder="Search user ID" /></div>}/>
    <div className="user-layout">
      <section className="card user-list"><h3>Demo profiles</h3>{users.map(user => <button key={user.id} className={selected.id === user.id ? "selected" : ""} onClick={() => setSelected(user)}><span className="avatar">{user.id.slice(4,6).toUpperCase()}</span><span><strong>{user.id}</strong><small>{user.label} · {user.events} events</small></span><time>{user.lastSeen}</time></button>)}</section>
      <div className="user-content">
        <section className="card profile-head"><div className="avatar large">{selected.id.slice(4,6).toUpperCase()}</div><div><div className="profile-title"><h3>{selected.id}</h3><Badge tone={selected.status === "cold" ? "amber" : "green"}>{selected.status}</Badge></div><p>{selected.label} · {selected.events} observed events</p></div><button className="button"><Code2 size={14}/> JSON</button></section>
        <div className="split-grid"><section className="card"><div className="card-head"><div><h3>Interest distribution</h3><p>Long-term vs. recent, recency weighted</p></div></div><div className="interest-list">{interests.map(item => <div key={item.topic}><span>{item.topic}</span><div className="tracks"><i style={{width:`${item.longTerm}%`}}/><b style={{width:`${item.recent}%`}}/></div><strong>{item.recent}</strong></div>)}</div><div className="legend"><span><i className="gray"/>Long-term</span><span><i className="mint"/>Recent</span></div></section>
        <section className="card"><div className="card-head"><div><h3>Representation</h3><p>Inspectable feature groups</p></div></div><div className="representation"><div><span>Long-term vector</span><code>128 dims</code></div><div><span>Session vector</span><code>64 dims</code></div><div><span>Last update</span><code>12:51:09</code></div><div><span>Profile source</span><code>behavior only</code></div></div><div className="profile-note"><BrainCircuit size={16}/><p><strong>LLM profile disabled</strong><span>Observed signals power these recommendations. No API key is required.</span></p></div></section></div>
        <section className="card"><div className="card-head"><div><h3>Interaction timeline</h3><p>Latest observed behavior · synthetic demo events</p></div><button className="text-button">Replay events</button></div><div className="timeline">{timeline.map((event, i) => <div key={`${event.time}-${i}`}><code>{event.time}</code><Badge tone={event.weight < 0 ? "amber" : "muted"}>{event.event}</Badge><span><strong>{event.content}</strong><small>{event.context}</small></span><b className={event.weight < 0 ? "negative" : ""}>{event.weight > 0 ? "+" : ""}{event.weight.toFixed(2)}</b></div>)}</div></section>
      </div>
    </div></>;
}

function Embeddings() {
  const [kind, setKind] = useState("all");
  const points = kind === "all" ? embeddingPoints : embeddingPoints.filter(p => p.kind === kind);
  const colors = ["#9df7d2", "#8d91ff", "#f3c984", "#e98989"];
  return <><DemoNotice/><SectionTitle eyebrow="Inspect / Representations" title="Embedding explorer" detail="A PCA projection for qualitative inspection—not a claim that 2D distance preserves the original space." action={<div className="segmented">{["all","user","content"].map(v => <button className={kind===v?"active":""} onClick={()=>setKind(v)} key={v}>{v}</button>)}</div>}/><section className="card embedding-card"><div className="card-head"><div><h3>Two-tower representation space</h3><p>PCA · model two-tower-v1 · deterministic fixture</p></div><Badge tone="muted">48 points</Badge></div><div className="embedding-chart"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:20,right:20,bottom:10,left:0}}><CartesianGrid stroke="#232728"/><XAxis type="number" dataKey="x" name="PC 1" tick={{fill:"#707979",fontSize:11}} axisLine={false}/><YAxis type="number" dataKey="y" name="PC 2" tick={{fill:"#707979",fontSize:11}} axisLine={false}/><Tooltip cursor={{strokeDasharray:"3 3"}} contentStyle={{background:"#171a1a",border:"1px solid #303535",borderRadius:8}}/><Scatter data={points}>{points.map(p=><Cell key={p.id} fill={p.kind === "user" ? "#ffffff" : colors[p.z]} stroke="#0f1111" strokeWidth={p.kind === "user" ? 3 : 1}/>)}</Scatter></ScatterChart></ResponsiveContainer></div><div className="cluster-key">{["Applied ML","Systems","Design","Business"].map((c,i)=><span key={c}><i style={{background:colors[i]}}/>{c}</span>)}<span><i className="user-dot"/>Users</span></div></section></>;
}

function Playground() {
  const [model, setModel] = useState("als-v1"); const [diversity, setDiversity] = useState(35); const [freshness, setFreshness] = useState(45); const [ran, setRan] = useState(true);
  const adjusted = useMemo(() => recommendations.map((r,i)=>({...r, score: Math.max(0, r.score + (freshness-45)*0.0008 - i*(diversity-35)*0.0005)})),[diversity,freshness]);
  return <><DemoNotice/><SectionTitle eyebrow="Build / Recommendations" title="Recommendation playground" detail="Change policy weights, compare rank components, and inspect why each item was selected." action={<button className="button primary" onClick={()=>setRan(false)}><Zap size={14}/> Generate</button>}/><div className="play-layout"><aside className="card controls"><h3>Request</h3><label>User<select><option>usr_4f91 · Research-oriented</option><option>usr_7a12 · Systems explorer</option></select></label><label>Candidate model<select value={model} onChange={e=>setModel(e.target.value)}><option>als-v1</option><option>two-tower-v1</option><option>popularity-v1</option></select></label><label>List size<select><option>10</option><option>20</option><option>50</option></select></label><div className="slider-label"><span>Diversity weight</span><code>{diversity}%</code></div><input type="range" min="0" max="100" value={diversity} onChange={e=>setDiversity(Number(e.target.value))}/><div className="slider-label"><span>Freshness weight</span><code>{freshness}%</code></div><input type="range" min="0" max="100" value={freshness} onChange={e=>setFreshness(Number(e.target.value))}/><label className="checkbox"><input type="checkbox" defaultChecked/> Filter seen content</label><label className="checkbox"><input type="checkbox" defaultChecked/> Apply category caps</label><button className="button primary wide" onClick={()=>{setRan(false);setTimeout(()=>setRan(true),250)}}><Play size={14} fill="currentColor"/> Run policy</button></aside><section className="card results"><div className="card-head"><div><h3>Ranked results</h3><p>{model} · heuristic scores, not calibrated probabilities</p></div><button className="button"><GitCompareArrows size={14}/> Compare</button></div>{!ran?<div className="loading"><span/><p>Ranking candidates…</p></div>:<div className="recommendations">{adjusted.map(item=><article key={item.rank}><span className="rank">0{item.rank}</span><div className="recommendation-main"><div><Badge tone="muted">{item.category}</Badge><strong>{item.title}</strong></div><p>{item.reason}</p><div className="score-bars"><span>relevance <i><b style={{width:`${item.relevance*100}%`}}/></i>{item.relevance.toFixed(2)}</span><span>recency <i><b style={{width:`${item.recency*100}%`}}/></i>{item.recency.toFixed(2)}</span><span>diversity <i><b style={{width:`${item.diversity*100}%`}}/></i>{item.diversity.toFixed(2)}</span></div></div><div className="final-score"><span>policy score</span><strong>{item.score.toFixed(3)}</strong></div></article>)}</div>}</section></div></>;
}

function Models() { return <><SectionTitle eyebrow="Operate / Models" title="Model registry" detail="Track reproducible artifacts, evaluation state, and deployment policy without overstating unrun results." action={<button className="button primary"><Play size={14}/> Start training</button>}/><div className="registry">{models.map(model=><section className="card model-row" key={model.version}><div className="model-icon"><Layers3 size={20}/></div><div className="model-name"><strong>{model.version}</strong><span>{model.architecture}</span></div><div><span>Dataset</span><strong>{model.dataset}</strong></div><div><span>Recall@10</span><strong>{model.metrics.recall10}</strong></div><div><span>NDCG@10</span><strong>{model.metrics.ndcg10}</strong></div><Badge tone={model.deployed?"green":model.status==="baseline"?"muted":"amber"}>{model.deployed?"active":model.status}</Badge><button className="icon-button" aria-label={`Open ${model.version}`}><ArrowRight size={16}/></button></section>)}</div><section className="card registry-empty"><Database size={24}/><h3>No measured artifacts yet</h3><p>Training jobs log dataset checksums, temporal split boundaries, seeds, hyperparameters, and actual evaluation results to MLflow.</p><code>make train && make evaluate</code></section></> }

function Experiments() { return <><SectionTitle eyebrow="Learn / Experiments" title="Experimentation" detail="Deterministic assignment and honest statistical reporting from real exposure events." action={<button className="button primary"><Beaker size={14}/> New experiment</button>}/><section className="card experiment"><div className="experiment-head"><div><Badge tone="amber">draft</Badge><h3>retrieval-model-comparison</h3><p>Compare ALS control against two-tower retrieval on qualified recommendation sessions.</p></div><span>exp_01JQ8A</span></div><div className="variants"><div><i>A</i><span><strong>Control</strong><small>als-v1 · 50% allocation</small></span></div><div><i>B</i><span><strong>Treatment</strong><small>two-tower-v1 · 50% allocation</small></span></div></div><div className="experiment-footer"><div><span>Primary metric</span><strong>Recommendation conversion</strong></div><div><span>Assignment</span><strong>hash(user_id, experiment_id)</strong></div><div><span>Samples</span><strong>0 — not started</strong></div><button className="button">Review design <ArrowRight size={13}/></button></div></section><section className="card guardrail"><Gauge size={20}/><div><h3>Analysis guardrails</h3><p>Confidence intervals appear only after observed samples exist. Simulated traffic stays out of experiment reporting, and stopping decisions remain explicit.</p></div></section></> }

function Observability() { return <><DemoNotice/><SectionTitle eyebrow="Operate / Systems" title="Observability" detail="Telemetry contracts are wired for local services; charts remain empty until measurements are collected."/><div className="observability-grid">{["API latency","Request throughput","Error rate","Consumer lag","Cache hit rate","Vector search latency"].map((name,i)=><section className="card obs" key={name}><div><span>{name}</span><Badge tone="muted">no data</Badge></div><div className="empty-chart">{Array.from({length:12},(_,j)=><i key={j} style={{height:`${18 + ((j*17+i*11)%36)}%`}}/>)}</div><p>Start the local stack and send traffic to collect this metric.</p></section>)}</div></> }

const pages: Record<NavId, () => React.JSX.Element> = { overview: Overview, users: UserExplorer, embeddings: Embeddings, playground: Playground, models: Models, experiments: Experiments, observability: Observability };

export function Dashboard() {
  const [active, setActive] = useState<NavId>("overview"); const [mobile, setMobile] = useState(false); const Page = pages[active];
  return <div className="shell"><aside className={`sidebar ${mobile?"open":""}`}><div className="brand"><div className="brand-mark"><span/><span/><span/></div><strong>Affinity</strong><Badge tone="muted">alpha</Badge><button onClick={()=>setMobile(false)} className="mobile-close" aria-label="Close menu"><X size={18}/></button></div><nav>{nav.map(item=>{const Icon=item.icon;return <button key={item.id} className={active===item.id?"active":""} onClick={()=>{setActive(item.id);setMobile(false)}}><Icon size={16}/><span>{item.label}</span>{item.id==="overview"&&<i/>}</button>})}</nav><div className="sidebar-bottom"><a href="https://github.com/jonxsong/Affinity" target="_blank" rel="noreferrer"><Github size={16}/>GitHub<ExternalLink size={12}/></a><div className="workspace"><span>AF</span><div><strong>Affinity Lab</strong><small>Local workspace</small></div><ChevronDown size={14}/></div></div></aside><main><header><button className="menu-button" onClick={()=>setMobile(true)} aria-label="Open menu"><Menu size={18}/></button><div className="breadcrumb"><span>affinity</span><b>/</b><strong>{nav.find(n=>n.id===active)?.label.toLowerCase()}</strong></div><div className="header-actions"><button><Search size={15}/><span>Search</span><kbd>⌘ K</kbd></button><a href="https://github.com/jonxsong/Affinity" target="_blank" rel="noreferrer"><Github size={16}/></a><span className="status"><i/>Demo</span></div></header><div className="content"><Page/></div><footer><span>Affinity · open-source recommendation intelligence</span><span>Demo data is synthetic or public-dataset derived</span></footer></main></div>;
}

