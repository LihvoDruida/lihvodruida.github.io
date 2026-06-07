import { logWorkerEvent } from "./logger.js";
import { getConfig } from "./config.js";

export function securityHeaders(extra = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    ...extra,
  };
}

export function structuredErrorResponse(message, status = 500, requestId = "", extraHeaders = {}) {
  return new Response(JSON.stringify({ ok: false, error: message, request_id: requestId || undefined }), {
    status,
    headers: securityHeaders({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }),
  });
}

export function hexToBytes(hex) {
  const clean = String(hex || "").trim();
  if (!clean || clean.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean)) return new Uint8Array();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  return bytes;
}

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export async function verifyTokenValue(provided, expected) {
  if (!expected) return true;
  if (!provided) return false;
  const [left, right] = await Promise.all([sha256Hex(provided), sha256Hex(expected)]);
  return constantTimeEqual(left, right);
}

export async function verifyBearerToken(request, expected) {
  const auth = request.headers.get("Authorization") || request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return verifyTokenValue(bearer, expected);
}

export async function verifyStatsToken(request, expected) {
  const provided = String(request.headers.get("X-Worker-Stats-Token") || request.headers.get("x-worker-stats-token") || "").trim();
  return verifyTokenValue(provided, expected);
}

export async function verifyBearerOrStatsToken(request, expected) {
  if (!expected) return true;
  const auth = request.headers.get("Authorization") || request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const stats = String(request.headers.get("X-Worker-Stats-Token") || request.headers.get("x-worker-stats-token") || "").trim();
  return verifyTokenValue(bearer || stats, expected);
}

/** Verify Discord Ed25519 signature with a strict replay window. */
export async function verifyDiscordRequest(request, env, rawBody) {
  const publicKey = String(env.DISCORD_PUBLIC_KEY || "").trim();
  if (!publicKey) return false;

  const signature = request.headers.get("X-Signature-Ed25519") || "";
  const timestamp = request.headers.get("X-Signature-Timestamp") || "";
  if (!signature || !timestamp) return false;

  const timestampMs = Number(timestamp) * 1000;
  const skewMs = Math.abs(Date.now() - timestampMs);
  const maxSkewMs = getConfig(env).discordSignatureSkewMs;
  if (!Number.isFinite(timestampMs) || skewMs > maxSkewMs) {
    logWorkerEvent("warn", "discord.signature.timestamp_rejected", { skewMs, maxSkewMs });
    return false;
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKey),
      { name: "Ed25519", namedCurve: "Ed25519" },
      false,
      ["verify"]
    );
    return crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      hexToBytes(signature),
      new TextEncoder().encode(timestamp + rawBody)
    );
  } catch (error) {
    logWorkerEvent("warn", "discord.signature.verify_failed", { message: error?.message });
    return false;
  }
}
