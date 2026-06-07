import { securityHeaders } from "./security.js";

export function buildCorsHeaders(corsOrigin, status = 200) {
  return securityHeaders({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": corsOrigin || "null",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Worker-Stats-Token, X-Idempotency-Key",
    "Access-Control-Max-Age": status === 204 ? "86400" : "0",
    Vary: "Origin",
  });
}

export function json(data, status = 200, corsOrigin = "*") {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: buildCorsHeaders(corsOrigin, status),
  });
}

export function optionsResponse(corsOrigin) {
  return new Response(null, { status: 204, headers: buildCorsHeaders(corsOrigin || "null", 204) });
}
