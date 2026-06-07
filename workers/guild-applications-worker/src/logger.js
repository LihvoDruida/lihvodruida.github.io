/**
 * Shared structured logging for the Cloudflare Worker modules.
 * The sanitizer is intentionally conservative: logs remain useful but never leak tokens.
 */
export function safeLogValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 4) return "[max-depth]";
  if (typeof value === "string") {
    return value
      .replace(/ghp_[A-Za-z0-9_]+/g, "[redacted]")
      .replace(/github_pat_[A-Za-z0-9_]+/g, "[redacted]")
      .replace(/Bot\s+[A-Za-z0-9._-]+/g, "Bot [redacted]")
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
      .slice(0, 700);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => safeLogValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).slice(0, 60).map(([key, item]) => [
        key,
        /token|secret|password|authorization|cookie|signature|private_key/i.test(key)
          ? "[redacted]"
          : safeLogValue(item, depth + 1),
      ])
    );
  }
  return String(value).slice(0, 240);
}

export function nowMs() {
  return Date.now();
}

export function elapsedMs(startedAt) {
  return Math.max(0, nowMs() - startedAt);
}

export function requestIdFromRequest(request) {
  return (
    request.headers.get("CF-Ray") ||
    request.headers.get("X-Request-ID") ||
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
  );
}

export function logWorkerEvent(level, event, details = {}) {
  const payload = safeLogValue({ event, time: new Date().toISOString(), ...details });
  const line = "[guild-worker:" + level + "] " + JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function withTelemetryHeaders(response, requestId, startedAt) {
  try {
    response.headers.set("X-Guild-Worker-Request-Id", requestId);
    response.headers.set("X-Guild-Worker-Duration-Ms", String(elapsedMs(startedAt)));
  } catch {
    // Some platform responses may have immutable headers. Ignore telemetry injection.
  }
  return response;
}
