import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { DashboardRole, DashboardSession } from "@/lib/auth";
import { createStableProfileId } from "@/lib/auth";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";

export type DashboardProfile = {
  profileId: string;
  provider: DashboardSession["provider"];
  providerUserId: string;
  displayName: string;
  login?: string | null;
  role: DashboardRole;
  avatarUrl?: string | null;
  discordRoleIds: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
  lastLoginAt?: string | null;
};

function timestampToIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  const maybeTimestamp = value as { toDate?: () => Date } | null;
  if (maybeTimestamp && typeof maybeTimestamp.toDate === "function") {
    return maybeTimestamp.toDate().toISOString();
  }
  return null;
}

function cleanRole(value: unknown): DashboardRole {
  return value === "admin" || value === "moderator" || value === "member" ? value : "member";
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.slice(0, 500) : null;
}

function normalizeProfile(profileId: string, data: Record<string, unknown>): DashboardProfile {
  return {
    profileId,
    provider: data.provider === "github" || data.provider === "token" ? data.provider : "discord",
    providerUserId: String(data.providerUserId || ""),
    displayName: String(data.displayName || data.login || "Guild member").slice(0, 120),
    login: data.login ? String(data.login).slice(0, 120) : null,
    role: cleanRole(data.role),
    avatarUrl: optionalString(data.avatarUrl),
    discordRoleIds: Array.isArray(data.discordRoleIds)
      ? data.discordRoleIds.map((roleId: unknown) => String(roleId || "").trim()).filter(Boolean).slice(0, 100)
      : [],
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    lastLoginAt: timestampToIso(data.lastLoginAt),
  };
}

export async function getOwnProfilePath(session: DashboardSession) {
  const profileId = session.profileId || (await createStableProfileId(session.provider, session.id));
  return `/profile/${profileId}`;
}

export function canViewProfile(viewer: DashboardSession | null | undefined, profileId: string) {
  if (!viewer) return false;
  if (viewer.role === "admin" || viewer.role === "moderator") return true;
  return Boolean(viewer.profileId && viewer.profileId === profileId);
}

export function canManageProfiles(viewer: DashboardSession | null | undefined) {
  return Boolean(viewer && (viewer.role === "admin" || viewer.role === "moderator"));
}

export async function upsertProfileFromSession(session: DashboardSession) {
  const profileId = session.profileId || (await createStableProfileId(session.provider, session.id));
  const profile: DashboardProfile = {
    profileId,
    provider: session.provider,
    providerUserId: session.id,
    displayName: session.name || session.login || "Guild member",
    login: session.login || null,
    role: session.role,
    avatarUrl: session.avatar_url || session.avatar || null,
    discordRoleIds: Array.from(new Set((session.discordRoleIds || []).map((roleId) => String(roleId || "").trim()).filter(Boolean))).slice(0, 100),
  };

  if (!hasFirebaseProfileConfig()) {
    return { profile, stored: false, reason: "firebase-not-configured" as const };
  }

  const db = getFirebaseAdminDb();
  const ref = db.collection("dashboardProfiles").doc(profileId);
  const snapshot = await ref.get();
  await ref.set({
    profileId,
    provider: profile.provider,
    providerUserId: profile.providerUserId,
    displayName: profile.displayName,
    login: profile.login || null,
    role: profile.role,
    avatarUrl: profile.avatarUrl || null,
    discordRoleIds: profile.discordRoleIds,
    updatedAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
    ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });

  return { profile, stored: true };
}

export async function getProfileById(profileId: string) {
  if (!/^id[a-f0-9]{16,40}$/.test(profileId)) return null;
  if (!hasFirebaseProfileConfig()) return null;

  const snapshot = await getFirebaseAdminDb().collection("dashboardProfiles").doc(profileId).get();
  if (!snapshot.exists) return null;
  return normalizeProfile(profileId, snapshot.data() || {});
}

export function profileFromSession(session: DashboardSession): DashboardProfile {
  return {
    profileId: session.profileId || "",
    provider: session.provider,
    providerUserId: session.id,
    displayName: session.name || session.login || "Guild member",
    login: session.login || null,
    role: session.role,
    avatarUrl: session.avatar_url || session.avatar || null,
    discordRoleIds: session.discordRoleIds || [],
  };
}
