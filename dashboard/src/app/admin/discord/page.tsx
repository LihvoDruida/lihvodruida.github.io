import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import AdminTabs from "@/components/AdminTabs";
import { buildPageMetadata } from "@/lib/seo";
import { getSession } from "@/lib/auth";
import { canManageDiscordMembers } from "@/lib/permissions";
import { fetchDiscordRoleControlSnapshot, getDiscordGuildId, type DiscordManageableRoleOption } from "@/lib/discordAdmin";
import { getGuildNicknamePolicy, nicknameTemplateExample } from "@/lib/guildNicknamePolicy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = buildPageMetadata({
  title: "Discord-учасники",
  description: "Керування Discord-ролями, серверними ніками та глобальним шаблоном ніку Mistblossom Vanguard.",
  path: "/admin/discord",
  keywords: ["Discord", "ролі", "ніки", "керування"],
});

function RoleCheckboxes({
  roles,
  fieldName = "roleIds",
  emptyText = "Discord-ролі не завантажились. Перевір bot token, guild ID і право “Керувати ролями”.",
  inputType = "checkbox",
}: {
  roles: DiscordManageableRoleOption[];
  fieldName?: string;
  emptyText?: string;
  inputType?: "checkbox" | "radio";
}) {
  if (!roles.length) {
    return <div className="discord-role-checkboxes discord-role-checkboxes--empty">{emptyText}</div>;
  }
  return (
    <div className="discord-role-checkboxes">
      {roles.map((role) => (
        <label key={`${fieldName}-${role.id}`} className={!role.manageable ? "is-disabled" : ""} title={role.blockedReason || role.name}>
          <input type={inputType} name={fieldName} value={role.id} disabled={!role.manageable} />
          <span>{role.name}</span>
          <small>{role.manageable ? `Позиція ${role.position} • ID ${role.id}` : role.blockedReason || "Недоступна для керування"}</small>
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

  const [policy, control] = await Promise.all([
    getGuildNicknamePolicy(),
    fetchDiscordRoleControlSnapshot(),
  ]);
  const roles = control.roles;
  const manageableRoles = control.manageableRoles;
  const hasManageableRoles = manageableRoles.length > 0;
  const guild = control.guild;
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
          <div className={`discord-management-status__item ${control.error ? "is-warning" : "is-ok"}`}>
            <strong>{control.bot?.displayName || "—"}</strong>
            <small>{control.error ? `Bot API: ${control.error}` : "Поточний Discord-бот"}</small>
          </div>
          <div className={`discord-management-status__item ${control.botTopRole ? "is-ok" : "is-warning"}`}>
            <strong>{control.botTopRole?.name || "—"}</strong>
            <small>{control.botTopRole ? `Найвища роль бота • позиція ${control.botTopRole.position}` : "Не вдалося визначити найвищу роль бота"}</small>
          </div>
          <div className={`discord-management-status__item ${control.botCanManageRoles ? "is-ok" : "is-warning"}`}>
            <strong>{control.botCanManageRoles ? "Так" : "Ні"}</strong>
            <small>Дозвіл “Керувати ролями”</small>
          </div>
          <div className={`discord-management-status__item ${hasManageableRoles ? "is-ok" : "is-warning"}`}>
            <strong>{manageableRoles.length} / {roles.length}</strong>
            <small>{hasManageableRoles ? "Ролей нижче бота, доступних для керування" : "Немає ролей, якими бот може керувати"}</small>
          </div>
        </section>

        <section className={`panel discord-management-card discord-management-card--notice ${hasManageableRoles ? "is-ok" : "is-warning"}`} aria-label="Перевірка ієрархії ролей Discord">
          <div className="profile-card-head profile-card-head--inline">
            <div>
              <span className="eyebrow">Ієрархія ролей</span>
              <h2>{hasManageableRoles ? "Бот може керувати робочими ролями" : "Керування ролями обмежене"}</h2>
            </div>
            <span className={`status-pill ${hasManageableRoles ? "good" : "warning"}`}>{manageableRoles.length} доступно</span>
          </div>
          <p className="profile-card-lead">
            Панель бере найвищу роль саме з Discord-учасника бота. Якщо роль Mistblossom Guild System стоїть над робочими ролями, вони мають бути доступні тут. Недоступними лишаються @everyone, керовані integration-ролі, роль самого бота та ролі на одному рівні або вище.
          </p>
          {control.blockedRoles.length ? (
            <details className="discord-management-details">
              <summary>Недоступні ролі: {control.blockedRoles.length}</summary>
              <div className="discord-management-blocked-roles">
                {control.blockedRoles.slice(0, 12).map((role) => (
                  <span key={role.id}><strong>{role.name}</strong><small>{role.blockedReason}</small></span>
                ))}
              </div>
            </details>
          ) : null}
        </section>

        <section className="panel discord-management-card" aria-label="Глобальний шаблон ніку">
          <div className="profile-card-head profile-card-head--inline">
            <div>
              <span className="eyebrow">Серверний нік</span>
              <h2>Глобальний шаблон</h2>
            </div>
            <span className="profile-count-pill">{manageableRoles.length} доступно</span>
          </div>
          <p className="profile-card-lead">Цей блок є джерелом правди для шаблону ніку та швидкості масових Discord-дій. Після збереження профіль, прийняття правил і Discord-операції беруть ці значення з панелі.</p>
          <form className="discord-management-form discord-management-form--settings" action="/api/admin/discord/settings" method="post" data-dashboard-action-form="true" data-dashboard-live-submit="true">
            <label className="field-label discord-management-form__wide">Шаблон ніку
              <input className="input" name="template" defaultValue={policy.template} placeholder="{name} [{main}, {alt}, {alt}]" required />
              <small>Доступні змінні: <code>{"{name}"}</code>, <code>{"{main}"}</code>, <code>{"{alt}"}</code>. <code>{"{alt}"}</code> означає один персонаж/альт, тому для кількох персонажів додай змінну кілька разів. Приклад за поточним шаблоном: {nicknameTemplateExample(policy.template)}. Якщо гільдійного мейна ще немає, валідними лишаються варіанти на кшталт <code>{"{name} [{alt}]"}</code> або <code>{"{name} [{alt}, {alt}]"}</code>.</small>
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

          <form className="panel discord-management-card" action="/api/admin/discord/officers/sync" method="post" data-dashboard-action-form="true" data-dashboard-live-submit="true">
            <div className="profile-card-head"><span className="eyebrow">Battle.net</span><h2>Видати роль офіцерам гільдії</h2></div>
            <p className="profile-card-lead">Перебирає всі профілі сайту і всіх їхніх персонажів, звіряє персонажів з live Battle.net roster гільдії за точним ключем регіон + реалм + імʼя. Роль видається тільки тоді, коли хоча б один персонаж профілю реально має статус <strong>Глава</strong> або <strong>Офіцер</strong>. Серверний нік перевіряється саме через Discord <code>member.nick</code>, не через глобальне імʼя.</p>
            <input type="hidden" name="limit" value="0" />
            <RoleCheckboxes roles={roles} fieldName="officerRoleIds" inputType="radio" emptyText="Немає доступних ролей для видачі офіцерам. Перевір роль бота та право “Керувати ролями”." />
            <div className="discord-officer-sync-summary" aria-label="Що перевіряється">
              <span><strong>Battle.net</strong><small>Live roster: точний персонаж + ранг 0/1</small></span>
              <span><strong>Профілі</strong><small>Усі профілі, усі персонажі</small></span>
              <span><strong>Discord</strong><small>Серверний нік member.nick</small></span>
            </div>
            <button className="btn primary" type="submit" disabled={!hasManageableRoles} data-confirm-message="Видати вибрану Discord-роль тільки профілям, де персонаж підтверджений у живому Battle.net roster як Глава або Офіцер?">Синхронізувати офіцерську роль</button>
          </form>

          <form className="panel discord-management-card discord-management-card--wide" action="/api/admin/discord/nicknames/cleanup" method="post" data-dashboard-action-form="true" data-dashboard-live-submit="true">
            <div className="profile-card-head"><span className="eyebrow">Автоперевірка</span><h2>Ролі за неправильний серверний нік</h2></div>
            <p className="profile-card-lead">Перевіряє тільки серверні ніки Discord (<code>member.nick</code>), не глобальні імена. Перед реальною зміною кожен учасник перечитується з Discord ще раз: якщо нік уже правильний, ролі не чіпаються. Цей блок не призначений для офіцерських ролей — офіцерські права видавай через синхронізацію Battle.net вище.</p>
            <input type="hidden" name="apply" value="1" />
            <label className="field-label">Скільки учасників перевірити<input className="input" name="limit" type="number" min="0" max="50000" defaultValue="0" /><small>0 = пройти всіх учасників Discord-сервера посторінково. Для великих проходів краще лишати паралельність низькою.</small></label>
            <div className="discord-cleanup-role-grid" aria-label="Ролі для масової дії за серверним ніком">
              <section className="discord-cleanup-role-column">
                <div className="profile-card-head profile-card-head--inline"><div><span className="eyebrow">Зняти</span><h3>Ролі, які прибрати</h3></div></div>
                <p className="profile-card-lead">Ці ролі буде знято з учасників, чиї серверні ніки не відповідають шаблону.</p>
                <RoleCheckboxes roles={roles} fieldName="removeRoleIds" />
              </section>
              <section className="discord-cleanup-role-column">
                <div className="profile-card-head profile-card-head--inline"><div><span className="eyebrow">Видати</span><h3>Ролі, які додати</h3></div></div>
                <p className="profile-card-lead">Опційно: видати тільки службову/санкційну роль тим самим невідповідним учасникам. Офіцерські ролі тут не використовуй.</p>
                <RoleCheckboxes roles={roles} fieldName="addRoleIds" />
              </section>
            </div>
            <div className="form-actions">
              <button className="btn subtle" formAction="/api/admin/discord/nicknames/inspect" formMethod="post" type="submit">Тільки перевірити серверні ніки</button>
              <button className="btn danger" name="mode" value="apply" type="submit" disabled={!hasManageableRoles} data-confirm-message="Ця дія перечитає кожного учасника з Discord і змінить ролі тільки тим, у кого серверний нік member.nick досі не відповідає шаблону. Офіцерські ролі тут не використовуй. Продовжити?">Застосувати ролі за неправильний серверний нік</button>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
