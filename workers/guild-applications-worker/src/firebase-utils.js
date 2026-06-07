import { logWorkerEvent } from "./logger.js";
import { kvGetJson, kvPutJson } from "./kv-utils.js";

export function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlEncodeString(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(String(value || "")));
}

export function pemToArrayBuffer(pem) {
  const body = String(pem || "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function requireFirebaseConfig(env) {
  const projectId = String(env.FIREBASE_PROJECT_ID || "").trim();
  const clientEmail = String(env.FIREBASE_CLIENT_EMAIL || "").trim();
  const privateKey = String(env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  const missing = [];
  if (!projectId) missing.push("FIREBASE_PROJECT_ID");
  if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");
  if (missing.length) throw new Error(`Firebase configuration is missing: ${missing.join(", ")}`);
  return { projectId, clientEmail, privateKey };
}

export async function createFirebaseJwt(env) {
  const { clientEmail, privateKey } = requireFirebaseConfig(env);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

/** Firebase OAuth token cache stored in KV; memory is only a development fallback. */
export async function getFirebaseAccessToken(env) {
  const cached = await kvGetJson(env, "firebase-auth-token").catch(() => null);
  if (cached?.accessToken && Number(cached.expiresAt || 0) > Date.now() + 60_000) return cached.accessToken;

  const assertion = await createFirebaseJwt(env);
  const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) throw new Error(data?.error_description || data?.error || `Firebase auth HTTP ${response.status}`);

  const expiresIn = Math.max(300, Number(data.expires_in || 3600) - 60);
  const item = { accessToken: data.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  await kvPutJson(env, "firebase-auth-token", item, expiresIn).catch((error) => {
    logWorkerEvent("warn", "firebase.auth_cache.write_failed", { message: error?.message });
  });
  return item.accessToken;
}

export function firestoreBaseUrl(env) {
  const { projectId } = requireFirebaseConfig(env);
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
}

export async function firebaseFetch(env, url, init = {}) {
  const token = await getFirebaseAccessToken(env);
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
      accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const raw = await response.text().catch(() => "");
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!response.ok) throw new Error(data?.error?.message || raw || `Firebase HTTP ${response.status}`);
  return data;
}
