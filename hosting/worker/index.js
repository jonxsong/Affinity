const ASSETS = /*__AFFINITY_ASSETS__*/ {};

const CONTENT = [
  [
    "item_101",
    "Practical retrieval systems for recommender teams",
    "applied_ml",
    "A field guide to candidate generation, retrieval evaluation, and operating vector indexes.",
    0.92,
    "2026-11-12T12:00:00Z",
  ],
  [
    "item_102",
    "Building two-tower models that survive production",
    "applied_ml",
    "Training objectives, hard negatives, embedding export, and online/offline consistency.",
    0.9,
    "2026-11-09T12:00:00Z",
  ],
  [
    "item_201",
    "Event streams without operational drama",
    "data_systems",
    "Idempotency, replay, consumer recovery, and practical event contracts.",
    0.88,
    "2026-11-13T12:00:00Z",
  ],
  [
    "item_202",
    "Postgres patterns for behavioral products",
    "data_systems",
    "Indexes, retention, and query patterns for high-volume product events.",
    0.84,
    "2026-11-06T12:00:00Z",
  ],
  [
    "item_301",
    "Measuring representation drift in production",
    "ml_operations",
    "Monitor embedding populations without confusing projection movement for semantic drift.",
    0.91,
    "2026-11-11T12:00:00Z",
  ],
  [
    "item_302",
    "Reproducible offline evaluation",
    "ml_operations",
    "Temporal holdouts, candidate consistency, uncertainty, and artifact lineage.",
    0.94,
    "2026-11-02T12:00:00Z",
  ],
  [
    "item_401",
    "Designing useful model-debugging interfaces",
    "design_tools",
    "Turn ranking components and behavioral evidence into an effective developer workflow.",
    0.87,
    "2026-11-10T12:00:00Z",
  ],
  [
    "item_402",
    "Visualization patterns for embedding spaces",
    "design_tools",
    "Responsible projection labeling, cluster inspection, and comparison interactions.",
    0.82,
    "2026-10-30T12:00:00Z",
  ],
  [
    "item_501",
    "Open-source infrastructure as product strategy",
    "open_source",
    "How transparent systems and strong developer experience compound adoption.",
    0.85,
    "2026-11-08T12:00:00Z",
  ],
  [
    "item_502",
    "Maintaining trustworthy ML benchmarks",
    "open_source",
    "Dataset provenance, repeatable harnesses, and avoiding misleading claims.",
    0.93,
    "2026-11-05T12:00:00Z",
  ],
  [
    "item_601",
    "Experimentation beyond the dashboard",
    "experimentation",
    "Assignment units, exposure logging, guardrails, and honest stopping rules.",
    0.89,
    "2026-11-07T12:00:00Z",
  ],
  [
    "item_602",
    "Cold-start systems that earn the first click",
    "experimentation",
    "Content quality, contextual popularity, and exploration for new users.",
    0.86,
    "2026-11-03T12:00:00Z",
  ],
].map(
  ([
    content_id,
    title,
    category,
    description,
    quality_score,
    published_at,
  ]) => ({
    content_id,
    title,
    category,
    description,
    quality_score,
    published_at,
  }),
);

const MODELS = [
  {
    id: "affinity-ranker-v1",
    architecture: "behavioral_policy",
    dataset_version: "runtime-events",
    parameters: {
      interest_weight: 0.55,
      quality_weight: 0.25,
      recency_weight: 0.2,
    },
    metrics: null,
    artifact_uri: null,
    trained_at: null,
    status: "ready",
  },
  {
    id: "implicit-svd-v1",
    architecture: "implicit_svd",
    dataset_version: "movielens-100k",
    parameters: { factors: 32 },
    metrics: null,
    artifact_uri: null,
    trained_at: null,
    status: "configured",
  },
  {
    id: "two-tower-v1",
    architecture: "two_tower",
    dataset_version: "movielens-100k",
    parameters: { embedding_dim: 64 },
    metrics: null,
    artifact_uri: null,
    trained_at: null,
    status: "configured",
  },
  {
    id: "gru4rec-v1",
    architecture: "gru4rec",
    dataset_version: "movielens-100k",
    parameters: { embedding_dim: 64, hidden_dim: 96 },
    metrics: null,
    artifact_uri: null,
    trained_at: null,
    status: "configured",
  },
];

const EXPERIMENTS = [
  {
    id: "8de5b9f8-c988-4f30-8ed7-427fb339cb40",
    name: "ranking-policy-v1",
    control: "affinity-ranker-v1",
    treatment: "two-tower-v1",
    allocation: 0.5,
    status: "draft",
    created_at: "2026-11-14T00:00:00Z",
  },
];

const EVENT_STRENGTH = {
  content_impression: 0.1,
  content_view: 0.55,
  click: 0.7,
  like: 0.9,
  save: 1,
  share: 0.95,
  search: 0.35,
  dismiss: -0.7,
  follow: 0.85,
  dwell_time: 0.65,
  recommendation_conversion: 1.1,
};

const CONTENT_BY_ID = new Map(CONTENT.map((item) => [item.content_id, item]));
const STARTED_AT = Date.now();

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      ...extraHeaders,
    },
  });
}

function error(code, message, status = 400, requestId = crypto.randomUUID()) {
  return json({ error: { code, message, request_id: requestId } }, status, {
    "x-request-id": requestId,
  });
}

function ownerId(request) {
  const authenticated = request.headers.get("oai-authenticated-user-id");
  if (authenticated) return `user:${authenticated}`;
  const client = request.headers.get("x-affinity-client-id");
  if (client && /^[a-zA-Z0-9_-]{16,100}$/.test(client))
    return `client:${client}`;
  return null;
}

function requireOwner(request, requestId) {
  const owner = ownerId(request);
  return owner
    ? { owner }
    : {
        response: error(
          "client_identity_required",
          "A stable Affinity client identity is required.",
          401,
          requestId,
        ),
      };
}

function constantTimeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(left || "");
  const rightBytes = new TextEncoder().encode(right || "");
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1)
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  return difference === 0;
}

function adminAuthorized(request, env) {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  return (
    Boolean(env.AFFINITY_ADMIN_TOKEN) &&
    constantTimeEqual(token, env.AFFINITY_ADMIN_TOKEN)
  );
}

function clamp(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function eventCategory(event) {
  const content = event.content_id ? CONTENT_BY_ID.get(event.content_id) : null;
  if (content) return content.category;
  try {
    return JSON.parse(event.context_json || "{}").category || null;
  } catch {
    return null;
  }
}

export function calculateInterests(events, now = Date.now()) {
  const totals = new Map();
  const recentTotals = new Map();
  const counts = new Map();
  for (const event of events) {
    const category = eventCategory(event);
    if (!category) continue;
    const ageDays = Math.max(
      0,
      (now - Date.parse(event.timestamp)) / 86_400_000,
    );
    const strength = EVENT_STRENGTH[event.event_type] ?? 0;
    const decayed = strength * Math.exp(-ageDays / 45);
    totals.set(category, (totals.get(category) || 0) + decayed);
    counts.set(category, (counts.get(category) || 0) + 1);
    if (ageDays <= 7)
      recentTotals.set(category, (recentTotals.get(category) || 0) + strength);
  }
  const normalize = (source) => {
    const maximum = Math.max(0, ...source.values());
    return [...source]
      .filter(([, score]) => score > 0)
      .map(([topic, score]) => ({
        topic,
        weight: maximum ? score / maximum : 0,
        evidence_count: counts.get(topic) || 0,
      }))
      .sort((a, b) => b.weight - a.weight || a.topic.localeCompare(b.topic));
  };
  return { long_term: normalize(totals), recent: normalize(recentTotals) };
}

export function rankContent(
  events,
  options = {},
  now = Date.now(),
  servingModel = null,
) {
  const interests = calculateInterests(events, now);
  const interestWeights = new Map(
    interests.long_term.map((item) => [item.topic, item.weight]),
  );
  for (const item of interests.recent) {
    interestWeights.set(
      item.topic,
      Math.max(interestWeights.get(item.topic) || 0, item.weight),
    );
  }
  const seen = new Set(
    events
      .filter((event) => event.event_type !== "dismiss")
      .map((event) => event.content_id),
  );
  const limit = clamp(options.limit, 1, 20, 10);
  const relevanceWeight = clamp(options.relevance_weight, 0, 1, 0.45);
  const recencyWeight = clamp(options.recency_weight, 0, 1, 0.2);
  const qualityWeight = clamp(options.quality_weight, 0, 1, 0.25);
  const diversityWeight = clamp(options.diversity_weight, 0, 1, 0.35);
  const fallbackUsed = interestWeights.size === 0;
  const candidates = CONTENT.filter((item) => !seen.has(item.content_id)).map(
    (item) => {
      const relevance = interestWeights.get(item.category) || 0;
      const ageDays = Math.max(
        0,
        (now - Date.parse(item.published_at)) / 86_400_000,
      );
      const recency = Math.exp(-ageDays / 30);
      const quality = item.quality_score;
      const learnedPrior =
        servingModel?.content_scores?.[item.content_id] ??
        servingModel?.category_scores?.[item.category] ??
        0.5;
      return { ...item, relevance, recency, quality, learnedPrior };
    },
  );
  const selected = [];
  const categoryCounts = new Map();
  while (selected.length < limit && candidates.length) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    let bestDiversity = 1;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const diversity = 1 / (1 + (categoryCounts.get(candidate.category) || 0));
      const policyScore =
        candidate.relevance * relevanceWeight +
        candidate.recency * recencyWeight +
        candidate.quality * qualityWeight +
        diversity * diversityWeight;
      const score = servingModel
        ? 0.8 * policyScore + 0.2 * candidate.learnedPrior
        : policyScore;
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
        bestDiversity = diversity;
      }
    }
    const [candidate] = candidates.splice(bestIndex, 1);
    categoryCounts.set(
      candidate.category,
      (categoryCounts.get(candidate.category) || 0) + 1,
    );
    selected.push({
      content_id: candidate.content_id,
      title: candidate.title,
      category: candidate.category,
      description: candidate.description,
      score: Number(bestScore.toFixed(6)),
      score_type: "heuristic_policy_score",
      components: {
        relevance: Number(candidate.relevance.toFixed(6)),
        recency: Number(candidate.recency.toFixed(6)),
        diversity: Number(bestDiversity.toFixed(6)),
        quality: candidate.quality,
        learned_prior: Number(candidate.learnedPrior.toFixed(6)),
      },
      explanation:
        servingModel && candidate.learnedPrior >= 0.65
          ? `The active trained model raised this ${candidate.category.replaceAll("_", " ")} item; live quality and freshness checks still apply.`
          : fallbackUsed
            ? "Cold-start selection based on content quality, freshness, and category diversity."
            : `Matches observed ${candidate.category.replaceAll("_", " ")} behavior while balancing freshness and diversity.`,
      model_version: servingModel?.model_id || "affinity-ranker-v1",
    });
  }
  return { fallback_used: fallbackUsed, items: selected, interests };
}

function validateServingModel(model) {
  if (
    !model ||
    model.schema_version !== 1 ||
    typeof model.model_id !== "string" ||
    !model.model_id.trim() ||
    model.model_id.length > 120 ||
    !Number.isInteger(model.training_event_count) ||
    model.training_event_count < 0 ||
    Number.isNaN(Date.parse(model.trained_at))
  )
    return "Serving model metadata is invalid.";
  for (const scores of [model.category_scores, model.content_scores]) {
    if (!scores || typeof scores !== "object" || Array.isArray(scores))
      return "Serving model score maps are required.";
    for (const [feature, score] of Object.entries(scores)) {
      if (
        !feature ||
        feature.length > 200 ||
        !Number.isFinite(score) ||
        score < 0 ||
        score > 1
      )
        return "Serving model features and scores are invalid.";
    }
  }
  return null;
}

async function loadActiveModel(db) {
  const row = await db
    .prepare(
      "SELECT artifact_json FROM affinity_active_model WHERE singleton = 1",
    )
    .first();
  if (!row?.artifact_json) return null;
  try {
    const model = JSON.parse(row.artifact_json);
    return validateServingModel(model) ? null : model;
  } catch {
    return null;
  }
}

async function activateServingModel(db, model) {
  await db
    .prepare(
      "INSERT INTO affinity_active_model (singleton,artifact_json,activated_at) VALUES (1,?,?) ON CONFLICT(singleton) DO UPDATE SET artifact_json=excluded.artifact_json,activated_at=excluded.activated_at",
    )
    .bind(JSON.stringify(model), new Date().toISOString())
    .run();
}

function trainServingModel(events, now = Date.now()) {
  const categorySignals = new Map();
  const contentSignals = new Map();
  const targets = {
    content_impression: [0.45, 0.1],
    content_view: [0.58, 0.45],
    click: [0.68, 0.7],
    like: [0.86, 1],
    save: [0.92, 1.15],
    share: [0.95, 1.2],
    search: [0.6, 0.35],
    dismiss: [0.08, 1],
    follow: [0.9, 1.1],
    dwell_time: [0.72, 0.65],
    recommendation_conversion: [1, 1.4],
  };
  const observe = (map, feature, target, confidence) => {
    const signal = map.get(feature) || { sum: 0, weight: 0 };
    signal.sum += target * confidence;
    signal.weight += confidence;
    map.set(feature, signal);
  };
  for (const event of events) {
    const content = CONTENT_BY_ID.get(event.content_id);
    const target = targets[event.event_type];
    if (!content || !target) continue;
    const ageDays = Math.max(
      0,
      (now - Date.parse(event.timestamp)) / 86_400_000,
    );
    const confidence = target[1] * Math.max(0.05, 2 ** (-ageDays / 30));
    observe(categorySignals, content.category, target[0], confidence);
    observe(contentSignals, content.content_id, target[0], confidence);
  }
  const scores = (map, priorWeight) =>
    Object.fromEntries(
      [...map].map(([feature, signal]) => [
        feature,
        Math.min(
          1,
          Math.max(
            0,
            (signal.sum + 0.5 * priorWeight) / (signal.weight + priorWeight),
          ),
        ),
      ]),
    );
  return {
    schema_version: 1,
    model_id: "behavioral-prior-v1",
    trained_at: new Date(now).toISOString(),
    training_event_count: events.length,
    category_scores: scores(categorySignals, 3),
    content_scores: scores(contentSignals, 6),
  };
}

async function loadEvents(db, owner, userId, limit = 500) {
  const result = await db
    .prepare(
      "SELECT event_id,user_id,content_id,event_type,timestamp,session_id,context_json,surface,schema_version FROM affinity_events WHERE owner_id = ? AND user_id = ? ORDER BY timestamp DESC LIMIT ?",
    )
    .bind(owner, userId, limit)
    .all();
  return result.results || [];
}

function validateEvent(event) {
  const required = [
    "event_id",
    "user_id",
    "event_type",
    "timestamp",
    "session_id",
    "surface",
  ];
  if (
    !event ||
    required.some(
      (field) => typeof event[field] !== "string" || !event[field].trim(),
    )
  )
    return "Event identifiers, type, timestamp, session, and surface are required.";
  if (
    !(event.event_type in EVENT_STRENGTH) ||
    event.schema_version !== 1 ||
    Number.isNaN(Date.parse(event.timestamp))
  )
    return "Unsupported event type, schema version, or timestamp.";
  const eventTime = Date.parse(event.timestamp);
  if (
    eventTime > Date.now() + 5 * 60_000 ||
    eventTime < Date.now() - 10 * 365 * 86_400_000
  )
    return "Event timestamp is outside the accepted retention window.";
  if (event.content_id && !CONTENT_BY_ID.has(event.content_id))
    return "Unknown content_id.";
  return null;
}

async function insertEvent(db, owner, event) {
  return db
    .prepare(
      "INSERT OR IGNORE INTO affinity_events (event_id,owner_id,user_id,content_id,event_type,timestamp,session_id,context_json,surface,schema_version) VALUES (?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      event.event_id,
      owner,
      event.user_id.slice(0, 200),
      event.content_id || null,
      event.event_type,
      new Date(event.timestamp).toISOString(),
      event.session_id.slice(0, 200),
      JSON.stringify(event.context || {}),
      event.surface.slice(0, 100),
      1,
    )
    .run();
}

export async function enforceRateLimit(db, owner, bucket, limit, requestId) {
  const windowStarted = Math.floor(Date.now() / 60_000) * 60_000;
  await db
    .prepare(
      "INSERT INTO affinity_rate_limits (owner_id,bucket,window_started,request_count) VALUES (?,?,?,1) ON CONFLICT(owner_id,bucket,window_started) DO UPDATE SET request_count=request_count+1",
    )
    .bind(owner, bucket, windowStarted)
    .run();
  const row = await db
    .prepare(
      "SELECT request_count FROM affinity_rate_limits WHERE owner_id=? AND bucket=? AND window_started=?",
    )
    .bind(owner, bucket, windowStarted)
    .first();
  if (Number(row?.request_count || 0) <= limit) return null;
  const retryAfter = Math.max(
    1,
    Math.ceil((windowStarted + 60_000 - Date.now()) / 1000),
  );
  return json(
    {
      error: {
        code: "rate_limit_exceeded",
        message: "Too many requests. Retry after the indicated delay.",
        request_id: requestId,
      },
    },
    429,
    { "x-request-id": requestId, "retry-after": String(retryAfter) },
  );
}

async function handleApi(request, env, url) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  if (!env.DB)
    return error(
      "storage_unavailable",
      "The hosted database binding is unavailable.",
      503,
      requestId,
    );
  if (url.pathname === "/health") {
    await env.DB.prepare("SELECT 1 AS ok").first();
    return json(
      { status: "ok", service: "affinity-sites-api", version: "1" },
      200,
      { "x-request-id": requestId },
    );
  }
  if (url.pathname === "/v1/overview" && request.method === "GET") {
    const scope = requireOwner(request, requestId);
    if (scope.response) return scope.response;
    const limited = await enforceRateLimit(
      env.DB,
      scope.owner,
      "overview",
      120,
      requestId,
    );
    if (limited) return limited;
    const [events, users, requests, activeModel] = await Promise.all([
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM affinity_events WHERE owner_id = ?",
      )
        .bind(scope.owner)
        .first(),
      env.DB.prepare(
        "SELECT COUNT(DISTINCT user_id) AS count FROM affinity_events WHERE owner_id = ?",
      )
        .bind(scope.owner)
        .first(),
      env.DB.prepare(
        "SELECT value FROM affinity_stats WHERE owner_id = ? AND key = 'recommendation_requests'",
      )
        .bind(scope.owner)
        .first(),
      loadActiveModel(env.DB),
    ]);
    return json({
      total_users: Number(users?.count || 0),
      total_content_items: CONTENT.length,
      total_events: Number(events?.count || 0),
      total_experiments: EXPERIMENTS.length,
      recommendation_requests: Number(requests?.value || 0),
      storage: "d1",
      uptime_seconds: Math.floor((Date.now() - STARTED_AT) / 1000),
      active_model: activeModel?.model_id || "affinity-ranker-v1",
    });
  }
  if (url.pathname === "/v1/events" && request.method === "POST") {
    const scope = requireOwner(request, requestId);
    if (scope.response) return scope.response;
    const limited = await enforceRateLimit(
      env.DB,
      scope.owner,
      "event-ingest",
      60,
      requestId,
    );
    if (limited) return limited;
    let event;
    try {
      event = await request.json();
    } catch {
      return error(
        "invalid_json",
        "Request body must be valid JSON.",
        400,
        requestId,
      );
    }
    const validationError = validateEvent(event);
    if (validationError)
      return error("validation_error", validationError, 422, requestId);
    const result = await insertEvent(env.DB, scope.owner, event);
    return json(
      {
        event_id: event.event_id,
        status: result.meta?.changes ? "accepted" : "duplicate",
      },
      result.meta?.changes ? 201 : 200,
      { "x-request-id": requestId },
    );
  }
  if (url.pathname === "/v1/models" && request.method === "GET") {
    const activeModel = await loadActiveModel(env.DB);
    const activeRegistry = activeModel
      ? [
          {
            id: activeModel.model_id,
            architecture: "empirical_bayes_prior",
            dataset_version: "runtime-events",
            parameters: { schema_version: activeModel.schema_version },
            metrics: {
              training_event_count: activeModel.training_event_count,
              category_feature_count: Object.keys(activeModel.category_scores)
                .length,
              content_feature_count: Object.keys(activeModel.content_scores)
                .length,
            },
            artifact_uri: "d1://affinity_active_model",
            trained_at: activeModel.trained_at,
            status: "ready",
          },
        ]
      : [];
    return json({
      items: [
        ...activeRegistry,
        ...MODELS.filter((item) => item.id !== activeModel?.model_id),
      ],
    });
  }
  if (url.pathname === "/v1/models/active" && request.method === "GET") {
    const model = await loadActiveModel(env.DB);
    return json({
      active: Boolean(model),
      model,
      fallback_model: "affinity-ranker-v1",
    });
  }
  if (url.pathname === "/v1/models/active" && request.method === "PUT") {
    if (!adminAuthorized(request, env))
      return error(
        "unauthorized",
        "Admin authentication is required.",
        401,
        requestId,
      );
    const model = await request.json().catch(() => null);
    const validationError = validateServingModel(model);
    if (validationError)
      return error("validation_error", validationError, 422, requestId);
    await activateServingModel(env.DB, model);
    return json({
      status: "active",
      model_id: model.model_id,
      training_event_count: model.training_event_count,
    });
  }
  if (
    url.pathname === "/v1/models/train-serving" &&
    request.method === "POST"
  ) {
    if (!adminAuthorized(request, env))
      return error(
        "unauthorized",
        "Admin authentication is required.",
        401,
        requestId,
      );
    const rows = await env.DB.prepare(
      "SELECT content_id,event_type,timestamp FROM affinity_events ORDER BY timestamp DESC LIMIT 100000",
    ).all();
    const model = trainServingModel(rows.results || []);
    await activateServingModel(env.DB, model);
    return json({ status: "active", model }, 201);
  }
  if (url.pathname === "/v1/admin/maintenance" && request.method === "POST") {
    if (!adminAuthorized(request, env))
      return error(
        "unauthorized",
        "Admin authentication is required.",
        401,
        requestId,
      );
    const payload = await request.json().catch(() => ({}));
    const retentionDays = clamp(payload.retention_days, 30, 3650, 365);
    const cutoff = new Date(
      Date.now() - retentionDays * 86_400_000,
    ).toISOString();
    const eventResult = await env.DB.prepare(
      "DELETE FROM affinity_events WHERE timestamp < ?",
    )
      .bind(cutoff)
      .run();
    const rateLimitResult = await env.DB.prepare(
      "DELETE FROM affinity_rate_limits WHERE window_started < ?",
    )
      .bind(Date.now() - 86_400_000)
      .run();
    return json({
      status: "complete",
      retention_days: retentionDays,
      deleted_events: Number(eventResult.meta?.changes || 0),
      deleted_rate_limit_windows: Number(rateLimitResult.meta?.changes || 0),
    });
  }
  if (url.pathname === "/v1/sync/import" && request.method === "POST") {
    if (!adminAuthorized(request, env))
      return error(
        "unauthorized",
        "Admin authentication is required.",
        401,
        requestId,
      );
    const scope = requireOwner(request, requestId);
    if (scope.response) return scope.response;
    const payload = await request.json().catch(() => null);
    if (
      !payload ||
      payload.schema_version !== 1 ||
      !Array.isArray(payload.events) ||
      payload.events.length > 100_000
    )
      return error(
        "validation_error",
        "Sync payload must use schema_version=1 and contain at most 100000 events.",
        422,
        requestId,
      );
    let accepted = 0;
    for (const event of payload.events) {
      const validationError = validateEvent(event);
      if (validationError)
        return error("validation_error", validationError, 422, requestId);
      const result = await insertEvent(env.DB, scope.owner, event);
      accepted += Number(result.meta?.changes || 0);
    }
    return json({
      status: "complete",
      accepted,
      duplicates: payload.events.length - accepted,
      total: payload.events.length,
    });
  }
  if (url.pathname === "/v1/experiments" && request.method === "GET")
    return json({ items: EXPERIMENTS });

  let match = url.pathname.match(/^\/v1\/sync\/export\/([^/]+)$/);
  if (match && request.method === "GET") {
    if (!adminAuthorized(request, env))
      return error(
        "unauthorized",
        "Admin authentication is required.",
        401,
        requestId,
      );
    const scope = requireOwner(request, requestId);
    if (scope.response) return scope.response;
    const userId = decodeURIComponent(match[1]);
    const events = await loadEvents(env.DB, scope.owner, userId, 100_000);
    return json({
      schema_version: 1,
      exported_at: new Date().toISOString(),
      user_id: userId,
      event_count: events.length,
      events: events.map((event) => ({
        ...event,
        context: JSON.parse(event.context_json || "{}"),
        context_json: undefined,
      })),
    });
  }

  match = url.pathname.match(
    /^\/v1\/users\/([^/]+)(?:\/(interests|history))?$/,
  );
  if (match && request.method === "GET") {
    const scope = requireOwner(request, requestId);
    if (scope.response) return scope.response;
    const limited = await enforceRateLimit(
      env.DB,
      scope.owner,
      "user-read",
      180,
      requestId,
    );
    if (limited) return limited;
    const userId = decodeURIComponent(match[1]);
    const events = await loadEvents(
      env.DB,
      scope.owner,
      userId,
      match[2] === "history" ? 50 : 500,
    );
    if (match[2] === "history") {
      return json({
        user_id: userId,
        items: events.map((event) => ({
          ...event,
          context: JSON.parse(event.context_json || "{}"),
          context_json: undefined,
        })),
        next_cursor: null,
      });
    }
    const interests = calculateInterests(events);
    if (match[2] === "interests") {
      return json({
        user_id: userId,
        source: "observed_events",
        ...interests,
        score_type: "normalized_decayed_event_strength",
      });
    }
    return json({
      user_id: userId,
      representation: events.length ? "observed_behavior" : "cold_start",
      observed_event_count: events.length,
      profile_version: 1,
      long_term_interest_count: interests.long_term.length,
      recent_interest_count: interests.recent.length,
      inferred_sensitive_attributes: [],
    });
  }
  if (match && request.method === "DELETE") {
    const scope = requireOwner(request, requestId);
    if (scope.response) return scope.response;
    const userId = decodeURIComponent(match[1]);
    const result = await env.DB.prepare(
      "DELETE FROM affinity_events WHERE owner_id = ? AND user_id = ?",
    )
      .bind(scope.owner, userId)
      .run();
    return json({
      user_id: userId,
      deleted_events: Number(result.meta?.changes || 0),
      status: "deleted",
    });
  }

  match = url.pathname.match(/^\/v1\/recommendations\/([^/]+)$/);
  if (match && request.method === "GET") {
    const scope = requireOwner(request, requestId);
    if (scope.response) return scope.response;
    const limited = await enforceRateLimit(
      env.DB,
      scope.owner,
      "recommendations",
      120,
      requestId,
    );
    if (limited) return limited;
    const userId = decodeURIComponent(match[1]);
    const [events, activeModel] = await Promise.all([
      loadEvents(env.DB, scope.owner, userId),
      loadActiveModel(env.DB),
    ]);
    const ranked = rankContent(
      events,
      Object.fromEntries(url.searchParams),
      Date.now(),
      activeModel,
    );
    await env.DB.prepare(
      "INSERT INTO affinity_stats (owner_id,key,value) VALUES (?,'recommendation_requests',1) ON CONFLICT(owner_id,key) DO UPDATE SET value = value + 1",
    )
      .bind(scope.owner)
      .run();
    return json({
      user_id: userId,
      model_version: activeModel?.model_id || "affinity-ranker-v1",
      fallback_used: ranked.fallback_used,
      items: ranked.items,
    });
  }

  return error("not_found", "API route not found.", 404, requestId);
}

function decodeAsset(asset) {
  const binary = atob(asset.body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function serveAsset(request, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  let asset = ASSETS[pathname];
  if (!asset && !pathname.includes("."))
    asset = ASSETS[`${pathname}.html`] || ASSETS[`${pathname}/index.html`];
  const notFound = !asset;
  if (notFound) asset = ASSETS["/404.html"];
  if (!asset) return new Response("Not found", { status: 404 });
  const headers = {
    "content-type": asset.type,
    "cache-control": pathname.startsWith("/_next/static/")
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-frame-options": "DENY",
    "content-security-policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  };
  return new Response(request.method === "HEAD" ? null : decodeAsset(asset), {
    status: notFound ? 404 : 200,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    void ctx;
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health" || url.pathname.startsWith("/v1/"))
        return await handleApi(request, env, url);
      if (request.method === "GET" || request.method === "HEAD")
        return serveAsset(request, url);
      return error("method_not_allowed", "Method not allowed.", 405);
    } catch (caught) {
      console.error("Affinity Worker request failed", caught);
      return error(
        "internal_error",
        "The Affinity service could not complete this request.",
        500,
      );
    }
  },
};
