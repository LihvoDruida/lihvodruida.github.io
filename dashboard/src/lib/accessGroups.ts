import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb, hasFirebaseProfileConfig } from "@/lib/firebaseAdmin";
import type { DashboardRole, DashboardSession } from "@/lib/auth";
import {
  DASHBOARD_PERMISSION_KEYS,
  DEFAULT_ADMIN_GROUP_ID,
  DEFAULT_MEMBER_GROUP_ID,
  DEFAULT_MENTOR_GROUP_ID,
  DEFAULT_MODERATOR_GROUP_ID,
  FIXED_GROUP_IDS,
  type AccessGroup,
  type DashboardPermissionKey,
} from "@/lib/accessGroupSchema";

const DEFAULT_GROUPS: AccessGroup[] = [
  {
    id: DEFAULT_ADMIN_GROUP_ID,
    name: "Адмін",
    role: "admin",
    rank: 100,
    lockedId: true,
    protectedGroup: true,
    discordRoleIds: [],
    permissions: [...DASHBOARD_PERMISSION_KEYS],
  },
  {
    id: DEFAULT_MODERATOR_GROUP_ID,
    name: "Модератор",
    role: "moderator",
    rank: 50,
    lockedId: true,
    protectedGroup: true,
    discordRoleIds: [],
    permissions: [
      "dashboard.view",
      "applications.view",
      "applications.manage",
      "applications.sensitive.view",
      "discord.embeds.manage",
      "raids.view",
      "raids.manage",
      "raids.roster.view",
      "guild.roster.view",
      "profiles.view",
      "profiles.access.view",
      "rules.stats.view",
    ],
  },

  {
    id: DEFAULT_MENTOR_GROUP_ID,
    name: "Наставник новачків",
    role: "mentor",
    rank: 20,
    lockedId: false,
    protectedGroup: false,
    discordRoleIds: [],
    permissions: [
      "dashboard.view",
      "applications.view",
      "raids.view",
      "guild.roster.view",
    ],
  },
  {
    id: DEFAULT_MEMBER_GROUP_ID,
    name: "Учасник",
    role: "member",
    rank: 10,
    lockedId: true,
    protectedGroup: true,
    discordRoleIds: [],
    permissions: [
      "dashboard.view",
      "raids.view",
      "guild.roster.view",
    ],
  },
];

function nowIso() {
  return new Date().toISOString();
}

function cleanId(value: unknown) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
}

function cleanName(value: unknown, fallback = "Група") {
  return String(value || fallback).trim().replace(/\s+/g, " ").slice(0, 80) || fallback;
}

function cleanDiscordRoleIds(value: unknown) {
  const items = Array.isArray(value) ? value : String(value || "").split(/[\s,;]+/g);
  return Array.from(new Set(items.map((item) => String(item || "").trim()).filter((item) => /^\d{16,25}$/.test(item)))).slice(0, 50);
}

function cleanPermissions(value: unknown) {
  const allowed = new Set<string>(DASHBOARD_PERMISSION_KEYS);
  const items = Array.isArray(value) ? value : String(value || "").split(/[\s,;]+/g);
  return Array.from(new Set(items.map((item) => String(item || "").trim()).filter((item): item is DashboardPermissionKey => allowed.has(item))));
}

function roleForGroupId(id: string, rank: number): DashboardRole {
  if (id === DEFAULT_ADMIN_GROUP_ID || rank >= 100) return "admin";
  if (id === DEFAULT_MODERATOR_GROUP_ID || rank >= 50) return "moderator";
  return "member";
}

function normalizeGroup(idInput: string, raw: Record<string, unknown> = {}): AccessGroup {
  const id = cleanId(raw.id || idInput);
  const fallback = DEFAULT_GROUPS.find((group) => group.id === id);
  const rank = Number.isFinite(Number(raw.rank)) ? Math.floor(Number(raw.rank)) : fallback?.rank ?? 10;
  const role = raw.role === "admin" || raw.role === "moderator" || raw.role === "mentor" || raw.role === "member"
    ? raw.role
    : fallback?.role || roleForGroupId(id, rank);
  const permissions = cleanPermissions(raw.permissions);

  return {
    id,
    name: cleanName(raw.name, fallback?.name || "Група"),
    role,
    rank,
    lockedId: Boolean(raw.lockedId ?? fallback?.lockedId ?? FIXED_GROUP_IDS.has(id)),
    protectedGroup: Boolean(raw.protectedGroup ?? fallback?.protectedGroup ?? FIXED_GROUP_IDS.has(id)),
    discordRoleIds: cleanDiscordRoleIds(raw.discordRoleIds),
    permissions: permissions.length ? permissions : fallback?.permissions || ["dashboard.view"],
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

function fallbackGroups() {
  return DEFAULT_GROUPS.map((group) => ({ ...group, permissions: [...group.permissions], discordRoleIds: [...group.discordRoleIds] }));
}

function collectionRef() {
  return getFirebaseAdminDb().collection("dashboardAccessGroups");
}

export async function listAccessGroups(): Promise<AccessGroup[]> {
  if (!hasFirebaseProfileConfig()) return fallbackGroups();
  const ref = collectionRef();
  await ensureDefaultAccessGroups();
  const snapshot = await ref.get();
  const groups = snapshot.docs.map((doc: any) => normalizeGroup(doc.id, doc.data()));
  return groups.sort((a: AccessGroup, b: AccessGroup) => b.rank - a.rank || Number(a.id) - Number(b.id) || a.name.localeCompare(b.name, "uk"));
}

export async function ensureDefaultAccessGroups() {
  if (!hasFirebaseProfileConfig()) return fallbackGroups();
  const ref = collectionRef();
  await Promise.all(DEFAULT_GROUPS.map(async (group) => {
    const doc = ref.doc(group.id);
    const snap = await doc.get();
    if (snap.exists) return;
    await doc.set({
      ...group,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }));
  return fallbackGroups();
}

export async function getAccessGroup(groupId: string) {
  const id = cleanId(groupId);
  if (!id) return null;
  const groups = await listAccessGroups();
  return groups.find((group) => group.id === id) || null;
}

export async function resolveAccessGroupFromDiscord(roleIdsInput: string[], userId?: string | null, ownerId?: string | null) {
  const user = String(userId || "").trim();
  const owner = String(ownerId || "").trim();
  const groups = await listAccessGroups();
  const admin = groups.find((group) => group.id === DEFAULT_ADMIN_GROUP_ID) || DEFAULT_GROUPS[0];
  if (user && owner && user === owner) {
    return { group: admin, isServerOwner: true };
  }

  const roleIds = new Set(roleIdsInput.map((roleId) => String(roleId || "").trim()).filter(Boolean));
  const matched = groups
    .filter((group) => group.discordRoleIds.some((roleId) => roleIds.has(roleId)))
    .sort((a, b) => b.rank - a.rank);

  if (matched[0]) return { group: matched[0], isServerOwner: false };

  const member = groups.find((group) => group.id === DEFAULT_MEMBER_GROUP_ID) || DEFAULT_GROUPS.find((group) => group.id === DEFAULT_MEMBER_GROUP_ID) || DEFAULT_GROUPS[DEFAULT_GROUPS.length - 1];
  return { group: member, isServerOwner: false };
}

export function applyAccessGroupToSession(session: DashboardSession, group: AccessGroup, isServerOwner = false): DashboardSession {
  const permissions = isServerOwner ? [...DASHBOARD_PERMISSION_KEYS] : [...group.permissions];
  return {
    ...session,
    role: isServerOwner ? "admin" : group.role,
    groupId: group.id,
    groupName: isServerOwner ? "Власник сервера" : group.name,
    groupRank: isServerOwner ? 1000 : group.rank,
    permissions,
    isServerOwner,
  };
}

export function hasPermission(session: DashboardSession | null | undefined, permission: DashboardPermissionKey) {
  if (!session) return false;
  if (session.isServerOwner) return true;
  if (session.permissions?.length) return Boolean(session.permissions.includes(permission));
  return session.role === "admin";
}

export function canManageGroups(session: DashboardSession | null | undefined) {
  return hasPermission(session, "groups.manage") && session?.role === "admin";
}

export function canEditTargetGroup(viewer: DashboardSession | null | undefined, target: AccessGroup) {
  if (!canManageGroups(viewer)) return false;
  if (!viewer) return false;
  if (viewer.isServerOwner) return true;
  if (target.id === DEFAULT_ADMIN_GROUP_ID) return false;
  if (viewer.groupId && viewer.groupId === target.id) return false;
  return true;
}

export async function upsertAccessGroup(input: {
  id?: unknown;
  currentId?: unknown;
  name?: unknown;
  rank?: unknown;
  discordRoleIds?: unknown;
  permissions?: unknown;
}, viewer: DashboardSession) {
  if (!canManageGroups(viewer)) throw new Error("Недостатньо прав для зміни груп.");
  if (!hasFirebaseProfileConfig()) throw new Error("Firebase не налаштований.");

  const currentId = cleanId(input.currentId);
  const nextId = cleanId(input.id || currentId);
  if (!nextId) throw new Error("Вкажи ID групи.");

  const groups = await listAccessGroups();
  const existing = groups.find((group) => group.id === currentId || group.id === nextId) || null;
  const target = existing || normalizeGroup(nextId, { id: nextId, name: input.name, permissions: ["dashboard.view"] });
  if (existing && !canEditTargetGroup(viewer, existing)) throw new Error("Цю групу не можна змінювати з поточного акаунта.");

  const fixedId = existing?.lockedId || FIXED_GROUP_IDS.has(currentId || nextId);
  const id = fixedId ? (existing?.id || nextId) : nextId;
  const rank = Number.isFinite(Number(input.rank)) ? Math.max(1, Math.min(100, Math.floor(Number(input.rank)))) : target.rank;
  const effectiveRank = id === DEFAULT_ADMIN_GROUP_ID ? 100 : id === DEFAULT_MODERATOR_GROUP_ID ? 50 : id === DEFAULT_MEMBER_GROUP_ID ? 10 : rank;
  const requestedPermissions = cleanPermissions(input.permissions);
  if (!viewer.isServerOwner && (id === DEFAULT_ADMIN_GROUP_ID || effectiveRank >= 100 || requestedPermissions.includes("groups.manage"))) {
    throw new Error("Адміністративні права груп може змінювати тільки власник Discord-сервера.");
  }

  const doc = {
    id,
    name: cleanName(input.name, target.name),
    role: roleForGroupId(id, effectiveRank),
    rank: effectiveRank,
    lockedId: FIXED_GROUP_IDS.has(id) || Boolean(target.lockedId),
    protectedGroup: FIXED_GROUP_IDS.has(id) || Boolean(target.protectedGroup),
    discordRoleIds: cleanDiscordRoleIds(input.discordRoleIds),
    permissions: requestedPermissions,
    updatedAt: nowIso(),
  };
  if (!doc.permissions.includes("dashboard.view")) doc.permissions.unshift("dashboard.view");

  const ref = collectionRef();
  if (currentId && currentId !== id) {
    await ref.doc(currentId).delete();
  }
  await ref.doc(id).set({ ...doc, createdAt: existing?.createdAt || nowIso() }, { merge: true });
  return normalizeGroup(id, doc);
}

export async function deleteAccessGroup(groupId: string, viewer: DashboardSession) {
  if (!canManageGroups(viewer)) throw new Error("Недостатньо прав для видалення груп.");
  const id = cleanId(groupId);
  if (!id || FIXED_GROUP_IDS.has(id)) throw new Error("Системні групи не видаляються.");
  if (viewer.groupId === id) throw new Error("Не можна видалити власну групу.");
  await collectionRef().doc(id).delete();
  return true;
}

export async function recordAdminAudit(action: string, viewer: DashboardSession, details: Record<string, unknown> = {}) {
  if (!hasFirebaseProfileConfig()) return;
  await getFirebaseAdminDb().collection("dashboardAdminAudit").add({
    action,
    actorId: viewer.id,
    actorName: viewer.name,
    actorGroupId: viewer.groupId || null,
    isServerOwner: Boolean(viewer.isServerOwner),
    details,
    createdAt: FieldValue.serverTimestamp(),
  }).catch(() => null);
}
