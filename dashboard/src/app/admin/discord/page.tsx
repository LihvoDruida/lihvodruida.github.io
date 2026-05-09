import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import DashboardIdentity from "@/components/DashboardIdentity";
import AdminTabs from "@/components/AdminTabs";
import { buildPageMetadata } from "@/lib/seo";
import { getSession } from "@/lib/auth";
import { canManageDiscordMembers } from "@/lib/permissions";
import { fetchDiscordGuildSnapshot, fetchDiscordRoles, getDiscordGuildId } from "@/lib/discordAdmin";
import { recordAdminAudit } from "@/lib/accessGroups";
import { getGuildNicknamePolicy, nicknameTemplateExample, setGuildDiscordManagementSettings } from "@/lib/guildNicknamePolicy";
import {
  addDiscordMemberRoles,
  inspectDiscordNicknameTemplate,
  removeDiscordMemberRoles,
  removeRolesFromMembersWithInvalidNicknames,
  updateDiscordMemberNickname,
} from "@/lib/discordMemberManagement";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = buildPageMetadata({
  title: "Discord-учасники",
  description: "Керування Discord-ролями, серверними ніками та глобальним шаблоном ніку Mistblossom Vanguard.",
  path: "/admin/discord",
  keywords: ["Discord", "ролі", "ніки", "керування"],
});

async function setActionToast(tone: "success" | "info" | "warning" | "error", title: string, message?: string) {
  const store = await cookies();
  store.set("dashboard_toast", JSON.stringify({ tone, title, message }), { path: "/", maxAge: 45, sameSite: "lax" });
}

async function saveDiscordSettingsAction(formData: FormData) {
  "use server";
  const user = await getSession();
  if (!user || !canManageDiscordMembers(user)) { redirect("/login"); throw new Error("Access denied"); }
  try {
    const policy = await setGuildDiscordManagementSettings({
      template: formData.get("template"),
      roleRemoveConcurrency: formData.get("roleRemoveConcurrency"),
      roleRemoveMaxConcurrency: formData.get("roleRemoveMaxConcurrency"),
      nicknameCleanupConcurrency: formData.get("nicknameCleanupConcurrency"),
      nicknameCleanupMaxConcurrency: formData.get("nicknameCleanupMaxConcurrency"),
    }, user);
    await recordAdminAudit("discord.management_settings.update", user, {
      template: policy.template,
      roleRemoveConcurrency: policy.roleRemoveConcurrency,
      roleRemoveMaxConcurrency: policy.roleRemoveMaxConcurrency,
      nicknameCleanupConcurrency: policy.nicknameCleanupConcurrency,
      nicknameCleanupMaxConcurrency: policy.nicknameCleanupMaxConcurrency,
    });
    revalidatePath("/admin/discord");
    revalidatePath("/profile/[profileId]", "page");
    revalidatePath("/rules/accept");
    await setActionToast("success", "Discord-налаштування оновлено", `Шаблон: ${policy.template}. Паралельність тепер береться з цієї сторінки.`);
  } catch (error) {
    await setActionToast("error", "Налаштування не збережено", error instanceof Error ? error.message : "Перевір шаблон і числові значення.");
  }
  redirect("/admin/discord");
}

async function updateNicknameAction(formData: FormData) {
  "use server";
  const user = await getSession();
  if (!user || !canManageDiscordMembers(user)) { redirect("/login"); throw new Error("Access denied"); }
  try {
    const result = await updateDiscordMemberNickname({ userId: formData.get("userId"), nickname: formData.get("nickname"), reason: `Mistblossom manual nickname update by ${user.name || user.id}` });
    await recordAdminAudit("discord.member.nickname.update", user, result);
    await setActionToast("success", "Нік оновлено", `Discord ID ${result.userId}: ${result.nickname}`);
  } catch (error) {
    await setActionToast("error", "Нік не оновлено", error instanceof Error ? error.message : "Discord API відхилив зміну ніку.");
  }
  redirect("/admin/discord");
}

async function addRoleAction(formData: FormData) {
  "use server";
  const user = await getSession();
  if (!user || !canManageDiscordMembers(user)) { redirect("/login"); throw new Error("Access denied"); }
  try {
    const result = await addDiscordMemberRoles({ userId: formData.get("userId"), roleIds: formData.getAll("roleIds"), reason: `Mistblossom manual role add by ${user.name || user.id}` });
    await recordAdminAudit("discord.member.roles.add", user, result);
    await setActionToast("success", "Роль видано", `Discord ID ${result.userId}: ролей додано ${result.roleIds.length}.`);
  } catch (error) {
    await setActionToast("error", "Роль не видано", error instanceof Error ? error.message : "Discord API відхилив видачу ролі.");
  }
  redirect("/admin/discord");
}

async function removeRoleAction(formData: FormData) {
  "use server";
  const user = await getSession();
  if (!user || !canManageDiscordMembers(user)) { redirect("/login"); throw new Error("Access denied"); }
  try {
    const result = await removeDiscordMemberRoles({ userId: formData.get("userId"), roleIds: formData.getAll("roleIds"), reason: `Mistblossom manual role remove by ${user.name || user.id}` });
    await recordAdminAudit("discord.member.roles.remove", user, result);
    await setActionToast("success", "Роль знято", `Discord ID ${result.userId}: ролей знято ${result.roleIds.length}.`);
  } catch (error) {
    await setActionToast("error", "Роль не знято", error instanceof Error ? error.message : "Discord API відхилив зняття ролі.");
  }
  redirect("/admin/discord");
}

async function inspectNicknameTemplateAction(formData: FormData) {
  "use server";
  const user = await getSession();
  if (!user || !canManageDiscordMembers(user)) { redirect("/login"); throw new Error("Access denied"); }
  try {
    const result = await inspectDiscordNicknameTemplate(Number(formData.get("limit") || 1000));
    await recordAdminAudit("discord.nickname_policy.inspect", user, { checked: result.checked, mismatched: result.mismatchedTotal, template: result.template });
    await setActionToast("info", "Перевірку завершено", `Перевірено ${result.checked}. Не відповідають шаблону: ${result.mismatchedTotal}.`);
  } catch (error) {
    await setActionToast("error", "Перевірка не виконана", error instanceof Error ? error.message : "Discord API не повернув список учасників.");
  }
  redirect("/admin/discord");
}

async function removeInvalidNicknameRolesAction(formData: FormData) {
  "use server";
  const user = await getSession();
  if (!user || !canManageDiscordMembers(user)) { redirect("/login"); throw new Error("Access denied"); }
  try {
    const apply = String(formData.get("apply") || "") === "1";
    const result = await removeRolesFromMembersWithInvalidNicknames({
      roleIds: formData.getAll("roleIds"),
      limit: formData.get("limit"),
      dryRun: !apply,
      reason: `Nickname does not match Mistblossom template; action by ${user.name || user.id}`,
    });
    await recordAdminAudit("discord.member.roles.remove_invalid_nickname", user, { dryRun: result.dryRun, checked: result.checked, targets: result.matchedTargets, changed: result.changed, failed: result.failed });
    await setActionToast(result.dryRun ? "info" : "success", result.dryRun ? "Попередній перегляд готовий" : "Ролі знято", result.dryRun ? `Знайдено ${result.matchedTargets} учасників із неправильним ніком. Для реального зняття ролей увімкни підтвердження.` : `Змінено ${result.changed}, помилок ${result.failed}.`);
  } catch (error) {
    await setActionToast("error", "Масову дію не виконано", error instanceof Error ? error.message : "Перевір роль, права бота і доступ до списку учасників.");
  }
  redirect("/admin/discord");
}

function RoleCheckboxes({ roles }: { roles: Array<{ id: string; name: string; position?: number }> }) {
  if (!roles.length) {
    return <div className="discord-role-checkboxes discord-role-checkboxes--empty">Discord-ролі не завантажились. Перевір bot token, guild ID і право Manage Roles.</div>;
  }
  return (
    <div className="discord-role-checkboxes">
      {roles.map((role) => (
        <label key={role.id}>
          <input type="checkbox" name="roleIds" value={role.id} />
          <span>{role.name}</span>
          <small>{role.id}</small>
        </label>
      ))}
    </div>
  );
}

export default async function AdminDiscordPage() {
  const user = await getSession();
  if (!user) { redirect("/login"); throw new Error("Login required"); }
  if (!canManageDiscordMembers(user)) {
    redirect(user.profileId ? `/profile/${user.profileId}` : "/profile");
    throw new Error("Access denied");
  }

  const [policy, rolesResult, guild] = await Promise.all([
    getGuildNicknamePolicy(),
    fetchDiscordRoles().then((roles) => ({ roles, error: "" })).catch((error) => ({ roles: [], error: error instanceof Error ? error.message : "Discord ролі недоступні" })),
    fetchDiscordGuildSnapshot().catch(() => null),
  ]);
  const roles = rolesResult.roles;
  const hasManageableRoles = roles.length > 0;
  const guildId = getDiscordGuildId();

  return (
    <main className="container admin-container">
      <section className="dashboard-shell content-shell admin-page discord-management-page" aria-label="Керування Discord-учасниками">
        <DashboardIdentity user={user} activeSection="admin" />
        <header className="hero panel admin-hero">
          <div>
            <span className="eyebrow">Адміністрування • Discord</span>
            <h1>Discord-учасники</h1>
            <p>Видача та зняття ролей, ручне перейменування на сервері й контроль глобального шаблону ніку.</p>
          </div>
          <div className="hero-actions">
            <span className="status-pill">Доступ: {user.groupName || user.role}</span>
            <span className={`status-pill ${guild ? "good" : "warning"}`}>{guild ? guild.name : guildId ? "Discord API недоступний" : "Discord не підключено"}</span>
          </div>
        </header>

        <AdminTabs active="discord" />

        <section className="discord-management-status" aria-label="Стан Discord-підключення">
          <div className={`discord-management-status__item ${guildId ? "is-ok" : "is-warning"}`}>
            <strong>{guildId || "—"}</strong>
            <small>Discord server ID</small>
          </div>
          <div className={`discord-management-status__item ${guild ? "is-ok" : "is-warning"}`}>
            <strong>{guild?.name || "Сервер не прочитано"}</strong>
            <small>{guild ? "Bot API відповідає" : "Перевір DISCORD_BOT_TOKEN і права бота"}</small>
          </div>
          <div className={`discord-management-status__item ${rolesResult.error ? "is-warning" : "is-ok"}`}>
            <strong>{roles.length}</strong>
            <small>{rolesResult.error ? `Ролі недоступні: ${rolesResult.error}` : "Доступних ролей для керування"}</small>
          </div>
        </section>

        <section className="panel discord-management-card" aria-label="Глобальний шаблон ніку">
          <div className="profile-card-head profile-card-head--inline">
            <div>
              <span className="eyebrow">Серверний нік</span>
              <h2>Глобальний шаблон</h2>
            </div>
            <span className="profile-count-pill">{roles.length} ролей</span>
          </div>
          <p className="profile-card-lead">Цей блок є джерелом правди для шаблону ніку та швидкості масових Discord-дій. `.env` більше не потрібен для цих значень; після збереження вони беруться з панелі.</p>
          <form className="discord-management-form discord-management-form--settings" action="/api/admin/discord/settings" method="post" data-dashboard-action-form="true" data-dashboard-live-submit="true">
            <label className="field-label discord-management-form__wide">Шаблон ніку
              <input className="input" name="template" defaultValue={policy.template} placeholder="{name} [{characters}]" required />
              <small>Доступні змінні: <code>{"{name}"}</code>, <code>{"{main}"}</code>, <code>{"{alts}"}</code>, <code>{"{characters}"}</code>. Приклад: {nicknameTemplateExample(policy.template)}</small>
            </label>

            <div className="discord-settings-grid" aria-label="Паралельність Discord-дій">
              <label className="field-label">Зняття ролей: паралельність
                <input className="input" name="roleRemoveConcurrency" type="number" min="0" max={policy.roleRemoveMaxConcurrency} defaultValue={policy.roleRemoveConcurrency} />
                <small>0 = автоматично. Використовується при ручному й масовому знятті ролей.</small>
              </label>
              <label className="field-label">Зняття ролей: максимум
                <input className="input" name="roleRemoveMaxConcurrency" type="number" min="1" max="5" defaultValue={policy.roleRemoveMaxConcurrency} />
                <small>Обмеження безпеки для Discord API. Рекомендовано 3–5.</small>
              </label>
              <label className="field-label">Перевірка ніків: паралельність
                <input className="input" name="nicknameCleanupConcurrency" type="number" min="0" max={policy.nicknameCleanupMaxConcurrency} defaultValue={policy.nicknameCleanupConcurrency} />
                <small>0 = автоматично. Використовується для масового проходу по учасниках.</small>
              </label>
              <label className="field-label">Перевірка ніків: максимум
                <input className="input" name="nicknameCleanupMaxConcurrency" type="number" min="1" max="4" defaultValue={policy.nicknameCleanupMaxConcurrency} />
                <small>Жорсткий верхній ліміт для cleanup-операцій.</small>
              </label>
            </div>

            <div className="discord-settings-summary" aria-label="Поточна конфігурація Discord-дій">
              <span><strong>{policy.roleRemoveConcurrency || "Авто"}</strong><small>Зняття ролей</small></span>
              <span><strong>{policy.roleRemoveMaxConcurrency}</strong><small>Макс. зняття ролей</small></span>
              <span><strong>{policy.nicknameCleanupConcurrency || "Авто"}</strong><small>Перевірка ніків</small></span>
              <span><strong>{policy.nicknameCleanupMaxConcurrency}</strong><small>Макс. перевірка</small></span>
            </div>

            <button className="btn primary" type="submit">Зберегти Discord-налаштування</button>
          </form>
        </section>

        <section className="discord-management-grid" aria-label="Дії з учасниками Discord">
          <form className="panel discord-management-card" action="/api/admin/discord/nickname" method="post" data-dashboard-action-form="true" data-dashboard-live-submit="true">
            <div className="profile-card-head"><span className="eyebrow">Учасник</span><h2>Перейменувати на сервері</h2></div>
            <label className="field-label">Discord user ID<input className="input" name="userId" inputMode="numeric" pattern="[0-9]{16,25}" required /></label>
            <label className="field-label">Новий серверний нік<input className="input" name="nickname" maxLength={32} required placeholder={nicknameTemplateExample(policy.template)} /></label>
            <button className="btn primary" type="submit">Змінити нік</button>
          </form>

          <form className="panel discord-management-card" action="/api/admin/discord/roles/add" method="post" data-dashboard-action-form="true" data-dashboard-live-submit="true">
            <div className="profile-card-head"><span className="eyebrow">Ролі</span><h2>Додати роль учаснику</h2></div>
            <label className="field-label">Discord user ID<input className="input" name="userId" inputMode="numeric" pattern="[0-9]{16,25}" required /></label>
            <RoleCheckboxes roles={roles} />
            <button className="btn primary" type="submit" disabled={!hasManageableRoles}>Додати вибрані ролі</button>
          </form>

          <form className="panel discord-management-card" action="/api/admin/discord/roles/remove" method="post" data-dashboard-action-form="true" data-dashboard-live-submit="true">
            <div className="profile-card-head"><span className="eyebrow">Ролі</span><h2>Зняти роль з учасника</h2></div>
            <label className="field-label">Discord user ID<input className="input" name="userId" inputMode="numeric" pattern="[0-9]{16,25}" required /></label>
            <RoleCheckboxes roles={roles} />
            <button className="btn danger" type="submit" disabled={!hasManageableRoles} data-confirm-message="Зняти вибрані ролі з цього учасника?">Зняти вибрані ролі</button>
          </form>

          <form className="panel discord-management-card discord-management-card--wide" action="/api/admin/discord/nicknames/cleanup" method="post" data-dashboard-action-form="true" data-dashboard-live-submit="true">
            <div className="profile-card-head"><span className="eyebrow">Автоперевірка</span><h2>Зняти ролі за неправильний нік</h2></div>
            <p className="profile-card-lead">Перевіряє серверні ніки за глобальним шаблоном і знімає тільки вибрані ролі. Спочатку запускай як попередній перегляд. Для списку учасників бот має мати доступ до Guild Members.</p>
            <label className="field-label">Ліміт учасників для перевірки<input className="input" name="limit" type="number" min="1" max="5000" defaultValue="1000" /></label>
            <RoleCheckboxes roles={roles} />
            <label className="raid-checkbox-line">
              <input type="checkbox" name="apply" value="1" />
              <span>Підтверджую реальне зняття ролей. Без цієї галочки буде тільки попередній перегляд.</span>
            </label>
            <div className="form-actions">
              <button className="btn subtle" formAction="/api/admin/discord/nicknames/inspect" formMethod="post" type="submit">Тільки перевірити шаблон</button>
              <button className="btn danger" type="submit" disabled={!hasManageableRoles} data-confirm-message="Ця дія може масово зняти вибрані ролі. Продовжити?">Запустити перевірку ролей</button>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
