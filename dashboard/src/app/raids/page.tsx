import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import DashboardIdentity from "@/components/DashboardIdentity";
import { getSession } from "@/lib/auth";
import { fetchDiscordTextChannels, hasDiscordEmbedConfig } from "@/lib/discordAdmin";
import { canManageRaids, hierarchyTitle } from "@/lib/permissions";
import {
  buildRaidParties,
  getRaid,
  hasRaidStorage,
  listRaids,
  raidCapacity,
  raidCompositionLabel,
  raidConsumablesLabel,
  raidDifficultyLabel,
  raidLootLabel,
  raidRosterCounts,
  raidTitle,
  type RaidItem,
  type RaidParty,
  type RaidSignup,
} from "@/lib/raids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(date?: string | null, time?: string | null) {
  if (!date && !time) return "Дата уточнюється";
  return [date || "Дата уточнюється", time || ""].filter(Boolean).join(", ");
}

function attendanceStatusLabel(action?: string) {
  if (action === "skipped") return "Позначено, що ти пропускаєш рейд.";
  if (action === "late") return "Записано: ти затримаєшся. Склад рейду оновлено.";
  if (action === "going") return "Тебе записано на рейд. Склад рейду оновлено.";
  return "Дію виконано.";
}

function StatusNotice({ params }: { params: Record<string, string | undefined> }) {
  if (params.published) {
    return <div className="notice panel success raid-notice">Рейд опубліковано в Discord: <a href={params.published} target="_blank" rel="noreferrer">відкрити</a></div>;
  }
  if (params.saved) return <div className="notice panel success raid-notice">Рейд збережено.</div>;
  if (params.attendance) return <div className="notice panel success raid-notice">{attendanceStatusLabel(params.attendance)}</div>;
  if (params.error) return <div className="notice panel error-note raid-notice">{params.error}</div>;
  return null;
}

function signupDisplayName(item?: RaidSignup | null) {
  if (!item) return "—";
  const name = item.characterName || item.discordName || "Гравець";
  return item.itemLevel ? `${name} • ${item.itemLevel}` : name;
}

function RoleRow({ label, item, role }: { label: string; item?: RaidSignup | null; role: "tank" | "healer" | "dps" }) {
  return (
    <div className={`raid-party-row raid-party-row--${role}${item?.status === "late" ? " is-late" : ""}`}>
      <span className="raid-role-icon" aria-hidden="true">{role === "tank" ? "🛡" : role === "healer" ? "✚" : "⚔"}</span>
      <span className="raid-role-label">{label}</span>
      <strong>{signupDisplayName(item)}</strong>
    </div>
  );
}

function PartyCard({ party }: { party: RaidParty }) {
  return (
    <article className="raid-party-card">
      <h3>Паті {party.index}</h3>
      <RoleRow label="Танк" role="tank" item={party.tank} />
      <RoleRow label="Хіл" role="healer" item={party.healer} />
      {party.dps.length ? party.dps.map((member) => <RoleRow key={`${party.index}-${member.discordId}-${member.characterName}`} label="ДД" role="dps" item={member} />) : <RoleRow label="ДД" role="dps" item={null} />}
    </article>
  );
}

function RosterSideList({ raid }: { raid: RaidItem }) {
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
      <div className="raid-roster-heading"><strong>Хто йде</strong><span>{counts.roster} / {raidCapacity(raid)}</span></div>
      <RosterBlock title={`Танки (${grouped.tanks.length}/${raid.composition.tanks})`} items={grouped.tanks} />
      <RosterBlock title={`Хіли (${grouped.healers.length}/${raid.composition.healers})`} items={grouped.healers} />
      <RosterBlock title={`ДД (${grouped.dps.length}/${raid.composition.dps})`} items={grouped.dps} />
      <RosterBlock title={`Затримаюсь (${grouped.late.length})`} items={grouped.late} empty="—" />
      <RosterBlock title={`Пропускають (${grouped.skipped.length})`} items={grouped.skipped} empty="—" />
    </aside>
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
          <small>{item.className || item.discordName}</small>
        </div>
      )) : <p>{empty}</p>}
    </div>
  );
}

function RaidAttendanceActions({ raid }: { raid: RaidItem }) {
  return (
    <form className="raid-preview-buttons raid-preview-buttons--interactive" action={`/api/raids/${encodeURIComponent(raid.id)}/attendance`} method="post">
      <button className="raid-action raid-action--go" type="submit" name="action" value="going">✓ Підписатися</button>
      <button className="raid-action raid-action--skip" type="submit" name="action" value="skipped">◷ Пропустити</button>
      <button className="raid-action raid-action--late" type="submit" name="action" value="late">✕ Затримаюсь</button>
    </form>
  );
}

function RaidAnnouncementPreview({ raid, actions }: { raid: RaidItem; actions?: ReactNode }) {
  const counts = raidRosterCounts(raid);
  const parties = buildRaidParties(raid);
  return (
    <section className="panel raid-preview-card" aria-label="Превʼю оголошення Discord">
      <div className="raid-preview-accent" aria-hidden="true" />
      <div className="raid-preview-head">
        {raid.thumbnailUrl || raid.imageUrl ? <img src={raid.thumbnailUrl || raid.imageUrl || ""} alt="" width={74} height={74} referrerPolicy="no-referrer" /> : <span className="raid-preview-thumb">⚔</span>}
        <div>
          <h2>{raidTitle(raid)}</h2>
          <p>{raid.description}</p>
        </div>
      </div>
      <div className="raid-preview-meta">
        <span><strong>📅 Дата</strong>{formatDateTime(raid.date, raid.time)}</span>
        <span><strong>👤 Створив</strong>{raid.createdByName}{raid.createdByMain ? <small>main: {raid.createdByMain}</small> : null}</span>
        <span><strong>🧪 Розхідники</strong>{raidConsumablesLabel(raid.consumables)}</span>
        <span><strong>🎁 Лут</strong>{raidLootLabel(raid.lootMode)}</span>
        <span><strong>👥 Склад</strong>{counts.roster} / {raidCapacity(raid)}<small>{raidCompositionLabel(raid)}</small></span>
      </div>
      {actions || (
        <div className="raid-preview-buttons" aria-hidden="true">
          <span className="raid-action raid-action--go">✓ Підписатися</span>
          <span className="raid-action raid-action--skip">◷ Пропустити</span>
          <span className="raid-action raid-action--late">✕ Затримаюсь</span>
        </div>
      )}
      <div className="raid-preview-roster-head">
        <div><strong>Склад рейду</strong><p>Паті побудовані в порядку 1–3 / 2–4, додаткові групи зʼявляються за потреби.</p></div>
      </div>
      <div className="raid-party-grid">
        {parties.map((party) => <PartyCard key={party.index} party={party} />)}
      </div>
    </section>
  );
}

function RaidList({ raids, selectedId }: { raids: RaidItem[]; selectedId?: string }) {
  return (
    <aside className="panel raid-list-panel">
      <a className="btn primary raid-create-btn" href="/raids">＋ Створити рейд</a>
      <div className="raid-list-title">Усі рейди</div>
      <div className="raid-list-stack">
        {raids.length ? raids.map((raid) => {
          const counts = raidRosterCounts(raid);
          return (
            <a key={raid.id} className={`raid-list-item${selectedId === raid.id ? " is-active" : ""}`} href={`/raids?raid=${raid.id}`}>
              {raid.thumbnailUrl || raid.imageUrl ? <img src={raid.thumbnailUrl || raid.imageUrl || ""} alt="" width={72} height={72} loading="lazy" referrerPolicy="no-referrer" /> : <span className="raid-list-fallback">⚔</span>}
              <span>
                <strong>{raidTitle(raid)}</strong>
                <small>📅 {formatDateTime(raid.date, raid.time)}</small>
                <small>👥 {counts.roster} / {raidCapacity(raid)}</small>
              </span>
              <em className={`raid-state raid-state--${raid.status}`}>{raid.status === "published" ? "Опубліковано" : "Чернетка"}</em>
            </a>
          );
        }) : <p className="raid-empty">Рейдів ще немає.</p>}
      </div>
    </aside>
  );
}

function RaidForm({ raid, channels }: { raid?: RaidItem | null; channels: Array<{ id: string; name: string }> }) {
  const defaultComposition = raid ? raidCompositionLabel(raid).replace(/\s/g, "") : "2/2/6";
  return (
    <form className="panel raid-form-panel" action="/api/raids" method="post">
      <input type="hidden" name="raidId" value={raid?.id || ""} />
      <div className="section-title">Редагування рейду</div>
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
      <label className="field-label">Канал Discord
        <select className="select" name="channelId" defaultValue={raid?.channelId || channels[0]?.id || ""} required>
          {channels.length ? channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>) : <option value="">Discord-канали недоступні</option>}
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
      <label className="field-label">Склад рейду<input className="input" name="composition" placeholder="2/2/6" defaultValue={defaultComposition} /></label>
      <p className="raid-form-hint">Формат: танки/хіли/дд. Для міфіку склад не розширюється понад 4 паті.</p>
      <label className="field-label">Опис<textarea className="input textarea" name="description" rows={5} defaultValue={raid?.description || "Глибоко в серці темної цитаделі нас чекають давні таємниці та смертельні вороги.\n\nБудьте готові до суворого випробування!"} /></label>
      <label className="field-label">Мініатюра / іконка<input className="input" name="thumbnailUrl" placeholder="https://..." defaultValue={raid?.thumbnailUrl || ""} /></label>
      <label className="field-label">Зображення embed<input className="input" name="imageUrl" placeholder="https://..." defaultValue={raid?.imageUrl || ""} /></label>
      <div className="raid-form-actions">
        <button className="btn subtle" name="action" value="save" type="submit">Зберегти чернетку</button>
        <button className="btn primary" name="action" value="publish" type="submit" disabled={!channels.length}>Опублікувати / оновити</button>
      </div>
      {raid?.messageUrl ? <a className="raid-message-link" href={raid.messageUrl} target="_blank" rel="noreferrer">Відкрити Discord-повідомлення</a> : null}
      {raid?.id && raid.status === "published" ? <a className="raid-message-link" href={`/raids?raid=${raid.id}`}>Відкрити сторінку рейду</a> : null}
    </form>
  );
}

function RaidPageShell({ user, title, description, children }: { user: NonNullable<Awaited<ReturnType<typeof getSession>>>; title: string; description: string; children: ReactNode }) {
  return (
    <main className="container raid-page">
      <section className="dashboard-shell raid-shell" aria-label="Панель рейдів Mistblossom Vanguard">
        <DashboardIdentity user={user} activeSection="raids" />
        <header className="hero panel dashboard-hero raid-dashboard-hero">
          <div className="hero-copy dashboard-hero__copy">
            <div className="eyebrow">Mistblossom Vanguard • Рейди</div>
            <div className="content-hero-status-row"><span className="content-mode-pill content-mode-pill--library">{hierarchyTitle(user.role)}</span><span className="content-hero-path">Discord-запис • склад паті • автоматичне оновлення</span></div>
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

function RaidMemberEmptyState() {
  return (
    <section className="panel raid-member-panel">
      <h2>Відкрий пряме посилання на конкретний рейд</h2>
      <p>Для учасників доступна тільки сторінка конкретного опублікованого рейду. Створення, список усіх рейдів і редагування залишаються для модераторів та адмінів.</p>
    </section>
  );
}

function RaidUnavailableState() {
  return (
    <section className="panel raid-member-panel">
      <h2>Рейд недоступний</h2>
      <p>Цей рейд не знайдено, він ще не опублікований або був видалений. Перевір посилання з Discord-повідомлення.</p>
    </section>
  );
}

function RaidMemberView({ raid }: { raid: RaidItem }) {
  return (
    <section className="raid-member-layout">
      <div className="raid-preview-column">
        <RaidAnnouncementPreview raid={raid} actions={<RaidAttendanceActions raid={raid} />} />
        {raid.messageUrl ? <a className="btn subtle raid-member-discord-link" href={raid.messageUrl} target="_blank" rel="noreferrer">Відкрити повідомлення рейду в Discord</a> : null}
      </div>
      <RosterSideList raid={raid} />
    </section>
  );
}

export default async function RaidsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const params = await searchParams;
  const canManage = canManageRaids(user);

  if (!canManage) {
    const selectedRaid = params.raid ? await getRaid(params.raid) : null;
    return (
      <RaidPageShell
        user={user}
        title="Рейдовий запис"
        description="За прямим посиланням учасник може тільки підписатися, пропустити рейд або позначити запізнення."
      >
        <StatusNotice params={params} />
        {!hasRaidStorage() ? <div className="notice panel error-note raid-notice">Firebase не налаштований: рейдовий запис недоступний.</div> : null}
        {selectedRaid && selectedRaid.status === "published" ? <RaidMemberView raid={selectedRaid} /> : params.raid ? <RaidUnavailableState /> : <RaidMemberEmptyState />}
      </RaidPageShell>
    );
  }

  const raids = await listRaids();
  const selectedRaid = params.raid ? await getRaid(params.raid) : raids[0] || null;
  const channelsResult = hasDiscordEmbedConfig() ? await fetchDiscordTextChannels().catch(() => null) : null;
  const channels = channelsResult?.channels || [];
  const previewRaid = selectedRaid || ({
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
  } satisfies RaidItem);

  return (
    <RaidPageShell
      user={user}
      title="Рейдові оголошення"
      description="Створи рейд, опублікуй embed з кнопками і отримуй готову структуру паті після кожної заявки."
    >
      <StatusNotice params={params} />
      {!hasRaidStorage() ? <div className="notice panel error-note raid-notice">Firebase не налаштований: рейди не зможуть зберігатися.</div> : null}
      {!hasDiscordEmbedConfig() ? <div className="notice panel error-note raid-notice">Discord-бот не підключений: публікація оголошення недоступна.</div> : null}

      <section className="raid-layout-grid">
        <RaidList raids={raids} selectedId={selectedRaid?.id} />
        <RaidForm raid={selectedRaid} channels={channels} />
        <div className="raid-preview-column">
          <RaidAnnouncementPreview raid={previewRaid} />
          <RosterSideList raid={previewRaid} />
        </div>
      </section>
    </RaidPageShell>
  );
}
