"use client";

import { useMemo, useState, type CSSProperties, type ChangeEvent } from "react";
import type { GuildRosterMember, GuildRosterStats, GuildScoreSegment } from "@/lib/guildRoster";

type SortKey = "rio-desc" | "rio-asc" | "ilvl-desc" | "name-asc" | "rank-asc";

type Props = {
  members: GuildRosterMember[];
  stats: GuildRosterStats;
  source: string;
  error?: string | null;
};

const SEGMENT_LABELS: Record<GuildScoreSegment, string> = {
  all: "ALL",
  dps: "DPS",
  healer: "HEALER",
  tank: "TANK",
};

const ROLE_LABELS: Record<string, string> = {
  all: "Усі ролі",
  tank: "Танк",
  healer: "Хіл",
  dps: "DPS",
  unknown: "Без ролі",
};

const ARMOR_LABELS = ["Тканина", "Шкіра", "Кольчуга", "Лати"] as const;
type ArmorType = typeof ARMOR_LABELS[number];

const ARMOR_BY_CLASS: Record<string, ArmorType> = {
  mage: "Тканина",
  маг: "Тканина",
  priest: "Тканина",
  жрець: "Тканина",
  warlock: "Тканина",
  чорнокнижник: "Тканина",
  druid: "Шкіра",
  друїд: "Шкіра",
  monk: "Шкіра",
  монах: "Шкіра",
  rogue: "Шкіра",
  розбійник: "Шкіра",
  "demon hunter": "Шкіра",
  "мисливець на демонів": "Шкіра",
  hunter: "Кольчуга",
  мисливець: "Кольчуга",
  shaman: "Кольчуга",
  шаман: "Кольчуга",
  evoker: "Кольчуга",
  пробуджувач: "Кольчуга",
  warrior: "Лати",
  воїн: "Лати",
  paladin: "Лати",
  паладин: "Лати",
  "death knight": "Лати",
  "лицар смерті": "Лати",
};

const CLASS_COLOR: Record<string, string> = {
  "death knight": "#c41e3a",
  "demon hunter": "#a330c9",
  druid: "#ff7c0a",
  evoker: "#33937f",
  hunter: "#aad372",
  mage: "#3fc7eb",
  monk: "#00ff98",
  paladin: "#f48cba",
  priest: "#ffffff",
  rogue: "#fff468",
  shaman: "#0070dd",
  warlock: "#8788ee",
  warrior: "#c69b6d",
};

const ROLE_ORDER = ["tank", "healer", "dps", "unknown"];

function formatNumber(value: number, digits = 0) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk"));
}

function getArmorType(member: GuildRosterMember): ArmorType {
  return ARMOR_BY_CLASS[member.className.trim().toLowerCase()] || "Тканина";
}

function roleShort(role: string) {
  if (role === "tank") return "Танк";
  if (role === "healer") return "Хіл";
  if (role === "dps") return "DPS";
  return "—";
}

function classColor(className: string) {
  return CLASS_COLOR[className.trim().toLowerCase()] || "#f6efe2";
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function buildConicSegments(items: Array<{ value: number; color: string }>) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  if (!total) return "rgba(255,255,255,0.08) 0 360deg";

  let cursor = 0;
  return items.map((item) => {
    const size = Math.max(0, item.value) / total * 360;
    const start = cursor;
    cursor += size;
    return `${item.color} ${start}deg ${cursor}deg`;
  }).join(", ");
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="guild-filter-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option value={option} key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function clampValue(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function parseNumberInput(event: ChangeEvent<HTMLInputElement>, fallback: number) {
  const raw = event.target.value.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function RangeFilter({
  label,
  minValue,
  maxValue,
  absoluteMin,
  absoluteMax,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  minValue: number;
  maxValue: number;
  absoluteMin: number;
  absoluteMax: number;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
}) {
  const safeAbsoluteMax = Math.max(absoluteMin, absoluteMax);
  const safeMin = clampValue(minValue, absoluteMin, safeAbsoluteMax);
  const safeMax = clampValue(maxValue, absoluteMin, safeAbsoluteMax);
  const low = Math.min(safeMin, safeMax);
  const high = Math.max(safeMin, safeMax);
  const span = Math.max(1, safeAbsoluteMax - absoluteMin);
  const startPercent = ((low - absoluteMin) / span) * 100;
  const endPercent = 100 - ((high - absoluteMin) / span) * 100;

  return (
    <div className="guild-range-group">
      <div className="guild-range-head">
        <span>{label}</span>
        <strong>{formatNumber(low)} — {formatNumber(high)}</strong>
      </div>

      <div className="guild-range-inputs">
        <label className="guild-range-value">
          <span>від</span>
          <input
            type="number"
            inputMode="numeric"
            min={absoluteMin}
            max={safeAbsoluteMax}
            value={safeMin}
            onChange={(event) => onMinChange(clampValue(parseNumberInput(event, safeMin), absoluteMin, safeAbsoluteMax))}
          />
        </label>
        <label className="guild-range-value">
          <span>до</span>
          <input
            type="number"
            inputMode="numeric"
            min={absoluteMin}
            max={safeAbsoluteMax}
            value={safeMax}
            onChange={(event) => onMaxChange(clampValue(parseNumberInput(event, safeMax), absoluteMin, safeAbsoluteMax))}
          />
        </label>
      </div>

      <div
        className="guild-dual-range"
        style={{
          "--range-start": `${startPercent}%`,
          "--range-end": `${endPercent}%`,
        } as CSSProperties}
      >
        <div className="guild-dual-range__line" aria-hidden="true" />
        <div className="guild-dual-range__active" aria-hidden="true" />
        <input
          className="guild-dual-range__input"
          type="range"
          min={absoluteMin}
          max={safeAbsoluteMax}
          value={safeMin}
          onChange={(event) => onMinChange(clampValue(Number(event.target.value), absoluteMin, safeAbsoluteMax))}
        />
        <input
          className="guild-dual-range__input"
          type="range"
          min={absoluteMin}
          max={safeAbsoluteMax}
          value={safeMax}
          onChange={(event) => onMaxChange(clampValue(Number(event.target.value), absoluteMin, safeAbsoluteMax))}
        />
      </div>
    </div>
  );
}

function StatDonut({ title, subtitle, center, caption, segments, legend }: {
  title: string;
  subtitle: string;
  center: string;
  caption: string;
  segments: Array<{ value: number; color: string }>;
  legend: Array<{ label: string; value: string; detail: string; color: string }>;
}) {
  return (
    <article className="guild-stat-card panel">
      <div className="guild-stat-card__head">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="guild-donut-layout">
        <div className="guild-donut" style={{ "--guild-donut": buildConicSegments(segments) } as CSSProperties}>
          <div>
            <strong>{center}</strong>
            <span>{caption}</span>
          </div>
        </div>
        <div className="guild-stat-legend">
          {legend.map((item) => (
            <div className="guild-stat-legend__item" key={item.label}>
              <span className="guild-stat-dot" style={{ background: item.color }} />
              <div>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </div>
              <b>{item.value}</b>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function CharacterAvatar({ member }: { member: GuildRosterMember }) {
  if (member.avatarUrl) {
    return <img className="guild-member-avatar" src={member.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />;
  }

  return <span className="guild-member-avatar guild-member-avatar--empty">{member.name.charAt(0).toUpperCase()}</span>;
}

function SegmentBadges({ member, activeSegment }: { member: GuildRosterMember; activeSegment: GuildScoreSegment }) {
  return (
    <div className="guild-score-badges" aria-label="Raider.IO сегменти">
      {(["all", "dps", "healer", "tank"] as GuildScoreSegment[]).map((segment) => {
        const value = member.scores[segment];
        if (!value && segment !== activeSegment) return null;
        return (
          <span className={segment === activeSegment ? "is-active" : undefined} key={segment}>
            <small>{SEGMENT_LABELS[segment]}</small>
            <strong>{formatNumber(value, 1)}</strong>
          </span>
        );
      })}
    </div>
  );
}

export default function GuildRosterExplorer({ members, stats, source, error }: Props) {
  const [segment, setSegment] = useState<GuildScoreSegment>("all");
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("Усі класи");
  const [specFilter, setSpecFilter] = useState("Усі спеки");
  const [roleFilter, setRoleFilter] = useState("Усі ролі");
  const [factionFilter, setFactionFilter] = useState("Усі фракції");
  const [rioMin, setRioMin] = useState(0);
  const [rioMax, setRioMax] = useState(Math.ceil(stats.maxRioAll || 0));
  const [itemLevelMin, setItemLevelMin] = useState(0);
  const [itemLevelMax, setItemLevelMax] = useState(Math.ceil(stats.maxItemLevel || 0));
  const [sort, setSort] = useState<SortKey>("rio-desc");

  const maxRio = Math.max(0, Math.ceil(stats.maxRioAll || 0));
  const maxItemLevel = Math.max(0, Math.ceil(stats.maxItemLevel || 0));

  const options = useMemo(() => ({
    classes: ["Усі класи", ...uniqueSorted(members.map((member) => member.className))],
    specs: ["Усі спеки", ...uniqueSorted(members.map((member) => member.specName))],
    factions: ["Усі фракції", ...uniqueSorted(members.map((member) => member.faction))],
  }), [members]);

  const filteredMembers = useMemo(() => {
    const search = query.trim().toLowerCase();
    const minRio = Math.min(rioMin, rioMax);
    const maxRioValue = Math.max(rioMin, rioMax);
    const minItemLevel = Math.min(itemLevelMin, itemLevelMax);
    const maxItemLevelValue = Math.max(itemLevelMin, itemLevelMax);

    return members
      .filter((member) => {
        const score = member.scores[segment] || 0;
        if (score < minRio || score > maxRioValue) return false;
        if (member.itemLevel < minItemLevel || member.itemLevel > maxItemLevelValue) return false;
        if (classFilter !== "Усі класи" && member.className !== classFilter) return false;
        if (specFilter !== "Усі спеки" && member.specName !== specFilter) return false;
        if (roleFilter !== "Усі ролі" && ROLE_LABELS[member.role] !== roleFilter) return false;
        if (factionFilter !== "Усі фракції" && member.faction !== factionFilter) return false;
        if (!search) return true;

        return [member.name, member.realmName, member.realmSlug, member.className, member.specName, member.raceName, member.faction]
          .join(" ")
          .toLowerCase()
          .includes(search);
      })
      .sort((a, b) => {
        if (sort === "rio-asc") return (a.scores[segment] || 0) - (b.scores[segment] || 0) || a.name.localeCompare(b.name, "uk");
        if (sort === "ilvl-desc") return b.itemLevel - a.itemLevel || (b.scores[segment] || 0) - (a.scores[segment] || 0);
        if (sort === "name-asc") return a.name.localeCompare(b.name, "uk");
        if (sort === "rank-asc") return (a.rank ?? 999) - (b.rank ?? 999) || a.name.localeCompare(b.name, "uk");
        return (b.scores[segment] || 0) - (a.scores[segment] || 0) || b.itemLevel - a.itemLevel || a.name.localeCompare(b.name, "uk");
      });
  }, [members, segment, query, classFilter, specFilter, roleFilter, factionFilter, rioMin, rioMax, itemLevelMin, itemLevelMax, sort]);

  const statData = useMemo(() => {
    const armorColors: Record<ArmorType, string> = {
      "Тканина": "#8a5cff",
      "Шкіра": "#ffad22",
      "Кольчуга": "#45c7f4",
      "Лати": "#ff4d59",
    };
    const armorCounts = ARMOR_LABELS.map((label) => ({
      label,
      count: members.filter((member) => getArmorType(member) === label).length,
      color: armorColors[label],
    }));

    const roleColors: Record<string, string> = {
      dps: "#ff737d",
      healer: "#4eff63",
      tank: "#65b7ff",
      unknown: "#9aa3b2",
    };
    const roleCounts = ROLE_ORDER.map((role) => ({
      role,
      count: members.filter((member) => member.role === role).length,
      averageRio: members.filter((member) => member.role === role).reduce((sum, member, _, arr) => sum + member.scores.all / Math.max(1, arr.length), 0),
      color: roleColors[role],
    })).filter((item) => item.count > 0 || item.role !== "unknown");

    return { armorCounts, roleCounts };
  }, [members]);

  const segmentCounts = useMemo(() => {
    return (["all", "dps", "healer", "tank"] as GuildScoreSegment[]).reduce((acc, item) => {
      acc[item] = members.filter((member) => (member.scores[item] || 0) > 0).length;
      return acc;
    }, {} as Record<GuildScoreSegment, number>);
  }, [members]);

  function resetFilters() {
    setQuery("");
    setClassFilter("Усі класи");
    setSpecFilter("Усі спеки");
    setRoleFilter("Усі ролі");
    setFactionFilter("Усі фракції");
    setRioMin(0);
    setRioMax(maxRio);
    setItemLevelMin(0);
    setItemLevelMax(maxItemLevel);
    setSort("rio-desc");
  }

  if (!members.length) {
    return (
      <section className="guild-roster-empty panel">
        <h2>Дані складу гільдії ще не завантажені</h2>
        <p>Сторінка бере склад напряму з Battle.net Guild Roster API та оновлює Raider.IO для персонажів. Перевір Battle.net змінні, Raider.IO access key за потреби та натисни “Оновити склад”.</p>
        {error ? <small>{error}</small> : null}
      </section>
    );
  }

  return (
    <>
      <section className="guild-stat-grid" aria-label="Статистика гільдії">
        <StatDonut
          title="Тип броні"
          subtitle="Яку броню носять гравці гільдії"
          center={formatNumber(stats.averageItemLevel)}
          caption="СЕР. ILVL"
          segments={statData.armorCounts.map((item) => ({ value: item.count, color: item.color }))}
          legend={statData.armorCounts.map((item) => ({
            label: item.label,
            value: `${percent(item.count, members.length)}%`,
            detail: `${item.count} гравців`,
            color: item.color,
          }))}
        />
        <StatDonut
          title="Середній RIO гільдії"
          subtitle="У центрі — середній Mythic+ рейтинг, по колу — співвідношення ролей"
          center={formatNumber(stats.averageRioAll)}
          caption="СЕР. RIO"
          segments={statData.roleCounts.map((item) => ({ value: item.count, color: item.color }))}
          legend={statData.roleCounts.map((item) => ({
            label: ROLE_LABELS[item.role] || item.role,
            value: `${percent(item.count, members.length)}%`,
            detail: `${item.count} гравців • сер. RIO ${formatNumber(item.averageRio)}`,
            color: item.color,
          }))}
        />
      </section>

      <section className="guild-roster-layout">
        <aside className="guild-filter-panel panel" aria-label="Фільтри складу гільдії">
          <div className="guild-filter-head">
            <div>
              <span className="eyebrow">Фільтри</span>
              <h2>Пошук по складу</h2>
            </div>
            <button type="button" onClick={resetFilters}>Скинути</button>
          </div>

          <label className="guild-filter-field guild-filter-field--wide">
            <span>Пошук</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Нік, клас, спек, реалм…" />
          </label>

          <RangeFilter
            label="RIO"
            minValue={rioMin}
            maxValue={rioMax}
            absoluteMin={0}
            absoluteMax={maxRio}
            onMinChange={setRioMin}
            onMaxChange={setRioMax}
          />

          <RangeFilter
            label="Item level"
            minValue={itemLevelMin}
            maxValue={itemLevelMax}
            absoluteMin={0}
            absoluteMax={maxItemLevel}
            onMinChange={setItemLevelMin}
            onMaxChange={setItemLevelMax}
          />

          <FilterSelect label="Клас" value={classFilter} options={options.classes} onChange={setClassFilter} />
          <FilterSelect label="Спек" value={specFilter} options={options.specs} onChange={setSpecFilter} />
          <FilterSelect label="Роль" value={roleFilter} options={["Усі ролі", "Танк", "Хіл", "DPS", "Без ролі"]} onChange={setRoleFilter} />
          <FilterSelect label="Фракція" value={factionFilter} options={options.factions} onChange={setFactionFilter} />
          <label className="guild-filter-field">
            <span>Сортування</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="rio-desc">RIO: від більшого</option>
              <option value="rio-asc">RIO: від меншого</option>
              <option value="ilvl-desc">Item level: від більшого</option>
              <option value="name-asc">Ім’я: А–Я</option>
              <option value="rank-asc">Гільдійний ранг</option>
            </select>
          </label>

          <div className="guild-filter-source">
            <span>Джерело: {source}</span>
            {stats.updatedAt ? <span>Оновлено: {stats.updatedAt}</span> : null}
          </div>
        </aside>

        <section className="guild-roster-main" aria-label="Список персонажів гільдії">
          <div className="guild-segment-tabs panel">
            {(["all", "dps", "healer", "tank"] as GuildScoreSegment[]).map((item) => (
              <button
                type="button"
                key={item}
                className={segment === item ? "is-active" : undefined}
                onClick={() => setSegment(item)}
              >
                <strong>{SEGMENT_LABELS[item]}</strong>
                <span>{segmentCounts[item]} з RIO</span>
              </button>
            ))}
          </div>

          <div className="guild-roster-summary panel">
            <div>
              <span className="eyebrow">Склад гільдії</span>
              <strong>{filteredMembers.length} / {members.length}</strong>
              <small>показано після фільтрів</small>
            </div>
            <div>
              <span>Макс. RIO ALL</span>
              <strong>{formatNumber(stats.maxRioAll, 1)}</strong>
            </div>
            <div>
              <span>Макс. ilvl</span>
              <strong>{formatNumber(stats.maxItemLevel)}</strong>
            </div>
          </div>

          <div className="guild-member-list">
            {filteredMembers.length ? filteredMembers.map((member, index) => {
              const score = member.scores[segment] || 0;
              return (
                <article className={`guild-member-card panel guild-member-card--${member.role}`} key={member.key}>
                  <div className="guild-member-leading">
                    <CharacterAvatar member={member} />
                    <div className="guild-member-rank">#{index + 1}</div>
                  </div>
                  <div className="guild-member-main">
                    <div className="guild-member-title">
                      <h3 style={{ color: classColor(member.className) }}>{member.name}</h3>
                      <span>{member.region}-{member.realmName}</span>
                    </div>
                    <p>{member.specName} {member.className} • {member.raceName}</p>
                    <div className="guild-member-score">
                      <small>RAIDER.IO M+</small>
                      <strong>{formatNumber(score, 1)}</strong>
                    </div>
                  </div>
                  <div className="guild-member-side">
                    <div className="guild-member-tags">
                      <span className={`guild-role-tag guild-role-tag--${member.role}`}>{roleShort(member.role)}</span>
                      <span className="guild-ilvl-tag">{member.itemLevel || "—"}</span>
                      <span className={`guild-faction-tag guild-faction-tag--${member.faction.toLowerCase()}`}>{member.faction}</span>
                    </div>
                    <SegmentBadges member={member} activeSegment={segment} />
                    {member.profileUrl ? <a href={member.profileUrl} target="_blank" rel="noreferrer">Raider.IO</a> : <span className="guild-no-link">Без Raider.IO</span>}
                  </div>
                </article>
              );
            }) : <div className="guild-roster-empty panel"><h2>Нікого не знайдено</h2><p>Зміни фільтри або скинь їх.</p></div>}
          </div>
        </section>
      </section>
    </>
  );
}
