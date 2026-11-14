import http from "k6/http";
import { check } from "k6";
import { randomUUID } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

export const options = {
  scenarios: { ingestion: { executor: "constant-vus", vus: 20, duration: "30s" } },
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<100"] },
};

export default function () {
  const body = JSON.stringify({
    event_id: randomUUID(), user_id: `load_user_${__VU}`, content_id: `item_${__ITER % 500}`,
    event_type: "content_view", timestamp: new Date().toISOString(), session_id: `session_${__VU}`,
    context: { source: "k6" }, surface: "benchmark", schema_version: 1,
  });
  const response = http.post("http://localhost:8080/v1/events", body, { headers: { "Content-Type": "application/json" } });
  check(response, { accepted: (r) => r.status === 202 });
}

