import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import DashboardIdentity from "@/components/DashboardIdentity";
import AccessGroupsManager from "@/components/AccessGroupsManager";
import { buildPageMetadata } from "@/lib/seo";
import { getSession, setSession } from "@/lib/auth";
import { applyAccessGroupToSession, canManageGroups, deleteAccessGroup, getAccessGroup, listAccessGroups, recordAdminAudit, upsertAccessGroup } from "@/lib/accessGroups";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = buildPageMetadata({
  title: "Групи та права",
  description: "Керування групами доступу, однією Discord-роллю на групу і правами Mistblossom Vanguard.",
  path: "/admin/groups",
  keywords: ["dashboard права", "групи доступу", "адміністрування"],
});

async function setActionToast(tone: "success" | "info" | "warning" | "error", title: string, message?: string) {
  const store = await cookies();
  store.set("dashboard_toast", JSON.stringify({ tone, title, message }), { path: "/", maxAge: 45, sameSite: "lax" });
}

async function saveGroupAction(formData: FormData) {
  "use server";
  const user = await getSession();
  if (!user || !canManageGroups(user)) { redirect("/login"); throw new Error("Access denied"); }
  await upsertAccessGroup({
    currentId: formData.get("currentId"),
    id: formData.get("id"),
    name: formData.get("name"),
    role: formData.get("role"),
    rank: formData.get("rank"),
    discordRoleId: formData.get("discordRoleId"),
    icon: formData.get("icon"),
    permissions: formData.getAll("permissions"),
  }, user);
  const groupId = String(formData.get("id") || formData.get("currentId") || "");
  await recordAdminAudit("access_group.upsert", user, { groupId });
  revalidatePath("/admin/groups");
  await setActionToast("success", formData.get("currentId") ? "Групу оновлено" : "Групу створено", "Права, Discord role ID та іконку збережено у Firebase.");
  const statusParam = formData.get("currentId") ? "updated" : "created";
  redirect(`/admin/groups?${statusParam}=${encodeURIComponent("Групу доступу збережено у Firebase.")}`);
}

async function deleteGroupAction(formData: FormData) {
  "use server";
  const user = await getSession();
  if (!user || !canManageGroups(user)) { redirect("/login"); throw new Error("Access denied"); }
  const groupId = String(formData.get("groupId") || "");
  await deleteAccessGroup(groupId, user);
  await recordAdminAudit("access_group.delete", user, { groupId });
  revalidatePath("/admin/groups");
  await setActionToast("success", "Групу видалено", "Список груп доступу оновлено.");
  redirect(`/admin/groups?deleted=${encodeURIComponent("Групу доступу видалено.")}`);
}

async function impersonateAction(formData: FormData) {
  "use server";
  const user = await getSession();
  if (!user?.isServerOwner) { redirect("/admin/groups"); throw new Error("Access denied"); }
  const group = await getAccessGroup(String(formData.get("groupId") || ""));
  if (!group) { redirect("/admin/groups"); throw new Error("Group not found"); }
  await setSession(applyAccessGroupToSession({ ...user, impersonatedBy: user.id }, group, false));
  await recordAdminAudit("access_group.impersonate", user, { groupId: group.id, groupName: group.name });
  await setActionToast("info", `Перегляд як: ${group.name}`, "Реальні права акаунта не змінені. Завершити режим можна через постійне повідомлення внизу.");
  redirect(user.profileId ? `/profile/${user.profileId}` : "/");
}

export default async function AdminGroupsPage() {
  const user = await getSession();
  if (!user) { redirect("/login"); throw new Error("Login required"); }
  if (!canManageGroups(user)) { redirect(user.profileId ? `/profile/${user.profileId}` : "/profile"); throw new Error("Access denied"); }

  const groups = await listAccessGroups();

  return (
    <main className="container access-groups-container">
      <section className="dashboard-shell content-shell access-groups-page" aria-label="Керування групами та правами доступу Mistblossom Vanguard">
        <DashboardIdentity user={user} activeSection="admin" />
        <header className="hero panel admin-hero access-groups-hero">
        <div>
          <span className="eyebrow">Адміністрування</span>
          <h1>Групи та права доступу</h1>
          <p>Права зберігаються у Firebase. Кожна група має одну Discord-роль, ранг і набір дозволів. Env використовується лише для підключень.</p>
        </div>
        <div className="hero-actions">
          <span className="status-pill">Поточна група: {user.groupName || user.role}</span>
          {user.isServerOwner ? <span className="status-pill good">Власник сервера</span> : null}
        </div>
        </header>
        <AccessGroupsManager
          groups={groups}
          isServerOwner={Boolean(user.isServerOwner)}
          currentGroupId={user.groupId}
          saveGroupAction={saveGroupAction}
          deleteGroupAction={deleteGroupAction}
          impersonateAction={impersonateAction}
        />
      </section>
    </main>
  );
}
