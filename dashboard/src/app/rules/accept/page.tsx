import { connection } from "next/server";
import DashboardIdentity from "@/components/DashboardIdentity";
import HeroSidePanel from "@/components/HeroSidePanel";
import { getSession, type DashboardSession } from "@/lib/auth";
import { fetchDiscordRoles } from "@/lib/discordAdmin";
import { getEnabledBattleNetRegions } from "@/lib/battlenet";
import {
  getProfileById,
  getProfileRaidRole,
  profileGenderLabel,
  type DashboardProfile,
} from "@/lib/profiles";
import {
  parseRulesRoleToken,
  rulesLoginPath,
  rulesOnboardingStatus,
} from "@/lib/rulesOnboarding";
import { wowRoleLabel } from "@/lib/wowRoles";
import { buildPageMetadata } from "@/lib/seo";
import { getGuildNicknamePolicy } from "@/lib/guildNicknamePolicy";

export const metadata = buildPageMetadata({
  title: "Прийняття правил",
  description:
    "Завершення профілю Mistblossom Vanguard перед видачею Discord-ролі за правила.",
  path: "/rules/accept",
  keywords: ["правила", "Discord", "реєстрація", "профіль"],
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

function roleName(roleId: string, roles: Array<{ id: string; name: string }>) {
  return (
    roles.find((role) => role.id === roleId)?.name ||
    `Discord роль ${roleId.slice(-6)}`
  );
}

function appendRulesReturnParams(href: string, token: string) {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}from=rules&rt=${encodeURIComponent(token)}`;
}

function statusNotice(status?: string | null) {
  if (status === "completed")
    return {
      tone: "ok",
      text: "✅ Реєстрацію завершено. Discord-роль видано, серверний нік оновлено.",
    };
  if (status === "completed_owner_nickname_manual")
    return {
      tone: "warning",
      text: "✅ Discord-роль видано. Ти власник сервера, тому Discord не дозволяє боту змінити твій нік — зміни його вручну за шаблоном у профілі.",
    };
  if (status === "completed_nickname_manual")
    return {
      tone: "warning",
      text: "✅ Discord-роль видано. Серверний нік потрібно змінити вручну за шаблоном у профілі.",
    };
  if (status === "incomplete")
    return {
      tone: "warning",
      text: "Заповни всі обовʼязкові пункти, після цього роль можна буде видати.",
    };
  if (status === "missing_role_token")
    return {
      tone: "warning",
      text: "Посилання не містить підтвердженої ролі. Натисни актуальну кнопку правил у Discord.",
    };
  if (status === "not_discord_profile")
    return {
      tone: "warning",
      text: "Реєстрацію правил можна завершити тільки через Discord-вхід.",
    };
  if (status === "discord_not_configured")
    return {
      tone: "error",
      text: "Discord-видача ролей тимчасово не налаштована. Звернись до офіцера.",
    };
  if (status === "geo_blocked")
    return {
      tone: "error",
      text: "Завершення реєстрації з цієї країни зараз обмежено правилами спільноти.",
    };
  if (status === "rate_limit")
    return {
      tone: "warning",
      text: "Забагато спроб завершення. Зачекай кілька хвилин і повтори дію.",
    };
  if (status === "request_too_large")
    return {
      tone: "error",
      text: "Запит відхилено: форма містить завеликі дані. Онови сторінку й повтори дію.",
    };
  if (status === "failed")
    return {
      tone: "error",
      text: "Не вдалося завершити реєстрацію. Спробуй ще раз або звернись до офіцера.",
    };
  return null;
}

function StepList({
  profile,
  nicknameTemplate,
  nextStepKey,
}: {
  profile: DashboardProfile | null;
  nicknameTemplate: string;
  nextStepKey?: string | null;
}) {
  const status = rulesOnboardingStatus(profile, nicknameTemplate);
  return (
    <div className="rules-onboarding-steps" role="list">
      {status.steps.map((step) => {
        const isNext = !step.complete && step.key === nextStepKey;
        return (
          <article
            className={[
              "rules-onboarding-step",
              step.complete ? "is-complete" : "is-missing",
              isNext ? "is-next" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="listitem"
            key={step.key}
          >
            <span className="rules-onboarding-step__state" aria-hidden="true">
              {step.complete ? "✓" : isNext ? "→" : "!"}
            </span>
            <span className="rules-onboarding-step__body">
              <strong>{step.title}</strong>
              <small>{step.description}</small>
            </span>
          </article>
        );
      })}
    </div>
  );
}

function ProfileSummary({
  profile,
  nicknameTemplate,
}: {
  profile: DashboardProfile;
  nicknameTemplate: string;
}) {
  const status = rulesOnboardingStatus(profile, nicknameTemplate);
  const main = status.mainCharacter;
  const manualRole =
    profile.raidRolePreference?.characterKey === main?.key
      ? profile.raidRolePreference?.role
      : null;
  const role = getProfileRaidRole(profile);
  return (
    <div className="rules-onboarding-summary" aria-label="Підсумок профілю">
      <span>
        <strong>{profile.preferredName || "—"}</strong>
        <small>Імʼя</small>
      </span>
      <span>
        <strong>{profileGenderLabel(profile.grammaticalGender)}</strong>
        <small>Звертання</small>
      </span>
      <span>
        <strong>{main?.name || "—"}</strong>
        <small>Мейн</small>
      </span>
      <span>
        <strong>{wowRoleLabel(role)}</strong>
        <small>{manualRole ? "Роль у рейді" : "Авто зі спеки"}</small>
      </span>
      <span>
        <strong>{status.nicknamePlan.value || "—"}</strong>
        <small>Новий Discord-нік</small>
      </span>
    </div>
  );
}

function ProgressBar({ complete, total }: { complete: number; total: number }) {
  const safeTotal = Math.max(1, total);
  const percentage = Math.max(
    0,
    Math.min(100, Math.round((complete / safeTotal) * 100)),
  );
  return (
    <div
      className="rules-onboarding-progress"
      aria-label={`Заповнення профілю ${complete} з ${total}`}
    >
      <div className="rules-onboarding-progress__meta">
        <strong>{percentage}%</strong>
        <small>
          {complete} з {total} пунктів
        </small>
      </div>
      <div
        className="rules-onboarding-progress__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={complete}
        aria-valuetext={`${complete} з ${total} пунктів`}
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
      <small>
        {complete === total
          ? "Усе готово до фінального підтвердження."
          : `Залишилось пунктів: ${Math.max(0, total - complete)}.`}
      </small>
    </div>
  );
}

function onboardingActionLabel(stepKey?: string | null) {
  switch (stepKey) {
    case "profile_name":
    case "profile_gender":
    case "raid_role":
    case "discord_nickname":
      return "Перейти до налаштувань профілю";
    case "battlenet_characters":
    case "main_character":
      return "Перейти до персонажів";
    default:
      return "Продовжити заповнення";
  }
}

export default async function RulesAcceptPage({
    searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const token = String(
    Array.isArray(params.rt) ? params.rt[0] : params.rt || "",
  ).trim();
  const roleIds = parseRulesRoleToken(token);
  const notice = statusNotice(
    String(
      Array.isArray(params.status) ? params.status[0] : params.status || "",
    ),
  );
  const session = await getSession();
  const nicknamePolicy = await getGuildNicknamePolicy();
  const profile = session?.profileId
    ? await getProfileById(session.profileId).catch(() => null)
    : null;
  const status = rulesOnboardingStatus(profile, nicknamePolicy.template);
  const completedSteps = status.steps.filter((step) => step.complete).length;
  const nextMissingStep = status.missing[0] || null;
  const nextMissingHref = nextMissingStep?.href
    ? appendRulesReturnParams(nextMissingStep.href, token)
    : "";
  const roles = roleIds.length ? await fetchDiscordRoles().catch(() => []) : [];
  const primaryRegion = getEnabledBattleNetRegions()[0] || "eu";

  return (
    <main className="container rules-onboarding-page">
      <section
        className="dashboard-shell content-shell rules-onboarding-shell"
        aria-label="Прийняття правил Mistblossom Vanguard"
      >
        {session ? (
          <DashboardIdentity
            user={session as DashboardSession}
            activeSection="profile"
          />
        ) : null}
        <header className="hero panel dashboard-hero rules-onboarding-hero">
          <div className="hero-copy dashboard-hero__copy guild-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Правила</div>
            <h1>Завершення реєстрації</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">
              Кнопка в Discord більше не видає роль одразу. Спочатку потрібно
              увійти, заповнити профіль, підключити персонажів і підтвердити
              серверний нік.
            </p>
          </div>
          <HeroSidePanel
            ariaLabel="Огляд завершення реєстрації"
            summary={[
              {
                label: "СТАН",
                value: status.complete ? "Готово" : "Потрібно доповнити",
                note: session
                  ? "Discord-профіль знайдено"
                  : "Потрібен вхід через Discord",
              },
              {
                label: "РОЛЬ",
                value: roleIds.length
                  ? roleName(roleIds[0], roles)
                  : "Не задано",
                note:
                  roleIds.length > 1
                    ? `+${roleIds.length - 1} ролей`
                    : `Регіон Battle.net: ${primaryRegion.toUpperCase()}`,
              },
            ]}
            stats={[
              {
                label: "КРОКИ",
                value: `${completedSteps}/${status.steps.length}`,
              },
              { label: "РОЛІ", value: roleIds.length.toLocaleString("uk-UA") },
              {
                label: "B.NET",
                value: profile?.battlenet?.linked ? "OK" : "—",
              },
            ]}
          />
        </header>

        <section
          className="panel rules-onboarding-card"
          aria-label="Стан реєстрації"
        >
          {notice ? (
            <div
              className={`login-alert profile-storage-warning rules-onboarding-notice rules-onboarding-notice--${notice.tone}`}
              role="status"
            >
              {notice.text}
            </div>
          ) : null}
          <div className="profile-card-head profile-card-head--inline">
            <div>
              <span className="eyebrow">Обовʼязково</span>
              <h2>
                {status.complete
                  ? "Профіль готовий"
                  : "Потрібно доповнити профіль"}
              </h2>
            </div>
            <span
              className={`profile-count-pill${status.complete ? " is-ok" : " is-warning"}`}
            >
              {completedSteps}/{status.steps.length}
            </span>
          </div>
          <ProgressBar complete={completedSteps} total={status.steps.length} />

          {!session ? (
            <div className="rules-onboarding-login">
              <p>
                Увійди через Discord, щоб система могла звʼязати профіль із
                сервером. Після входу повернешся на цю сторінку.
              </p>
              <a className="btn primary" href={rulesLoginPath(token)}>
                Увійти через Discord
              </a>
            </div>
          ) : !roleIds.length ? (
            <div className="login-alert profile-storage-warning" role="status">
              Посилання правил не містить підтвердженої ролі. Натисни актуальну
              кнопку “Прийняти правила” в Discord або попроси офіцера оновити
              embed правил.
            </div>
          ) : profile ? (
            <>
              <ProfileSummary
                profile={profile}
                nicknameTemplate={nicknamePolicy.template}
              />
              <StepList
                profile={profile}
                nicknameTemplate={nicknamePolicy.template}
                nextStepKey={nextMissingStep?.key}
              />

              <div className="rules-onboarding-role-box">
                <strong>Роль після завершення</strong>
                <span>
                  {roleIds.map((roleId) => roleName(roleId, roles)).join(", ")}
                </span>
                <small>
                  <span id="rules-complete-help">
                    Роль видається після одного фінального підтвердження. Нік
                    формується за шаблоном: {nicknamePolicy.template}.
                  </span>
                </small>
              </div>

              <section
                className={`rules-onboarding-final-action${status.complete ? " is-ready" : " is-pending"}`}
                aria-label="Фінальна дія реєстрації"
              >
                <span className="rules-onboarding-final-action__copy">
                  <strong>
                    {status.complete
                      ? "Можна підтверджувати"
                      : nextMissingStep
                        ? `Наступний крок: ${nextMissingStep.title}`
                        : "Потрібно доповнити профіль"}
                  </strong>
                  <small>
                    {status.complete
                      ? "Знизу залишилась одна дія: підтвердити правила, видати Discord-роль і прийняти зміни профілю."
                      : nextMissingStep?.description ||
                        "Заповни обовʼязкові дані, після цього тут зʼявиться фінальне підтвердження."}
                  </small>
                </span>

                {status.complete ? (
                  <form
                    action="/api/rules/accept/complete"
                    method="post"
                    data-dashboard-action="/api/rules/accept/complete"
                    aria-describedby="rules-complete-help"
                  >
                    <input type="hidden" name="rt" value={token} />
                    <button
                      className="btn primary rules-onboarding-primary-action"
                      type="submit"
                      data-loading-label="Підтверджуємо..."
                    >
                      Підтвердити й прийняти зміни
                    </button>
                  </form>
                ) : nextMissingHref ? (
                  <a
                    className="btn primary rules-onboarding-primary-action"
                    href={nextMissingHref}
                  >
                    {onboardingActionLabel(nextMissingStep?.key)}
                  </a>
                ) : null}
              </section>
            </>
          ) : (
            <div className="login-alert profile-storage-warning" role="status">
              Профіль ще створюється або тимчасово недоступний. Онови сторінку
              через кілька секунд.
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
