import { logWorkerEvent } from "./logger.js";
import { kvGetJson, kvPutJson } from "./kv-utils.js";

export function isSequentialApplicationNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number < 1000000;
}

async function allocateWithFirestoreCounter(env, adapters) {
  const { firebaseFetch, firestoreBaseUrl, firestoreFields, parseFirestoreFields, readMaxFirebaseApplicationNumber } = adapters;
  if (!firebaseFetch || !firestoreBaseUrl || !firestoreFields || !parseFirestoreFields) return null;

  const base = firestoreBaseUrl(env);
  const counterDoc = `${base}/dashboardCounters/applicationNumbers`;
  const begin = await firebaseFetch(env, `${base}:beginTransaction`, {
    method: "POST",
    body: JSON.stringify({ options: { readWrite: {} } }),
  });
  const transaction = begin?.transaction;
  if (!transaction) return null;

  try {
    const batch = await firebaseFetch(env, `${base}:batchGet`, {
      method: "POST",
      body: JSON.stringify({ documents: [counterDoc], transaction }),
    });
    const found = Array.isArray(batch) ? batch.find((row) => row?.found)?.found : null;
    const currentFields = found?.fields ? parseFirestoreFields(found.fields) : {};
    let current = Number(currentFields.value || currentFields.next || 0);
    if (!isSequentialApplicationNumber(current)) current = await readMaxFirebaseApplicationNumber(env);
    const next = current + 1;
    if (!isSequentialApplicationNumber(next)) throw new Error("Application counter overflow.");

    await firebaseFetch(env, `${base}:commit`, {
      method: "POST",
      body: JSON.stringify({
        transaction,
        writes: [
          {
            update: {
              name: counterDoc,
              fields: firestoreFields({
                value: next,
                updatedAt: new Date().toISOString(),
                updatedAtMs: Date.now(),
                source: "worker-firestore-transaction",
              }),
            },
          },
        ],
      }),
    });
    return next;
  } catch (error) {
    await firebaseFetch(env, `${base}:rollback`, {
      method: "POST",
      body: JSON.stringify({ transaction }),
    }).catch(() => null);
    throw error;
  }
}

/**
 * Primary allocator: Firestore transaction counter.
 * Fallback allocator: KV high-water mark + existing create-document conflict retry.
 */
export async function allocateSequentialApplicationNumber(env, adapters) {
  try {
    const number = await allocateWithFirestoreCounter(env, adapters);
    if (isSequentialApplicationNumber(number)) {
      await rememberAllocatedApplicationNumber(env, number);
      return number;
    }
  } catch (error) {
    logWorkerEvent("warn", "applications.sequence.firestore_counter_failed", { message: error?.message });
  }

  const key = "applications:sequence";
  const cached = await kvGetJson(env, key).catch(() => null);
  let current = Number(cached?.value || 0);
  if (!isSequentialApplicationNumber(current)) current = await adapters.readMaxFirebaseApplicationNumber(env);
  const next = current + 1;
  await kvPutJson(env, key, { value: next, updatedAt: new Date().toISOString() }, 7 * 24 * 60 * 60).catch((error) => {
    logWorkerEvent("warn", "applications.sequence.kv_write_failed", { message: error?.message });
  });
  return next;
}

export async function rememberAllocatedApplicationNumber(env, number) {
  if (!isSequentialApplicationNumber(number)) return;
  await kvPutJson(env, "applications:sequence", { value: number, updatedAt: new Date().toISOString() }, 7 * 24 * 60 * 60).catch(() => {});
}
