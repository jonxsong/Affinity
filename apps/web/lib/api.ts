import { z } from "zod";

export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";

export const apiLocationLabel = apiBaseUrl || "this site";

const healthSchema = z.object({
  status: z.string(),
  service: z.string().optional(),
  version: z.string().optional(),
});

const overviewSchema = z.object({
  total_users: z.number(),
  total_content_items: z.number(),
  total_events: z.number(),
  total_experiments: z.number(),
  recommendation_requests: z.number(),
  storage: z.string(),
  uptime_seconds: z.number(),
  active_model: z.string(),
});

const eventSchema = z.object({
  event_id: z.string(),
  user_id: z.string(),
  content_id: z.string().nullable().optional(),
  event_type: z.string(),
  timestamp: z.string(),
  session_id: z.string(),
  context: z.record(z.string(), z.unknown()),
  surface: z.string(),
  schema_version: z.number(),
});

const interestSchema = z.object({
  topic: z.string(),
  weight: z.number(),
  evidence_count: z.number(),
});

const interestsSchema = z.object({
  user_id: z.string(),
  source: z.string(),
  long_term: z.array(interestSchema),
  recent: z.array(interestSchema),
  score_type: z.string(),
});

const profileSchema = z.object({
  user_id: z.string(),
  representation: z.string(),
  observed_event_count: z.number(),
  profile_version: z.number(),
  long_term_interest_count: z.number(),
  recent_interest_count: z.number(),
  inferred_sensitive_attributes: z.array(z.string()),
});

const historySchema = z.object({
  user_id: z.string(),
  items: z.array(eventSchema),
  next_cursor: z.number().nullable(),
});

const scoreComponentsSchema = z.object({
  relevance: z.number(),
  recency: z.number(),
  diversity: z.number(),
  quality: z.number(),
  learned_prior: z.number().optional(),
});

const recommendationSchema = z.object({
  content_id: z.string(),
  title: z.string(),
  category: z.string(),
  description: z.string(),
  score: z.number(),
  score_type: z.string(),
  components: scoreComponentsSchema,
  explanation: z.string(),
  model_version: z.string(),
});

const recommendationsSchema = z.object({
  user_id: z.string(),
  model_version: z.string(),
  fallback_used: z.boolean(),
  items: z.array(recommendationSchema),
});

const modelSchema = z.object({
  id: z.string(),
  architecture: z.string(),
  dataset_version: z.string(),
  parameters: z.record(z.string(), z.unknown()),
  metrics: z.record(z.string(), z.unknown()).nullable(),
  artifact_uri: z.string().nullable(),
  trained_at: z.string().nullable(),
  status: z.string(),
});

const modelsSchema = z.object({ items: z.array(modelSchema) });

const experimentSchema = z.object({
  id: z.string(),
  name: z.string(),
  control: z.string(),
  treatment: z.string(),
  allocation: z.number(),
  status: z.string(),
  created_at: z.string(),
});

const experimentsSchema = z.object({ items: z.array(experimentSchema) });

export type Overview = z.infer<typeof overviewSchema>;
export type UserProfile = z.infer<typeof profileSchema>;
export type Interests = z.infer<typeof interestsSchema>;
export type History = z.infer<typeof historySchema>;
export type RecommendationResponse = z.infer<typeof recommendationsSchema>;
export type ModelVersion = z.infer<typeof modelSchema>;
export type Experiment = z.infer<typeof experimentSchema>;

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

const clientIdStorageKey = "affinity.client-id.v1";

function browserClientId(): string | null {
  if (typeof window === "undefined") return null;
  let clientId = window.localStorage.getItem(clientIdStorageKey);
  if (!clientId) {
    clientId = `web_${crypto.randomUUID().replaceAll("-", "")}`;
    window.localStorage.setItem(clientIdStorageKey, clientId);
  }
  return clientId;
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const clientId = browserClientId();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(clientId ? { "x-affinity-client-id": clientId } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error;
    throw new ApiClientError(
      error?.message || `Affinity API returned ${response.status}`,
      response.status,
      error?.code,
    );
  }
  return schema.parse(payload);
}

export const api = {
  health: () => request("/health", healthSchema),
  overview: () => request("/v1/overview", overviewSchema),
  profile: (userId: string) =>
    request(`/v1/users/${encodeURIComponent(userId)}`, profileSchema),
  interests: (userId: string) =>
    request(
      `/v1/users/${encodeURIComponent(userId)}/interests`,
      interestsSchema,
    ),
  history: (userId: string) =>
    request(
      `/v1/users/${encodeURIComponent(userId)}/history?limit=50`,
      historySchema,
    ),
  recommendations: (
    userId: string,
    options: { diversity: number; freshness: number; limit?: number },
  ) => {
    const freshness = options.freshness / 100;
    const diversity = options.diversity / 100;
    const parameters = new URLSearchParams({
      limit: String(options.limit ?? 10),
      relevance_weight: String(Math.max(0.15, 0.7 - freshness * 0.3)),
      recency_weight: String(0.1 + freshness * 0.4),
      quality_weight: "0.25",
      diversity_weight: String(diversity),
    });
    return request(
      `/v1/recommendations/${encodeURIComponent(userId)}?${parameters}`,
      recommendationsSchema,
    );
  },
  models: () => request("/v1/models", modelsSchema),
  experiments: () => request("/v1/experiments", experimentsSchema),
  ingest: (input: {
    userId: string;
    contentId?: string;
    eventType: string;
    category?: string;
  }) =>
    request(
      "/v1/events",
      z.object({ event_id: z.string(), status: z.string() }),
      {
        method: "POST",
        body: JSON.stringify({
          event_id: crypto.randomUUID(),
          user_id: input.userId,
          content_id: input.contentId || null,
          event_type: input.eventType,
          timestamp: new Date().toISOString(),
          session_id: `console-${new Date().toISOString().slice(0, 10)}`,
          context: input.category ? { category: input.category } : {},
          surface: "developer_console",
          schema_version: 1,
        }),
      },
    ),
};
