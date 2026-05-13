import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import { createStableProfileId } from "@/lib/profileIds";

export type DashboardProfileDeleteResult =
  | { deleted: number; profileIds: string[]; reason: "deleted" }
  | { deleted: 0; profileIds: string[]; reason: "invalid-discord-id" | "invalid-profile-id" | "firebase-not-configured" | "not-found" };

function clearProfileDerivedCaches() {
  (globalThis as typeof globalThis & { __mistblossomCharacterProfileLinksCache?: unknown }).__mistblossomCharacterProfileLinksCache = undefined;
}

export async function deleteDashboardProfileById(profileId: string): Promise<boolean> {
  const cleanProfileId = String(profileId || "").trim();
  if (!/^id[a-f0-9]{16,40}$/.test(cleanProfileId)) return false;
  if (!hasFirebaseProfileConfig()) return false;

  await getFirebaseAdminDb().collection("dashboardProfiles").doc(cleanProfileId).delete();
  clearProfileDerivedCaches();
  return true;
}

export async function deleteDashboardProfilesByDiscordUserId(discordUserId: string): Promise<DashboardProfileDeleteResult> {
  const cleanDiscordId = String(discordUserId || "").trim();
  if (!/^\d{16,25}$/.test(cleanDiscordId)) {
    return { deleted: 0, profileIds: [], reason: "invalid-discord-id" };
  }
  if (!hasFirebaseProfileConfig()) {
    return { deleted: 0, profileIds: [], reason: "firebase-not-configured" };
  }

  const db = getFirebaseAdminDb();
  const refs = new Map<string, any>();

  const stableProfileId = await createStableProfileId("discord", cleanDiscordId);
  const stableRef = db.collection("dashboardProfiles").doc(stableProfileId);
  const stableSnapshot = await stableRef.get().catch(() => null);
  if (stableSnapshot?.exists) refs.set(stableProfileId, stableRef);

  const byProviderUserId = await db.collection("dashboardProfiles")
    .where("providerUserId", "==", cleanDiscordId)
    .limit(50)
    .get()
    .catch(() => null);

  for (const doc of byProviderUserId?.docs || []) {
    const raw = doc.data() || {};
    if (raw.provider && raw.provider !== "discord") continue;
    refs.set(doc.id, doc.ref);
  }

  for (const field of ["discordId", "discordUserId"]) {
    const snapshot = await db.collection("dashboardProfiles")
      .where(field, "==", cleanDiscordId)
      .limit(20)
      .get()
      .catch(() => null);
    for (const doc of snapshot?.docs || []) refs.set(doc.id, doc.ref);
  }

  if (!refs.size) return { deleted: 0, profileIds: [], reason: "not-found" };

  const batch = db.batch();
  for (const ref of refs.values()) batch.delete(ref);
  await batch.commit();
  clearProfileDerivedCaches();

  return { deleted: refs.size, profileIds: Array.from(refs.keys()), reason: "deleted" };
}
