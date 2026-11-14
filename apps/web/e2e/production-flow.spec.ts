import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = {
      "access-control-allow-origin": "http://127.0.0.1:4317",
      "access-control-allow-headers": "content-type,x-affinity-client-id",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    };
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors });
    }
    if (url.pathname === "/health") {
      return route.fulfill({
        contentType: "application/json",
        headers: cors,
        body: JSON.stringify({ status: "ok", service: "affinity-test" }),
      });
    }
    if (url.pathname === "/v1/overview") {
      return route.fulfill({
        contentType: "application/json",
        headers: cors,
        body: JSON.stringify({
          total_users: 4,
          total_content_items: 12,
          total_events: 21,
          total_experiments: 1,
          recommendation_requests: 8,
          storage: "d1",
          uptime_seconds: 120,
          active_model: "behavioral-prior-v1",
        }),
      });
    }
    if (url.pathname.startsWith("/v1/recommendations/")) {
      return route.fulfill({
        contentType: "application/json",
        headers: cors,
        body: JSON.stringify({
          user_id: "usr_4f91",
          model_version: "behavioral-prior-v1",
          fallback_used: false,
          items: [
            {
              content_id: "item_301",
              title: "Measuring representation drift in production",
              category: "ml_operations",
              description: "Production drift monitoring.",
              score: 0.91,
              score_type: "heuristic_policy_score",
              components: {
                relevance: 0.9,
                recency: 0.8,
                diversity: 1,
                quality: 0.91,
                learned_prior: 0.86,
              },
              explanation: "Matches observed behavior.",
              model_version: "behavioral-prior-v1",
            },
          ],
        }),
      });
    }
    if (url.pathname === "/v1/events" && request.method() === "POST") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        headers: cors,
        body: JSON.stringify({ event_id: "event-test", status: "accepted" }),
      });
    }
    if (url.pathname.startsWith("/v1/users/") && request.method() === "DELETE") {
      return route.fulfill({
        contentType: "application/json",
        headers: cors,
        body: JSON.stringify({
          user_id: decodeURIComponent(url.pathname.split("/").at(-1) || ""),
          deleted_events: 3,
          status: "deleted",
        }),
      });
    }
    return route.continue();
  });
});

test("run playground opens live ranked results", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Live API connected").first()).toBeVisible();
  await page.getByRole("button", { name: "Run playground" }).click();
  await expect(
    page.getByRole("heading", { name: "Recommendation playground" }),
  ).toBeVisible();
  await expect(
    page.getByText("Measuring representation drift in production"),
  ).toBeVisible();
  await expect(page.getByText("API unavailable")).toHaveCount(0);
});

test("event composer writes a durable signal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ingest event" }).click();
  await expect(page.getByText("accepted", { exact: true })).toBeVisible();
});

test("user explorer confirms and completes privacy deletion", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "User explorer" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete data" }).click();
  await expect(page.getByRole("button", { name: "Deleted 3" })).toBeVisible();
});
