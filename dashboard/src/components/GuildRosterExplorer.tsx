"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type {
  GuildRosterMember,
  GuildRosterStats,
  GuildScoreSegment,
} from "@/lib/guildRoster";
import { useDashboardApiResource } from "@/lib/dashboardBackgroundApi";
import { formatStableNumber, stableTextCompare } from "@/lib/stableUiText";

type SortKey =
  | "rio-desc"
  | "rio-asc"
  | "ilvl-desc"
  | "wcl-dps-desc"
  | "wcl-hps-desc"
  | "wcl-updated-desc"
  | "name-asc"
  | "rank-asc";

type Props = {
  members: GuildRosterMember[];
  stats: GuildRosterStats;
  source: string;
  error?: string | null;
};

type GuildRosterLivePayload = Props & {
  ok?: boolean;
  memberCount?: number;
  updatedAt?: string | null;
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
type ArmorType = (typeof ARMOR_LABELS)[number];

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
  return formatStableNumber(value, digits);
}

type GuildRosterWclMetric = NonNullable<
  NonNullable<GuildRosterMember["warcraftLogs"]>["primaryMetric"]
>;

function metricAmount(metric?: GuildRosterWclMetric | null) {
  if (!metric) return 0;
  const value = Number(metric.max ?? metric.average ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function metricHasValue(metric?: GuildRosterWclMetric | null) {
  if (!metric) return false;
  return metricAmount(metric) > 0 && Number(metric.pulls || 0) > 0;
}

function memberWclDps(member: GuildRosterMember) {
  const snapshot = member.warcraftLogs;
  if (!snapshot || snapshot.status !== "ready") return 0;
  if (member.role === "tank") return metricAmount(snapshot.tankDps);
  if (member.role === "dps") return metricAmount(snapshot.dps);
  return Math.max(metricAmount(snapshot.dps), metricAmount(snapshot.tankDps));
}

function memberWclHps(member: GuildRosterMember) {
  const snapshot = member.warcraftLogs;
  if (!snapshot || snapshot.status !== "ready") return 0;
  if (member.role === "tank") return metricAmount(snapshot.tankHps);
  if (member.role === "healer") return metricAmount(snapshot.hps);
  return Math.max(metricAmount(snapshot.hps), metricAmount(snapshot.tankHps));
}

function memberWclUpdatedAt(member: GuildRosterMember) {
  const time = Date.parse(member.warcraftLogs?.updatedAt || "");
  return Number.isFinite(time) ? time : 0;
}

function uniqueSorted(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  ).sort((a, b) => stableTextCompare(a, b));
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
  return items
    .map((item) => {
      const size = (Math.max(0, item.value) / total) * 360;
      const start = cursor;
      cursor += size;
      return `${item.color} ${start}deg ${cursor}deg`;
    })
    .join(", ");
}

function FilterSelect({
  id,
  name,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="guild-filter-field" htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function clampValue(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function parseNumberInput(
  event: ChangeEvent<HTMLInputElement>,
  fallback: number,
) {
  const raw = event.target.value.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

const RANGE_THUMB_HALF_PX = 10;

function rangePosition(percentValue: number) {
  const safePercent = Math.min(100, Math.max(0, percentValue));
  const insetCompensation = RANGE_THUMB_HALF_PX * (1 - safePercent / 50);
  const roundedPercent = Number(safePercent.toFixed(4));
  const roundedCompensation = Number(insetCompensation.toFixed(4));

  return `calc(${roundedPercent}% + ${roundedCompensation}px)`;
}

function RangeFilter({
  idBase,
  nameBase,
  label,
  minValue,
  maxValue,
  absoluteMin,
  absoluteMax,
  onMinChange,
  onMaxChange,
}: {
  idBase: string;
  nameBase: string;
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
        <strong>
          {formatNumber(low)} — {formatNumber(high)}
        </strong>
      </div>

      <div className="guild-range-inputs">
        <label className="guild-range-value" htmlFor={`${idBase}-min`}>
          <span>від</span>
          <input
            id={`${idBase}-min`}
            name={`${nameBase}_min`}
            type="number"
            inputMode="numeric"
            min={absoluteMin}
            max={safeAbsoluteMax}
            value={safeMin}
            onChange={(event) =>
              onMinChange(
                clampValue(
                  parseNumberInput(event, safeMin),
                  absoluteMin,
                  safeAbsoluteMax,
                ),
              )
            }
          />
        </label>
        <label className="guild-range-value" htmlFor={`${idBase}-max`}>
          <span>до</span>
          <input
            id={`${idBase}-max`}
            name={`${nameBase}_max`}
            type="number"
            inputMode="numeric"
            min={absoluteMin}
            max={safeAbsoluteMax}
            value={safeMax}
            onChange={(event) =>
              onMaxChange(
                clampValue(
                  parseNumberInput(event, safeMax),
                  absoluteMin,
                  safeAbsoluteMax,
                ),
              )
            }
          />
        </label>
      </div>

      <div
        className="guild-dual-range"
        style={
          {
            "--range-start": rangePosition(startPercent),
            "--range-end": rangePosition(endPercent),
          } as CSSProperties
        }
      >
        <div className="guild-dual-range__line" aria-hidden="true" />
        <div className="guild-dual-range__active" aria-hidden="true" />
        <input
          id={`${idBase}-min-slider`}
          name={`${nameBase}_min_slider`}
          className="guild-dual-range__input"
          type="range"
          min={absoluteMin}
          max={safeAbsoluteMax}
          value={safeMin}
          onChange={(event) =>
            onMinChange(
              clampValue(
                Number(event.target.value),
                absoluteMin,
                safeAbsoluteMax,
              ),
            )
          }
        />
        <input
          id={`${idBase}-max-slider`}
          name={`${nameBase}_max_slider`}
          className="guild-dual-range__input"
          type="range"
          min={absoluteMin}
          max={safeAbsoluteMax}
          value={safeMax}
          onChange={(event) =>
            onMaxChange(
              clampValue(
                Number(event.target.value),
                absoluteMin,
                safeAbsoluteMax,
              ),
            )
          }
        />
      </div>
    </div>
  );
}

function StatDonut({
  title,
  subtitle,
  center,
  caption,
  segments,
  legend,
}: {
  title: string;
  subtitle: string;
  center: string;
  caption: string;
  segments: Array<{ value: number; color: string }>;
  legend: Array<{
    label: string;
    value: string;
    detail: string;
    color: string;
  }>;
}) {
  return (
    <article className="guild-stat-card panel">
      <div className="guild-stat-card__head">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="guild-donut-layout">
        <div
          className="guild-donut"
          style={
            { "--guild-donut": buildConicSegments(segments) } as CSSProperties
          }
        >
          <div>
            <strong>{center}</strong>
            <span>{caption}</span>
          </div>
        </div>
        <div className="guild-stat-legend">
          {legend.map((item) => (
            <div className="guild-stat-legend__item" key={item.label}>
              <span
                className="guild-stat-dot"
                style={{ background: item.color }}
              />
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
    return (
      <img
        className="guild-member-avatar"
        src={member.avatarUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span className="guild-member-avatar guild-member-avatar--empty">
      {member.name.charAt(0).toUpperCase()}
    </span>
  );
}

function openProfileCard(event: MouseEvent<HTMLElement>, href?: string | null) {
  if (!href) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("a,button,input,select,textarea,label")) return;
  window.location.href = href;
}

function openProfileCardWithKeyboard(
  event: KeyboardEvent<HTMLElement>,
  href?: string | null,
) {
  if (!href) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("a,button,input,select,textarea,label")) return;
  event.preventDefault();
  window.location.href = href;
}

function SegmentBadges({
  member,
  activeSegment,
}: {
  member: GuildRosterMember;
  activeSegment: GuildScoreSegment;
}) {
  return (
    <div className="guild-score-badges" aria-label="Raider.IO сегменти">
      {(["all", "dps", "healer", "tank"] as GuildScoreSegment[]).map(
        (segment) => {
          const value = member.scores[segment];
          if (!value && segment !== activeSegment) return null;
          return (
            <span
              className={segment === activeSegment ? "is-active" : undefined}
              key={segment}
            >
              <small>{SEGMENT_LABELS[segment]}</small>
              <strong>{formatNumber(value, 1)}</strong>
            </span>
          );
        },
      )}
    </div>
  );
}

function DataSourceStatus({ member }: { member: GuildRosterMember }) {
  const wcl = member.warcraftLogs;
  const bnetProfileReady = Boolean(
    member.battleNetUpdatedAt ||
      member.itemLevel > 0 ||
      member.avatarUrl ||
      member.specName !== "Unknown" ||
      member.role !== "unknown",
  );
  const wclReady = Boolean(wcl && wcl.status === "ready");
  const wclHasMetric = memberWclDps(member) > 0 || memberWclHps(member) > 0;
  return (
    <div className="guild-member-source-row" aria-label="Джерела даних персонажа">
      <span className="is-ready">Battle.net: склад</span>
      <span className={bnetProfileReady ? "is-ready" : "is-pending"}>
        Профіль BNet: {bnetProfileReady ? "готово" : "очікує"}
      </span>
      <span className={member.hasRaiderIo ? "is-ready" : "is-pending"}>
        Raider.IO: {member.hasRaiderIo ? "M+" : "очікує"}
      </span>
      <span className={wclHasMetric ? "is-ready" : wclReady ? "is-empty" : "is-pending"}>
        WCL: {wclHasMetric ? "DPS/HPS" : wclReady ? "без pull" : wcl?.status === "error" ? "помилка" : "очікує"}
      </span>
    </div>
  );
}

function WarcraftLogsBadges({ member }: { member: GuildRosterMember }) {
  const snapshot = member.warcraftLogs;
  if (!snapshot || snapshot.status === "not_configured") {
    return (
      <div
        className="guild-wcl-badges guild-wcl-badges--muted"
        aria-label="Warcraft Logs"
      >
        <span>
          <small>Warcraft Logs</small>
          <strong>очікує</strong>
          <em>дані DPS/HPS ще не синхронізовані</em>
        </span>
      </div>
    );
  }
  if (snapshot.status !== "ready") {
    return (
      <div
        className="guild-wcl-badges guild-wcl-badges--muted"
        aria-label="Warcraft Logs"
      >
        <span>
          <small>Warcraft Logs</small>
          <strong>—</strong>
          <em>{snapshot.status === "not_found" ? "персонажа не знайдено" : snapshot.error || "помилка синхронізації"}</em>
        </span>
      </div>
    );
  }

  const metrics =
    member.role === "tank"
      ? [snapshot.tankDps, snapshot.tankHps]
      : member.role === "healer"
        ? [snapshot.hps]
        : member.role === "dps"
          ? [snapshot.dps]
          : [snapshot.hps, snapshot.dps, snapshot.tankDps, snapshot.tankHps];
  const visible = metrics.filter((item): item is GuildRosterWclMetric =>
    metricHasValue(item),
  );

  if (!visible.length) {
    return (
      <div
        className="guild-wcl-badges guild-wcl-badges--muted"
        aria-label="Warcraft Logs"
      >
        <span>
          <small>Warcraft Logs</small>
          <strong>без pull</strong>
          <em>немає валідних DPS/HPS з останніх 5 kill/wipe</em>
        </span>
      </div>
    );
  }

  return (
    <div className="guild-wcl-badges" aria-label="Warcraft Logs HPS/DPS">
      {visible.map((metric) => (
        <span
          key={`${metric.role}-${metric.metric}-${metric.label}`}
          className={`guild-wcl-badge guild-wcl-badge--${metric.role}`}
        >
          <small>{metric.label} MAX 5</small>
          <strong>{formatNumber(metricAmount(metric), 1)}</strong>
          <em>
            сер. {formatNumber(metric.average ?? 0, 1)} • {metric.kills} kill /{" "}
            {metric.wipes} wipe • {metric.pulls}/5
          </em>
        </span>
      ))}
    </div>
  );
}

export default function GuildRosterExplorer({
  members,
  stats,
  source,
  error,
}: Props) {
  const initialRoster = useMemo<GuildRosterLivePayload>(
    () => ({ members, stats, source, error: error || null }),
    [members, stats, source, error],
  );
  const rosterResource = useDashboardApiResource<GuildRosterLivePayload>({
    key: "guild-roster",
    scope: "guild",
    initialData: initialRoster,
    minIntervalMs: 10 * 60 * 1000,
    request: () => ({
      url: "/api/guild/refresh",
      method: "POST",
      headers: { "X-Dashboard-Action": "guild-roster-cache-sync" },
      json: { cacheOnly: true, includeMembers: true },
      select: (payload) => {
        const data = payload as Partial<GuildRosterLivePayload> | null;
        return {
          members: Array.isArray(data?.members) ? data.members : members,
          stats: data?.stats || stats,
          source: typeof data?.source === "string" ? data.source : source,
          error: typeof data?.error === "string" ? data.error : null,
          ok: data?.ok,
          memberCount: data?.memberCount,
          updatedAt: data?.updatedAt,
        };
      },
    }),
  });
  const liveMembers = rosterResource.data.members.length
    ? rosterResource.data.members
    : members;
  const liveStats = rosterResource.data.stats || stats;
  const liveSource = rosterResource.data.source || source;
  const liveError =
    rosterResource.data.error || error || rosterResource.error || null;

  const [segment, setSegment] = useState<GuildScoreSegment>("all");
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("Усі класи");
  const [specFilter, setSpecFilter] = useState("Усі спеки");
  const [roleFilter, setRoleFilter] = useState("Усі ролі");
  const [factionFilter, setFactionFilter] = useState("Усі фракції");
  const [rioMin, setRioMin] = useState(0);
  const [rioMax, setRioMax] = useState(Math.ceil(liveStats.maxRioAll || 0));
  const [itemLevelMin, setItemLevelMin] = useState(0);
  const [itemLevelMax, setItemLevelMax] = useState(
    Math.ceil(liveStats.maxItemLevel || 0),
  );
  const [wclDpsMin, setWclDpsMin] = useState(0);
  const [wclDpsMax, setWclDpsMax] = useState(0);
  const [sort, setSort] = useState<SortKey>("rio-desc");
  const [filtersOpen, setFiltersOpen] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 720px)");
    const applyState = () => {
      setFiltersOpen(!media.matches);
    };

    applyState();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", applyState);
      return () => media.removeEventListener("change", applyState);
    }

    media.addListener(applyState);
    return () => media.removeListener(applyState);
  }, []);

  const maxRio = Math.max(0, Math.ceil(liveStats.maxRioAll || 0));
  const maxItemLevel = Math.max(0, Math.ceil(liveStats.maxItemLevel || 0));
  const maxWclDps = Math.ceil(Math.max(0, ...liveMembers.map(memberWclDps)));
  const maxWclHps = Math.ceil(Math.max(0, ...liveMembers.map(memberWclHps)));
  const wclReadyCount = liveMembers.filter(
    (member) => member.warcraftLogs?.status === "ready",
  ).length;
  const wclMetricCount = liveMembers.filter(
    (member) => memberWclDps(member) > 0 || memberWclHps(member) > 0,
  ).length;

  useEffect(() => {
    setRioMax((value) => (value <= 0 || value < maxRio ? maxRio : Math.min(value, maxRio)));
  }, [maxRio]);

  useEffect(() => {
    setItemLevelMax((value) =>
      value <= 0 || value < maxItemLevel ? maxItemLevel : Math.min(value, maxItemLevel),
    );
  }, [maxItemLevel]);

  useEffect(() => {
    setWclDpsMax((value) =>
      value <= 0 || value < maxWclDps ? maxWclDps : Math.min(value, maxWclDps),
    );
  }, [maxWclDps]);

  const options = useMemo(
    () => ({
      classes: [
        "Усі класи",
        ...uniqueSorted(liveMembers.map((member) => member.className)),
      ],
      specs: [
        "Усі спеки",
        ...uniqueSorted(liveMembers.map((member) => member.specName)),
      ],
      factions: [
        "Усі фракції",
        ...uniqueSorted(liveMembers.map((member) => member.faction)),
      ],
    }),
    [liveMembers],
  );

  const filteredMembers = useMemo(() => {
    const search = query.trim().toLowerCase();
    const minRio = Math.min(rioMin, rioMax);
    const maxRioValue = Math.max(rioMin, rioMax);
    const minItemLevel = Math.min(itemLevelMin, itemLevelMax);
    const maxItemLevelValue = Math.max(itemLevelMin, itemLevelMax);
    const minWclDps = Math.min(wclDpsMin, wclDpsMax);
    const maxWclDpsValue = Math.max(wclDpsMin, wclDpsMax);

    return liveMembers
      .filter((member) => {
        const score = member.scores[segment] || 0;
        if (score < minRio || score > maxRioValue) return false;
        if (
          member.itemLevel < minItemLevel ||
          member.itemLevel > maxItemLevelValue
        )
          return false;
        const wclDps = memberWclDps(member);
        if (maxWclDpsValue > 0 && (wclDps < minWclDps || wclDps > maxWclDpsValue))
          return false;
        if (classFilter !== "Усі класи" && member.className !== classFilter)
          return false;
        if (specFilter !== "Усі спеки" && member.specName !== specFilter)
          return false;
        if (
          roleFilter !== "Усі ролі" &&
          ROLE_LABELS[member.role] !== roleFilter
        )
          return false;
        if (factionFilter !== "Усі фракції" && member.faction !== factionFilter)
          return false;
        if (!search) return true;

        return [
          member.name,
          member.realmName,
          member.realmSlug,
          member.className,
          member.specName,
          member.raceName,
          member.faction,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      })
      .sort((a, b) => {
        if (sort === "rio-asc")
          return (
            (a.scores[segment] || 0) - (b.scores[segment] || 0) ||
            stableTextCompare(a.name, b.name)
          );
        if (sort === "ilvl-desc")
          return (
            b.itemLevel - a.itemLevel ||
            (b.scores[segment] || 0) - (a.scores[segment] || 0)
          );
        if (sort === "wcl-dps-desc")
          return (
            memberWclDps(b) - memberWclDps(a) ||
            (b.scores[segment] || 0) - (a.scores[segment] || 0) ||
            stableTextCompare(a.name, b.name)
          );
        if (sort === "wcl-hps-desc")
          return (
            memberWclHps(b) - memberWclHps(a) ||
            (b.scores[segment] || 0) - (a.scores[segment] || 0) ||
            stableTextCompare(a.name, b.name)
          );
        if (sort === "wcl-updated-desc")
          return memberWclUpdatedAt(b) - memberWclUpdatedAt(a) || stableTextCompare(a.name, b.name);
        if (sort === "name-asc") return stableTextCompare(a.name, b.name);
        if (sort === "rank-asc")
          return (
            (a.rank ?? 999) - (b.rank ?? 999) ||
            stableTextCompare(a.name, b.name)
          );
        return (
          (b.scores[segment] || 0) - (a.scores[segment] || 0) ||
          b.itemLevel - a.itemLevel ||
          stableTextCompare(a.name, b.name)
        );
      });
  }, [
    liveMembers,
    segment,
    query,
    classFilter,
    specFilter,
    roleFilter,
    factionFilter,
    rioMin,
    rioMax,
    itemLevelMin,
    itemLevelMax,
    wclDpsMin,
    wclDpsMax,
    sort,
  ]);

  const statData = useMemo(() => {
    const armorColors: Record<ArmorType, string> = {
      Тканина: "#8a5cff",
      Шкіра: "#ffad22",
      Кольчуга: "#45c7f4",
      Лати: "#ff4d59",
    };
    const armorCounts = ARMOR_LABELS.map((label) => ({
      label,
      count: liveMembers.filter((member) => getArmorType(member) === label)
        .length,
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
      count: liveMembers.filter((member) => member.role === role).length,
      averageRio: liveMembers
        .filter((member) => member.role === role)
        .reduce(
          (sum, member, _, arr) =>
            sum + member.scores.all / Math.max(1, arr.length),
          0,
        ),
      color: roleColors[role],
    })).filter((item) => item.count > 0 || item.role !== "unknown");

    return { armorCounts, roleCounts };
  }, [liveMembers]);

  const segmentCounts = useMemo(() => {
    return (["all", "dps", "healer", "tank"] as GuildScoreSegment[]).reduce(
      (acc, item) => {
        acc[item] = liveMembers.filter(
          (member) => (member.scores[item] || 0) > 0,
        ).length;
        return acc;
      },
      {} as Record<GuildScoreSegment, number>,
    );
  }, [liveMembers]);

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
    setWclDpsMin(0);
    setWclDpsMax(maxWclDps);
    setSort("rio-desc");
  }

  if (!liveMembers.length) {
    const isStorageLimited =
      liveSource === "firebase-temporary-unavailable" ||
      /ліміт|quota|resource|firebase.*недоступ/i.test(liveError || "");

    if (isStorageLimited) {
      return (
        <section className="guild-roster-empty panel app-error-panel" aria-live="polite">
          <span className="eyebrow">Firebase quota guard</span>
          <h2>Тимчасова технічна помилка</h2>
          <p>
            Сховище Firebase зараз недоступне або вперлося в ліміти. Сайт
            зупинив важкі читання складу, щоб не збільшувати перевищення квоти.
          </p>
          {liveError ? <small>{liveError}</small> : null}
          <div className="form-actions">
            <button
              className="btn subtle"
              type="button"
              onClick={() => window.location.reload()}
            >
              Оновити сторінку
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="guild-roster-empty panel">
        <h2>Дані складу гільдії ще не завантажені</h2>
        <p>
          Сторінка читає тільки нормалізовані Firebase-записи. Live-збір не
          запускається під час render, щоб не роздувати API та Firebase-ліміти.
          Запусти покрокову синхронізацію через кнопку “Оновити склад”.
        </p>
        {liveError ? <small>{liveError}</small> : null}
      </section>
    );
  }

  return (
    <>
      <section className="guild-stat-grid" aria-label="Статистика гільдії">
        <StatDonut
          title="Тип броні"
          subtitle="Яку броню носять гравці гільдії"
          center={formatNumber(liveStats.averageItemLevel)}
          caption="СЕР. ILVL"
          segments={statData.armorCounts.map((item) => ({
            value: item.count,
            color: item.color,
          }))}
          legend={statData.armorCounts.map((item) => ({
            label: item.label,
            value: `${percent(item.count, liveMembers.length)}%`,
            detail: `${item.count} гравців`,
            color: item.color,
          }))}
        />
        <StatDonut
          title="Середній RIO гільдії"
          subtitle="У центрі — середній Mythic+ рейтинг, по колу — співвідношення ролей"
          center={formatNumber(liveStats.averageRioAll)}
          caption="СЕР. RIO"
          segments={statData.roleCounts.map((item) => ({
            value: item.count,
            color: item.color,
          }))}
          legend={statData.roleCounts.map((item) => ({
            label: ROLE_LABELS[item.role] || item.role,
            value: `${percent(item.count, liveMembers.length)}%`,
            detail: `${item.count} гравців • сер. RIO ${formatNumber(item.averageRio)}`,
            color: item.color,
          }))}
        />
      </section>

      <section className="guild-roster-layout">
        <aside
          className={`guild-filter-panel panel ${filtersOpen ? "is-open" : "is-collapsed"}`}
          aria-label="Фільтри складу гільдії"
        >
          <div className="guild-filter-head">
            <div>
              <span className="eyebrow">Фільтри</span>
              <h2>Пошук по складу</h2>
            </div>
            <div className="guild-filter-head__actions">
              <button
                type="button"
                className="guild-filter-toggle"
                onClick={() => setFiltersOpen((value) => !value)}
                aria-expanded={filtersOpen}
              >
                {filtersOpen ? "Згорнути" : "Показати"}
              </button>
              <button
                type="button"
                className="guild-filter-reset"
                onClick={resetFilters}
              >
                Скинути
              </button>
            </div>
          </div>

          {filtersOpen ? (
            <div className="guild-filter-body">
              <label
                className="guild-filter-field guild-filter-field--wide"
                htmlFor="guild-roster-search"
              >
                <span>Пошук</span>
                <input
                  id="guild-roster-search"
                  name="guild_roster_search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Нік, клас, спек, реалм…"
                  autoComplete="off"
                />
              </label>

              <RangeFilter
                idBase="guild-roster-rio"
                nameBase="guild_roster_rio"
                label="RIO"
                minValue={rioMin}
                maxValue={rioMax}
                absoluteMin={0}
                absoluteMax={maxRio}
                onMinChange={setRioMin}
                onMaxChange={setRioMax}
              />

              <RangeFilter
                idBase="guild-roster-wcl-dps"
                nameBase="guild_roster_wcl_dps"
                label="WCL DPS MAX 5"
                minValue={wclDpsMin}
                maxValue={wclDpsMax}
                absoluteMin={0}
                absoluteMax={maxWclDps}
                onMinChange={setWclDpsMin}
                onMaxChange={setWclDpsMax}
              />

              <RangeFilter
                idBase="guild-roster-item-level"
                nameBase="guild_roster_item_level"
                label="Item level"
                minValue={itemLevelMin}
                maxValue={itemLevelMax}
                absoluteMin={0}
                absoluteMax={maxItemLevel}
                onMinChange={setItemLevelMin}
                onMaxChange={setItemLevelMax}
              />

              <FilterSelect
                id="guild-roster-class"
                name="guild_roster_class"
                label="Клас"
                value={classFilter}
                options={options.classes}
                onChange={setClassFilter}
              />
              <FilterSelect
                id="guild-roster-spec"
                name="guild_roster_spec"
                label="Спек"
                value={specFilter}
                options={options.specs}
                onChange={setSpecFilter}
              />
              <FilterSelect
                id="guild-roster-role"
                name="guild_roster_role"
                label="Роль"
                value={roleFilter}
                options={["Усі ролі", "Танк", "Хіл", "DPS", "Без ролі"]}
                onChange={setRoleFilter}
              />
              <FilterSelect
                id="guild-roster-faction"
                name="guild_roster_faction"
                label="Фракція"
                value={factionFilter}
                options={options.factions}
                onChange={setFactionFilter}
              />
              <label className="guild-filter-field" htmlFor="guild-roster-sort">
                <span>Сортування</span>
                <select
                  id="guild-roster-sort"
                  name="guild_roster_sort"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                >
                  <option value="rio-desc">RIO: від більшого</option>
                  <option value="rio-asc">RIO: від меншого</option>
                  <option value="ilvl-desc">Item level: від більшого</option>
                  <option value="wcl-dps-desc">WCL DPS MAX 5</option>
                  <option value="wcl-hps-desc">WCL HPS MAX 5</option>
                  <option value="wcl-updated-desc">WCL: останнє оновлення</option>
                  <option value="name-asc">Ім’я: А–Я</option>
                  <option value="rank-asc">Гільдійний ранг</option>
                </select>
              </label>

              <div className="guild-filter-source">
                <span>Джерело: {liveSource}</span>
                {liveStats.updatedAt ? (
                  <span>Оновлено: {liveStats.updatedAt}</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </aside>

        <section
          className="guild-roster-main"
          aria-label="Список персонажів гільдії"
        >
          <div className="guild-segment-tabs panel">
            {(["all", "dps", "healer", "tank"] as GuildScoreSegment[]).map(
              (item) => (
                <button
                  type="button"
                  key={item}
                  className={segment === item ? "is-active" : undefined}
                  onClick={() => setSegment(item)}
                >
                  <strong>{SEGMENT_LABELS[item]}</strong>
                  <span>{segmentCounts[item]} з RIO</span>
                </button>
              ),
            )}
          </div>

          <div className="guild-roster-summary panel">
            <div>
              <span className="eyebrow">Склад гільдії</span>
              <strong>
                {filteredMembers.length} / {liveMembers.length}
              </strong>
              <small>показано після фільтрів</small>
            </div>
            <div>
              <span>Макс. RIO ALL</span>
              <strong>{formatNumber(liveStats.maxRioAll, 1)}</strong>
            </div>
            <div>
              <span>Макс. ilvl</span>
              <strong>{formatNumber(liveStats.maxItemLevel)}</strong>
            </div>
            <div>
              <span>WCL DPS MAX 5</span>
              <strong>{formatNumber(maxWclDps, 1)}</strong>
            </div>
            <div>
              <span>WCL HPS MAX 5</span>
              <strong>{formatNumber(maxWclHps, 1)}</strong>
            </div>
            <div>
              <span>WCL готово</span>
              <strong>{wclMetricCount}/{wclReadyCount || liveMembers.length}</strong>
            </div>
          </div>

          <div className="guild-member-list">
            {filteredMembers.length ? (
              filteredMembers.map((member, index) => {
                const score = member.scores[segment] || 0;
                const ownerProfileHref = member.ownerProfileId
                  ? `/profile/${encodeURIComponent(member.ownerProfileId)}`
                  : null;
                return (
                  <article
                    className={`guild-member-card panel guild-member-card--${member.role}${ownerProfileHref ? " guild-member-card--clickable" : ""}`}
                    key={member.key}
                    role={ownerProfileHref ? "link" : undefined}
                    tabIndex={ownerProfileHref ? 0 : undefined}
                    data-profile-href={ownerProfileHref || undefined}
                    title={
                      ownerProfileHref
                        ? `Відкрити профіль: ${member.ownerDisplayName || member.name}`
                        : undefined
                    }
                    onClick={(event) =>
                      openProfileCard(event, ownerProfileHref)
                    }
                    onKeyDown={(event) =>
                      openProfileCardWithKeyboard(event, ownerProfileHref)
                    }
                  >
                    <div className="guild-member-leading">
                      <CharacterAvatar member={member} />
                      <div className="guild-member-rank">#{index + 1}</div>
                    </div>
                    <div className="guild-member-main">
                      <div className="guild-member-title">
                        <h3 style={{ color: classColor(member.className) }}>
                          {member.name}
                        </h3>
                        <span>
                          {member.region}-{member.realmName}
                        </span>
                      </div>
                      <p>
                        {member.specName} {member.className} • {member.raceName}
                      </p>
                      <DataSourceStatus member={member} />
                      <div className="guild-member-score">
                        <div className="guild-member-score-block guild-member-score-block--rio">
                          <small>RAIDER.IO M+</small>
                          <strong>{formatNumber(score, 1)}</strong>
                        </div>
                        <div className="guild-member-score-block guild-member-score-block--ilvl">
                          <small>ITEM LEVEL</small>
                          <strong>{member.itemLevel || "—"}</strong>
                        </div>
                      </div>
                      <WarcraftLogsBadges member={member} />
                    </div>
                    <div className="guild-member-side">
                      <div className="guild-member-tags">
                        <span
                          className={`guild-role-tag guild-role-tag--${member.role}`}
                        >
                          {roleShort(member.role)}
                        </span>
                        {member.guildStatusLabel ? (
                          <span
                            className={`guild-status-tag guild-status-tag--${member.guildStatus || "member"}`}
                          >
                            {member.guildStatusLabel}
                          </span>
                        ) : null}
                        <span
                          className={`guild-faction-tag guild-faction-tag--${member.faction.toLowerCase()}`}
                        >
                          {member.faction}
                        </span>
                      </div>
                      <SegmentBadges member={member} activeSegment={segment} />
                      <div className="guild-member-links">
                        {ownerProfileHref ? (
                          <a
                            className="guild-profile-link"
                            href={ownerProfileHref}
                            onClick={(event) => event.stopPropagation()}
                          >
                            Профіль
                          </a>
                        ) : (
                          <span className="guild-no-link">
                            Профіль не привʼязано
                          </span>
                        )}
                        {member.profileUrl ? (
                          <a
                            href={member.profileUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            Raider.IO
                          </a>
                        ) : (
                          <span className="guild-no-link">Без Raider.IO</span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="guild-roster-empty panel">
                <h2>Нікого не знайдено</h2>
                <p>Зміни фільтри або скинь їх.</p>
              </div>
            )}
          </div>
        </section>
      </section>
    </>
  );
}
