import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import { getSession } from "@/lib/auth";
import { hasDiscordEmbedConfig } from "@/lib/discordAdmin";

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
  const isAdmin = user.role === "admin";
  return (
    <main className="container">
      <section className="dashboard-shell content-shell discord-shell" aria-label="Discord action панель Mistblossom Vanguard">
        <DashboardIdentity user={user} activeSection="discord" />
        <header className="hero panel dashboard-hero content-dashboard-hero discord-dashboard-hero">
          <div className="hero-copy dashboard-hero__copy content-dashboard-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Discord publishing</div>
            <div className="content-hero-status-row" aria-label="Стан Discord редактора">
              <span className="content-mode-pill content-mode-pill--library">Actions hub</span>
              <span className="content-hero-path">Rules • General posts</span>
            </div>
            <h1>Discord embeds</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">Окрема адмін-панель для правил сервера і звичайних embed-постів. Правила мають кнопки прийняття, ролі та статистику, а пости можна публікувати або редагувати за Discord message link.</p>
            <div className="hero-secure-note content-hero-actions">
              <span className="hero-lock" aria-hidden="true">✦</span>
              <span>Редактор працює без ручного JSON: усі частини embed заповнюються окремими полями, з живим preview і вибором кольору.</span>
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

      {!isAdmin ? (
        <div className="notice panel">Ця сторінка доступна тільки адміністраторам.</div>
      ) : !hasDiscordEmbedConfig() ? (
        <div className="notice panel error-note">Не налаштовано Discord bot config. Потрібні DISCORD_BOT_TOKEN і DISCORD_GUILD_ID.</div>
      ) : (
        <>
          <section className="discord-hub-grid discord-hub-grid--compact" aria-label="Discord embed розділи">
            <a className="panel discord-hub-card discord-hub-card--rules" href="/discord/rules">
              <span className="eyebrow">Rules embeds</span>
              <strong>Правила сервера</strong>
              <p>Список rule-повідомлень, статистика прийняття/відмов, додавання, редагування і ролі для кнопки “Прийняти правила”.</p>
              <span className="btn primary">Відкрити правила</span>
            </a>

            <a className="panel discord-hub-card" href="/discord/embed">
              <span className="eyebrow">General posts</span>
              <strong>Звичайні embed-пости</strong>
              <p>Публікація в будь-який канал і редагування майбутніх повідомлень за Discord message link без інтерактивних кнопок.</p>
              <span className="btn subtle">Відкрити post sender</span>
            </a>
          </section>
        </>
      )}
    </main>
  );
}
