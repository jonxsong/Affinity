import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, api } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Affinity API client", () => {
  it("validates overview responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        total_users: 4,
        total_content_items: 12,
        total_events: 28,
        total_experiments: 1,
        recommendation_requests: 9,
        storage: "d1",
        uptime_seconds: 120,
        active_model: "affinity-ranker-v1",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.overview()).resolves.toMatchObject({
      total_events: 28,
      storage: "d1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/overview",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("turns structured API errors into typed client errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: "validation_error", message: "invalid event" } },
            { status: 422 },
          ),
        ),
    );
    await expect(api.overview()).rejects.toEqual(
      new ApiClientError("invalid event", 422, "validation_error"),
    );
  });
});
