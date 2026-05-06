import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import DashboardIdentity from "@/components/DashboardIdentity";
import AccessGroupsManager from "@/components/AccessGroupsManager";
import { buildPageMetadata } from "@/lib/seo";
import { getSession, setSession } from "@/lib/auth";
import { applyAccessGroupToSession, canManageGroups, deleteAccessGroup, getAccessGroup, listAccessGroups, recordAdminAudit, upsertAccessGroup } from "@/lib/accessGroups";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = buildPageMetadata({
  title: "Групи та права",
  description: "Керування групами доступу dashboard, Discord role ID і правами Mistblossom Vanguard.",
  path: "/admin/groups",
  keywords: ["dashboard права", "групи доступу", "адміністрування"],
});

async function saveGroupAction(formData: FormData) {
  "use server";
  const user = await getSession();
  if (!user || !canManageGroups(user)) { redirect("/login"); throw new Error("Access denied"); }
  await upsertAccessGroup({
    currentId: formData.get("currentId"),
    id: formData.get("id"),
    name: formData.get("name"),
    rank: formData.get("rank"),
    discordRoleIds: formData.get("discordRoleIds"),
    permissions: formData.getAll("permissions"),
  }, user);
  await recordAdminAudit("access_group.upsert", user, { groupId: String(formData.get("id") || formData.get("currentId") || "") });
  revalidatePath("/admin/groups");
}

async function deleteGroupAction(formData: FormData) {
  "use server";
  const user = await getSession();
  if (!user || !canManageGroups(user)) { redirect("/login"); throw new Error("Access denied"); }
  const groupId = String(formData.get("groupId") || "");
  await deleteAccessGroup(groupId, user);
  await recordAdminAudit("access_group.delete", user, { groupId });
  revalidatePath("/admin/groups");
}

async function impersonateAction(formData: FormData) {
  "use server";
  const user = await getSession();
  if (!user?.isServerOwner) { redirect("/admin/groups"); throw new Error("Access denied"); }
  const group = await getAccessGroup(String(formData.get("groupId") || ""));
  if (!group) { redirect("/admin/groups"); throw new Error("Group not found"); }
  await setSession(applyAccessGroupToSession({ ...user, impersonatedBy: user.id }, group, false));
  await recordAdminAudit("access_group.impersonate", user, { groupId: group.id });
  redirect("/");
}

export default async function AdminGroupsPage() {
  const user = await getSession();
  if (!user) { redirect("/login"); throw new Error("Login required"); }
  if (!canManageGroups(user)) { redirect(user.profileId ? `/profile/${user.profileId}` : "/profile"); throw new Error("Access denied"); }

  const groups = await listAccessGroups();

  return (
    <main className="dashboard-shell content-shell">
      <DashboardIdentity user={user} activeSection="admin" />
      <section className="hero panel admin-hero">
        <div>
          <span className="eyebrow">Адміністрування</span>
          <h1>Групи та права доступу</h1>
          <p>Права зберігаються у Firebase. Env більше не керує ролями доступу — він потрібен лише для підключень Discord, Firebase і сесій.</p>
        </div>
        <div className="hero-actions">
          <span className="status-pill">Поточна група: {user.groupName || user.role}</span>
          {user.isServerOwner ? <span className="status-pill good">Власник сервера</span> : null}
        </div>
      </section>
      <AccessGroupsManager
        groups={groups}
        isServerOwner={Boolean(user.isServerOwner)}
        currentGroupId={user.groupId}
        saveGroupAction={saveGroupAction}
        deleteGroupAction={deleteGroupAction}
        impersonateAction={impersonateAction}
      />
    </main>
  );
}
