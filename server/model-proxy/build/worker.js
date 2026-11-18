var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// protocol.mjs
var DEFAULT_MODEL = "doubao-seed-2-1-lite-260915";
var DEFAULT_RESPONSES_URL = "https://ark.cn-beijing.volces.com/api/v3/responses";
var MAX_BYTES = 8e3;
var WINDOW_MS = 6e4;
var MAX_REQUESTS = 10;
var hits = [];
var INSTRUCTIONS = '\u4F60\u662F\u4F5C\u606F\u6559\u7EC3\u3002\u53EA\u6839\u636E\u8FD9\u6B21\u8F93\u5165\u91CC\u7684\u6458\u8981\u56DE\u7B54\uFF0C\u4E0D\u8981\u8BCA\u65AD\u6216\u6CBB\u7597\uFF0C\u4E0D\u8981\u5B89\u6392\u901A\u77E5\uFF0C\u4E0D\u8981\u63A7\u5236\u8BBE\u5907\u6216\u624B\u73AF\u3002\u6570\u636E\u4E0D\u591F\u5C31\u76F4\u63A5\u8BF4\u4E0D\u591F\u3002\u7528\u7B80\u77ED\u4E2D\u6587\u3002\u82E5\u8981\u63D0\u8BAE\u4E00\u4E2A\u4EFB\u52A1\uFF0C\u5728\u6B63\u6587\u540E\u53E6\u8D77\u4E00\u884C\u53EA\u7ED9\u4E00\u4E2A JSON\uFF1A{"proposals":[{"title":"","detail":""}]}\u3002\u6CA1\u6709\u5408\u9002\u4EFB\u52A1\u5C31\u4E0D\u8981\u5199 JSON\u3002';
function binding(env, key) {
  try {
    const value = env?.[key];
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}
__name(binding, "binding");
function responsesUrl(env) {
  const explicit = binding(env, "VOLC_ARK_RESPONSES_URL");
  if (explicit) return explicit;
  const base = binding(env, "VOLC_ARK_BASE_URL");
  if (base) return `${base.replace(/\/$/, "")}/api/v3/responses`;
  return DEFAULT_RESPONSES_URL;
}
__name(responsesUrl, "responsesUrl");
function modelName(env) {
  return binding(env, "VOLC_ARK_MODEL") || binding(env, "VOLC_ARK_ENDPOINT_ID") || DEFAULT_MODEL;
}
__name(modelName, "modelName");
function buildResponsesBody({ summary, turns = [], model }) {
  const input = [];
  for (const turn of turns.slice(-6)) {
    const text = String(turn?.text || "").slice(0, 500);
    if (!text) continue;
    if (turn.role === "assistant") {
      input.push({ type: "message", role: "assistant", content: [{ type: "output_text", text }] });
    } else {
      input.push({ type: "message", role: "user", content: [{ type: "input_text", text }] });
    }
  }
  input.push({ type: "message", role: "user", content: [{ type: "input_text", text: String(summary || "").slice(0, 2e3) }] });
  return {
    model,
    instructions: INSTRUCTIONS,
    input,
    stream: false,
    store: false,
    max_output_tokens: 256,
    thinking: { type: "disabled" }
  };
}
__name(buildResponsesBody, "buildResponsesBody");
function extractOutputText(body) {
  if (typeof body?.output_text === "string" && body.output_text.trim()) return body.output_text.trim();
  const parts = [];
  for (const item of body?.output || []) {
    if (item?.type !== "message") continue;
    for (const block of item.content || []) {
      if (block?.type === "output_text" && typeof block.text === "string" && block.text.trim()) parts.push(block.text.trim());
    }
  }
  return parts.join("\n").trim();
}
__name(extractOutputText, "extractOutputText");
function interpretResponses(httpStatus, body) {
  if (!httpStatus) return { status: "model_failed", reason: "timeout" };
  if (httpStatus < 200 || httpStatus >= 300) return { status: "model_failed", reason: `http_${httpStatus}` };
  if (!body || typeof body !== "object") return { status: "model_failed", reason: "not_json" };
  if (body.error) return { status: "model_failed", reason: "error" };
  if (body.status === "incomplete") return { status: "model_incomplete", reason: body.incomplete_details?.reason || "incomplete" };
  if (body.status === "failed") return { status: "model_failed", reason: "failed" };
  if (body.status !== "completed") return { status: "model_failed", reason: `status_${body.status || "missing"}` };
  const message = (body.output || []).find((item) => item?.type === "message");
  if (message?.status === "incomplete") return { status: "model_incomplete", reason: "message_incomplete" };
  if (message?.status === "failed") return { status: "model_failed", reason: "message_failed" };
  const raw = extractOutputText(body);
  if (!raw) return { status: "model_empty" };
  return { status: "ok", ...splitCoachText(raw) };
}
__name(interpretResponses, "interpretResponses");
function splitCoachText(raw) {
  const match = raw.match(/\{[\s\S]*"proposals"[\s\S]*\}\s*$/);
  if (!match) return { text: raw, proposals: [] };
  try {
    const parsed = JSON.parse(match[0]);
    const proposals = Array.isArray(parsed.proposals) ? parsed.proposals.filter((item) => item && !item.schedulesNotification && !(item.deviceCommands || []).length) : [];
    const text = String(parsed.text || raw.slice(0, match.index).trim() || raw);
    return { text, proposals };
  } catch {
    return { text: raw, proposals: [] };
  }
}
__name(splitCoachText, "splitCoachText");
function sameSecret(left, right) {
  const encoder = new TextEncoder();
  const a = encoder.encode(String(left ?? ""));
  const b = encoder.encode(String(right ?? ""));
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0 && a.length > 0;
}
__name(sameSecret, "sameSecret");
function corsHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS"
  };
}
__name(corsHeaders, "corsHeaders");
function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}
__name(json, "json");
function limited(now) {
  hits.push(now);
  while (hits.length && now - hits[0] > WINDOW_MS) hits.shift();
  return hits.length > MAX_REQUESTS;
}
__name(limited, "limited");
async function handleCoachRequest(request, env = {}, deps = {}) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  const url = new URL(request.url);
  const gate = binding(env, "MODEL_PROXY_TOKEN");
  const volcanoKey = binding(env, "VOLC_ARK_API_KEY");
  const presented = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const authed = Boolean(gate) && sameSecret(presented, gate);
  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    if (!gate) return json({ status: "proxy_unconfigured" }, 503);
    if (!authed) return json({ status: "unauthorized" }, 401);
    return json({ status: volcanoKey ? "ready" : "model_unconfigured", modelConfigured: Boolean(volcanoKey) }, 200);
  }
  if (request.method !== "POST" || url.pathname !== "/v1/coach") return json({ status: "not_found" }, 404);
  if (!gate) return json({ status: "proxy_unconfigured" }, 503);
  if (!authed) return json({ status: "unauthorized" }, 401);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return json({ status: "too_large" }, 413);
  if (limited(deps.now ? deps.now() : Date.now())) return json({ status: "rate_limited" }, 429);
  (deps.log || (() => {
  }))(`coach_request bytes=${new TextEncoder().encode(raw).byteLength}`);
  if (!volcanoKey) return json({ status: "model_unconfigured", modelConfigured: false }, 200);
  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return json({ status: "model_failed", reason: "bad_request" }, 400);
  }
  const summary = typeof payload.summary === "string" ? payload.summary : JSON.stringify(payload.summary || {});
  const body = buildResponsesBody({ summary, turns: Array.isArray(payload.turns) ? payload.turns : [], model: modelName(env) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs || 2e4);
  try {
    const fetchImpl = deps.fetchImpl || fetch;
    const upstream = await fetchImpl(responsesUrl(env), {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${volcanoKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    let parsed = null;
    try {
      parsed = await upstream.json();
    } catch {
      parsed = null;
    }
    return json(interpretResponses(upstream.status, parsed), 200);
  } catch (error) {
    const reason = error?.name === "AbortError" ? "timeout" : "model_failed";
    (deps.log || (() => {
    }))(`model_failed ${reason}`);
    return json({ status: "model_failed", reason }, 200);
  } finally {
    clearTimeout(timer);
  }
}
__name(handleCoachRequest, "handleCoachRequest");

// volc-proxy.mjs
var volc_proxy_default = {
  async fetch(request, env) {
    try {
      return await handleCoachRequest(request, env);
    } catch (error) {
      return new Response(JSON.stringify({ status: "proxy_error", reason: error?.name || "Error" }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }
  }
};
export {
  volc_proxy_default as default
};
