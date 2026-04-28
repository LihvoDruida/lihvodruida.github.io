import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import { getSession } from "@/lib/auth";
import { canManageGeneralEmbeds, canManageRulesEmbeds, canViewRulesStats, hierarchyTitle } from "@/lib/permissions";
import { hasDiscordEmbedConfig } from "@/lib/discordAdmin";
import { getOwnProfilePath } from "@/lib/profiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function StatusNotice({ params }: { params: Record<string, string | undefined> }) {
  if (params.published) {
    return (
      <div className="notice panel success discord-notice">
        Опубліковано Discord-повідомлення: <a href={params.published} target="_blank" rel="noreferrer">відкрити</a>
      </div>
    );
  }

  if (params.updated) {
    return (
      <div className="notice panel success discord-notice">
        Оновлено Discord-повідомлення: <a href={params.updated} target="_blank" rel="noreferrer">відкрити</a>
      </div>
    );
  }

  if (params.error) return <div className="notice panel error-note discord-notice">{params.error}</div>;
  return null;
}

export default async function DiscordHubPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const params = await searchParams;
  const canUseGeneralEmbeds = canManageGeneralEmbeds(user);
  const canEditRules = canManageRulesEmbeds(user);
  const canViewRules = canViewRulesStats(user);
  if (!canUseGeneralEmbeds && !canViewRules) redirect(await getOwnProfilePath(user));

  return (
    <main className="container">
      <section className="dashboard-shell content-shell discord-shell" aria-label="Discord action панель Mistblossom Vanguard">
        <DashboardIdentity user={user} activeSection="discord" />
        <header className="hero panel dashboard-hero content-dashboard-hero discord-dashboard-hero">
          <div className="hero-copy dashboard-hero__copy content-dashboard-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Discord publishing</div>
            <div className="content-hero-status-row" aria-label="Стан Discord редактора">
              <span className="content-mode-pill content-mode-pill--library">{hierarchyTitle(user.role)}</span>
              <span className="content-hero-path">{canViewRules ? "Статистика правил • Звичайні embed" : "Звичайні embed"}</span>
            </div>
            <h1>Discord embeds</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">Панель Discord embed-постів із доступом за ролями. Офіцери працюють зі звичайними embed, модератори бачать статистику правил, гільдмайстер може редагувати rules embed.</p>
            <div className="hero-secure-note content-hero-actions">
              <span className="hero-lock" aria-hidden="true">✦</span>
              <span>Доступ привʼязаний до ролі на сайті.</span>
            </div>
          </div>

          <div className="hero-emblem content-hero-emblem discord-hero-emblem" aria-hidden="true">
            <div className="hero-emblem__rings" />
            <div className="hero-flower">
              <span className="hero-flower__petal hero-flower__petal--top" />
              <span className="hero-flower__petal hero-flower__petal--left" />
              <span className="hero-flower__petal hero-flower__petal--right" />
              <span className="hero-flower__petal hero-flower__petal--low-left" />
              <span className="hero-flower__petal hero-flower__petal--low-right" />
              <span className="hero-flower__core" />
            </div>
            <div className="hero-platform" />
          </div>
        </header>
      </section>

      <StatusNotice params={params} />

      {!canUseGeneralEmbeds ? (
        <div className="notice panel">Твоя роль не має доступу до Discord-дій.</div>
      ) : !hasDiscordEmbedConfig() ? (
        <div className="notice panel error-note">Не налаштовано Discord bot config. Потрібні DISCORD_BOT_TOKEN і DISCORD_GUILD_ID.</div>
      ) : (
        <section className={`discord-hub-grid discord-hub-grid--compact ${canViewRules ? "" : "discord-hub-grid--single"}`} aria-label="Discord embed розділи">
          {canViewRules ? (
            <a className="panel discord-hub-card discord-hub-card--rules" href="/discord/rules">
              <span className="eyebrow">Rules stats • {hierarchyTitle(user.role)}</span>
              <strong>{canEditRules ? "Правила сервера" : "Статистика правил"}</strong>
              <p>{canEditRules ? "Rules embed, статистика і ролі кнопки прийняття." : "Статистика звичайних правил і список підписантів правил рейду."}</p>
              <span className="btn primary">{canEditRules ? "Відкрити правила" : "Відкрити статистику"}</span>
            </a>
          ) : null}

          <a className="panel discord-hub-card" href="/discord/embed">
            <span className="eyebrow">Звичайні embed • {hierarchyTitle(user.role)}</span>
            <strong>Звичайні embed-пости</strong>
            <p>Звичайні embed, редагування за link і теги ролей.</p>
            <span className="btn subtle">Відкрити embed-редактор</span>
          </a>
        </section>
      )}
    </main>
  );
}
