import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import HeroSidePanel from "@/components/HeroSidePanel";
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
  description: "Перевірка Discord-профілів, очищення Firebase-профілів, серверні ніки та глобальний шаблон ніку Mistblossom Vanguard.",
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

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <header className="discord-management-section-head">
      <span className="eyebrow">{eyebrow}</span>
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
    </header>
  );
}

function InfoChip({ title, text }: { title: string; text: string }) {
  return (
    <span className="discord-info-chip">
      <strong>{title}</strong>
      <small>{text}</small>
    </span>
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

  const statusItems = [
    {
      label: "Discord server ID",
      value: guildId || "—",
      note: guildId ? "Сервер підключено" : "Немає DISCORD_GUILD_ID",
      ok: Boolean(guildId),
    },
    {
      label: "Сервер",
      value: guild?.name || "Сервер не прочитано",
      note: guild ? "Bot API відповідає" : "Перевір DISCORD_BOT_TOKEN і права бота",
      ok: Boolean(guild),
    },
    {
      label: "Бот",
      value: control.bot?.displayName || "—",
      note: control.error ? `Bot API: ${control.error}` : "Поточний Discord-бот",
      ok: !control.error,
    },
    {
      label: "Найвища роль бота",
      value: control.botTopRole?.name || "—",
      note: control.botTopRole ? `Позиція ${control.botTopRole.position}` : "Не вдалося визначити роль",
      ok: Boolean(control.botTopRole),
    },
    {
      label: "Керування ролями",
      value: control.botCanManageRoles ? "Так" : "Ні",
      note: "Discord permission Manage Roles",
      ok: Boolean(control.botCanManageRoles),
    },
    {
      label: "Доступні ролі",
      value: `${manageableRoles.length} / ${roles.length}`,
      note: hasManageableRoles ? "Нижче ролі бота" : "Бот не може керувати ролями",
      ok: hasManageableRoles,
    },
  ];

  return (
    <main className="container admin-container">
      <section className="dashboard-shell content-shell admin-page discord-management-page" aria-label="Керування Discord-учасниками">
        <DashboardIdentity user={user} activeSection="admin" />
        <header className="hero panel admin-hero discord-admin-hero">
          <div className="hero-copy dashboard-hero__copy guild-hero__copy">
            <span className="eyebrow">Mistblossom Vanguard • Discord</span>
            <h1>Discord-учасники</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">Очищення Firebase-профілів, контроль серверних ніків, шаблон і безпечні масові Discord-дії в одному місці.</p>
          </div>
          <HeroSidePanel
            ariaLabel="Огляд Discord-керування"
            summary={[
              { label: "ДОСТУП", value: user.groupName || user.role, note: "Права поточного користувача" },
              { label: "СЕРВЕР", value: guild ? guild.name : "Недоступно", note: guildId ? guildId : "Discord не підключено" },
            ]}
            stats={[
              { label: "РОЛЕЙ", value: roles.length.toLocaleString("uk-UA") },
              { label: "ДОСТУПНО", value: manageableRoles.length.toLocaleString("uk-UA") },
              { label: "BOT", value: control.botCanManageRoles ? "OK" : "ERR" },
            ]}
          />
        </header>

        <AdminTabs active="discord" />

        <section className="panel discord-management-section discord-management-section--status" aria-label="Стан Discord-підключення">
          <SectionHeader
            eyebrow="Система"
            title="Стан підключення"
            description="Швидка діагностика Discord API, ролі бота та доступності масових дій."
          />
          <div className="discord-management-status">
            {statusItems.map((item) => (
              <div key={item.label} className={`discord-management-status__item ${item.ok ? "is-ok" : "is-warning"}`}>
                <strong>{item.value}</strong>
                <small>{item.label}</small>
                <em>{item.note}</em>
              </div>
            ))}
          </div>
        </section>

        <section className={`panel discord-management-section discord-management-section--roles ${hasManageableRoles ? "is-ok" : "is-warning"}`} aria-label="Перевірка ієрархії ролей Discord">
          <div className="discord-management-section-head discord-management-section-head--inline">
            <div>
              <span className="eyebrow">Ієрархія ролей</span>
              <h2>{hasManageableRoles ? "Бот може керувати робочими ролями" : "Керування ролями обмежене"}</h2>
              <p>Панель бере найвищу роль саме з Discord-учасника бота. Недоступні ролі не показуються як робочі дії.</p>
            </div>
            <span className={`status-pill ${hasManageableRoles ? "good" : "warning"}`}>{manageableRoles.length} доступно</span>
          </div>
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

        <section className="discord-management-layout" aria-label="Налаштування та Discord-дії">
          <aside className="discord-management-sidebar" aria-label="Швидкі налаштування Discord">
            <form className="panel discord-management-card discord-management-card--compact" action="/api/admin/discord/nickname" method="post" data-dashboard-action-form="true" data-dashboard-live-submit="true">
              <div className="profile-card-head">
                <span className="eyebrow">Учасник</span>
                <h2>Перейменувати на сервері</h2>
              </div>
              <div className="discord-management-card__body">
                <label className="field-label">Discord user ID<input className="input" name="userId" inputMode="numeric" pattern="[0-9]{16,25}" required /></label>
                <label className="field-label">Новий серверний нік<input className="input" name="nickname" maxLength={32} required placeholder={nicknameTemplateExample(policy.template)} /></label>
                <button className="btn primary" type="submit">Змінити нік</button>
              </div>
            </form>

            <form className="panel discord-management-card discord-management-card--settings" action="/api/admin/discord/settings" method="post" data-dashboard-action-form="true" data-dashboard-live-submit="true">
              <div className="profile-card-head profile-card-head--inline">
                <div>
                  <span className="eyebrow">Серверний нік</span>
                  <h2>Глобальний шаблон</h2>
                </div>
                <span className="profile-count-pill">{manageableRoles.length} рол.</span>
              </div>
              <div className="discord-management-card__body">
                <p className="profile-card-lead">Джерело правди для профілю, прийняття правил і масових Discord-операцій.</p>
                <label className="field-label">Шаблон ніку
                  <input className="input" name="template" defaultValue={policy.template} placeholder="{name} [{main}, {alt}, {alt}]" required />
                  <small>Змінні: <code>{"{name}"}</code>, <code>{"{main}"}</code>, <code>{"{alt}"}</code>. Приклад: {nicknameTemplateExample(policy.template)}.</small>
                </label>
                <div className="discord-settings-grid" aria-label="Паралельність Discord-дій">
                  <label className="field-label">Зняття ролей
                    <input className="input" name="roleRemoveConcurrency" type="number" min="0" max={policy.roleRemoveMaxConcurrency} defaultValue={policy.roleRemoveConcurrency} />
                    <small>0 = автоматично.</small>
                  </label>
                  <label className="field-label">Макс. зняття
                    <input className="input" name="roleRemoveMaxConcurrency" type="number" min="1" max="5" defaultValue={policy.roleRemoveMaxConcurrency} />
                    <small>Рекомендовано 3–5.</small>
                  </label>
                  <label className="field-label">Перевірка ніків
                    <input className="input" name="nicknameCleanupConcurrency" type="number" min="0" max={policy.nicknameCleanupMaxConcurrency} defaultValue={policy.nicknameCleanupConcurrency} />
                    <small>0 = автоматично.</small>
                  </label>
                  <label className="field-label">Макс. перевірка
                    <input className="input" name="nicknameCleanupMaxConcurrency" type="number" min="1" max="4" defaultValue={policy.nicknameCleanupMaxConcurrency} />
                    <small>Ліміт cleanup-операцій.</small>
                  </label>
                </div>
                <div className="discord-settings-summary" aria-label="Поточна конфігурація Discord-дій">
                  <InfoChip title={String(policy.roleRemoveConcurrency || "Авто")} text="Зняття ролей" />
                  <InfoChip title={String(policy.roleRemoveMaxConcurrency)} text="Макс. зняття" />
                  <InfoChip title={String(policy.nicknameCleanupConcurrency || "Авто")} text="Перевірка ніків" />
                  <InfoChip title={String(policy.nicknameCleanupMaxConcurrency)} text="Макс. перевірка" />
                </div>
                <button className="btn primary" type="submit">Зберегти Discord-налаштування</button>
              </div>
            </form>
          </aside>

          <div className="discord-management-main" aria-label="Масові Discord-дії">
            <form className="panel discord-management-card discord-management-card--primary" action="/api/admin/discord/profiles/cleanup" method="post" data-dashboard-action-form="true" data-dashboard-live-submit="true">
              <div className="profile-card-head profile-card-head--inline">
                <div>
                  <span className="eyebrow">Firebase-профілі</span>
                  <h2>Перевірити Discord-стан профілів</h2>
                </div>
                <span className="status-pill warning">Без ручної видачі ролей</span>
              </div>
              <div className="discord-management-card__body">
                <p className="profile-card-lead">Прохід по Firebase-профілях зі звіркою Discord ID проти учасників сервера та бан-листа. Видаляються лише профілі, де акаунт уже не є учасником сервера або перебуває в бані.</p>
                <label className="field-label discord-management-limit-field">Скільки профілів перевірити
                  <input className="input" name="limit" type="number" min="0" max="50000" defaultValue="0" />
                  <small>0 = пройти всі профілі посторінково, без обмеження першими 5/10 записами.</small>
                </label>
                <div className="discord-officer-sync-summary" aria-label="Що перевіряється перед очищенням профілів">
                  <InfoChip title="Firebase" text="dashboardProfiles" />
                  <InfoChip title="Discord" text="Учасники сервера" />
                  <InfoChip title="Бани" text="Guild bans" />
                  <InfoChip title="Повторно" text="Перед delete" />
                </div>
                <div className="form-actions form-actions--split">
                  <button className="btn subtle" name="mode" value="inspect" type="submit">Тільки перевірити</button>
                  <button className="btn danger" name="mode" value="apply" type="submit" data-confirm-message="Ця дія повторно перевірить кожного кандидата через Discord і видалить з Firebase профілі, де акаунт не є учасником сервера або перебуває в бані. Профілі активних учасників не чіпаються. Продовжити?">Видалити неактуальні профілі</button>
                </div>
              </div>
            </form>

            <div className="discord-action-grid">
              <form className="panel discord-management-card" action="/api/admin/discord/officers/sync" method="post" data-dashboard-action-form="true" data-dashboard-live-submit="true">
                <div className="profile-card-head">
                  <span className="eyebrow">Склад гільдії</span>
                  <h2>Офіцерська роль</h2>
                </div>
                <div className="discord-management-card__body">
                  <p className="profile-card-lead">Видає роль тільки профілям, де хоча б один персонаж у збереженому складі має <strong>Глава</strong> або <strong>Офіцер</strong>. Серверний нік перевіряється через <code>member.nick</code>.</p>
                  <input type="hidden" name="limit" value="0" />
                  <RoleCheckboxes roles={roles} fieldName="officerRoleIds" inputType="radio" emptyText="Немає доступних ролей для видачі офіцерам. Перевір роль бота та право “Керувати ролями”." />
                  <div className="discord-officer-sync-summary" aria-label="Що перевіряється">
                    <InfoChip title="Склад" text="officer/guild_master" />
                    <InfoChip title="Профілі" text="Усі персонажі" />
                    <InfoChip title="Discord" text="member.nick" />
                  </div>
                  <button className="btn primary" type="submit" disabled={!hasManageableRoles} data-confirm-message="Видати вибрану Discord-роль тільки профілям, де персонаж є у збереженому складі гільдії зі статусом Глава або Офіцер?">Синхронізувати роль</button>
                </div>
              </form>

              <form className="panel discord-management-card" action="/api/admin/discord/nicknames/cleanup" method="post" data-dashboard-action-form="true" data-dashboard-live-submit="true">
                <div className="profile-card-head">
                  <span className="eyebrow">Автоперевірка</span>
                  <h2>Ролі за неправильний нік</h2>
                </div>
                <div className="discord-management-card__body">
                  <p className="profile-card-lead">Перевіряє тільки серверні ніки <code>member.nick</code>. Перед зміною кожен учасник перечитується з Discord ще раз.</p>
                  <input type="hidden" name="apply" value="1" />
                  <label className="field-label">Скільки учасників перевірити
                    <input className="input" name="limit" type="number" min="0" max="50000" defaultValue="0" />
                    <small>0 = пройти всіх учасників Discord-сервера посторінково.</small>
                  </label>
                  <div className="discord-cleanup-role-grid" aria-label="Ролі для масової дії за серверним ніком">
                    <section className="discord-cleanup-role-column">
                      <div className="discord-role-column-head"><span className="eyebrow">Зняти</span><h3>Прибрати ролі</h3></div>
                      <p className="profile-card-lead">Ролі знімаються з учасників, чиї ніки не відповідають шаблону.</p>
                      <RoleCheckboxes roles={roles} fieldName="removeRoleIds" />
                    </section>
                    <section className="discord-cleanup-role-column">
                      <div className="discord-role-column-head"><span className="eyebrow">Видати</span><h3>Додати ролі</h3></div>
                      <p className="profile-card-lead">Опційно для службової або санкційної ролі. Офіцерські ролі тут не використовувати.</p>
                      <RoleCheckboxes roles={roles} fieldName="addRoleIds" />
                    </section>
                  </div>
                  <div className="form-actions form-actions--split">
                    <button className="btn subtle" formAction="/api/admin/discord/nicknames/inspect" formMethod="post" type="submit">Тільки перевірити</button>
                    <button className="btn danger" name="mode" value="apply" type="submit" disabled={!hasManageableRoles} data-confirm-message="Ця дія перечитає кожного учасника з Discord і змінить ролі тільки тим, у кого серверний нік member.nick досі не відповідає шаблону. Офіцерські ролі тут не використовуй. Продовжити?">Застосувати ролі</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
