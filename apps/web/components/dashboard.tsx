"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import {
  Activity,
  ArrowRight,
  Beaker,
  Boxes,
  BrainCircuit,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleDot,
  Code2,
  Database,
  ExternalLink,
  Gauge,
  Github,
  Layers3,
  Menu,
  Network,
  Play,
  Search,
  Settings2,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  embeddingPoints,
  interests,
  metrics,
  models,
  recommendations,
  services,
  throughput,
  timeline,
  users,
  type NavId,
} from "@/lib/demo-data";
import { api, apiLocationLabel } from "@/lib/api";

const nav: { id: NavId; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: ChartNoAxesCombined },
  { id: "users", label: "User explorer", icon: Users },
  { id: "embeddings", label: "Embeddings", icon: Network },
  { id: "playground", label: "Playground", icon: Sparkles },
  { id: "models", label: "Model registry", icon: Boxes },
  { id: "experiments", label: "Experiments", icon: Beaker },
  { id: "observability", label: "Observability", icon: Activity },
];

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "green" | "amber" | "muted";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function SectionTitle({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action}
    </div>
  );
}

function DemoNotice() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 15_000,
  });
  const live = health.isSuccess;
  return (
    <div className={`demo-notice ${live ? "live" : ""}`}>
      <CircleDot size={14} />
      <span>
        {live
          ? `Live API connected at ${apiLocationLabel}. Actions update durable application state.`
          : `API unavailable at ${apiLocationLabel}. Showing labeled showcase data while the connection recovers.`}
      </span>
    </div>
  );
}

function EventComposer() {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("usr_4f91");
  const [contentId, setContentId] = useState("item_101");
  const [eventType, setEventType] = useState("content_view");
  const mutation = useMutation({
    mutationFn: () => api.ingest({ userId, contentId, eventType }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });
  return (
    <section className="card event-composer">
      <div className="card-head">
        <div>
          <h3>Ingest a behavioral event</h3>
          <p>
            Writes through the versioned Affinity API and immediately updates
            this user&apos;s representation.
          </p>
        </div>
        <Badge tone={mutation.isSuccess ? "green" : "muted"}>
          {mutation.isSuccess ? mutation.data.status : "event v1"}
        </Badge>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <label>
          User ID
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            required
          />
        </label>
        <label>
          Content ID
          <input
            value={contentId}
            onChange={(event) => setContentId(event.target.value)}
            required
          />
        </label>
        <label>
          Event type
          <select
            value={eventType}
            onChange={(event) => setEventType(event.target.value)}
          >
            <option value="content_view">Content view</option>
            <option value="click">Click</option>
            <option value="like">Like</option>
            <option value="save">Save</option>
            <option value="share">Share</option>
            <option value="dismiss">Dismiss</option>
            <option value="recommendation_conversion">Conversion</option>
          </select>
        </label>
        <button className="button primary" disabled={mutation.isPending}>
          <Zap size={14} />
          {mutation.isPending ? "Writing…" : "Ingest event"}
        </button>
      </form>
      {mutation.isError && (
        <p className="form-error">{mutation.error.message}</p>
      )}
    </section>
  );
}

function Overview({ onOpenPlayground }: { onOpenPlayground: () => void }) {
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: api.overview,
    refetchInterval: 10_000,
  });
  const liveMetrics = overview.data
    ? [
        {
          label: "Observed users",
          value: overview.data.total_users.toLocaleString(),
          delta: overview.data.storage,
          tone: "neutral",
        },
        {
          label: "Content items",
          value: overview.data.total_content_items.toLocaleString(),
          delta: "PostgreSQL catalog",
          tone: "neutral",
        },
        {
          label: "Accepted events",
          value: overview.data.total_events.toLocaleString(),
          delta: "Deduplicated",
          tone: "neutral",
        },
        {
          label: "Recommendation requests",
          value: overview.data.recommendation_requests.toLocaleString(),
          delta: `${overview.data.uptime_seconds}s uptime`,
          tone: "neutral",
        },
      ]
    : metrics;
  return (
    <>
      <DemoNotice />
      <SectionTitle
        eyebrow="Workspace / Production"
        title="Recommendation intelligence"
        detail="One place to understand behavior, inspect representations, and debug every ranked result."
        action={
          <button className="button primary" onClick={onOpenPlayground}>
            <Play size={15} fill="currentColor" /> Run playground
          </button>
        }
      />
      <div className="metric-grid">
        {liveMetrics.map((metric) => (
          <div className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small className={metric.tone}>{metric.delta}</small>
          </div>
        ))}
      </div>
      <div className="overview-grid">
        <section className="card chart-card">
          <div className="card-head">
            <div>
              <h3>Traffic preview</h3>
              <p>Synthetic events · last 60 minutes</p>
            </div>
            <Badge tone="muted">Illustrative</Badge>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={throughput}
                margin={{ left: -22, right: 8, top: 10 }}
              >
                <defs>
                  <linearGradient id="eventFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9df7d2" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#9df7d2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#232728" />
                <XAxis
                  dataKey="time"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#707979", fontSize: 11 }}
                  interval={2}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#707979", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#171a1a",
                    border: "1px solid #303535",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  dataKey="events"
                  stroke="#9df7d2"
                  fill="url(#eventFill)"
                  strokeWidth={2}
                />
                <Area
                  dataKey="recommendations"
                  stroke="#8d91ff"
                  fill="transparent"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="legend">
            <span>
              <i className="mint" />
              Events
            </span>
            <span>
              <i className="purple" />
              Recommendation requests
            </span>
          </div>
        </section>
        <section className="card service-card">
          <div className="card-head">
            <div>
              <h3>Service health</h3>
              <p>Local infrastructure adapters</p>
            </div>
            <Settings2 size={17} />
          </div>
          <div className="service-list">
            {(overview.isSuccess
              ? [
                  { name: "Affinity API", status: "live", note: "Connected" },
                  {
                    name:
                      overview.data.storage === "d1"
                        ? "Cloudflare D1"
                        : "PostgreSQL",
                    status: "live",
                    note: "Durable events",
                  },
                  {
                    name: "Ranking policy",
                    status: "live",
                    note: overview.data.active_model,
                  },
                  { name: "Redis", status: "offline", note: "Optional cache" },
                  {
                    name: "Qdrant",
                    status: "offline",
                    note: "Deep retrieval optional",
                  },
                ]
              : services
            ).map((service) => (
              <div className="service" key={service.name}>
                <div>
                  <CircleDot size={15} className={service.status} />
                  <span>{service.name}</span>
                </div>
                <div>
                  <small>{service.note}</small>
                  <Badge
                    tone={
                      service.status === "live"
                        ? "green"
                        : service.status === "demo"
                          ? "amber"
                          : "muted"
                    }
                  >
                    {service.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="overview-grid lower">
        <section className="card">
          <div className="card-head">
            <div>
              <h3>Active model</h3>
              <p>Configured serving policy</p>
            </div>
            <Badge tone="green">deployed locally</Badge>
          </div>
          <div className="model-hero">
            <div className="model-icon">
              <BrainCircuit size={22} />
            </div>
            <div>
              <strong>
                {overview.data?.active_model ?? "affinity-ranker-v1"}
              </strong>
              <span>Behavioral multi-signal ranking</span>
            </div>
            <div className="model-meta">
              <span>Fallback</span>
              <strong>Quality + recency</strong>
            </div>
          </div>
          <div className="empty-metrics">
            <Gauge size={18} />
            <div>
              <strong>Evaluation pending</strong>
              <span>
                Run <code>make evaluate</code> to populate actual metrics.
              </span>
            </div>
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <h3>Recent pipeline activity</h3>
              <p>Reproducible jobs and artifacts</p>
            </div>
            <button className="text-button">
              View all <ArrowRight size={13} />
            </button>
          </div>
          <div className="jobs">
            <div>
              <Check size={15} />
              <span>
                <strong>demo-data.seed</strong>
                <small>Deterministic fixture · seed 42</small>
              </span>
              <time>ready</time>
            </div>
            <div>
              <CircleDot size={15} />
              <span>
                <strong>movielens.prepare</strong>
                <small>Requires explicit download</small>
              </span>
              <time>not run</time>
            </div>
            <div>
              <CircleDot size={15} />
              <span>
                <strong>models.compare</strong>
                <small>Temporal holdout protocol</small>
              </span>
              <time>not run</time>
            </div>
          </div>
        </section>
      </div>
      <EventComposer />
    </>
  );
}

function UserExplorer() {
  const [selected, setSelected] = useState(users[0]);
  const [lookup, setLookup] = useState(selected.id);
  const profile = useQuery({
    queryKey: ["profile", selected.id],
    queryFn: () => api.profile(selected.id),
  });
  const interestQuery = useQuery({
    queryKey: ["interests", selected.id],
    queryFn: () => api.interests(selected.id),
  });
  const history = useQuery({
    queryKey: ["history", selected.id],
    queryFn: () => api.history(selected.id),
  });
  const liveInterests = useMemo(() => {
    if (!interestQuery.data) return interests;
    const topics = new Map<
      string,
      { topic: string; longTerm: number; recent: number }
    >();
    for (const item of interestQuery.data.long_term)
      topics.set(item.topic, {
        topic: item.topic,
        longTerm: Math.round(item.weight * 100),
        recent: 0,
      });
    for (const item of interestQuery.data.recent) {
      const current = topics.get(item.topic) ?? {
        topic: item.topic,
        longTerm: 0,
        recent: 0,
      };
      current.recent = Math.round(item.weight * 100);
      topics.set(item.topic, current);
    }
    return Array.from(topics.values());
  }, [interestQuery.data]);
  const liveTimeline =
    history.data?.items.map((event) => ({
      event: event.event_type,
      content: event.content_id ?? "No content ID",
      context: event.surface,
      time: new Date(event.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      weight: event.event_type === "dismiss" ? -0.55 : 0.6,
    })) ?? timeline;
  const observedEvents = profile.data?.observed_event_count ?? selected.events;
  const representation = profile.data?.representation ?? selected.status;
  return (
    <>
      <DemoNotice />
      <SectionTitle
        eyebrow="Inspect / Users"
        title="User explorer"
        detail="Separate observed behavior from inferred interests and trace every representation update."
        action={
          <form
            className="searchbox"
            onSubmit={(event) => {
              event.preventDefault();
              const id = lookup.trim();
              if (id)
                setSelected({
                  id,
                  label: "API user",
                  events: 0,
                  lastSeen: "now",
                  status: "active",
                });
            }}
          >
            <Search size={15} />
            <input
              aria-label="Search users"
              placeholder="Enter user ID"
              value={lookup}
              onChange={(event) => setLookup(event.target.value)}
            />
          </form>
        }
      />
      <div className="user-layout">
        <section className="card user-list">
          <h3>Seeded profiles</h3>
          {users.map((user) => (
            <button
              key={user.id}
              className={selected.id === user.id ? "selected" : ""}
              onClick={() => {
                setSelected(user);
                setLookup(user.id);
              }}
            >
              <span className="avatar">
                {user.id.slice(4, 6).toUpperCase()}
              </span>
              <span>
                <strong>{user.id}</strong>
                <small>
                  {user.label} · {user.events} fixture events
                </small>
              </span>
              <time>{user.lastSeen}</time>
            </button>
          ))}
        </section>
        <div className="user-content">
          <section className="card profile-head">
            <div className="avatar large">
              {selected.id.slice(4, 6).toUpperCase()}
            </div>
            <div>
              <div className="profile-title">
                <h3>{selected.id}</h3>
                <Badge
                  tone={
                    representation === "cold_start" || representation === "cold"
                      ? "amber"
                      : "green"
                  }
                >
                  {representation}
                </Badge>
              </div>
              <p>
                {profile.isSuccess ? "Live API profile" : selected.label} ·{" "}
                {observedEvents} observed events
              </p>
            </div>
            <button
              className="button"
              onClick={() =>
                navigator.clipboard?.writeText(
                  JSON.stringify(profile.data ?? {}, null, 2),
                )
              }
            >
              <Code2 size={14} /> Copy JSON
            </button>
          </section>
          <div className="split-grid">
            <section className="card">
              <div className="card-head">
                <div>
                  <h3>Interest distribution</h3>
                  <p>Long-term vs. recent, recency weighted</p>
                </div>
              </div>
              {liveInterests.length ? (
                <div className="interest-list">
                  {liveInterests.map((item) => (
                    <div key={item.topic}>
                      <span>{item.topic.replaceAll("_", " ")}</span>
                      <div className="tracks">
                        <i style={{ width: `${item.longTerm}%` }} />
                        <b style={{ width: `${item.recent}%` }} />
                      </div>
                      <strong>{item.recent}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-inline">
                  Ingest interactions to build this profile.
                </div>
              )}
              <div className="legend">
                <span>
                  <i className="gray" />
                  Long-term
                </span>
                <span>
                  <i className="mint" />
                  Recent
                </span>
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <div>
                  <h3>Representation</h3>
                  <p>Inspectable feature groups</p>
                </div>
              </div>
              <div className="representation">
                <div>
                  <span>Observed events</span>
                  <code>{observedEvents}</code>
                </div>
                <div>
                  <span>Long-term topics</span>
                  <code>{profile.data?.long_term_interest_count ?? "—"}</code>
                </div>
                <div>
                  <span>Recent topics</span>
                  <code>{profile.data?.recent_interest_count ?? "—"}</code>
                </div>
                <div>
                  <span>Profile source</span>
                  <code>{interestQuery.data?.source ?? "showcase"}</code>
                </div>
              </div>
              <div className="profile-note">
                <BrainCircuit size={16} />
                <p>
                  <strong>Behavior-first profile</strong>
                  <span>
                    Only explicit interaction evidence affects this
                    representation; sensitive attributes are never inferred.
                  </span>
                </p>
              </div>
            </section>
          </div>
          <section className="card">
            <div className="card-head">
              <div>
                <h3>Interaction timeline</h3>
                <p>
                  {history.isSuccess
                    ? "Durable API events"
                    : "Labeled showcase events"}
                </p>
              </div>
              <button className="text-button" onClick={() => history.refetch()}>
                Refresh
              </button>
            </div>
            <div className="timeline">
              {liveTimeline.map((event, i) => (
                <div key={`${event.time}-${i}`}>
                  <code>{event.time}</code>
                  <Badge tone={event.weight < 0 ? "amber" : "muted"}>
                    {event.event}
                  </Badge>
                  <span>
                    <strong>{event.content}</strong>
                    <small>{event.context}</small>
                  </span>
                  <b className={event.weight < 0 ? "negative" : ""}>
                    {event.weight > 0 ? "+" : ""}
                    {event.weight.toFixed(2)}
                  </b>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function Embeddings() {
  const [kind, setKind] = useState("all");
  const points =
    kind === "all"
      ? embeddingPoints
      : embeddingPoints.filter((p) => p.kind === kind);
  const colors = ["#9df7d2", "#8d91ff", "#f3c984", "#e98989"];
  return (
    <>
      <DemoNotice />
      <SectionTitle
        eyebrow="Inspect / Representations"
        title="Embedding explorer"
        detail="A PCA projection for qualitative inspection—not a claim that 2D distance preserves the original space."
        action={
          <div className="segmented">
            {["all", "user", "content"].map((v) => (
              <button
                className={kind === v ? "active" : ""}
                onClick={() => setKind(v)}
                key={v}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />
      <section className="card embedding-card">
        <div className="card-head">
          <div>
            <h3>Two-tower representation space</h3>
            <p>PCA · model two-tower-v1 · deterministic fixture</p>
          </div>
          <Badge tone="muted">48 points</Badge>
        </div>
        <div className="embedding-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid stroke="#232728" />
              <XAxis
                type="number"
                dataKey="x"
                name="PC 1"
                tick={{ fill: "#707979", fontSize: 11 }}
                axisLine={false}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="PC 2"
                tick={{ fill: "#707979", fontSize: 11 }}
                axisLine={false}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{
                  background: "#171a1a",
                  border: "1px solid #303535",
                  borderRadius: 8,
                }}
              />
              <Scatter data={points}>
                {points.map((p) => (
                  <Cell
                    key={p.id}
                    fill={p.kind === "user" ? "#ffffff" : colors[p.z]}
                    stroke="#0f1111"
                    strokeWidth={p.kind === "user" ? 3 : 1}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="cluster-key">
          {["Applied ML", "Systems", "Design", "Business"].map((c, i) => (
            <span key={c}>
              <i style={{ background: colors[i] }} />
              {c}
            </span>
          ))}
          <span>
            <i className="user-dot" />
            Users
          </span>
        </div>
      </section>
    </>
  );
}

function Playground() {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("usr_4f91");
  const [diversity, setDiversity] = useState(35);
  const [freshness, setFreshness] = useState(45);
  const live = useQuery({
    queryKey: ["recommendations", userId, diversity, freshness],
    queryFn: () => api.recommendations(userId, { diversity, freshness }),
  });
  const signal = useMutation({
    mutationFn: (input: {
      contentId: string;
      eventType: string;
      category: string;
    }) => api.ingest({ userId, ...input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      await queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    },
  });
  const display =
    live.data?.items.map((item, index) => ({
      rank: index + 1,
      contentId: item.content_id,
      title: item.title,
      category: item.category,
      score: item.score,
      relevance: item.components.relevance,
      recency: item.components.recency,
      diversity: item.components.diversity,
      reason: item.explanation,
    })) ??
    recommendations.map((item) => ({
      ...item,
      contentId: `showcase-${item.rank}`,
    }));
  return (
    <>
      <DemoNotice />
      <SectionTitle
        eyebrow="Build / Recommendations"
        title="Recommendation playground"
        detail="Change policy weights, compare rank components, and inspect why each item was selected."
        action={
          <button
            className="button primary"
            onClick={() => live.refetch()}
            disabled={live.isFetching}
          >
            <Zap size={14} /> Generate
          </button>
        }
      />
      <div className="play-layout">
        <aside className="card controls">
          <h3>Request</h3>
          <label>
            User
            <input
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
            />
          </label>
          <label>
            Serving model
            <select value="affinity-ranker-v1" disabled>
              <option>affinity-ranker-v1</option>
            </select>
          </label>
          <label>
            List size
            <select disabled>
              <option>10</option>
            </select>
          </label>
          <div className="slider-label">
            <span>Diversity weight</span>
            <code>{diversity}%</code>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={diversity}
            onChange={(e) => setDiversity(Number(e.target.value))}
          />
          <div className="slider-label">
            <span>Freshness weight</span>
            <code>{freshness}%</code>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={freshness}
            onChange={(e) => setFreshness(Number(e.target.value))}
          />
          <label className="checkbox">
            <input type="checkbox" checked readOnly /> Filter seen content
          </label>
          <label className="checkbox">
            <input type="checkbox" checked readOnly /> Apply diversity policy
          </label>
          <button
            className="button primary wide"
            onClick={() => live.refetch()}
            disabled={live.isFetching}
          >
            <Play size={14} fill="currentColor" />{" "}
            {live.isFetching ? "Ranking…" : "Run policy"}
          </button>
        </aside>
        <section className="card results">
          <div className="card-head">
            <div>
              <h3>Ranked results</h3>
              <p>
                {live.data?.model_version ?? "showcase-policy"} · heuristic
                scores, not calibrated probabilities
              </p>
            </div>
            <Badge
              tone={
                live.data?.fallback_used
                  ? "amber"
                  : live.isSuccess
                    ? "green"
                    : "muted"
              }
            >
              {live.data?.fallback_used
                ? "cold start"
                : live.isSuccess
                  ? "personalized"
                  : "showcase"}
            </Badge>
          </div>
          {live.isFetching && !live.data ? (
            <div className="loading">
              <span />
              <p>Ranking candidates…</p>
            </div>
          ) : (
            <div className="recommendations">
              {display.map((item) => (
                <article key={item.contentId}>
                  <span className="rank">
                    {String(item.rank).padStart(2, "0")}
                  </span>
                  <div className="recommendation-main">
                    <div>
                      <Badge tone="muted">{item.category}</Badge>
                      <strong>{item.title}</strong>
                    </div>
                    <p>{item.reason}</p>
                    <div className="score-bars">
                      <span>
                        relevance{" "}
                        <i>
                          <b style={{ width: `${item.relevance * 100}%` }} />
                        </i>
                        {item.relevance.toFixed(2)}
                      </span>
                      <span>
                        recency{" "}
                        <i>
                          <b style={{ width: `${item.recency * 100}%` }} />
                        </i>
                        {item.recency.toFixed(2)}
                      </span>
                      <span>
                        diversity{" "}
                        <i>
                          <b style={{ width: `${item.diversity * 100}%` }} />
                        </i>
                        {item.diversity.toFixed(2)}
                      </span>
                    </div>
                    {live.isSuccess && (
                      <div className="signal-actions">
                        <button
                          onClick={() =>
                            signal.mutate({
                              contentId: item.contentId,
                              eventType: "content_view",
                              category: item.category,
                            })
                          }
                        >
                          View
                        </button>
                        <button
                          onClick={() =>
                            signal.mutate({
                              contentId: item.contentId,
                              eventType: "save",
                              category: item.category,
                            })
                          }
                        >
                          Save
                        </button>
                        <button
                          onClick={() =>
                            signal.mutate({
                              contentId: item.contentId,
                              eventType: "dismiss",
                              category: item.category,
                            })
                          }
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="final-score">
                    <span>policy score</span>
                    <strong>{item.score.toFixed(3)}</strong>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Models() {
  const registry = useQuery({ queryKey: ["models"], queryFn: api.models });
  const display =
    registry.data?.items.map((model) => ({
      version: model.id,
      architecture: model.architecture,
      dataset: model.dataset_version,
      status: model.status,
      metrics: {
        recall10:
          typeof model.metrics?.["recall@10"] === "number"
            ? Number(model.metrics["recall@10"]).toFixed(4)
            : "—",
        ndcg10:
          typeof model.metrics?.["ndcg@10"] === "number"
            ? Number(model.metrics["ndcg@10"]).toFixed(4)
            : "—",
      },
      deployed: model.id === "affinity-ranker-v1",
    })) ?? models;
  return (
    <>
      <DemoNotice />
      <SectionTitle
        eyebrow="Operate / Models"
        title="Model registry"
        detail="Track reproducible artifacts, evaluation state, and deployment policy without overstating unrun results."
        action={
          <button className="button" onClick={() => registry.refetch()}>
            <Play size={14} /> Refresh registry
          </button>
        }
      />
      <div className="registry">
        {display.map((model) => (
          <section className="card model-row" key={model.version}>
            <div className="model-icon">
              <Layers3 size={20} />
            </div>
            <div className="model-name">
              <strong>{model.version}</strong>
              <span>{model.architecture}</span>
            </div>
            <div>
              <span>Dataset</span>
              <strong>{model.dataset}</strong>
            </div>
            <div>
              <span>Recall@10</span>
              <strong>{model.metrics.recall10}</strong>
            </div>
            <div>
              <span>NDCG@10</span>
              <strong>{model.metrics.ndcg10}</strong>
            </div>
            <Badge
              tone={
                model.deployed
                  ? "green"
                  : model.status === "baseline" || model.status === "ready"
                    ? "muted"
                    : "amber"
              }
            >
              {model.deployed ? "active" : model.status}
            </Badge>
            <button
              className="icon-button"
              aria-label={`Open ${model.version}`}
            >
              <ArrowRight size={16} />
            </button>
          </section>
        ))}
      </div>
      <section className="card registry-empty">
        <Database size={24} />
        <h3>
          {registry.isSuccess
            ? `${registry.data.items.length} registered model versions`
            : "Connect the runtime registry"}
        </h3>
        <p>
          Training jobs log dataset checksums, temporal split boundaries, seeds,
          hyperparameters, and actual evaluation results to MLflow.
        </p>
        <code>make train &amp;&amp; make evaluate</code>
      </section>
    </>
  );
}

function Experiments() {
  const experimentsQuery = useQuery({
    queryKey: ["experiments"],
    queryFn: api.experiments,
  });
  const experiment = experimentsQuery.data?.items[0];
  return (
    <>
      <DemoNotice />
      <SectionTitle
        eyebrow="Learn / Experiments"
        title="Experimentation"
        detail="Deterministic assignment and honest statistical reporting from real exposure events."
        action={
          <button className="button" onClick={() => experimentsQuery.refetch()}>
            <Beaker size={14} /> Refresh
          </button>
        }
      />
      {experiment ? (
        <section className="card experiment">
          <div className="experiment-head">
            <div>
              <Badge tone={experiment.status === "running" ? "green" : "amber"}>
                {experiment.status}
              </Badge>
              <h3>{experiment.name}</h3>
              <p>
                Stable user assignment between registered control and treatment
                models.
              </p>
            </div>
            <span>{experiment.id.slice(0, 12)}</span>
          </div>
          <div className="variants">
            <div>
              <i>A</i>
              <span>
                <strong>Control</strong>
                <small>
                  {experiment.control} ·{" "}
                  {Math.round((1 - experiment.allocation) * 100)}% allocation
                </small>
              </span>
            </div>
            <div>
              <i>B</i>
              <span>
                <strong>Treatment</strong>
                <small>
                  {experiment.treatment} ·{" "}
                  {Math.round(experiment.allocation * 100)}% allocation
                </small>
              </span>
            </div>
          </div>
          <div className="experiment-footer">
            <div>
              <span>Primary metric</span>
              <strong>Recommendation conversion</strong>
            </div>
            <div>
              <span>Assignment</span>
              <strong>FNV-1a(user + experiment)</strong>
            </div>
            <div>
              <span>Created</span>
              <strong>
                {new Date(experiment.created_at).toLocaleDateString()}
              </strong>
            </div>
            <button className="button">
              Inspect API <ArrowRight size={13} />
            </button>
          </div>
        </section>
      ) : (
        <section className="card registry-empty">
          <Beaker size={24} />
          <h3>
            {experimentsQuery.isSuccess
              ? "No experiments yet"
              : "Runtime not connected"}
          </h3>
          <p>
            Create a protected experiment through the API to see deterministic
            assignments here.
          </p>
          <code>POST /v1/experiments</code>
        </section>
      )}
      <section className="card guardrail">
        <Gauge size={20} />
        <div>
          <h3>Analysis guardrails</h3>
          <p>
            Confidence intervals appear only after observed samples exist.
            Simulated traffic stays out of experiment reporting, and stopping
            decisions remain explicit.
          </p>
        </div>
      </section>
    </>
  );
}

function Observability() {
  return (
    <>
      <DemoNotice />
      <SectionTitle
        eyebrow="Operate / Systems"
        title="Observability"
        detail="Telemetry contracts are wired for local services; charts remain empty until measurements are collected."
      />
      <div className="observability-grid">
        {[
          "API latency",
          "Request throughput",
          "Error rate",
          "Consumer lag",
          "Cache hit rate",
          "Vector search latency",
        ].map((name, i) => (
          <section className="card obs" key={name}>
            <div>
              <span>{name}</span>
              <Badge tone="muted">no data</Badge>
            </div>
            <div className="empty-chart">
              {Array.from({ length: 12 }, (_, j) => (
                <i
                  key={j}
                  style={{ height: `${18 + ((j * 17 + i * 11) % 36)}%` }}
                />
              ))}
            </div>
            <p>
              Start the local stack and send traffic to collect this metric.
            </p>
          </section>
        ))}
      </div>
    </>
  );
}

const pages: Record<Exclude<NavId, "overview">, () => React.JSX.Element> = {
  users: UserExplorer,
  embeddings: Embeddings,
  playground: Playground,
  models: Models,
  experiments: Experiments,
  observability: Observability,
};

export function Dashboard() {
  const [active, setActive] = useState<NavId>("overview");
  const [mobile, setMobile] = useState(false);
  const Page = active === "overview" ? null : pages[active];
  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 15_000,
  });
  return (
    <div className="shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="brand">
          <Image
            className="brand-logo"
            src="/affinity-logo.svg"
            alt="Affinity"
            width={202}
            height={72}
            priority
          />
          <Badge tone="muted">beta</Badge>
          <button
            onClick={() => setMobile(false)}
            className="mobile-close"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={active === item.id ? "active" : ""}
                onClick={() => {
                  setActive(item.id);
                  setMobile(false);
                }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
                {item.id === "overview" && <i />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <a
            href="https://github.com/jonxsong/Affinity"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={16} />
            GitHub
            <ExternalLink size={12} />
          </a>
          <div className="workspace">
            <span>AF</span>
            <div>
              <strong>Affinity Lab</strong>
              <small>
                {health.isSuccess ? "Runtime connected" : "Showcase mode"}
              </small>
            </div>
            <ChevronDown size={14} />
          </div>
        </div>
      </aside>
      <main>
        <header>
          <button
            className="menu-button"
            onClick={() => setMobile(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <div className="breadcrumb">
            <span>affinity</span>
            <b>/</b>
            <strong>
              {nav.find((n) => n.id === active)?.label.toLowerCase()}
            </strong>
          </div>
          <div className="header-actions">
            <button>
              <Search size={15} />
              <span>Search</span>
              <kbd>⌘ K</kbd>
            </button>
            <a
              href="https://github.com/jonxsong/Affinity"
              target="_blank"
              rel="noreferrer"
            >
              <Github size={16} />
            </a>
            <span className={`status ${health.isSuccess ? "live" : ""}`}>
              <i />
              {health.isSuccess ? "Live" : "Showcase"}
            </span>
          </div>
        </header>
        <div className="content">
          {Page ? (
            <Page />
          ) : (
            <Overview onOpenPlayground={() => setActive("playground")} />
          )}
        </div>
        <footer>
          <span>Affinity · open-source recommendation intelligence</span>
          <span>
            {health.isSuccess
              ? `Connected to ${apiLocationLabel}`
              : "Public and synthetic showcase data is labeled"}
          </span>
        </footer>
      </main>
    </div>
  );
}
