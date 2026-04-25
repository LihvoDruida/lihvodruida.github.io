import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import { getSession } from "@/lib/auth";
import {
  fetchDiscordRoles,
  fetchDiscordTextChannels,
  hasDiscordEmbedConfig,
} from "@/lib/discordAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const defaultRulesEmbed = {
  url: "https://lihvodruida.pp.ua/guild/apply/",
  title: "🌸 Правила Mistblossom Vanguard",
  description:
    "# 🌸 Хто ми\n> **Mistblossom Vanguard** — PvE-гільдія, орієнтована на прогрес, взаємоповагу та командну гру.  \n> Ми граємо серйозно, але пам’ятаємо: це гра, а не друга робота.\n\n## 🤝 Поведінка\n- ✅ Стався до всіх учасників гільдії з повагою.\n- ❌ Образи, тролінг, дискримінація та перехід на особистості суворо заборонені.\n- ❌ Політичні та гострі конфліктні теми не обговорюємо.\n- ✅ Конструктивна критика вітається, беззмістовний хейт — ні.\n- 🗣️ Бажана мова спілкування — **українська**.\n\n## ⏳ Активність\n- 🛡️ Реальне життя — пріоритет. Відсутність понад 14 днів без попередження **не** веде до автоматичного пониження ролі чи виключення.\n- 📅 Якщо записався на рейд, ключ або PvP — будь присутній або завчасно попередь.\n- 🌫️ AFK у справах — нормально, але зникати мовчки небажано.\n\n## 💰 Лут та крафт\n- ❌ Продавати екіпіровку чи інші ігрові предмети согільдійцям **заборонено**.\n- 🎲 Непотрібні речі ми ролимо або віддаємо тим, кому вони покращать гру.\n- 🔨 Crafting Orders для своїх виконуються лише за **чайові**, без фіксованих цін.\n\n## 🐉 PvE / Рейди\n- 🎒 Приходимо підготовленими: енчанти, фласки, їжа, відремонтована екіпіровка.\n- 🎧 Під час пулів слухаємо та виконуємо команди рейд-лідера.\n- 🎲 Лут роздається за оголошеними правилами — без драм через пікселі.\n\n## 🗝️ Mythic+ та PvP\n- ⏱️ Поважай час своєї групи.\n- 🚫 Не виходь із ключа без вагомої причини.\n- 🤝 Помилки обговорюємо спокійно, без флейму.\n\n## 🔊 Discord\n- 📂 Використовуй канали за призначенням.\n- 🔇 Без спаму, флуду та soundboard-хаосу.\n- 🎙️ Під час бою — мінімум зайвого шуму та розмов не по темі.\n\n## ⚖️ Ієрархія та санкції\n- 👑 Рішення Гілдмайстра та офіцерів є остаточними.\n- 🤝 Суперечки вирішуємо приватно через офіцерів.\n- ⚠️ Санкції: попередження → м’ют → кік за систематичні порушення.\n\n**Ми тут, щоб грати разом, розвиватись і отримувати задоволення.**  \n*Поважай гільдію — і туман буде на твоєму боці* 🌸",
  color: 4289797,
  footer: {
    text: "Mistblossom Vanguard • Правила сервера",
  },
};

const defaultGeneralEmbed = {
  title: "🌸 Оголошення Mistblossom Vanguard",
  description: "Напиши текст повідомлення тут. Підтримується Discord Markdown, посилання, fields, image, thumbnail і footer.",
  color: 4289797,
  footer: {
    text: "Mistblossom Vanguard",
  },
};

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

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

  if (params.error) {
    return <div className="notice panel error-note discord-notice">{params.error}</div>;
  }

  return null;
}

function ChannelSelect({ channels, suggestedChannelId }: {
  channels: Array<{ id: string; name: string; type: number }>;
  suggestedChannelId: string;
}) {
  return (
    <select className="select modern-select" name="channelId" defaultValue={suggestedChannelId} required>
      {channels.map((channel) => (
        <option key={channel.id} value={channel.id}>
          #{channel.name}{channel.type === 5 ? " • announcement" : ""}
        </option>
      ))}
    </select>
  );
}

function RulesEmbedForm({ channels, roles, suggestedRulesChannelId }: {
  channels: Array<{ id: string; name: string; type: number }>;
  roles: Array<{ id: string; name: string; color: number; position: number }>;
  suggestedRulesChannelId: string;
}) {
  return (
    <section className="panel discord-editor-panel discord-editor-panel--rules" aria-label="Редактор правил Discord">
      <div className="discord-panel-head">
        <div>
          <span className="eyebrow">Rules embed</span>
          <h2>Правила з кнопками</h2>
          <p>Публікує embed у канал правил. “Прийняти” видає вибрані ролі, “Відмовитися” видаляє учасника із сервера.</p>
        </div>
        <span className="discord-mode-pill">Admin only</span>
      </div>

      <form className="content-form content-form--modern discord-embed-form" method="post" action="/api/discord/embeds/publish">
        <input type="hidden" name="mode" value="rules" />

        <div className="form-row two discord-form-topline">
          <label className="content-field">
            <span>Канал для правил</span>
            <ChannelSelect channels={channels} suggestedChannelId={suggestedRulesChannelId} />
            <small>Автоматично вибирається Discord rules_channel_id або перший канал з назвою rules/правила.</small>
          </label>

          <label className="content-field">
            <span>Посилання на повідомлення для редагування</span>
            <input className="input" name="messageLink" placeholder="https://discord.com/channels/.../.../..." />
            <small>Залиш порожнім для нової публікації. Якщо вставиш лінк — буде PATCH існуючого embed.</small>
          </label>
        </div>

        <div className="form-row two discord-form-main">
          <label className="content-field content-field--wide discord-json-field">
            <span>Embed JSON</span>
            <textarea className="input textarea markdown-area discord-json-area" name="embedJson" defaultValue={prettyJson(defaultRulesEmbed)} minLength={20} required />
          </label>

          <label className="content-field content-field--wide discord-role-field">
            <span>Ролі для кнопки “Прийняти”</span>
            <select className="select modern-select discord-role-select" name="roleIds" multiple size={Math.min(Math.max(roles.length, 6), 14)} required>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
            <small>Можна вибрати кілька ролей. Бот зможе видати тільки ролі нижче своєї найвищої ролі.</small>
          </label>
        </div>

        <label className="content-field content-field--wide">
          <span>Текст над embed, опціонально</span>
          <textarea className="input textarea compact" name="content" placeholder="Наприклад: Прочитай правила та натисни кнопку нижче." />
        </label>

        <div className="content-actions-row content-actions-row--sticky discord-actions-row">
          <button className="btn subtle" type="submit" name="action" value="edit">Оновити за посиланням</button>
          <button className="btn primary" type="submit" name="action" value="publish">Опублікувати правила</button>
        </div>
      </form>
    </section>
  );
}

function GeneralEmbedForm({ channels, suggestedChannelId }: {
  channels: Array<{ id: string; name: string; type: number }>;
  suggestedChannelId: string;
}) {
  return (
    <section className="panel discord-editor-panel" aria-label="Звичайна відправка Discord embed">
      <div className="discord-panel-head">
        <div>
          <span className="eyebrow">Embed sender</span>
          <h2>Звичайний embed</h2>
          <p>Для оголошень, новин або службових повідомлень. Можна створити нове повідомлення або відредагувати старе за Discord-посиланням.</p>
        </div>
        <span className="discord-mode-pill discord-mode-pill--soft">No buttons</span>
      </div>

      <form className="content-form content-form--modern discord-embed-form" method="post" action="/api/discord/embeds/publish">
        <input type="hidden" name="mode" value="general" />

        <div className="form-row two discord-form-topline">
          <label className="content-field">
            <span>Канал</span>
            <ChannelSelect channels={channels} suggestedChannelId={suggestedChannelId} />
          </label>

          <label className="content-field">
            <span>Посилання на повідомлення для редагування</span>
            <input className="input" name="messageLink" placeholder="https://discord.com/channels/.../.../..." />
            <small>Якщо посилання є — буде редагування, якщо ні — нова публікація.</small>
          </label>
        </div>

        <label className="content-field content-field--wide discord-json-field">
          <span>Embed JSON</span>
          <textarea className="input textarea markdown-area discord-json-area discord-json-area--compact" name="embedJson" defaultValue={prettyJson(defaultGeneralEmbed)} minLength={20} required />
        </label>

        <label className="content-field content-field--wide">
          <span>Текст над embed, опціонально</span>
          <textarea className="input textarea compact" name="content" placeholder="Опціональний plain text перед embed." />
        </label>

        <div className="content-actions-row content-actions-row--sticky discord-actions-row">
          <button className="btn subtle" type="submit" name="action" value="edit">Оновити за посиланням</button>
          <button className="btn primary" type="submit" name="action" value="publish">Опублікувати embed</button>
        </div>
      </form>
    </section>
  );
}

export default async function DiscordEmbedPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const params = await searchParams;
  const isAdmin = user.role === "admin";
  let channels: Array<{ id: string; name: string; type: number }> = [];
  let roles: Array<{ id: string; name: string; color: number; position: number }> = [];
  let suggestedRulesChannelId = "";
  let configError = "";

  if (isAdmin && hasDiscordEmbedConfig()) {
    try {
      const [channelData, roleData] = await Promise.all([
        fetchDiscordTextChannels(),
        fetchDiscordRoles(),
      ]);
      channels = channelData.channels;
      roles = roleData;
      suggestedRulesChannelId = channelData.suggestedRulesChannelId || channels[0]?.id || "";
    } catch (error) {
      configError = error instanceof Error ? error.message : String(error || "Discord API error");
    }
  }

  const hasData = channels.length > 0 && roles.length > 0;
  const suggestedGeneralChannelId = channels[0]?.id || suggestedRulesChannelId;

  return (
    <main className="container">
      <section className="dashboard-shell content-shell discord-shell" aria-label="Discord embed панель Mistblossom Vanguard">
        <DashboardIdentity user={user} activeSection="discord" />
        <header className="hero panel dashboard-hero content-dashboard-hero discord-dashboard-hero">
          <div className="hero-copy dashboard-hero__copy content-dashboard-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Discord bot panel</div>
            <div className="content-hero-status-row" aria-label="Стан Discord редактора">
              <span className="content-mode-pill content-mode-pill--library">Embed editor</span>
              <span className="content-hero-path">Rules • General • Message edit</span>
            </div>
            <h1>Discord embeds</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">Редагуй JSON embed, вибирай канал із сервера, публікуй правила з кнопками або оновлюй старі повідомлення за посиланням.</p>
            <div className="hero-secure-note content-hero-actions">
              <span className="hero-lock" aria-hidden="true">✦</span>
              <span>Доступ тільки для адміністратора. Токен бота ніколи не віддається у браузер.</span>
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
        <div className="notice panel">Ця сторінка доступна тільки адміністраторам. Модератори можуть працювати із заявками, але не з Discord-публікаціями.</div>
      ) : !hasDiscordEmbedConfig() ? (
        <div className="notice panel error-note">
          Не налаштовано Discord bot config. Потрібні DISCORD_BOT_TOKEN і DISCORD_GUILD_ID.
        </div>
      ) : configError ? (
        <div className="notice panel error-note">Discord API не повернув дані: {configError}</div>
      ) : !hasData ? (
        <div className="notice panel error-note">Не знайдено текстових каналів або ролей для вибору.</div>
      ) : (
        <section className="discord-page-stack">
          <RulesEmbedForm channels={channels} roles={roles} suggestedRulesChannelId={suggestedRulesChannelId} />
          <GeneralEmbedForm channels={channels} suggestedChannelId={suggestedGeneralChannelId} />
        </section>
      )}
    </main>
  );
}
