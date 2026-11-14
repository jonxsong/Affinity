export type NavId = "overview" | "users" | "embeddings" | "playground" | "models" | "experiments" | "observability";

export const metrics = [
  { label: "Demo users", value: "6,040", delta: "MovieLens 100K", tone: "neutral" },
  { label: "Content items", value: "3,706", delta: "Normalized titles", tone: "neutral" },
  { label: "Event ingest", value: "—", delta: "Run benchmark", tone: "pending" },
  { label: "API latency", value: "—", delta: "Not measured here", tone: "pending" },
];

export const throughput = [
  { time: "12:00", events: 132, recommendations: 38 },
  { time: "12:05", events: 181, recommendations: 52 },
  { time: "12:10", events: 156, recommendations: 43 },
  { time: "12:15", events: 224, recommendations: 67 },
  { time: "12:20", events: 198, recommendations: 58 },
  { time: "12:25", events: 263, recommendations: 74 },
  { time: "12:30", events: 241, recommendations: 69 },
  { time: "12:35", events: 289, recommendations: 83 },
  { time: "12:40", events: 267, recommendations: 78 },
  { time: "12:45", events: 312, recommendations: 91 },
  { time: "12:50", events: 284, recommendations: 82 },
  { time: "12:55", events: 326, recommendations: 96 },
];

export const interests = [
  { topic: "Applied ML", longTerm: 86, recent: 94 },
  { topic: "Data systems", longTerm: 78, recent: 71 },
  { topic: "Design tools", longTerm: 62, recent: 49 },
  { topic: "Startups", longTerm: 57, recent: 65 },
  { topic: "Open source", longTerm: 51, recent: 76 },
];

export const users = [
  { id: "usr_4f91", label: "Research-oriented", events: 184, lastSeen: "2m ago", status: "active" },
  { id: "usr_7a12", label: "Systems explorer", events: 97, lastSeen: "18m ago", status: "active" },
  { id: "usr_12bd", label: "New user", events: 3, lastSeen: "1h ago", status: "cold" },
  { id: "usr_902c", label: "Design enthusiast", events: 246, lastSeen: "3h ago", status: "active" },
];

export const timeline = [
  { event: "content_view", content: "Vector search at scale", context: "docs_feed", time: "12:51:08", weight: 0.82 },
  { event: "save", content: "Two-tower retrieval, explained", context: "recommendations", time: "12:48:31", weight: 1.0 },
  { event: "dwell_time", content: "Evaluating ranking systems", context: "article", time: "12:43:17", weight: 0.74 },
  { event: "dismiss", content: "Consumer trend report", context: "home", time: "12:39:02", weight: -0.25 },
  { event: "search", content: "implicit feedback matrix factorization", context: "global", time: "12:35:46", weight: 0.67 },
];

export const recommendations = [
  {
    rank: 1,
    title: "Practical retrieval systems for recommender teams",
    category: "Applied ML",
    score: 0.913,
    relevance: 0.88,
    recency: 0.94,
    diversity: 0.76,
    reason: "Matches recent retrieval-system reading and a saved two-tower article.",
  },
  {
    rank: 2,
    title: "Event streams without operational drama",
    category: "Data systems",
    score: 0.864,
    relevance: 0.83,
    recency: 0.78,
    diversity: 0.92,
    reason: "Strong long-term systems affinity; adds topic diversity to the list.",
  },
  {
    rank: 3,
    title: "Measuring representation drift in production",
    category: "ML operations",
    score: 0.821,
    relevance: 0.85,
    recency: 0.69,
    diversity: 0.81,
    reason: "Close semantic match to evaluation history; unseen content.",
  },
  {
    rank: 4,
    title: "Designing useful model-debugging interfaces",
    category: "Design tools",
    score: 0.774,
    relevance: 0.71,
    recency: 0.83,
    diversity: 0.88,
    reason: "Connects historical design interest with current model-debugging intent.",
  },
];

export const models = [
  { version: "popularity-v1", architecture: "Popularity", dataset: "MovieLens 100K", status: "baseline", metrics: { recall10: "—", ndcg10: "—" }, deployed: false },
  { version: "als-v1", architecture: "Implicit ALS", dataset: "MovieLens 100K", status: "ready to train", metrics: { recall10: "—", ndcg10: "—" }, deployed: true },
  { version: "two-tower-v1", architecture: "Two-tower", dataset: "MovieLens 100K", status: "ready to train", metrics: { recall10: "—", ndcg10: "—" }, deployed: false },
  { version: "gru4rec-v1", architecture: "GRU4Rec", dataset: "MovieLens 100K", status: "ready to train", metrics: { recall10: "—", ndcg10: "—" }, deployed: false },
];

export const embeddingPoints = Array.from({ length: 48 }, (_, index) => ({
  x: Math.sin(index * 1.7) * 34 + (index % 3) * 16 + 50,
  y: Math.cos(index * 1.13) * 28 + (index % 4) * 11 + 44,
  z: index % 4,
  kind: index % 9 === 0 ? "user" : "content",
  id: index % 9 === 0 ? `usr_${(index * 97).toString(16)}` : `item_${1000 + index}`,
}));

export const services = [
  { name: "Rust API", status: "demo", note: "Static console mode" },
  { name: "PostgreSQL", status: "offline", note: "Start with Docker Compose" },
  { name: "Redis", status: "offline", note: "Start with Docker Compose" },
  { name: "Qdrant", status: "offline", note: "Start with Docker Compose" },
  { name: "Redpanda", status: "offline", note: "Start with Docker Compose" },
];

