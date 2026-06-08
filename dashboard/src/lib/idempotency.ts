import "server-only";

import { createHash, randomUUID } from "crypto";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";

type StoredAction<T> = {
  status: "pending" | "done";
  value?: T;
  expiresAt: number;
};

type IdempotentActionStatus =
  | "SKIP"
  | "MISS"
  | "HIT"
  | "PENDING"
  | "LOCAL_MISS"
  | "LOCAL_HIT"
  | "LOCAL_PENDING";

type IdempotentActionOptions<T> = {
  namespace: string;
  key?: string | null;
  ttlMs?: number;
  pendingValue: T;
  action: () => Promise<T>;
};

declare global {
  // eslint-disable-next-line no-var
  var __mistblossomIdempotentActions:
    | Map<string, StoredAction<unknown>>
    | undefined;
}

const IDEMPOTENCY_COLLECTION = "dashboardIdempotency";
const DEFAULT_TTL_MS = 90_000;
const MAX_LOCAL_ITEMS = 1000;

function localStore() {
  const map = globalThis.__mistblossomIdempotentActions || new Map<string, StoredAction<unknown>>();
  globalThis.__mistblossomIdempotentActions = map;
  const now = Date.now();
  if (map.size > MAX_LOCAL_ITEMS) {
    for (const [key, item] of map) {
      if (item.expiresAt <= now) map.delete(key);
    }
  }
  return map;
}

function cleanNamespace(value: string) {
  return String(value || "action").replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 80) || "action";
}

export function cleanIdempotencyKey(value: unknown) {
  const key = String(value || "").trim();
  return /^[A-Za-z0-9:._-]{12,220}$/.test(key) ? key : "";
}

function docId(namespace: string, key: string) {
  return createHash("sha256").update(`${cleanNamespace(namespace)}:${key}`).digest("hex");
}

function localKey(namespace: string, key: string) {
  return `${cleanNamespace(namespace)}:${key}`;
}

function safeParse<T>(value: unknown): T | null {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

async function runLocalIdempotent<T>(
  namespace: string,
  key: string,
  ttlMs: number,
  pendingValue: T,
  action: () => Promise<T>,
): Promise<{ value: T; status: IdempotentActionStatus }> {
  const store = localStore();
  const itemKey = localKey(namespace, key);
  const now = Date.now();
  const existing = store.get(itemKey) as StoredAction<T> | undefined;
  if (existing && existing.expiresAt > now) {
    return {
      value: existing.status === "done" && existing.value !== undefined ? existing.value : pendingValue,
      status: existing.status === "done" ? "LOCAL_HIT" : "LOCAL_PENDING",
    };
  }

  store.set(itemKey, { status: "pending", expiresAt: now + ttlMs });
  try {
    const value = await action();
    store.set(itemKey, { status: "done", value, expiresAt: Date.now() + ttlMs });
    return { value, status: "LOCAL_MISS" };
  } catch (error) {
    store.delete(itemKey);
    throw error;
  }
}

export async function runIdempotentAction<T>({
  namespace,
  key,
  ttlMs = DEFAULT_TTL_MS,
  pendingValue,
  action,
}: IdempotentActionOptions<T>): Promise<{ value: T; status: IdempotentActionStatus }> {
  const cleanKey = cleanIdempotencyKey(key);
  const safeTtlMs = Math.max(10_000, Math.min(10 * 60_000, Math.floor(ttlMs)));
  if (!cleanKey) return { value: await action(), status: "SKIP" };

  if (!hasFirebaseProfileConfig()) {
    return runLocalIdempotent(namespace, cleanKey, safeTtlMs, pendingValue, action);
  }

  const ownerId = randomUUID();
  const now = Date.now();
  const expiresAtMs = now + safeTtlMs;
  const db = getFirebaseAdminDb();
  const ref = db.collection(IDEMPOTENCY_COLLECTION).doc(docId(namespace, cleanKey));

  let claim: { value: T; status: "MISS" | "HIT" | "PENDING" };
  try {
    claim = await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() || {} : {};
      const existingExpiresAtMs = Number(data.expiresAtMs || 0);
      if (snap.exists && existingExpiresAtMs > now) {
        if (data.status === "done") {
          const parsed = safeParse<T>(data.resultJson);
          if (parsed !== null) return { value: parsed, status: "HIT" as const };
        }
        return { value: pendingValue, status: "PENDING" as const };
      }

      tx.set(ref, {
        namespace: cleanNamespace(namespace),
        keyPreview: cleanKey.slice(0, 120),
        ownerId,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAtMs,
      });
      return { value: pendingValue, status: "MISS" as const };
    });
  } catch (error) {
    console.warn("[idempotency] Distributed action claim failed; using local guard", {
      namespace: cleanNamespace(namespace),
      message: error instanceof Error ? error.message : String(error),
    });
    return runLocalIdempotent(namespace, cleanKey, safeTtlMs, pendingValue, action);
  }

  if (claim.status !== "MISS") return claim;

  const itemKey = localKey(namespace, cleanKey);
  const local = localStore();
  local.set(itemKey, { status: "pending", expiresAt: expiresAtMs });

  let value: T;
  try {
    value = await action();
  } catch (error) {
    local.delete(itemKey);
    await ref.delete().catch(() => undefined);
    throw error;
  }

  const resultJson = safeStringify(value);
  const doneExpiresAtMs = Date.now() + safeTtlMs;
  try {
    await ref.set({
      ownerId,
      status: "done",
      resultJson,
      resultSize: resultJson.length,
      updatedAt: FieldValue.serverTimestamp(),
      expiresAtMs: doneExpiresAtMs,
    }, { merge: true });
  } catch (error) {
    console.warn("[idempotency] Distributed action result write failed; keeping local result", {
      namespace: cleanNamespace(namespace),
      message: error instanceof Error ? error.message : String(error),
    });
  }

  local.set(itemKey, { status: "done", value, expiresAt: doneExpiresAtMs });
  return { value, status: "MISS" };
}

export function idempotencyHeader(status: IdempotentActionStatus) {
  return status === "SKIP" ? undefined : status;
}
