import DashboardIdentity from "@/components/DashboardIdentity";
import { getSession, type DashboardSession } from "@/lib/auth";
import { fetchDiscordRoles } from "@/lib/discordAdmin";
import { getEnabledBattleNetRegions } from "@/lib/battlenet";
import { getProfileById, profileGenderLabel, type DashboardProfile } from "@/lib/profiles";
import { parseRulesRoleToken, rulesLoginPath, rulesOnboardingStatus } from "@/lib/rulesOnboarding";
import { wowRoleLabel } from "@/lib/wowRoles";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Прийняття правил",
  description: "Завершення профілю Mistblossom Vanguard перед видачею Discord-ролі за правила.",
  path: "/rules/accept",
  keywords: ["правила", "Discord", "реєстрація", "профіль"],
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

function roleName(roleId: string, roles: Array<{ id: string; name: string }>) {
  return roles.find((role) => role.id === roleId)?.name || `Discord роль ${roleId.slice(-6)}`;
}

function statusNotice(status?: string | null) {
  if (status === "completed") return { tone: "ok", text: "✅ Реєстрацію завершено. Discord-роль видано, серверний нік оновлено." };
  if (status === "completed_nickname_manual") return { tone: "warning", text: "✅ Discord-роль видано. Нік не вдалося змінити автоматично — перевір права бота або зміни нік вручну." };
  if (status === "incomplete") return { tone: "warning", text: "Заповни всі обовʼязкові пункти, після цього роль можна буде видати." };
  if (status === "missing_role_token") return { tone: "warning", text: "Посилання не містить підтвердженої ролі. Натисни актуальну кнопку правил у Discord." };
  if (status === "failed") return { tone: "error", text: "Не вдалося завершити реєстрацію. Спробуй ще раз або звернись до офіцера." };
  return null;
}

function StepList({ profile, token }: { profile: DashboardProfile | null; token: string }) {
  const status = rulesOnboardingStatus(profile);
  return (
    <div className="rules-onboarding-steps" role="list">
      {status.steps.map((step) => (
        <article className={`rules-onboarding-step${step.complete ? " is-complete" : " is-missing"}`} role="listitem" key={step.key}>
          <span className="rules-onboarding-step__state" aria-hidden="true">{step.complete ? "✓" : "!"}</span>
          <span className="rules-onboarding-step__body">
            <strong>{step.title}</strong>
            <small>{step.description}</small>
          </span>
          {!step.complete && step.href ? <a className="btn btn-ghost btn-sm" href={`${step.href}?from=rules&rt=${encodeURIComponent(token)}`}>Заповнити</a> : null}
        </article>
      ))}
    </div>
  );
}

function ProfileSummary({ profile }: { profile: DashboardProfile }) {
  const status = rulesOnboardingStatus(profile);
  const main = status.mainCharacter;
  const role = profile.raidRolePreference?.characterKey === main?.key ? profile.raidRolePreference?.role : null;
  return (
    <div className="rules-onboarding-summary" aria-label="Підсумок профілю">
      <span><strong>{profile.preferredName || "—"}</strong><small>Імʼя</small></span>
      <span><strong>{profileGenderLabel(profile.grammaticalGender)}</strong><small>Звертання</small></span>
      <span><strong>{main?.name || "—"}</strong><small>Мейн</small></span>
      <span><strong>{role ? wowRoleLabel(role) : "—"}</strong><small>Роль у рейді</small></span>
      <span><strong>{status.nicknamePlan.value || "—"}</strong><small>Новий Discord-нік</small></span>
    </div>
  );
}

export default async function RulesAcceptPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const token = String(Array.isArray(params.rt) ? params.rt[0] : params.rt || "").trim();
  const roleIds = parseRulesRoleToken(token);
  const notice = statusNotice(String(Array.isArray(params.status) ? params.status[0] : params.status || ""));
  const session = await getSession();
  const profile = session?.profileId ? await getProfileById(session.profileId).catch(() => null) : null;
  const status = rulesOnboardingStatus(profile);
  const roles = roleIds.length ? await fetchDiscordRoles().catch(() => []) : [];
  const primaryRegion = getEnabledBattleNetRegions()[0] || "eu";

  return (
    <main className="container rules-onboarding-page">
      <section className="dashboard-shell content-shell rules-onboarding-shell" aria-label="Прийняття правил Mistblossom Vanguard">
        {session ? <DashboardIdentity user={session as DashboardSession} activeSection="profile" /> : null}
        <header className="hero panel dashboard-hero rules-onboarding-hero">
          <div className="hero-copy dashboard-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Правила</div>
            <h1>Завершення реєстрації</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">Кнопка в Discord більше не видає роль одразу. Спочатку потрібно увійти, заповнити профіль, підключити персонажів і підтвердити серверний нік.</p>
          </div>
        </header>

        <section className="panel rules-onboarding-card" aria-label="Стан реєстрації">
          {notice ? <div className={`login-alert profile-storage-warning rules-onboarding-notice rules-onboarding-notice--${notice.tone}`} role="status">{notice.text}</div> : null}
          <div className="profile-card-head profile-card-head--inline">
            <div>
              <span className="eyebrow">Обовʼязково</span>
              <h2>{status.complete ? "Профіль готовий" : "Потрібно доповнити профіль"}</h2>
            </div>
            <span className={`profile-count-pill${status.complete ? " is-ok" : " is-warning"}`}>{status.steps.filter((step) => step.complete).length}/{status.steps.length}</span>
          </div>

          {!session ? (
            <div className="rules-onboarding-login">
              <p>Увійди через Discord, щоб система могла звʼязати профіль із сервером. Після входу повернешся на цю сторінку.</p>
              <a className="btn primary" href={rulesLoginPath(token)}>Увійти через Discord</a>
            </div>
          ) : !roleIds.length ? (
            <div className="login-alert profile-storage-warning" role="status">Посилання правил не містить підтвердженої ролі. Натисни актуальну кнопку “Прийняти правила” в Discord або попроси офіцера оновити embed правил.</div>
          ) : profile ? (
            <>
              <ProfileSummary profile={profile} />
              <StepList profile={profile} token={token} />

              <div className="rules-onboarding-role-box">
                <strong>Роль після завершення</strong>
                <span>{roleIds.map((roleId) => roleName(roleId, roles)).join(", ")}</span>
                <small>Роль буде видано тільки після натискання “Завершити реєстрацію”. До цього Discord-роль не змінюється.</small>
              </div>

              <div className="rules-onboarding-actions">
                <a className="btn subtle" href={`/profile/${profile.profileId}?from=rules&rt=${encodeURIComponent(token)}`}>Відкрити профіль</a>
                <a className="btn subtle" href={`/api/auth/battlenet/start?region=${primaryRegion}`}>Оновити Battle.net</a>
                <form action="/api/rules/accept/complete" method="post">
                  <input type="hidden" name="rt" value={token} />
                  <button className="btn primary" type="submit" disabled={!status.complete}>Завершити реєстрацію й отримати роль</button>
                </form>
              </div>
            </>
          ) : (
            <div className="login-alert profile-storage-warning" role="status">Профіль ще створюється або тимчасово недоступний. Онови сторінку через кілька секунд.</div>
          )}
        </section>
      </section>
    </main>
  );
}
