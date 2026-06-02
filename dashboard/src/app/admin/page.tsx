import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import HeroSidePanel from "@/components/HeroSidePanel";
import AdminTabs from "@/components/AdminTabs";
import IntegrationStatusPanel from "@/components/IntegrationStatusPanel";
import { buildPageMetadata } from "@/lib/seo";
import { getSession } from "@/lib/auth";
import {
  canManageDiscordMembers,
  canManageGroups,
  canViewAdminLogs,
} from "@/lib/permissions";
import {
  getGuildNicknamePolicy,
  nicknameTemplateExample,
} from "@/lib/guildNicknamePolicy";
import { getGeoAccessPolicy } from "@/lib/geoAccessPolicy";
import { getAuthAccessPolicy } from "@/lib/authAccessPolicy";
import { getDashboardApiSettings } from "@/lib/dashboardApiSettings";
import { fetchDiscordRoles } from "@/lib/discordAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = buildPageMetadata({
  title: "Керування",
  description:
    "Центр керування Mistblossom: групи доступу, Discord-ролі, серверні ніки та глобальний шаблон ніку.",
  path: "/admin",
  keywords: ["керування", "Discord", "права", "ролі"],
});

export default async function AdminOverviewPage() {
  const user = await getSession();
  if (!user) {
    redirect("/login");
    throw new Error("Login required");
  }
  if (
    !canManageGroups(user) &&
    !canManageDiscordMembers(user) &&
    !canViewAdminLogs(user)
  ) {
    redirect("/access-denied?reason=admin&from=/admin");
    throw new Error("Access denied");
  }

  const policy = await getGuildNicknamePolicy();
  const geoPolicy = await getGeoAccessPolicy();
  const authPolicy = await getAuthAccessPolicy();
  const apiSettings = await getDashboardApiSettings();
  const canEditGeoPolicy = canManageGroups(user);
  const canEditAuthPolicy = canManageGroups(user);
  const canEditApiSettings = canManageGroups(user);
  let discordRoles: Array<{
    id: string;
    name: string;
    color: number;
    position: number;
    managed: boolean;
  }> = [];
  let authRolesError = "";

  if (canEditAuthPolicy) {
    try {
      discordRoles = await fetchDiscordRoles();
    } catch (error) {
      authRolesError =
        error instanceof Error
          ? error.message
          : String(error || "Discord API error");
    }
  }
  const selectedAuthRoleIds = new Set(authPolicy.requiredRoleIds);
  const loadedAuthRoleIds = new Set(discordRoles.map((role) => role.id));
  const manualAuthRoleIds = discordRoles.length
    ? authPolicy.requiredRoleIds.filter(
        (roleId) => !loadedAuthRoleIds.has(roleId),
      )
    : authPolicy.requiredRoleIds;

  return (
    <main className="container admin-container">
      <section
        className="dashboard-shell content-shell admin-page"
        aria-label="Керування Mistblossom Vanguard"
      >
        <DashboardIdentity user={user} activeSection="admin" />
        <header className="hero panel admin-hero">
          <div className="hero-copy dashboard-hero__copy guild-hero__copy">
            <span className="eyebrow">
              Mistblossom Vanguard • Адміністрування
            </span>
            <h1>Керування</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">
              Один центр для прав доступу, Discord-ролей, серверних ніків і
              глобального шаблону імен.
            </p>
          </div>
          <HeroSidePanel
            ariaLabel="Огляд адміністрування"
            summary={[
              {
                label: "ГРУПА",
                value: user.groupName || user.role,
                note: user.isServerOwner
                  ? "Власник сервера"
                  : "Права з поточної сесії",
              },
              {
                label: "ШАБЛОН",
                value: policy.template,
                note: nicknameTemplateExample(policy.template),
              },
            ]}
            stats={[
              { label: "ГРУПИ", value: canManageGroups(user) ? "ON" : "—" },
              {
                label: "DISCORD",
                value: canManageDiscordMembers(user) ? "ON" : "—",
              },
              { label: "ЛОГИ", value: canViewAdminLogs(user) ? "ON" : "—" },
              { label: "ГЕО", value: geoPolicy.enabled ? "ON" : "OFF" },
              { label: "ВХІД", value: authPolicy.enabled ? "ON" : "OFF" },
              {
                label: "API",
                value: `${Math.round(apiSettings.backgroundRefreshMinSeconds / 60)}хв`,
              },
              {
                label: "WCL",
                value: apiSettings.warcraftLogsClientSecretConfigured
                  ? apiSettings.warcraftLogsCredentialsSource === "panel"
                    ? "PANEL"
                    : "ENV"
                  : "OFF",
              },
              {
                label: "API LOG",
                value: apiSettings.dashboardApiDebugAuditLogs
                  ? "DEBUG"
                  : apiSettings.dashboardApiWarningAuditLogs
                    ? "WARN"
                    : "OFF",
              },
              {
                label: "WCL LOG",
                value: apiSettings.warcraftLogsDebugAuditLogs ? "ON" : "OFF",
              },
              {
                label: "WCL ROSTER",
                value: apiSettings.guildRosterWclEnabled
                  ? apiSettings.guildRosterWclMemberLimit > 0
                    ? String(apiSettings.guildRosterWclMemberLimit)
                    : "ALL"
                  : "OFF",
              },
            ]}
          />
        </header>

        <AdminTabs active="overview" user={user} />

        <section
          className="admin-overview-grid admin-overview-grid--security"
          aria-label="Стан системи та правила доступу"
        >
          <IntegrationStatusPanel
            compact
            className="admin-overview-status-card"
          />

          <article className="panel admin-overview-card admin-overview-card--wide admin-system-summary-card">
            <span aria-hidden="true">✦</span>
            <div>
              <strong>Поточний шаблон ніку</strong>
              <small>
                <code>{policy.template}</code>
              </small>
              <small>Приклад: {nicknameTemplateExample(policy.template)}</small>
            </div>
          </article>

          <article
            id="background-api-settings"
            className="panel admin-overview-card admin-overview-card--wide admin-policy-card background-api-card"
          >
            <header className="admin-policy-card__header">
              <span className="admin-policy-card__icon" aria-hidden="true">
                🔄
              </span>
              <div className="admin-policy-card__title">
                <strong>Фоновий API та автооновлення</strong>
                <small>
                  Керує оновленням профілів, Raider.IO та Warcraft Logs.
                </small>
              </div>
              <div
                className="admin-policy-status"
                aria-label="Поточний стан фонового API"
              >
                <span className="is-on">
                  {Math.round(apiSettings.backgroundRefreshMinSeconds / 60)} хв
                </span>
                <span>
                  {apiSettings.source === "firestore" ? "панель" : "запасне"}
                </span>
                <span>
                  {apiSettings.warcraftLogsClientSecretConfigured
                    ? `WCL: ${apiSettings.warcraftLogsCredentialsSource}`
                    : "WCL: вимкнено"}
                </span>
                <span>
                  {apiSettings.guildRosterWclEnabled
                    ? `WCL склад: ${apiSettings.guildRosterWclMemberLimit > 0 ? apiSettings.guildRosterWclMemberLimit : "усі"}`
                    : "WCL склад: OFF"}
                </span>
              </div>
            </header>

            <form
              className="admin-policy-form"
              action="/api/admin/background-api/settings"
              method="post"
              data-dashboard-action-form="true"
              data-dashboard-live-submit="true"
            >
              <fieldset className="admin-policy-fieldset admin-policy-fieldset--compact">
                <legend>Інтервали оновлення</legend>
                <label className="admin-policy-input">
                  <span>Глобальний фоновий refresh, секунд</span>
                  <small>Як часто оновлювати загальні дані сторінок.</small>
                  <input
                    type="number"
                    name="backgroundRefreshMinSeconds"
                    min={600}
                    max={86400}
                    step={60}
                    defaultValue={apiSettings.backgroundRefreshMinSeconds}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Профіль / Battle.net + Raider.IO, секунд</span>
                  <small>Як часто оновлювати дані персонажів у профілі.</small>
                  <input
                    type="number"
                    name="profileViewRefreshMinSeconds"
                    min={600}
                    max={86400}
                    step={60}
                    defaultValue={apiSettings.profileViewRefreshMinSeconds}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Batch-refresh усіх профілів, секунд</span>
                  <small>Як часто запускати оновлення всіх профілів.</small>
                  <input
                    type="number"
                    name="profileExternalRefreshMinSeconds"
                    min={600}
                    max={86400}
                    step={300}
                    defaultValue={apiSettings.profileExternalRefreshMinSeconds}
                    disabled={!canEditApiSettings}
                  />
                </label>
              </fieldset>

              <fieldset className="admin-policy-fieldset admin-policy-fieldset--compact">
                <legend>Ліміти та паралельність</legend>
                <label className="admin-policy-input">
                  <span>Batch limit профілів</span>
                  <small>Скільки профілів обробляти за один запуск.</small>
                  <input
                    type="number"
                    name="profileExternalRefreshBatchLimit"
                    min={1}
                    max={500}
                    step={1}
                    defaultValue={apiSettings.profileExternalRefreshBatchLimit}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Паралельність персонажів</span>
                  <small>
                    0 = автоматично. Вища паралельність може впиратися в ліміти
                    API.
                  </small>
                  <input
                    type="number"
                    name="profileCharacterRefreshConcurrency"
                    min={0}
                    max={8}
                    step={1}
                    defaultValue={
                      apiSettings.profileCharacterRefreshConcurrency
                    }
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Макс. паралельність персонажів</span>
                  <small>Верхня межа одночасної обробки персонажів.</small>
                  <input
                    type="number"
                    name="profileCharacterRefreshMaxConcurrency"
                    min={1}
                    max={8}
                    step={1}
                    defaultValue={
                      apiSettings.profileCharacterRefreshMaxConcurrency
                    }
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Паралельність batch-профілів</span>
                  <small>0 = автоматично для оновлення всіх профілів.</small>
                  <input
                    type="number"
                    name="profileExternalRefreshConcurrency"
                    min={0}
                    max={6}
                    step={1}
                    defaultValue={apiSettings.profileExternalRefreshConcurrency}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Макс. batch-паралельність</span>
                  <small>Верхня межа одночасних профілів.</small>
                  <input
                    type="number"
                    name="profileExternalRefreshMaxConcurrency"
                    min={1}
                    max={6}
                    step={1}
                    defaultValue={
                      apiSettings.profileExternalRefreshMaxConcurrency
                    }
                    disabled={!canEditApiSettings}
                  />
                </label>
              </fieldset>

              <fieldset className="admin-policy-fieldset admin-policy-fieldset--compact admin-policy-fieldset--dense">
                <legend>Runtime-параметри сайту</legend>
                <label className="admin-policy-input">
                  <span>Guild region</span>
                  <small>Battle.net/Raider.IO region для складу.</small>
                  <input
                    name="guildRosterRegion"
                    defaultValue={apiSettings.guildRosterRegion}
                    disabled={!canEditApiSettings}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Guild realm</span>
                  <small>Realm slug без пробілів, наприклад terokkar.</small>
                  <input
                    name="guildRosterRealm"
                    defaultValue={apiSettings.guildRosterRealm}
                    disabled={!canEditApiSettings}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Guild name</span>
                  <small>Назва гільдії для Battle.net Guild Roster API.</small>
                  <input
                    name="guildRosterName"
                    defaultValue={apiSettings.guildRosterName}
                    disabled={!canEditApiSettings}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Guild cache TTL, секунд</span>
                  <small>Коли кеш складу вважається застарілим.</small>
                  <input
                    type="number"
                    name="guildRosterCacheTtlSeconds"
                    min={300}
                    max={86400}
                    step={300}
                    defaultValue={apiSettings.guildRosterCacheTtlSeconds}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Guild read cache TTL, мс</span>
                  <small>In-memory кеш читання guildRuntimeCache.</small>
                  <input
                    type="number"
                    name="guildRosterCacheReadTtlMs"
                    min={30000}
                    max={300000}
                    step={10000}
                    defaultValue={apiSettings.guildRosterCacheReadTtlMs}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Guild write batch size</span>
                  <small>Скільки chunk-docs писати за один Firestore batch.</small>
                  <input
                    type="number"
                    name="guildRosterCacheWriteBatchSize"
                    min={1}
                    max={250}
                    step={1}
                    defaultValue={apiSettings.guildRosterCacheWriteBatchSize}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Guild records chunk size</span>
                  <small>Скільки персонажів тримати в одному Firebase chunk-документі.</small>
                  <input
                    type="number"
                    name="guildRosterRecordsChunkSize"
                    min={25}
                    max={120}
                    step={1}
                    defaultValue={apiSettings.guildRosterRecordsChunkSize}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <input type="hidden" name="guildRosterReadLegacyMemberDocs" value="0" />
                <label className="admin-policy-toggle admin-policy-toggle--danger">
                  <input
                    type="checkbox"
                    name="guildRosterReadLegacyMemberDocs"
                    value="1"
                    defaultChecked={apiSettings.guildRosterReadLegacyMemberDocs}
                    disabled={!canEditApiSettings}
                  />
                  <span>
                    <strong>Дозволити legacy читання member-docs</strong>
                    <small>Тільки для міграції. У бойовому режимі вимкнено, щоб не спалювати Firebase reads.</small>
                  </span>
                </label>
                <input type="hidden" name="guildRosterWriteLegacyMemberDocs" value="0" />
                <label className="admin-policy-toggle admin-policy-toggle--danger">
                  <input
                    type="checkbox"
                    name="guildRosterWriteLegacyMemberDocs"
                    value="1"
                    defaultChecked={apiSettings.guildRosterWriteLegacyMemberDocs}
                    disabled={!canEditApiSettings}
                  />
                  <span>
                    <strong>Дублювати запис у legacy member-docs</strong>
                    <small>Не вмикати постійно. Основне сховище тепер chunked records.</small>
                  </span>
                </label>
                <label className="admin-policy-input">
                  <span>Guild refresh concurrency</span>
                  <small>Легка паралельність внутрішньої обробки roster.</small>
                  <input
                    type="number"
                    name="guildRosterRefreshConcurrency"
                    min={1}
                    max={12}
                    step={1}
                    defaultValue={apiSettings.guildRosterRefreshConcurrency}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Guild max concurrency</span>
                  <small>Верхня межа паралельності roster-обробки.</small>
                  <input
                    type="number"
                    name="guildRosterRefreshMaxConcurrency"
                    min={1}
                    max={12}
                    step={1}
                    defaultValue={apiSettings.guildRosterRefreshMaxConcurrency}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <input type="hidden" name="guildRosterCacheDeleteStaleMembers" value="0" />
                <label className="admin-policy-toggle">
                  <input
                    type="checkbox"
                    name="guildRosterCacheDeleteStaleMembers"
                    value="1"
                    defaultChecked={apiSettings.guildRosterCacheDeleteStaleMembers}
                    disabled={!canEditApiSettings}
                  />
                  <span>
                    <strong>Видаляти stale member-docs</strong>
                    <small>Вимкнено за замовчуванням, щоб не створювати write storm у Firebase.</small>
                  </span>
                </label>
              </fieldset>

              <fieldset className="admin-policy-fieldset admin-policy-fieldset--compact admin-policy-fieldset--dense">
                <legend>Timeout, retry та кеші сторінок</legend>
                <label className="admin-policy-input">
                  <span>Battle.net timeout, мс</span>
                  <input type="number" name="battleNetRequestTimeoutMs" min={2500} max={30000} step={500} defaultValue={apiSettings.battleNetRequestTimeoutMs} disabled={!canEditApiSettings} />
                </label>
                <label className="admin-policy-input">
                  <span>Battle.net retries</span>
                  <input type="number" name="battleNetRequestRetries" min={0} max={5} step={1} defaultValue={apiSettings.battleNetRequestRetries} disabled={!canEditApiSettings} />
                </label>
                <label className="admin-policy-input">
                  <span>Raider.IO timeout, мс</span>
                  <input type="number" name="raiderIoRequestTimeoutMs" min={2500} max={30000} step={500} defaultValue={apiSettings.raiderIoRequestTimeoutMs} disabled={!canEditApiSettings} />
                </label>
                <label className="admin-policy-input">
                  <span>Raider.IO retries</span>
                  <input type="number" name="raiderIoRequestRetries" min={0} max={4} step={1} defaultValue={apiSettings.raiderIoRequestRetries} disabled={!canEditApiSettings} />
                </label>
                <label className="admin-policy-input">
                  <span>Raider.IO cooldown після 429, секунд</span>
                  <small>Пауза для всього сайту після відповіді Too many requests.</small>
                  <input type="number" name="raiderIoRateLimitCooldownSeconds" min={60} max={86400} step={60} defaultValue={apiSettings.raiderIoRateLimitCooldownSeconds} disabled={!canEditApiSettings} />
                </label>
                <label className="admin-policy-input">
                  <span>Raider.IO пауза між запитами, мс</span>
                  <small>Локальний throttle, щоб не перевищувати ліміт API під час великих ростерів.</small>
                  <input type="number" name="raiderIoRequestMinDelayMs" min={0} max={10000} step={50} defaultValue={apiSettings.raiderIoRequestMinDelayMs} disabled={!canEditApiSettings} />
                </label>
                <label className="admin-policy-input">
                  <span>Profile read cache, мс</span>
                  <input type="number" name="profileReadCacheTtlMs" min={30000} max={300000} step={10000} defaultValue={apiSettings.profileReadCacheTtlMs} disabled={!canEditApiSettings} />
                </label>
                <label className="admin-policy-input">
                  <span>Profile list cache, мс</span>
                  <input type="number" name="profileListCacheTtlMs" min={30000} max={300000} step={10000} defaultValue={apiSettings.profileListCacheTtlMs} disabled={!canEditApiSettings} />
                </label>
                <label className="admin-policy-input">
                  <span>Character links cache, мс</span>
                  <input type="number" name="profileCharacterLinksCacheTtlMs" min={30000} max={600000} step={10000} defaultValue={apiSettings.profileCharacterLinksCacheTtlMs} disabled={!canEditApiSettings} />
                </label>
                <label className="admin-policy-input">
                  <span>Raid list cache, мс</span>
                  <input type="number" name="raidListCacheTtlMs" min={30000} max={300000} step={10000} defaultValue={apiSettings.raidListCacheTtlMs} disabled={!canEditApiSettings} />
                </label>
                <label className="admin-policy-input">
                  <span>Raid item cache, мс</span>
                  <input type="number" name="raidItemCacheTtlMs" min={10000} max={120000} step={5000} defaultValue={apiSettings.raidItemCacheTtlMs} disabled={!canEditApiSettings} />
                </label>
              </fieldset>

              <fieldset className="admin-policy-fieldset admin-policy-fieldset--compact">
                <legend>Кеш та обсяг даних</legend>
                <label className="admin-policy-input">
                  <span>Кеш Raider.IO, мс</span>
                  <small>
                    Скільки тримати відповідь по персонажу в памʼяті сервера.
                  </small>
                  <input
                    type="number"
                    name="raiderIoCharacterCacheTtlMs"
                    min={0}
                    max={900000}
                    step={30000}
                    defaultValue={apiSettings.raiderIoCharacterCacheTtlMs}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Кеш Warcraft Logs, мс</span>
                  <small>
                    Скільки тримати зібрану WCL-статистику персонажа.
                  </small>
                  <input
                    type="number"
                    name="warcraftLogsCharacterCacheTtlMs"
                    min={0}
                    max={900000}
                    step={30000}
                    defaultValue={apiSettings.warcraftLogsCharacterCacheTtlMs}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>WCL звітів</span>
                  <small>
                    Скільки останніх рейдових звітів переглядати для персонажа.
                  </small>
                  <input
                    type="number"
                    name="warcraftLogsRecentReportLimit"
                    min={1}
                    max={30}
                    step={1}
                    defaultValue={apiSettings.warcraftLogsRecentReportLimit}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>WCL боїв у звіті</span>
                  <small>Скільки boss-pulls брати з одного звіту.</small>
                  <input
                    type="number"
                    name="warcraftLogsReportFightTableLimit"
                    min={4}
                    max={60}
                    step={1}
                    defaultValue={apiSettings.warcraftLogsReportFightTableLimit}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <input type="hidden" name="dashboardApiDebugAuditLogs" value="0" />
                <label className="admin-policy-toggle">
                  <input
                    type="checkbox"
                    name="dashboardApiDebugAuditLogs"
                    value="1"
                    defaultChecked={apiSettings.dashboardApiDebugAuditLogs}
                    disabled={!canEditApiSettings}
                  />
                  <span>
                    <strong>Глобальний debug API у журналі</strong>
                    <small>
                      Записує детальні кроки guild/API sync у /admin/logs. Вмикай тимчасово, бо для великої гільдії це багато записів.
                    </small>
                  </span>
                </label>
                <input type="hidden" name="dashboardApiWarningAuditLogs" value="0" />
                <label className="admin-policy-toggle">
                  <input
                    type="checkbox"
                    name="dashboardApiWarningAuditLogs"
                    value="1"
                    defaultChecked={apiSettings.dashboardApiWarningAuditLogs}
                    disabled={!canEditApiSettings}
                  />
                  <span>
                    <strong>Надсилати warning/error API у Discord-журнал</strong>
                    <small>
                      Таймаути, вичерпаний бюджет кроку, часткові помилки Raider.IO/WCL і падіння sync job йдуть у Discord-журнал без запису в dashboardAdminAudit.
                    </small>
                  </span>
                </label>
                <label className="admin-policy-input">
                  <span>Discord audit read cache TTL, мс</span>
                  <small>Кеш читання /admin/logs, щоб сторінка не зверталась до Discord API при кожному відкритті.</small>
                  <input
                    type="number"
                    name="auditLogReadCacheTtlMs"
                    min={10000}
                    max={120000}
                    step={5000}
                    defaultValue={apiSettings.auditLogReadCacheTtlMs}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Discord audit dedupe window, мс</span>
                  <small>Однакові системні помилки в цьому вікні не дублюються в Discord.</small>
                  <input
                    type="number"
                    name="auditLogDedupeWindowMs"
                    min={0}
                    max={600000}
                    step={10000}
                    defaultValue={apiSettings.auditLogDedupeWindowMs}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Audit max visible</span>
                  <small>Скільки останніх записів показувати з Discord-журналу та локальної памʼяті процесу.</small>
                  <input
                    type="number"
                    name="auditLogMaxStored"
                    min={100}
                    max={1000}
                    step={50}
                    defaultValue={apiSettings.auditLogMaxStored}
                    disabled={!canEditApiSettings}
                  />
                </label>
              </fieldset>

              <fieldset className="admin-policy-fieldset admin-policy-fieldset--compact">
                <legend>Склад гільдії: покрокова синхронізація</legend>
                <label className="admin-policy-input">
                  <span>Ліміт персонажів складу</span>
                  <small>
                    Максимум персонажів, які читаються з Battle.net roster. Для
                    великої гільдії став 1000.
                  </small>
                  <input
                    type="number"
                    name="guildRosterMemberLimit"
                    min={1}
                    max={1000}
                    step={1}
                    defaultValue={apiSettings.guildRosterMemberLimit}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Бюджет одного API-кроку, мс</span>
                  <small>
                    Скільки часу сервер може витратити на один короткий крок.
                    Безпечніше тримати нижче 30 секунд.
                  </small>
                  <input
                    type="number"
                    name="guildRosterRefreshStepBudgetMs"
                    min={5000}
                    max={38000}
                    step={1000}
                    defaultValue={apiSettings.guildRosterRefreshStepBudgetMs}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>TTL sync job, секунд</span>
                  <small>
                    Через скільки секунд завислий job вважається застарілим і
                    може бути створений заново.
                  </small>
                  <input
                    type="number"
                    name="guildRosterSyncJobTtlSeconds"
                    min={300}
                    max={21600}
                    step={60}
                    defaultValue={apiSettings.guildRosterSyncJobTtlSeconds}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Battle.net profile крок</span>
                  <small>
                    Скільки персонажів оновлювати з Battle.net Profile API за один HTTP-крок: avatar, item level, spec і роль.
                  </small>
                  <input
                    type="number"
                    name="guildRosterBattleNetStepSize"
                    min={0}
                    max={100}
                    step={1}
                    defaultValue={apiSettings.guildRosterBattleNetStepSize}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Battle.net profile TTL, секунд</span>
                  <small>
                    Скільки тримати Battle.net snapshot персонажа перед повторним оновленням.
                  </small>
                  <input
                    type="number"
                    name="guildRosterBattleNetTtlSeconds"
                    min={300}
                    max={604800}
                    step={300}
                    defaultValue={apiSettings.guildRosterBattleNetTtlSeconds}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Raider.IO крок</span>
                  <small>
                    Скільки персонажів Raider.IO обробляти за один HTTP-крок. Raider.IO тут дає тільки M+ score і profile URL.
                  </small>
                  <input
                    type="number"
                    name="guildRosterRaiderIoStepSize"
                    min={0}
                    max={100}
                    step={1}
                    defaultValue={apiSettings.guildRosterRaiderIoStepSize}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Raider.IO TTL, секунд</span>
                  <small>
                    Скільки тримати Raider.IO snapshot персонажа перед повторною
                    перевіркою.
                  </small>
                  <input
                    type="number"
                    name="guildRosterRaiderIoTtlSeconds"
                    min={300}
                    max={604800}
                    step={300}
                    defaultValue={apiSettings.guildRosterRaiderIoTtlSeconds}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <input
                  type="hidden"
                  name="guildRosterShardedCacheEnabled"
                  value="0"
                />
                <label className="admin-policy-toggle">
                  <input
                    type="checkbox"
                    name="guildRosterShardedCacheEnabled"
                    value="1"
                    defaultChecked={apiSettings.guildRosterShardedCacheEnabled}
                    disabled={!canEditApiSettings}
                  />
                  <span>
                    <strong>Sharded cache для великого складу</strong>
                    <small>
                      Зберігає кожного персонажа окремим документом, щоб не
                      роздувати один Firestore-документ.
                    </small>
                  </span>
                </label>
                <label className="admin-policy-input">
                  <span>Поріг sharded cache</span>
                  <small>
                    Починати окремі документи, коли склад має стільки персонажів
                    або більше.
                  </small>
                  <input
                    type="number"
                    name="guildRosterShardedCacheThreshold"
                    min={1}
                    max={1000}
                    step={1}
                    defaultValue={apiSettings.guildRosterShardedCacheThreshold}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <input
                  type="hidden"
                  name="guildRosterClientDrivenSyncEnabled"
                  value="0"
                />
                <label className="admin-policy-toggle">
                  <input
                    type="checkbox"
                    name="guildRosterClientDrivenSyncEnabled"
                    value="1"
                    defaultChecked={
                      apiSettings.guildRosterClientDrivenSyncEnabled
                    }
                    disabled={!canEditApiSettings}
                  />
                  <span>
                    <strong>Клієнтський цикл синхронізації</strong>
                    <small>
                      Браузер адміністратора послідовно викликає короткі
                      API-кроки. Токени й запис у Firebase залишаються тільки на
                      сервері.
                    </small>
                  </span>
                </label>
                <label className="admin-policy-input">
                  <span>Пауза між клієнтськими кроками, мс</span>
                  <small>
                    Менше значення швидше, але може сильніше впиратися у
                    зовнішні API.
                  </small>
                  <input
                    type="number"
                    name="guildRosterClientStepDelayMs"
                    min={0}
                    max={5000}
                    step={50}
                    defaultValue={apiSettings.guildRosterClientStepDelayMs}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Timeout клієнтського кроку, мс</span>
                  <small>
                    Скільки браузер чекає відповідь одного /api/guild/refresh
                    кроку.
                  </small>
                  <input
                    type="number"
                    name="guildRosterClientRequestTimeoutMs"
                    min={5000}
                    max={60000}
                    step={1000}
                    defaultValue={apiSettings.guildRosterClientRequestTimeoutMs}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Макс. клієнтських кроків</span>
                  <small>
                    Запобіжник, щоб браузер не крутив синхронізацію нескінченно.
                  </small>
                  <input
                    type="number"
                    name="guildRosterClientMaxSteps"
                    min={1}
                    max={10000}
                    step={10}
                    defaultValue={apiSettings.guildRosterClientMaxSteps}
                    disabled={!canEditApiSettings}
                  />
                </label>
              </fieldset>

              <fieldset className="admin-policy-fieldset admin-policy-fieldset--compact">
                <legend>Warcraft Logs у складі гільдії</legend>
                <input type="hidden" name="guildRosterWclEnabled" value="0" />
                <label className="admin-policy-toggle">
                  <input
                    type="checkbox"
                    name="guildRosterWclEnabled"
                    value="1"
                    defaultChecked={apiSettings.guildRosterWclEnabled}
                    disabled={!canEditApiSettings}
                  />
                  <span>
                    <strong>Показувати HPS/DPS зі WCL у списку складу</strong>
                    <small>
                      Дані записуються в guildRuntimeCache → guildRoster →
                      payload.members[].warcraftLogs і читаються зі збереженого
                      кешу.
                    </small>
                  </span>
                </label>
                <label className="admin-policy-input">
                  <span>WCL персонажів у складі</span>
                  <small>
                    0 = обробляти весь склад. Для великих ростерів краще ставити
                    40–120, щоб не впиратися в rate limits.
                  </small>
                  <input
                    type="number"
                    name="guildRosterWclMemberLimit"
                    min={0}
                    max={1000}
                    step={1}
                    defaultValue={apiSettings.guildRosterWclMemberLimit}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>WCL паралельність складу</span>
                  <small>
                    0 = автоматично. Це кількість одночасних WCL-запитів під час
                    оновлення guildRoster cache.
                  </small>
                  <input
                    type="number"
                    name="guildRosterWclConcurrency"
                    min={0}
                    max={8}
                    step={1}
                    defaultValue={apiSettings.guildRosterWclConcurrency}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Макс. WCL паралельність складу</span>
                  <small>
                    Верхня межа для автоматичного режиму та ручної
                    паралельності.
                  </small>
                  <input
                    type="number"
                    name="guildRosterWclMaxConcurrency"
                    min={1}
                    max={8}
                    step={1}
                    defaultValue={apiSettings.guildRosterWclMaxConcurrency}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>WCL крок складу</span>
                  <small>
                    Скільки персонажів WCL обробляти за один HTTP-крок. Для
                    стабільності 1–2.
                  </small>
                  <input
                    type="number"
                    name="guildRosterWclStepSize"
                    min={0}
                    max={20}
                    step={1}
                    defaultValue={apiSettings.guildRosterWclStepSize}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>WCL snapshot TTL, секунд</span>
                  <small>
                    Скільки тримати збережений DPS/HPS snapshot персонажа перед
                    повторною перевіркою.
                  </small>
                  <input
                    type="number"
                    name="guildRosterProfileWclTtlSeconds"
                    min={300}
                    max={604800}
                    step={300}
                    defaultValue={apiSettings.guildRosterProfileWclTtlSeconds}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>WCL roster timeout, мс</span>
                  <small>
                    Timeout одного Warcraft Logs GraphQL-запиту у roster mode.
                  </small>
                  <input
                    type="number"
                    name="warcraftLogsRosterRequestTimeoutMs"
                    min={1500}
                    max={12000}
                    step={500}
                    defaultValue={
                      apiSettings.warcraftLogsRosterRequestTimeoutMs
                    }
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>WCL roster retries</span>
                  <small>
                    Повторні спроби для WCL roster-запитів. 0 — найменший ризик
                    timeout.
                  </small>
                  <input
                    type="number"
                    name="warcraftLogsRosterRequestRetries"
                    min={0}
                    max={2}
                    step={1}
                    defaultValue={apiSettings.warcraftLogsRosterRequestRetries}
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>WCL recent reports для складу</span>
                  <small>
                    Скільки останніх report перевіряти в легкому roster mode.
                  </small>
                  <input
                    type="number"
                    name="warcraftLogsRosterRecentReportLimit"
                    min={1}
                    max={8}
                    step={1}
                    defaultValue={
                      apiSettings.warcraftLogsRosterRecentReportLimit
                    }
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>WCL boss fights у report</span>
                  <small>
                    Скільки boss-fight seed брати з одного report у roster mode.
                  </small>
                  <input
                    type="number"
                    name="warcraftLogsRosterReportFightTableLimit"
                    min={3}
                    max={16}
                    step={1}
                    defaultValue={
                      apiSettings.warcraftLogsRosterReportFightTableLimit
                    }
                    disabled={!canEditApiSettings}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>WCL report table concurrency</span>
                  <small>
                    Паралельність читання tables всередині одного WCL-персонажа
                    у roster mode.
                  </small>
                  <input
                    type="number"
                    name="warcraftLogsRosterReportTableConcurrency"
                    min={1}
                    max={2}
                    step={1}
                    defaultValue={
                      apiSettings.warcraftLogsRosterReportTableConcurrency
                    }
                    disabled={!canEditApiSettings}
                  />
                </label>
                <div className="admin-policy-hint admin-policy-hint--split">
                  <strong>Поточний стан WCL для складу</strong>
                  <small>
                    Режим:{" "}
                    {apiSettings.guildRosterWclEnabled
                      ? "увімкнено"
                      : "вимкнено"}
                  </small>
                  <small>
                    Ліміт персонажів:{" "}
                    {apiSettings.guildRosterWclMemberLimit > 0
                      ? apiSettings.guildRosterWclMemberLimit
                      : "усі"}
                  </small>
                  <small>
                    Паралельність:{" "}
                    {apiSettings.guildRosterWclConcurrency > 0
                      ? apiSettings.guildRosterWclConcurrency
                      : "auto"}{" "}
                    / max {apiSettings.guildRosterWclMaxConcurrency}
                  </small>
                  <small>
                    Крок: {apiSettings.guildRosterWclStepSize}; TTL:{" "}
                    {Math.round(
                      apiSettings.guildRosterProfileWclTtlSeconds / 60,
                    )}{" "}
                    хв
                  </small>
                  <small>
                    GraphQL: timeout{" "}
                    {apiSettings.warcraftLogsRosterRequestTimeoutMs}мс, retries{" "}
                    {apiSettings.warcraftLogsRosterRequestRetries}, reports{" "}
                    {apiSettings.warcraftLogsRosterRecentReportLimit}, fights{" "}
                    {apiSettings.warcraftLogsRosterReportFightTableLimit}
                  </small>
                </div>
              </fieldset>

              <fieldset className="admin-policy-fieldset admin-policy-fieldset--compact">
                <legend>Warcraft Logs API</legend>
                <label className="admin-policy-input">
                  <span>Warcraft Logs Client ID</span>
                  <small>
                    Можна зберігати тут. Якщо поле порожнє, система використає
                    запасне значення з деплою.
                  </small>
                  <input
                    name="warcraftLogsClientId"
                    defaultValue={apiSettings.warcraftLogsClientId || ""}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    disabled={!canEditApiSettings}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Warcraft Logs Client Secret</span>
                  <small>
                    Секрет не показується повторно. Вводь його тільки для
                    встановлення або заміни.
                  </small>
                  <input
                    type="password"
                    name="warcraftLogsClientSecret"
                    placeholder={
                      apiSettings.warcraftLogsClientSecretConfigured
                        ? "Secret уже налаштований — залиш порожнім, щоб не змінювати"
                        : "Встав Client Secret"
                    }
                    disabled={!canEditApiSettings}
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                </label>
                <label className="admin-policy-input">
                  <span>Warcraft Logs Base URL</span>
                  <small>
                    Залиш стандартну адресу, якщо немає окремої причини
                    змінювати.
                  </small>
                  <input
                    name="warcraftLogsBaseUrl"
                    defaultValue={apiSettings.warcraftLogsBaseUrl}
                    placeholder="https://www.warcraftlogs.com"
                    disabled={!canEditApiSettings}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <input
                  type="hidden"
                  name="warcraftLogsDebugAuditLogs"
                  value="0"
                />
                <label className="admin-policy-toggle">
                  <input
                    type="checkbox"
                    name="warcraftLogsDebugAuditLogs"
                    value="1"
                    defaultChecked={apiSettings.warcraftLogsDebugAuditLogs}
                    disabled={!canEditApiSettings}
                  />
                  <span>
                    <strong>Увімкнути тимчасовий WCL debug audit log</strong>
                    <small>
                      Тимчасово записує сирі відповіді та розбір даних у
                      загальні логи. Після перевірки вимкни.
                    </small>
                  </span>
                </label>

                <label className="admin-policy-toggle admin-policy-toggle--danger">
                  <input
                    type="checkbox"
                    name="clearWarcraftLogsClientSecret"
                    disabled={!canEditApiSettings}
                  />
                  <span>
                    <strong>Очистити збережений Client Secret у панелі</strong>
                    <small>
                      Очищає секрет із панелі. Запасне значення з деплою не
                      чіпається.
                    </small>
                  </span>
                </label>
                <div className="admin-policy-hint admin-policy-hint--split">
                  <strong>Поточний стан Warcraft Logs</strong>
                  <small>
                    Статус:{" "}
                    {apiSettings.warcraftLogsClientSecretConfigured
                      ? "налаштовано"
                      : "не налаштовано"}
                  </small>
                  <small>
                    Джерело:{" "}
                    {apiSettings.warcraftLogsCredentialsSource === "panel"
                      ? "панель керування"
                      : apiSettings.warcraftLogsCredentialsSource === "env"
                        ? "запасне значення"
                        : "немає"}
                  </small>
                  <small>
                    Secret:{" "}
                    {apiSettings.warcraftLogsClientSecretConfigured
                      ? "збережений / доступний"
                      : "відсутній"}
                  </small>
                  <small>
                    Debug audit log:{" "}
                    {apiSettings.warcraftLogsDebugAuditLogs
                      ? "увімкнено"
                      : "вимкнено"}
                  </small>
                  <small>
                    Обсяг: {apiSettings.warcraftLogsRecentReportLimit} звітів /{" "}
                    {apiSettings.warcraftLogsReportFightTableLimit} боїв
                  </small>
                </div>
              </fieldset>

              <footer className="admin-policy-footer">
                <small>
                  Якщо панель ще не збережена, поточні значення взяті з ENV/fallback. Натисни збереження, щоб записати їх у Firebase й використовувати як єдине runtime-джерело.
                </small>
                <button
                  className="btn primary"
                  type="submit"
                  disabled={!canEditApiSettings}
                >
                  Зберегти runtime-параметри
                </button>
              </footer>
            </form>
          </article>

          <article className="panel admin-overview-card admin-overview-card--wide admin-policy-card auth-access-card">
            <header className="admin-policy-card__header">
              <span className="admin-policy-card__icon" aria-hidden="true">
                🔐
              </span>
              <div className="admin-policy-card__title">
                <strong>Авторизація та реєстрація</strong>
                <small>
                  Серверна перевірка Discord-входу: користувач має бути на
                  сервері й мати одну з дозволених ролей.
                </small>
              </div>
              <div
                className="admin-policy-status"
                aria-label="Поточний стан авторизації"
              >
                <span className={authPolicy.enabled ? "is-on" : "is-off"}>
                  {authPolicy.enabled ? "Увімкнено" : "Вимкнено"}
                </span>
                <span>
                  {authPolicy.requiredRoleIds.length
                    ? `${authPolicy.requiredRoleIds.length} рол.`
                    : "роль не вибрана"}
                </span>
              </div>
            </header>

            <form
              className="admin-policy-form auth-access-form"
              action="/api/admin/security/auth-access"
              method="post"
              data-dashboard-action-form="true"
              data-dashboard-live-submit="true"
            >
              <fieldset className="admin-policy-fieldset">
                <legend>Режим входу</legend>
                <label className="admin-policy-toggle">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={authPolicy.enabled}
                    disabled={!canEditAuthPolicy}
                  />
                  <span>
                    <strong>Обмежити вхід Discord-роллю</strong>
                    <small>
                      Перевіряється під час OAuth callback і live-перевірки
                      сесії.
                    </small>
                  </span>
                </label>
                <label className="admin-policy-toggle">
                  <input
                    type="checkbox"
                    name="requireConfiguredRole"
                    defaultChecked={authPolicy.requireConfiguredRole}
                    disabled={!canEditAuthPolicy}
                  />
                  <span>
                    <strong>Блокувати, якщо роль не вибрана</strong>
                    <small>
                      <code>AUTH_ACCESS_REQUIRE_CONFIGURED_ROLE=true</code>.
                      Якщо роль не вибрана — вхід блокується.
                    </small>
                  </span>
                </label>
                <label className="admin-policy-toggle">
                  <input
                    type="checkbox"
                    name="allowServerOwner"
                    defaultChecked={authPolicy.allowServerOwner}
                    disabled={!canEditAuthPolicy}
                  />
                  <span>
                    <strong>Дозволити власнику сервера обхід ролі</strong>
                    <small>
                      Корисно, якщо Discord не дозволяє видати власнику звичайну
                      роль.
                    </small>
                  </span>
                </label>
                <label className="admin-policy-toggle admin-policy-toggle--danger">
                  <input
                    type="checkbox"
                    name="allowEmergencyTokenLogin"
                    defaultChecked={authPolicy.allowEmergencyTokenLogin}
                    disabled={!canEditAuthPolicy}
                  />
                  <span>
                    <strong>Дозволити резервний token-вхід</strong>
                    <small>
                      <code>AUTH_ACCESS_ALLOW_EMERGENCY_TOKEN_LOGIN=false</code>
                      . Вмикати тільки як аварійний доступ: token-вхід не має
                      Discord membership/role перевірки.
                    </small>
                  </span>
                </label>
              </fieldset>

              <fieldset className="admin-policy-fieldset admin-policy-fieldset--roles">
                <legend>Роль, потрібна для авторизації / реєстрації</legend>
                {authRolesError ? (
                  <small className="error-note">
                    Не вдалося завантажити ролі Discord. Можна вставити role ID
                    вручну нижче.
                  </small>
                ) : null}
                {discordRoles.length ? (
                  <div className="auth-access-role-list">
                    {discordRoles.map((role) => (
                      <label className="auth-access-role-option" key={role.id}>
                        <input
                          type="checkbox"
                          name="requiredRoleIds"
                          value={role.id}
                          defaultChecked={selectedAuthRoleIds.has(role.id)}
                          disabled={!canEditAuthPolicy}
                        />
                        <span>{role.name}</span>
                        <small>{role.id}</small>
                      </label>
                    ))}
                  </div>
                ) : (
                  <small className="admin-policy-empty">
                    Список ролей недоступний або порожній.
                  </small>
                )}
                <label className="admin-policy-input">
                  <span>Role ID вручну</span>
                  <small>
                    Сюди потрапляють тільки ролі, яких немає у списку вище.
                    Інакше зняті чекбокси знову додавалися б через це поле.
                  </small>
                  <input
                    name="requiredRoleIdsText"
                    defaultValue={manualAuthRoleIds.join(", ")}
                    placeholder="123456789012345678, 234567890123456789"
                    disabled={!canEditAuthPolicy}
                  />
                </label>
              </fieldset>

              <footer className="admin-policy-footer">
                <small>
                  Поточний стан:{" "}
                  {authPolicy.enabled
                    ? "обмеження увімкнені"
                    : "обмеження вимкнені"}
                  ; без вибраної ролі:{" "}
                  {authPolicy.requireConfiguredRole
                    ? "блокувати"
                    : "дозволяти за старими правилами"}
                  ; резервний token-вхід:{" "}
                  {authPolicy.allowEmergencyTokenLogin
                    ? "дозволено"
                    : "заборонено"}
                  . Безпечний дефолт:{" "}
                  <code>AUTH_ACCESS_REQUIRE_CONFIGURED_ROLE=true</code>,{" "}
                  <code>AUTH_ACCESS_ALLOW_EMERGENCY_TOKEN_LOGIN=false</code>.
                </small>
                <button
                  className="btn primary"
                  type="submit"
                  disabled={!canEditAuthPolicy}
                >
                  Зберегти правила входу
                </button>
              </footer>
            </form>
          </article>

          <article className="panel admin-overview-card admin-overview-card--wide admin-policy-card geo-access-card">
            <header className="admin-policy-card__header">
              <span className="admin-policy-card__icon" aria-hidden="true">
                🛡
              </span>
              <div className="admin-policy-card__title">
                <strong>Геообмеження доступу</strong>
                <small>
                  Блокує подання заявок і старт авторизації за edge-сигналом
                  Cloudflare/Vercel без зовнішніх IP-баз.
                </small>
              </div>
              <div
                className="admin-policy-status"
                aria-label="Поточний стан геообмежень"
              >
                <span className={geoPolicy.enabled ? "is-on" : "is-off"}>
                  {geoPolicy.enabled ? "Увімкнено" : "Вимкнено"}
                </span>
                <span>
                  {geoPolicy.blockedCountries.join(", ") || "країни не задані"}
                </span>
              </div>
            </header>

            <form
              className="admin-policy-form"
              action="/api/admin/security/geo-access"
              method="post"
              data-dashboard-action-form="true"
              data-dashboard-live-submit="true"
            >
              <fieldset className="admin-policy-fieldset">
                <legend>Що блокувати</legend>
                <label className="admin-policy-toggle">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={geoPolicy.enabled}
                    disabled={!canEditGeoPolicy}
                  />
                  <span>
                    <strong>Увімкнути геообмеження</strong>
                    <small>Глобальний перемикач для цієї політики.</small>
                  </span>
                </label>
                <label className="admin-policy-toggle">
                  <input
                    type="checkbox"
                    name="blockApplications"
                    defaultChecked={geoPolicy.blockApplications}
                    disabled={!canEditGeoPolicy}
                  />
                  <span>
                    <strong>Забороняти подання заявок</strong>
                    <small>
                      Перевірка виконується у Worker перед створенням заявки.
                    </small>
                  </span>
                </label>
                <label className="admin-policy-toggle">
                  <input
                    type="checkbox"
                    name="blockAuth"
                    defaultChecked={geoPolicy.blockAuth}
                    disabled={!canEditGeoPolicy}
                  />
                  <span>
                    <strong>Забороняти авторизацію</strong>
                    <small>
                      Старт OAuth і callback блокуються до створення сесії.
                    </small>
                  </span>
                </label>
                <label className="admin-policy-toggle admin-policy-toggle--danger">
                  <input
                    type="checkbox"
                    name="blockUnknownCountries"
                    defaultChecked={geoPolicy.blockUnknownCountries}
                    disabled={!canEditGeoPolicy}
                  />
                  <span>
                    <strong>Блокувати невідому країну</strong>
                    <small>
                      Обережно: може зачепити VPN, privacy relay або погано
                      проксовані запити.
                    </small>
                  </span>
                </label>
              </fieldset>

              <fieldset className="admin-policy-fieldset admin-policy-fieldset--compact">
                <legend>Країни</legend>
                <label className="admin-policy-input">
                  <span>ISO-коди країн</span>
                  <small>
                    Зберігаються як ISO 3166 Alpha-2. Можна вводити{" "}
                    <code>RU</code>, <code>BY</code>, а також aliases{" "}
                    <code>RUS/643</code>, <code>BLR/112</code> — вони
                    автоматично стануть <code>RU/BY</code>.
                  </small>
                  <input
                    name="blockedCountries"
                    defaultValue={geoPolicy.blockedCountries.join(", ")}
                    placeholder="RU, BY"
                    disabled={!canEditGeoPolicy}
                    autoCapitalize="characters"
                    spellCheck={false}
                  />
                </label>
                <div
                  className="geo-country-chip-list"
                  aria-label="Заблоковані країни"
                >
                  {geoPolicy.blockedCountries.length ? (
                    geoPolicy.blockedCountries.map((country) => (
                      <span className="geo-country-chip" key={country}>
                        {country}
                      </span>
                    ))
                  ) : (
                    <span className="geo-country-chip geo-country-chip--muted">
                      країни не задані
                    </span>
                  )}
                </div>
                <div className="admin-policy-hint admin-policy-hint--split">
                  <strong>Поточний стан</strong>
                  <small>
                    Заявки:{" "}
                    {geoPolicy.blockApplications
                      ? "блокуються"
                      : "не блокуються"}
                  </small>
                  <small>
                    Авторизація:{" "}
                    {geoPolicy.blockAuth ? "блокується" : "не блокується"}
                  </small>
                  <small>
                    Невідома країна:{" "}
                    {geoPolicy.blockUnknownCountries
                      ? "блокується"
                      : "дозволяється"}
                  </small>
                  <small>
                    Сигнали: <code>CF-IPCountry</code>,{" "}
                    <code>request.cf.country</code>,{" "}
                    <code>X-Vercel-IP-Country</code>.
                  </small>
                </div>
              </fieldset>

              <footer className="admin-policy-footer">
                <small>
                  Dashboard і Worker читають одну політику з Firebase.
                  Cloudflare/Vercel передають країну як Alpha-2; Alpha-3 і
                  цифрові ISO-коди лише нормалізуються перед збереженням.
                </small>
                <button
                  className="btn primary"
                  type="submit"
                  disabled={!canEditGeoPolicy}
                >
                  Зберегти геообмеження
                </button>
              </footer>
            </form>
          </article>
        </section>
      </section>
    </main>
  );
}
