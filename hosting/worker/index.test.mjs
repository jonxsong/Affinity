import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./index.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const worker = await import(moduleUrl);

test("cold-start ranking returns diverse explained content", () => {
  const result = worker.rankContent(
    [],
    { limit: 5 },
    Date.parse("2026-11-14T12:00:00Z"),
  );
  assert.equal(result.fallback_used, true);
  assert.equal(result.items.length, 5);
  assert.equal(new Set(result.items.map((item) => item.category)).size, 5);
  assert.ok(
    result.items.every((item) => item.explanation.includes("Cold-start")),
  );
});

test("positive events personalize ranking and filter seen content", () => {
  const events = [
    {
      content_id: "item_101",
      event_type: "save",
      timestamp: "2026-11-14T11:00:00Z",
      context_json: "{}",
    },
  ];
  const result = worker.rankContent(
    events,
    { limit: 10 },
    Date.parse("2026-11-14T12:00:00Z"),
  );
  assert.equal(result.fallback_used, false);
  assert.equal(
    result.items.some((item) => item.content_id === "item_101"),
    false,
  );
  assert.equal(result.items[0].category, "applied_ml");
});

test("portable serving model contributes a learned prior", () => {
  const model = {
    schema_version: 1,
    model_id: "behavioral-prior-v1",
    trained_at: "2026-11-14T12:00:00Z",
    training_event_count: 20,
    category_scores: { design_tools: 0.99 },
    content_scores: {},
  };
  const result = worker.rankContent(
    [],
    { limit: 12 },
    Date.parse("2026-11-14T12:00:00Z"),
    model,
  );
  assert.equal(result.items[0].category, "design_tools");
  assert.equal(result.items[0].model_version, "behavioral-prior-v1");
  assert.equal(result.items[0].components.learned_prior, 0.99);
});

test("health endpoint validates the D1 binding", async () => {
  const DB = { prepare: () => ({ first: async () => ({ ok: 1 }) }) };
  const response = await worker.default.fetch(
    new Request("https://affinity.test/health"),
    { DB },
    {},
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "affinity-sites-api",
    version: "1",
  });
});
