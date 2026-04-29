import type { ReactNode } from "react";
import DashboardIdentity from "@/components/DashboardIdentity";
import type { DashboardSession } from "@/lib/auth";
import { hierarchyTitle } from "@/lib/permissions";
import { wowRoleLabel } from "@/lib/wowRoles";
import {
  buildRaidParties,
  isRaidClosed,
  raidAutoComposition,
  raidAutoCompositionLabel,
  raidAutoCapacity,
  raidConsumablesLabel,
  raidLootLabel,
  raidRosterCounts,
  raidTitle,
  type RaidItem,
  type RaidParty,
  type RaidSignup,
} from "@/lib/raids";

export type RaidChannelOption = { id: string; name: string };

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function formatRaidDateTime(date?: string | null, time?: string | null) {
  if (!date && !time) return "Дата уточнюється";
  return [date || "Дата уточнюється", time || ""].filter(Boolean).join(", ");
}

export function attendanceStatusLabel(action?: string) {
  if (action === "skipped") return "Позначено, що ти пропускаєш рейд.";
  if (action === "late") return "Записано: ти затримаєшся. Склад рейду оновлено.";
  if (action === "going") return "Тебе записано на рейд. Склад рейду оновлено.";
  return "Дію виконано.";
}

export function StatusNotice({ params: _params }: { params: Record<string, string | undefined> }) {
  return null;
}

export function signupDisplayName(item?: RaidSignup | null) {
  if (!item) return "—";
  const name = item.characterName || item.discordName || "Гравець";
  return item.itemLevel ? `${name} • ${item.itemLevel}` : name;
}

function signupSpecLabel(item?: RaidSignup | null) {
  if (!item) return "";
  const spec = item.activeSpecName ? `${item.activeSpecName}${item.className ? ` • ${item.className}` : ""}` : item.className || "";
  const role = wowRoleLabel(item.role);
  return [spec, role].filter(Boolean).join(" • ");
}

function raidStatusLabel(raid: RaidItem) {
  if (isRaidClosed(raid)) return "Закрито";
  return raid.status === "published" ? "Опубліковано" : "Чернетка";
}

function raidStatusClass(raid: RaidItem) {
  if (isRaidClosed(raid)) return "closed";
  return raid.status;
}

function RoleRow({ label, item, role }: { label: string; item?: RaidSignup | null; role: "tank" | "healer" | "dps" }) {
  return (
    <div className={`raid-party-row raid-party-row--${role}${item?.status === "late" ? " is-late" : ""}`}>
      <span className="raid-role-icon" aria-hidden="true">{role === "tank" ? "🛡" : role === "healer" ? "✚" : "⚔"}</span>
      <span className="raid-role-label">{label}</span>
      <span className="raid-party-member-copy">
        <strong>{signupDisplayName(item)}</strong>
        {item ? <small>{signupSpecLabel(item)}</small> : null}
      </span>
    </div>
  );
}

function PartyCard({ party }: { party: RaidParty }) {
  return (
    <article className="raid-party-card">
      <h3>Паті {party.index}</h3>
      <RoleRow label="Танк" role="tank" item={party.tank} />
      <RoleRow label="Хіл" role="healer" item={party.healer} />
      {party.dps.length ? party.dps.map((member, index) => (
        <RoleRow key={`${party.index}-${member.discordId}-${member.characterName || member.discordName}-${index}`} label="ДД" role="dps" item={member} />
      )) : <RoleRow label="ДД" role="dps" item={null} />}
    </article>
  );
}

function RosterBlock({ title, items, empty = "Поки порожньо" }: { title: string; items: RaidSignup[]; empty?: string }) {
  return (
    <div className="raid-roster-block">
      <h4>{title}</h4>
      {items.length ? items.map((item) => (
        <div className="raid-roster-member" key={`${title}-${item.discordId}`}>
          <span>{item.role === "tank" ? "🛡" : item.role === "healer" ? "✚" : "⚔"}</span>
          <strong>{signupDisplayName(item)}</strong>
          <small>{signupSpecLabel(item) || item.discordName}</small>
        </div>
      )) : <p>{empty}</p>}
    </div>
  );
}

export function RosterSideList({ raid }: { raid: RaidItem }) {
  const composition = raidAutoComposition(raid);
  const grouped = {
    tanks: raid.signups.filter((item) => item.status !== "skipped" && item.role === "tank"),
    healers: raid.signups.filter((item) => item.status !== "skipped" && item.role === "healer"),
    dps: raid.signups.filter((item) => item.status !== "skipped" && item.role === "dps"),
    late: raid.signups.filter((item) => item.status === "late"),
    skipped: raid.signups.filter((item) => item.status === "skipped"),
  };
  const counts = raidRosterCounts(raid);
  return (
    <aside className="raid-roster-panel panel">
      <div className="raid-roster-heading"><strong>Хто йде</strong><span>{counts.roster} / {raidAutoCapacity(raid)}</span></div>
      <RosterBlock title={`Танки (${grouped.tanks.length}/${composition.tanks})`} items={grouped.tanks} />
      <RosterBlock title={`Хіли (${grouped.healers.length}/${composition.healers})`} items={grouped.healers} />
      <RosterBlock title={`ДД (${grouped.dps.length}/${composition.dps})`} items={grouped.dps} />
      <RosterBlock title={`Затримаюсь (${grouped.late.length})`} items={grouped.late} empty="—" />
      <RosterBlock title={`Пропускають (${grouped.skipped.length})`} items={grouped.skipped} empty="—" />
    </aside>
  );
}

export function RaidAttendanceActions({ raid }: { raid: RaidItem }) {
  const closed = isRaidClosed(raid) || raid.status !== "published";
  const title = closed ? "Запис на цей рейд уже вимкнено." : undefined;
  return (
    <form className="raid-preview-buttons raid-preview-buttons--interactive" action={`/api/raids/${encodeURIComponent(raid.id)}/attendance`} method="post" aria-disabled={closed}>
      <button className="raid-action raid-action--go" type="submit" name="action" value="going" disabled={closed} title={title}>✓ Підписатися</button>
      <button className="raid-action raid-action--skip" type="submit" name="action" value="skipped" disabled={closed} title={title}>◷ Пропустити</button>
      <button className="raid-action raid-action--late" type="submit" name="action" value="late" disabled={closed} title={title}>✕ Затримаюсь</button>
    </form>
  );
}

export function RaidManageActions({ raid }: { raid: RaidItem }) {
  const closed = isRaidClosed(raid);
  return (
    <div className="raid-manage-actions">
      <a className="btn subtle btn-sm" href={`/raids/${encodeURIComponent(raid.id)}/edit`}>Редагувати</a>
      {!closed && raid.status !== "draft" ? (
        <form action={`/api/raids/${encodeURIComponent(raid.id)}/close`} method="post">
          <button className="btn warning btn-sm" type="submit">Закрити</button>
        </form>
      ) : null}
      <form action={`/api/raids/${encodeURIComponent(raid.id)}/delete`} method="post">
        <button className="btn danger btn-sm" type="submit">Видалити</button>
      </form>
    </div>
  );
}

export function RaidAnnouncementPreview({ raid, actions, manageActions }: { raid: RaidItem; actions?: ReactNode; manageActions?: ReactNode }) {
  const counts = raidRosterCounts(raid);
  const parties = buildRaidParties(raid);
  const closed = isRaidClosed(raid);
  return (
    <section className={`panel raid-preview-card${closed ? " is-closed" : ""}`} aria-label="Оголошення рейду">
      <div className="raid-preview-accent" aria-hidden="true" />
      <div className="raid-preview-head">
        {raid.thumbnailUrl || raid.imageUrl ? <img src={raid.thumbnailUrl || raid.imageUrl || ""} alt="" width={74} height={74} referrerPolicy="no-referrer" /> : <span className="raid-preview-thumb">⚔</span>}
        <div>
          <div className="raid-preview-title-row">
            <h2>{raidTitle(raid)}</h2>
            {manageActions ? <div className="raid-preview-manage-actions">{manageActions}</div> : null}
          </div>
          <p>{raid.description}</p>
          {closed ? <div className="raid-closed-banner">🔒 Рейд закрито. Запис і Discord-кнопки неактивні.</div> : null}
        </div>
      </div>
      <div className="raid-preview-meta">
        <span><strong>📌 Статус</strong>{raidStatusLabel(raid)}</span>
        <span><strong>📅 Дата</strong>{formatRaidDateTime(raid.date, raid.time)}</span>
        <span><strong>👤 Створив</strong>{raid.createdByName}{raid.createdByMain ? <small>main: {raid.createdByMain}</small> : null}</span>
        <span><strong>🧪 Розхідники</strong>{raidConsumablesLabel(raid.consumables)}</span>
        <span><strong>🎁 Лут</strong>{raidLootLabel(raid.lootMode)}</span>
        <span><strong>👥 Склад</strong>{counts.roster} / {raidAutoCapacity(raid)}<small>{raidAutoCompositionLabel(raid)}</small></span>
      </div>
      {actions || (
        <div className={`raid-preview-buttons${closed ? " is-disabled" : ""}`} aria-hidden="true">
          <span className="raid-action raid-action--go">✓ Підписатися</span>
          <span className="raid-action raid-action--skip">◷ Пропустити</span>
          <span className="raid-action raid-action--late">✕ Затримаюсь</span>
        </div>
      )}
      <div className="raid-preview-roster-head">
        <div><strong>Склад рейду</strong><p>Паті будуються автоматично за кількістю гравців: 2/2/6 → 2/4/16 → 2/6/22. Для міфіку розширення зупиняється на 4 паті.</p></div>
      </div>
      <div className="raid-party-grid">
        {parties.map((party) => <PartyCard key={party.index} party={party} />)}
      </div>
    </section>
  );
}

export function RaidListCard({ raid }: { raid: RaidItem }) {
  const counts = raidRosterCounts(raid);
  const statusClass = raidStatusClass(raid);
  const capacity = raidAutoCapacity(raid);
  return (
    <article className={`raid-list-item raid-list-item--${statusClass}`}>
      <a className="raid-list-main-link" href={`/raids/${encodeURIComponent(raid.id)}`} aria-label={`Відкрити рейд ${raidTitle(raid)}`}>
        {raid.thumbnailUrl || raid.imageUrl ? <img src={raid.thumbnailUrl || raid.imageUrl || ""} alt="" width={86} height={86} loading="lazy" referrerPolicy="no-referrer" /> : <span className="raid-list-fallback">⚔</span>}
        <span className="raid-list-copy">
          <span className="raid-list-title-row">
            <strong>{raidTitle(raid)}</strong>
            <em className={`raid-state raid-state--${statusClass}`}>{raidStatusLabel(raid)}</em>
          </span>
          <span className="raid-list-facts">
            <small>📅 {formatRaidDateTime(raid.date, raid.time)}</small>
            <small>👤 {raid.createdByName}{raid.createdByMain ? ` • ${raid.createdByMain}` : ""}</small>
            <small>👥 {counts.roster} / {capacity} • {raidAutoCompositionLabel(raid)}</small>
          </span>
          <span className="raid-list-progress" aria-label={`Заповнення рейду ${counts.roster} з ${capacity}`}>
            <span style={{ width: `${Math.min(100, Math.round((counts.roster / Math.max(1, capacity)) * 100))}%` }} />
          </span>
        </span>
      </a>
      <div className="raid-list-actions" aria-label="Керування рейдом">
        <a className="btn subtle btn-sm" href={`/raids/${encodeURIComponent(raid.id)}`}>Відкрити</a>
        <a className="btn subtle btn-sm" href={`/raids/${encodeURIComponent(raid.id)}/edit`}>Редагувати</a>
        <form action={`/api/raids/${encodeURIComponent(raid.id)}/delete`} method="post">
          <button className="btn danger btn-sm" type="submit">Видалити</button>
        </form>
      </div>
    </article>
  );
}

export function RaidForm({ raid, channels }: { raid?: RaidItem | null; channels: RaidChannelOption[] }) {
  const defaultComposition = raid ? raidAutoCompositionLabel(raid).replace(/\s/g, "") : "2/2/6";
  const channelOptions = raid?.channelId && !channels.some((channel) => channel.id === raid.channelId)
    ? [{ id: raid.channelId, name: "поточний канал" }, ...channels]
    : channels;
  const isExistingRaid = Boolean(raid?.id);
  const isDiscordPublished = Boolean(raid?.channelId && raid?.messageId && raid?.status !== "draft");
  const canPublish = channelOptions.length > 0 && !(raid ? isRaidClosed(raid) : false);
  const saveLabel = isExistingRaid && raid?.status !== "draft" ? "Зберегти локально" : "Зберегти чернетку";
  const publishLabel = isDiscordPublished ? "Оновити Discord" : "Опублікувати в Discord";
  return (
    <div className="raid-form-stack">
      <form className="panel raid-form-panel raid-form-panel--modern" action="/api/raids" method="post">
        <input type="hidden" name="raidId" value={raid?.id || ""} />
        <input type="hidden" name="composition" value={defaultComposition} />
        <div className="raid-form-heading">
          <div>
            <div className="section-title">{raid?.id ? "Редагування рейду" : "Створення рейду"}</div>
            <p>Чернетка лише зберігає дані. Публікація створює Discord-повідомлення, а редагування оновлює вже опублікований embed.</p>
          </div>
          {raid ? <em className={`raid-state raid-state--${raidStatusClass(raid)}`}>{raidStatusLabel(raid)}</em> : null}
        </div>

        <div className="raid-form-section">
          <strong>Основне</strong>
          <label className="field-label">Назва рейду<input className="input" name="title" defaultValue={raid?.title || "Войдспайр"} required /></label>
          <label className="field-label">Тип рейду
            <select className="select" name="difficulty" defaultValue={raid?.difficulty || "heroic"}>
              <option value="normal">Нормал</option>
              <option value="heroic">Героїк</option>
              <option value="mythic">Міфік</option>
            </select>
          </label>
          <div className="raid-form-row">
            <label className="field-label">Дата<input className="input" type="date" name="date" defaultValue={raid?.date || todayIso()} required /></label>
            <label className="field-label">Час<input className="input" type="time" name="time" defaultValue={raid?.time || "20:00"} required /></label>
          </div>
        </div>

        <div className="raid-form-section raid-form-section--two">
          <label className="field-label">Канал Discord
            <select className="select" name="channelId" defaultValue={raid?.channelId || channelOptions[0]?.id || ""} required>
              {channelOptions.length ? channelOptions.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>) : <option value="">Discord-канали недоступні</option>}
            </select>
          </label>
          <label className="field-label">Розхідники
            <select className="select" name="consumables" defaultValue={raid?.consumables || "own"}>
              <option value="own">Власні</option>
              <option value="guild">Гільдійні</option>
            </select>
          </label>
          <label className="field-label">Лут
            <select className="select" name="lootMode" defaultValue={raid?.lootMode || "ms-os"}>
              <option value="ms-os">MS &gt; OS</option>
              <option value="free-roll">Вільний рол</option>
              <option value="soft-reserve">Soft Reserve</option>
              <option value="loot-council">Loot Council</option>
            </select>
          </label>
        </div>

        <div className="raid-auto-composition-note">
          <strong>Склад генерується автоматично</strong>
          <span>Поточна схема: {defaultComposition}. Система сама розширює рейд за кількістю заявок: 2/2/6 → 2/4/16 → 2/6/22 → далі за потреби.</span>
        </div>

        <div className="raid-form-section">
          <strong>Текст і зображення</strong>
          <label className="field-label">Опис<textarea className="input textarea" name="description" rows={5} defaultValue={raid?.description || "Глибоко в серці темної цитаделі нас чекають давні таємниці та смертельні вороги.\n\nБудьте готові до суворого випробування!"} /></label>
          <label className="field-label">Мініатюра / іконка<input className="input" name="thumbnailUrl" placeholder="https://..." defaultValue={raid?.thumbnailUrl || ""} /></label>
          <label className="field-label">Зображення embed<input className="input" name="imageUrl" placeholder="https://..." defaultValue={raid?.imageUrl || ""} /></label>
        </div>

        <div className="raid-form-actions">
          <button className="btn subtle" name="action" value="save" type="submit">{saveLabel}</button>
          <button className="btn primary" formAction="/api/raids/publish" name="action" value="publish" type="submit" disabled={!canPublish}>{publishLabel}</button>
        </div>
        <div className="raid-form-links">
          {raid?.id ? <a className="raid-message-link" href={`/raids/${encodeURIComponent(raid.id)}`}>Відкрити сторінку рейду</a> : null}
          {raid?.messageUrl ? <a className="raid-message-link" href={raid.messageUrl} target="_blank" rel="noreferrer">Відкрити Discord-повідомлення</a> : null}
        </div>
      </form>
      {raid?.id ? (
        <form className="panel raid-form-danger-zone raid-form-danger-zone--separate" action={`/api/raids/${encodeURIComponent(raid.id)}/delete`} method="post">
          <strong>Видалення рейду</strong>
          <p>Видаляє рейд зі списку. Якщо рейд уже був опублікований, система також спробує прибрати Discord-повідомлення.</p>
          <button className="btn danger" type="submit">Видалити рейд</button>
        </form>
      ) : null}
    </div>
  );
}

export function RaidPageShell({ user, title, description, children }: { user?: DashboardSession | null; title: string; description: string; children: ReactNode }) {
  return (
    <main className="container raid-page">
      <section className="dashboard-shell raid-shell" aria-label="Панель рейдів Mistblossom Vanguard">
        {user ? <DashboardIdentity user={user} activeSection="raids" /> : null}
        <header className="hero panel dashboard-hero raid-dashboard-hero">
          <div className="hero-copy dashboard-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Рейди</div>
            <div className="content-hero-status-row">
              <span className="content-mode-pill content-mode-pill--library">{user ? hierarchyTitle(user.role) : "Учасник"}</span>
              <span className="content-hero-path">Discord-запис • склад паті • автоматичне оновлення</span>
            </div>
            <h1>{title}</h1>
            <span className="hero-accent" aria-hidden="true" />
            <p className="lead">{description}</p>
          </div>
        </header>
      </section>
      {children}
    </main>
  );
}

export function RaidUnavailableState({ canManage = false }: { canManage?: boolean }) {
  return (
    <section className="panel raid-member-panel">
      <h2>Рейд недоступний</h2>
      <p>{canManage ? "Рейд не знайдено або був видалений." : "Цей рейд не знайдено, ще не опублікований або був видалений. Перевір посилання з Discord-повідомлення."}</p>
    </section>
  );
}

export function makePreviewRaid(user: DashboardSession): RaidItem {
  return {
    id: "previewraid",
    title: "Войдспайр",
    difficulty: "heroic",
    date: todayIso(),
    time: "20:00",
    description: "Глибоко в серці темної цитаделі Войдспайр нас чекають давні таємниці та смертельні вороги.\n\nБудьте готові до суворого випробування!",
    createdByDiscordId: user.provider === "discord" ? user.id : "",
    createdByName: user.name || "@Sebas",
    createdByMain: null,
    consumables: "own",
    lootMode: "ms-os",
    composition: { tanks: 2, healers: 2, dps: 6 },
    status: "draft",
    signups: [],
  };
}
