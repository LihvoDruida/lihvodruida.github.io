"use client";

import { useMemo, useState } from "react";

import type {
  WarcraftLogsBossPull,
  WarcraftLogsBossSummary,
  WarcraftLogsCharacterSummary,
  WarcraftLogsDifficultySummary,
  WarcraftLogsMetricSummary,
} from "@/lib/warcraftLogs";
import {
  formatStableNumber,
  formatStableUkCompactDate,
} from "@/lib/stableUiText";

type GraphMode = "percentile" | "amount";

type GraphPoint = WarcraftLogsBossPull & {
  xPercent: number;
  yPercent: number;
  label: string;
  bossKey: string;
  bossName: string;
  isActive: boolean;
  sortTime: number;
};

type GraphData = {
  points: GraphPoint[];
  mode: GraphMode;
  maxAmount: number | null;
};

type GraphTick = {
  xPercent: number;
  label: string;
};

const PERCENTILE_MAX = 99;
const PERCENTILE_GUIDES = [99, 80, 60, 40, 20, 0] as const;
const SLICE_ORDER = [
  "healer-hps",
  "dps-dps",
  "tank-dps",
  "tank-hps",
  "overall",
];
const VIEWBOX = {
  width: 1000,
  height: 360,
  left: 58,
  right: 18,
  top: 54,
  bottom: 44,
};
const PLOT_WIDTH = VIEWBOX.width - VIEWBOX.left - VIEWBOX.right;
const PLOT_HEIGHT = VIEWBOX.height - VIEWBOX.top - VIEWBOX.bottom;

function clampPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(PERCENTILE_MAX, value));
}

function formatPercent(value: number | null | undefined) {
  const percent = clampPercent(value);
  if (percent === null) return "—";
  return `${formatStableNumber(percent, percent % 1 ? 1 : 0)}%`;
}

function clampProgress(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function formatProgress(value: number | null | undefined) {
  const percent = clampProgress(value);
  if (percent === null) return "—";
  return `${formatStableNumber(percent, percent % 1 ? 1 : 0)}%`;
}

function formatAmount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 1000)
    return `${formatStableNumber(value / 1000, value >= 100_000 ? 0 : 1)}k`;
  return formatStableNumber(value, 0);
}

function formatDuration(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return "—";
  const seconds = Math.round(value > 10_000 ? value / 1000 : value);
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function difficultyLabel(value: number | null | undefined) {
  if (value === 5) return "MYTHIC";
  if (value === 4) return "HEROIC";
  if (value === 3) return "NORMAL";
  if (value === 2) return "LEGACY/FLEX";
  if (value === 1) return "LFR";
  return "RAID";
}

function normalizedOutcome(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["kill", "killed", "true", "1", "кіл"].includes(normalized)) return "kill";
  if (["wipe", "wiped", "false", "0", "вайп"].includes(normalized)) return "wipe";
  return normalized || "unknown";
}

function pullOutcomeLabel(value: string | null | undefined) {
  const outcome = normalizedOutcome(value);
  if (outcome === "kill") return "Кіл";
  if (outcome === "wipe") return "Вайп";
  return value || "—";
}

function pullOutcomeClass(value: string | null | undefined) {
  const outcome = normalizedOutcome(value);
  if (outcome === "kill") return "is-kill";
  if (outcome === "wipe") return "is-wipe";
  return "is-unknown";
}

function pullDate(pull: WarcraftLogsBossPull) {
  return pull.startTime ? new Date(pull.startTime).getTime() : 0;
}

function bossKey(
  boss: Pick<WarcraftLogsBossSummary, "encounterId" | "encounterName">,
) {
  return `${boss.encounterId ?? boss.encounterName}`;
}

function graphPointKey(point: GraphPoint, index: number) {
  return [
    point.bossKey,
    point.reportCode || "pull",
    point.reportFightId ?? "fight",
    point.startTime || index,
    point.percentile ?? "percentile",
  ].join(":");
}

function xCoord(percent: number) {
  return VIEWBOX.left + (percent / 100) * PLOT_WIDTH;
}

function yCoord(percent: number) {
  const safePercent = Math.max(0, Math.min(PERCENTILE_MAX, percent));
  return VIEWBOX.top + ((PERCENTILE_MAX - safePercent) / PERCENTILE_MAX) * PLOT_HEIGHT;
}

function diamondPoints(cx: number, cy: number, radius: number) {
  return `${cx},${cy - radius} ${cx + radius},${cy} ${cx},${cy + radius} ${cx - radius},${cy}`;
}

function percentileLabel(value: number) {
  if (value === 99) return "99-й перцентиль";
  if (value === 0) return "0-й перцентиль";
  return `${value}-й перцентиль`;
}

function toCombinedGraphPoints(
  bosses: WarcraftLogsBossSummary[],
  activeBoss: WarcraftLogsBossSummary | null,
  activeSlice: WarcraftLogsMetricSummary | null,
  activeDifficulty: number | null,
): GraphData {
  const activeBossKey = activeBoss ? bossKey(activeBoss) : null;
  const primaryDifficulty = activeDifficulty ?? activeSlice?.primaryDifficulty ?? null;
  const source = bosses.flatMap((boss) => {
    const key = bossKey(boss);
    return boss.pulls
      .filter(
        (pull) =>
          primaryDifficulty === null || pull.difficulty === primaryDifficulty,
      )
      .map((pull) => ({
        boss,
        pull,
        percent: clampPercent(pull.percentile),
        amount:
          typeof pull.amount === "number" &&
          Number.isFinite(pull.amount) &&
          pull.amount > 0
            ? pull.amount
            : null,
        sortTime: pullDate(pull),
        key,
      }));
  });

  const hasPercentiles = source.some((item) => item.percent !== null);
  const amountMax = source.reduce(
    (max, item) => (item.amount !== null ? Math.max(max, item.amount) : max),
    0,
  );
  const mode: GraphMode = hasPercentiles ? "percentile" : "amount";
  const filtered = source.filter((item) =>
    mode === "percentile"
      ? item.percent !== null
      : item.amount !== null && amountMax > 0,
  );

  const sorted = filtered.sort((left, right) => {
    if (left.sortTime !== right.sortTime) return left.sortTime - right.sortTime;
    return left.boss.encounterName.localeCompare(
      right.boss.encounterName,
      "uk",
    );
  });
  const timed = sorted.filter((item) => item.sortTime > 0);
  const firstTime = timed[0]?.sortTime ?? 0;
  const lastTime = timed[timed.length - 1]?.sortTime ?? 0;
  const range = lastTime > firstTime ? lastTime - firstTime : 0;

  return {
    mode,
    maxAmount: amountMax > 0 ? amountMax : null,
    points: sorted.map((item, index) => {
      const xPercent =
        range > 0 && item.sortTime > 0
          ? ((item.sortTime - firstTime) / range) * 100
          : sorted.length <= 1
            ? 50
            : (index / (sorted.length - 1)) * 100;
      const yPercent =
        mode === "percentile"
          ? (item.percent ?? 0)
          : amountMax > 0 && item.amount !== null
            ? Math.max(0, Math.min(100, (item.amount / amountMax) * 100))
            : 0;
      return {
        ...item.pull,
        xPercent: Math.max(0, Math.min(100, xPercent)),
        yPercent,
        bossKey: item.key,
        bossName: item.boss.encounterName,
        isActive: activeBossKey ? item.key === activeBossKey : true,
        sortTime: item.sortTime,
        label: [
          item.boss.encounterName,
          formatStableUkCompactDate(item.pull.startTime),
          mode === "percentile"
            ? `Parse ${formatPercent(item.pull.percentile)}`
            : null,
          item.pull.amount !== null
            ? `${metricLabel(activeSlice)} ${formatAmount(item.pull.amount)}`
            : null,
          item.pull.killedWith,
          item.pull.itemLevel !== null
            ? `ilvl ${formatStableNumber(item.pull.itemLevel, 0)}`
            : null,
        ]
          .filter(Boolean)
          .join(" • "),
      };
    }),
  };
}

function graphTicks(points: GraphPoint[]): GraphTick[] {
  const timed = [...points]
    .filter((point) => point.sortTime > 0)
    .sort((left, right) => left.sortTime - right.sortTime);
  if (!timed.length) return [];
  if (timed.length === 1)
    return [
      {
        xPercent: timed[0].xPercent,
        label: formatStableUkCompactDate(timed[0].startTime),
      },
    ];

  const target = Math.min(6, timed.length);
  const used = new Set<number>();
  return Array.from({ length: target }, (_, index) => {
    const sourceIndex = Math.round(
      (index / Math.max(1, target - 1)) * (timed.length - 1),
    );
    return timed[sourceIndex];
  })
    .filter((point) => {
      const day = Math.floor(point.sortTime / 86_400_000);
      if (used.has(day)) return false;
      used.add(day);
      return true;
    })
    .map((point) => ({
      xPercent: point.xPercent,
      label: formatStableUkCompactDate(point.startTime),
    }));
}

function metricLabel(
  summary: Pick<WarcraftLogsMetricSummary, "metricLabel"> | null | undefined,
) {
  return summary?.metricLabel || "Показник";
}

function totalAmountLabel(summary: WarcraftLogsMetricSummary) {
  return summary.metric === "hps"
    ? "Healing"
    : summary.metric === "dps"
      ? "Damage"
      : "Total";
}

function sliceHasUsefulData(summary: WarcraftLogsMetricSummary) {
  if (summary.role === "overall") return false;
  return Boolean(
    summary.recentStats.pullCount > 0 ||
    summary.recentStats.sampleSize > 0 ||
    summary.recentStats.averagePercentile !== null ||
    summary.bossRankings.some(
      (boss) =>
        boss.recentStats.pullCount > 0 ||
        boss.recentStats.sampleSize > 0 ||
        boss.bestPercentile !== null,
    ),
  );
}

function sortedMetricSummaries(summary: WarcraftLogsCharacterSummary) {
  return [...summary.metricSummaries]
    .filter(sliceHasUsefulData)
    .sort((left, right) => {
      const leftIndex = SLICE_ORDER.indexOf(left.key);
      const rightIndex = SLICE_ORDER.indexOf(right.key);
      return (
        (leftIndex === -1 ? 99 : leftIndex) -
        (rightIndex === -1 ? 99 : rightIndex)
      );
    });
}

function difficultyKey(value: number | null | undefined) {
  return value === null || value === undefined ? "unknown" : String(value);
}

function availableDifficulties(activeSlice: WarcraftLogsMetricSummary | null) {
  if (!activeSlice) return [] as WarcraftLogsDifficultySummary[];
  return activeSlice.difficultySummaries
    .filter(
      (difficulty) =>
        difficulty.difficulty !== null &&
        (difficulty.recentStats.pullCount > 0 ||
          difficulty.recentStats.sampleSize > 0 ||
          difficulty.recentStats.averagePercentile !== null),
    )
    .sort((left, right) => (right.difficulty ?? 0) - (left.difficulty ?? 0));
}

function bossStatsForDifficulty(
  boss: WarcraftLogsBossSummary,
  difficulty: number | null,
) {
  return (
    boss.difficultySummaries.find((item) => item.difficulty === difficulty) ||
    boss.difficultySummaries[0] ||
    null
  );
}

function bossHasDifficulty(
  boss: WarcraftLogsBossSummary,
  difficulty: number | null,
) {
  if (difficulty === null) return true;
  return (
    boss.difficulty === difficulty ||
    boss.primaryDifficulty === difficulty ||
    boss.difficultySummaries.some((item) => item.difficulty === difficulty) ||
    boss.pulls.some((pull) => pull.difficulty === difficulty)
  );
}

function bossCompletenessScore(
  boss: WarcraftLogsBossSummary,
  difficulty: number | null,
): number {
  const difficultyStats = bossStatsForDifficulty(boss, difficulty);
  const values: unknown[] = [
    boss.bestPercentile,
    boss.percentile,
    boss.bestAmount,
    difficultyStats?.recentStats.maxAmount,
    difficultyStats?.recentStats.averageAmount,
    difficultyStats?.recentStats.pullCount,
    difficultyStats?.recentStats.sampleSize,
    boss.totalKills,
    boss.fastestKillMs,
    boss.pulls.length,
  ];
  return values.reduce<number>(
    (score, value) =>
      score + (value !== null && value !== undefined && value !== "" ? 1 : 0),
    boss.difficulty === difficulty ? 3 : 0,
  );
}

function availableBossesForDifficulty(
  activeSlice: WarcraftLogsMetricSummary | null,
  difficulty: number | null,
) {
  const byBoss = new Map<string, WarcraftLogsBossSummary>();
  for (const boss of activeSlice?.bossRankings || []) {
    if (!boss.encounterName || !bossHasDifficulty(boss, difficulty)) continue;
    const stats = bossStatsForDifficulty(boss, difficulty);
    const hasData =
      (stats?.recentStats.pullCount ?? 0) > 0 ||
      (stats?.recentStats.sampleSize ?? 0) > 0 ||
      boss.bestPercentile !== null ||
      boss.percentile !== null;
    if (!hasData) continue;

    const key = bossKey(boss);
    const existing = byBoss.get(key);
    if (
      !existing ||
      bossCompletenessScore(boss, difficulty) >
        bossCompletenessScore(existing, difficulty)
    ) {
      byBoss.set(key, boss);
    }
  }
  return [...byBoss.values()].sort((left, right) =>
    left.encounterName.localeCompare(right.encounterName, "uk"),
  );
}

function pullsForDifficulty(
  pulls: WarcraftLogsBossPull[],
  difficulty: number | null,
) {
  if (difficulty === null) return pulls;
  return pulls.filter((pull) => pull.difficulty === difficulty);
}

function GraphSvg({
  graph,
  activeBossName,
  activeSlice,
}: {
  graph: GraphData;
  activeBossName: string | null;
  activeSlice: WarcraftLogsMetricSummary;
}) {
  const points = graph.points;
  const activePoints = points
    .filter((point) => point.isActive)
    .sort((left, right) => left.sortTime - right.sortTime);
  const inactivePoints = points.filter((point) => !point.isActive);
  const polyline = activePoints
    .map((point) => `${xCoord(point.xPercent)},${yCoord(point.yPercent)}`)
    .join(" ");
  const ticks = graphTicks(points);

  return (
    <div
      className="profile-wcl-graph"
      aria-label="Спільний графік по рейдових босах"
    >
      <svg
        viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
        role="img"
        preserveAspectRatio="xMidYMid meet"
      >
        <title>Динаміка по всіх рейдових босах</title>
        <rect
          className="profile-wcl-plot-bg"
          x={VIEWBOX.left}
          y={VIEWBOX.top}
          width={PLOT_WIDTH}
          height={PLOT_HEIGHT}
          rx="2"
        />

        <g className="profile-wcl-svg-legend" aria-hidden="true">
          {PERCENTILE_GUIDES.map((percentile, index) => {
            const x = VIEWBOX.left + index * 132;
            return (
              <g
                key={percentile}
                className={`profile-wcl-guide profile-wcl-guide--${percentile}`}
                transform={`translate(${x} 18)`}
              >
                <line
                  x1="0"
                  x2="34"
                  y1="0"
                  y2="0"
                  vectorEffect="non-scaling-stroke"
                />
                <text x="41" y="4">
                  {graph.mode === "percentile"
                    ? percentileLabel(percentile)
                    : formatAmount(((graph.maxAmount || 0) * percentile) / 100)}
                </text>
              </g>
            );
          })}
          <g
            className="profile-wcl-legend-pulls"
            transform={`translate(${VIEWBOX.left + PERCENTILE_GUIDES.length * 132} 18)`}
          >
            <polygon points={diamondPoints(5, 0, 4)} />
            <text x="16" y="4">
              {activeBossName || "Вибрано"}{" "}
              {graph.mode === "percentile" ? "Parse" : activeSlice.metricLabel}
            </text>
          </g>
        </g>

        {PERCENTILE_GUIDES.map((percentile) => {
          const y = yCoord(percentile);
          return (
            <g
              key={percentile}
              className={`profile-wcl-guide profile-wcl-guide--${percentile}`}
            >
              <line
                x1={VIEWBOX.left}
                x2={VIEWBOX.left + PLOT_WIDTH}
                y1={y}
                y2={y}
                vectorEffect="non-scaling-stroke"
              />
              <text
                className="profile-wcl-y-tick"
                x={VIEWBOX.left - 12}
                y={y + 4}
                textAnchor="end"
              >
                {graph.mode === "percentile"
                  ? percentile
                  : formatAmount(((graph.maxAmount || 0) * percentile) / 100)}
              </text>
            </g>
          );
        })}

        <line
          className="profile-wcl-axis"
          x1={VIEWBOX.left}
          x2={VIEWBOX.left}
          y1={VIEWBOX.top}
          y2={VIEWBOX.top + PLOT_HEIGHT}
          vectorEffect="non-scaling-stroke"
        />
        <line
          className="profile-wcl-axis"
          x1={VIEWBOX.left}
          x2={VIEWBOX.left + PLOT_WIDTH}
          y1={VIEWBOX.top + PLOT_HEIGHT}
          y2={VIEWBOX.top + PLOT_HEIGHT}
          vectorEffect="non-scaling-stroke"
        />
        <text
          className="profile-wcl-axis-title"
          transform={`translate(22 ${VIEWBOX.top + PLOT_HEIGHT / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          {graph.mode === "percentile" ? "Parse %" : activeSlice.metricLabel}
        </text>

        {ticks.map((tick) => {
          const x = xCoord(tick.xPercent);
          return (
            <g
              key={`${tick.xPercent}-${tick.label}`}
              className="profile-wcl-x-tick"
            >
              <line
                x1={x}
                x2={x}
                y1={VIEWBOX.top}
                y2={VIEWBOX.top + PLOT_HEIGHT}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={x}
                y={VIEWBOX.top + PLOT_HEIGHT + 25}
                textAnchor="middle"
              >
                {tick.label}
              </text>
            </g>
          );
        })}

        {polyline ? (
          <polyline
            points={polyline}
            className="profile-wcl-line"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {inactivePoints.map((point, index) => {
          const x = xCoord(point.xPercent);
          const y = yCoord(point.yPercent);
          return (
            <polygon
              key={graphPointKey(point, index)}
              className="profile-wcl-point profile-wcl-point--muted"
              points={diamondPoints(x, y, 3.5)}
              vectorEffect="non-scaling-stroke"
            >
              <title>{point.label}</title>
            </polygon>
          );
        })}
        {activePoints.map((point, index) => {
          const x = xCoord(point.xPercent);
          const y = yCoord(point.yPercent);
          return (
            <polygon
              key={graphPointKey(point, index)}
              className="profile-wcl-point profile-wcl-point--active"
              points={diamondPoints(x, y, 5)}
              vectorEffect="non-scaling-stroke"
            >
              <title>{point.label}</title>
            </polygon>
          );
        })}
      </svg>
    </div>
  );
}

function MetricStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | null;
}) {
  return (
    <span className="profile-wcl-mini-stat">
      <strong>{value}</strong>
      <small>{label}</small>
      {hint ? <em>{hint}</em> : null}
    </span>
  );
}

function PullFact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "muted";
}) {
  if (!value || value === "—") return null;
  return (
    <span className={`profile-wcl-pull-fact${tone ? ` profile-wcl-pull-fact--${tone}` : ""}`}>
      <strong>{value}</strong>
      <small>{label}</small>
    </span>
  );
}

function PullRow({
  pull,
  index,
  activeSlice,
}: {
  pull: WarcraftLogsBossPull;
  index: number;
  activeSlice: WarcraftLogsMetricSummary;
}) {
  const total =
    pull.metric === "hps"
      ? (pull.healingDone ?? pull.totalAmount)
      : pull.metric === "dps"
        ? (pull.damageDone ?? pull.totalAmount)
        : pull.totalAmount;
  const outcome = normalizedOutcome(pull.killedWith);
  const progress =
    outcome === "wipe"
      ? pull.bossPercentage
      : (pull.fightPercentage ?? pull.bossPercentage);
  const primaryMetric = formatAmount(pull.amount);
  const reportMeta = [
    formatStableUkCompactDate(pull.startTime),
    difficultyLabel(pull.difficulty),
    pull.reportFightId !== null ? `fight ${pull.reportFightId}` : null,
    pull.fightSize ? `${pull.fightSize} гравців` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  const row = (
    <>
      <span className="profile-wcl-pull-main">
        <strong>#{index + 1} · {pullOutcomeLabel(pull.killedWith)}</strong>
        <small>{reportMeta || pull.reportTitle || "рейдовий pull"}</small>
      </span>
      <span className="profile-wcl-pull-primary">
        <strong>{primaryMetric}</strong>
        <small>{metricLabel(activeSlice)}</small>
      </span>
      <span className="profile-wcl-pull-facts">
        <PullFact label="parse" value={formatPercent(pull.percentile)} />
        <PullFact label={totalAmountLabel(activeSlice)} value={formatAmount(total)} />
        <PullFact
          label={outcome === "wipe" ? "залишок боса" : "прогрес"}
          value={formatProgress(progress)}
          tone={outcome === "kill" ? "good" : outcome === "wipe" ? "warn" : undefined}
        />
        <PullFact label="тривалість" value={formatDuration(pull.durationMs)} />
        <PullFact
          label="смерті"
          value={
            pull.deathCount !== null
              ? formatStableNumber(pull.deathCount, 0)
              : "—"
          }
          tone={pull.deathCount && pull.deathCount > 0 ? "warn" : "muted"}
        />
        <PullFact
          label="ilvl"
          value={
            pull.itemLevel !== null
              ? formatStableNumber(pull.itemLevel, 0)
              : "—"
          }
        />
        <PullFact
          label="interrupts"
          value={
            pull.interruptCount !== null
              ? formatStableNumber(pull.interruptCount, 0)
              : "—"
          }
        />
        <PullFact
          label="dispels"
          value={
            pull.dispelCount !== null
              ? formatStableNumber(pull.dispelCount, 0)
              : "—"
          }
        />
      </span>
    </>
  );

  const className = `profile-wcl-pull-row ${pullOutcomeClass(pull.killedWith)}`;
  if (pull.reportUrl) {
    return (
      <a
        className={className}
        href={pull.reportUrl}
        target="_blank"
        rel="noreferrer"
      >
        {row}
      </a>
    );
  }
  return <div className={className}>{row}</div>;
}


function BossButton({
  boss,
  active,
  onClick,
  label,
  difficulty,
}: {
  boss: WarcraftLogsBossSummary;
  active: boolean;
  onClick: () => void;
  label: string;
  difficulty: number | null;
}) {
  const stats = bossStatsForDifficulty(boss, difficulty);
  const recent = stats?.recentStats ?? boss.recentStats;
  return (
    <button
      type="button"
      className={active ? "is-active" : ""}
      role="tab"
      aria-selected={active}
      onClick={onClick}
    >
      <strong>{boss.encounterName}</strong>
      <span>
        {stats?.difficultyLabel || difficultyLabel(difficulty ?? boss.difficulty)} · {formatPercent(recent.averagePercentile ?? boss.bestPercentile)} parse · {formatAmount(recent.averageAmount)} {label}
      </span>
      <em>
        {formatStableNumber(recent.pullCount, 0)} пулів · {formatStableNumber(recent.killCount, 0)}/{formatStableNumber(recent.wipeCount, 0)} К/В · {formatStableNumber(recent.deathCount, 0)} смертей
      </em>
    </button>
  );
}


function GraphSidePanel({
  activeBoss,
  activeSlice,
  activeDifficulty,
}: {
  activeBoss: WarcraftLogsBossSummary;
  activeSlice: WarcraftLogsMetricSummary;
  activeDifficulty: number | null;
}) {
  const difficultyStats = bossStatsForDifficulty(activeBoss, activeDifficulty);
  const stats = difficultyStats?.recentStats ?? activeBoss.recentStats;
  return (
    <aside
      className="profile-wcl-graph-side"
      aria-label="Підсумок вибраного боса"
    >
      <span className="profile-wcl-graph-side__difficulty">
        {difficultyStats?.difficultyLabel ||
          difficultyLabel(activeDifficulty ?? activeBoss.difficulty)}
      </span>
      <strong>
        {formatPercent(
          stats.averagePercentile ??
            activeBoss.medianPercentile ??
            activeBoss.bestPercentile,
        )}
      </strong>
      <small>Середній parse по активній складності</small>
      <dl>
        <div>
          <dt>Пули</dt>
          <dd>{formatStableNumber(stats.pullCount, 0)}</dd>
        </div>
        <div>
          <dt>Кіл / вайп</dt>
          <dd>{formatStableNumber(stats.killCount, 0)} / {formatStableNumber(stats.wipeCount, 0)}</dd>
        </div>
        <div>
          <dt>Макс. {activeSlice.metricLabel}</dt>
          <dd>{formatAmount(stats.maxAmount ?? activeBoss.bestAmount)}</dd>
        </div>
        <div>
          <dt>Середній</dt>
          <dd>{formatAmount(stats.averageAmount)}</dd>
        </div>
        <div>
          <dt>Медіана</dt>
          <dd>{formatAmount(stats.medianAmount)}</dd>
        </div>
        <div>
          <dt>Смерті</dt>
          <dd>{formatStableNumber(stats.deathCount, 0)}</dd>
        </div>
        <div>
          <dt>Best wipe</dt>
          <dd>{formatProgress(stats.bestBossPercentage)}</dd>
        </div>
        <div>
          <dt>Стабільність</dt>
          <dd>{formatPercent(stats.consistencyScore)}</dd>
        </div>
        <div>
          <dt>Найшвидший кіл</dt>
          <dd>{formatDuration(activeBoss.fastestKillMs)}</dd>
        </div>
      </dl>
    </aside>
  );
}


function DataCoverageStrip({
  summary,
}: {
  summary: WarcraftLogsCharacterSummary;
}) {
  const coverage = summary.sourceCoverage;
  const cleanPulls = coverage.uniqueReportPullRows || coverage.reportPullRows;
  return (
    <div className="profile-wcl-data-strip" aria-label="Покриття Warcraft Logs">
      <span>
        <strong>{formatStableNumber(coverage.reportsChecked, 0)}</strong>
        <small>WCL звітів</small>
      </span>
      <span>
        <strong>{formatStableNumber(coverage.reportBossFightsChecked, 0)}</strong>
        <small>boss pull-ів знайдено</small>
      </span>
      <span>
        <strong>{formatStableNumber(cleanPulls, 0)}</strong>
        <small>чистих рольових pull-ів</small>
      </span>
      <span>
        <strong>
          {formatStableNumber(coverage.roleTotals.healer, 0)} / {formatStableNumber(coverage.roleTotals.dps, 0)} / {formatStableNumber(coverage.roleTotals.tank, 0)}
        </strong>
        <small>хіл / дд / танк</small>
      </span>
      <span>
        <strong>{formatStableNumber(coverage.skippedUnknownRole, 0)}</strong>
        <small>без чистої ролі</small>
      </span>
      <span>
        <strong>{formatStableNumber(coverage.duplicatePullRows, 0)}</strong>
        <small>обʼєднаних дублів</small>
      </span>
    </div>
  );
}


export default function WarcraftLogsBossGraphs({
  summary,
}: {
  summary: WarcraftLogsCharacterSummary;
}) {
  const slices = useMemo(() => sortedMetricSummaries(summary), [summary]);
  const [selectedSliceKey, setSelectedSliceKey] = useState<string | null>(null);
  const [selectedDifficultyKey, setSelectedDifficultyKey] = useState<string | null>(null);
  const activeSlice =
    slices.find((slice) => slice.key === selectedSliceKey) || slices[0] || null;
  const difficulties = useMemo(
    () => availableDifficulties(activeSlice),
    [activeSlice],
  );
  const activeDifficulty =
    difficulties.find((difficulty) => difficultyKey(difficulty.difficulty) === selectedDifficultyKey) ||
    difficulties.find((difficulty) => difficulty.difficulty === activeSlice?.primaryDifficulty) ||
    difficulties[0] ||
    null;
  const activeDifficultyValue = activeDifficulty?.difficulty ?? activeSlice?.primaryDifficulty ?? null;
  const activeStats = activeDifficulty?.recentStats ?? activeSlice?.recentStats ?? null;
  const bosses = useMemo(
    () => availableBossesForDifficulty(activeSlice, activeDifficultyValue),
    [activeSlice, activeDifficultyValue],
  );
  const [selectedBossKey, setSelectedBossKey] = useState<string | null>(null);
  const activeBoss =
    bosses.find((boss) => bossKey(boss) === selectedBossKey) ||
    bosses[0] ||
    null;
  const graphData = useMemo(
    () => toCombinedGraphPoints(bosses, activeBoss, activeSlice, activeDifficultyValue),
    [bosses, activeBoss, activeSlice, activeDifficultyValue],
  );

  if (!slices.length || !activeSlice) {
    return (
      <div className="profile-wcl-dynamic profile-wcl-dynamic--empty">
        <strong>Warcraft Logs поки не повернув чисті рольові дані</strong>
        <span>Пули без визначеної ролі не додаються в статистику.</span>
      </div>
    );
  }

  return (
    <section
      className="profile-wcl-dynamic"
      aria-label="Динамічні графіки Warcraft Logs по ролях і босах"
    >
      <div className="profile-wcl-dynamic__head">
        <div>
          <span className="eyebrow">Warcraft Logs</span>
          <h3>Чисті пули по рейдових босах</h3>
          <p>
            Чисті рейдові pull-и з WCL: хілам рахуємо тільки HPS, ДД тільки DPS,
            танкам окремо Tank DPS і Tank HPS. Складність перемикається нижче.
          </p>
        </div>
        <span className="profile-count-pill">{slices.length} метрик</span>
      </div>

      <DataCoverageStrip summary={summary} />

      <div
        className="profile-wcl-role-tabs"
        role="tablist"
        aria-label="Рольові метрики Warcraft Logs"
      >
        {slices.map((slice) => (
          <button
            key={slice.key}
            type="button"
            className={slice.key === activeSlice.key ? "is-active" : ""}
            role="tab"
            aria-selected={slice.key === activeSlice.key}
            onClick={() => {
              setSelectedSliceKey(slice.key);
              setSelectedDifficultyKey(null);
              setSelectedBossKey(null);
            }}
          >
            <strong>{slice.title}</strong>
            <span>
              {slice.primaryDifficultyLabel || "рейд"} • {formatStableNumber(slice.recentStats.pullCount, 0)} пулів • {formatStableNumber(slice.recentStats.killCount, 0)}/{formatStableNumber(slice.recentStats.wipeCount, 0)} К/В
            </span>
          </button>
        ))}
      </div>

      <div
        className="profile-wcl-metric-grid"
        aria-label={`Підсумок ${activeSlice.title}`}
      >
        <MetricStat
          label="Активна складність"
          value={activeDifficulty?.difficultyLabel || activeSlice.primaryDifficultyLabel || "—"}
          hint="перемикач нижче"
        />
        <MetricStat
          label="Parse avg"
          value={formatPercent(activeStats?.averagePercentile ?? activeSlice.bestPerformanceAverage)}
          hint={activeSlice.roleLabel}
        />
        <MetricStat
          label="Медіана parse"
          value={formatPercent(activeStats?.medianPercentile ?? activeSlice.medianPerformanceAverage)}
          hint={activeSlice.metricLabel}
        />
        <MetricStat
          label={`Макс. ${activeSlice.metricLabel}`}
          value={formatAmount(activeStats?.maxAmount)}
          hint="чисті пули"
        />
        <MetricStat
          label={`Середній ${activeSlice.metricLabel}`}
          value={formatAmount(activeStats?.averageAmount)}
          hint="єдиний метод"
        />
        <MetricStat
          label={`Медіана ${activeSlice.metricLabel}`}
          value={formatAmount(activeStats?.medianAmount)}
          hint="власний розрахунок"
        />
        <MetricStat
          label="Стабільність"
          value={formatPercent(activeStats?.consistencyScore)}
          hint="розкид"
        />
        <MetricStat
          label="Пули / К/В"
          value={`${formatStableNumber(activeStats?.pullCount ?? 0, 0)} / ${formatStableNumber(activeStats?.killCount ?? 0, 0)}-${formatStableNumber(activeStats?.wipeCount ?? 0, 0)}`}
          hint={`${formatStableNumber(activeStats?.deathCount ?? 0, 0)} смертей`}
        />
      </div>

      {difficulties.length ? (
        <div
          className="profile-wcl-difficulty-strip"
          aria-label="Перемикач складності Warcraft Logs"
          role="tablist"
        >
          {difficulties.map((difficulty) => (
            <button
              type="button"
              key={`${activeSlice.key}-${difficultyKey(difficulty.difficulty)}`}
              className={
                difficulty.difficulty === activeDifficultyValue
                  ? "is-primary"
                  : ""
              }
              role="tab"
              aria-selected={difficulty.difficulty === activeDifficultyValue}
              onClick={() => {
                setSelectedDifficultyKey(difficultyKey(difficulty.difficulty));
                setSelectedBossKey(null);
              }}
            >
              <strong>{difficulty.difficultyLabel}</strong>
              <small>
                {formatAmount(difficulty.recentStats.averageAmount)}{" "}
                {activeSlice.metricLabel} • {difficulty.recentStats.pullCount}{" "}
                пулів • {difficulty.recentStats.killCount}/{difficulty.recentStats.wipeCount} К/В
              </small>
            </button>
          ))}
        </div>
      ) : null}

      {bosses.length ? (
        <>
          <div
            className="profile-wcl-boss-tabs"
            role="tablist"
            aria-label="Боси Warcraft Logs"
          >
            {bosses.map((boss, index) => {
              const key = `${boss.encounterId ?? boss.encounterName}`;
              return (
                <BossButton
                  key={key}
                  boss={boss}
                  label={activeSlice.metricLabel}
                  difficulty={activeDifficultyValue}
                  active={
                    activeBoss
                      ? `${activeBoss.encounterId ?? activeBoss.encounterName}` ===
                        key
                      : index === 0
                  }
                  onClick={() => setSelectedBossKey(key)}
                />
              );
            })}
          </div>

          {activeBoss ? (
            <div className="profile-wcl-boss-panel" role="tabpanel">
              <div className="profile-wcl-boss-summary">
                <MetricStat
                  label="Складність"
                  value={bossStatsForDifficulty(activeBoss, activeDifficultyValue)?.difficultyLabel || activeBoss.primaryDifficultyLabel || "—"}
                />
                <MetricStat
                  label="Найкращий parse"
                  value={formatPercent(bossStatsForDifficulty(activeBoss, activeDifficultyValue)?.recentStats.averagePercentile ?? activeBoss.bestPercentile)}
                />
                <MetricStat
                  label={`Макс. ${activeSlice.metricLabel}`}
                  value={formatAmount(
                    bossStatsForDifficulty(activeBoss, activeDifficultyValue)?.recentStats.maxAmount ??
                      activeBoss.recentStats.maxAmount ??
                      activeBoss.bestAmount,
                  )}
                />
                <MetricStat
                  label={`Середній ${activeSlice.metricLabel}`}
                  value={formatAmount(bossStatsForDifficulty(activeBoss, activeDifficultyValue)?.recentStats.averageAmount ?? activeBoss.recentStats.averageAmount)}
                  hint="єдиний метод"
                />
                <MetricStat
                  label={`Медіана ${activeSlice.metricLabel}`}
                  value={formatAmount(bossStatsForDifficulty(activeBoss, activeDifficultyValue)?.recentStats.medianAmount ?? activeBoss.recentStats.medianAmount)}
                />
                <MetricStat
                  label="Кіл / вайп"
                  value={`${bossStatsForDifficulty(activeBoss, activeDifficultyValue)?.recentStats.killCount ?? activeBoss.recentStats.killCount}/${bossStatsForDifficulty(activeBoss, activeDifficultyValue)?.recentStats.wipeCount ?? activeBoss.recentStats.wipeCount}`}
                />
                <MetricStat
                  label="Кіли / швидкість"
                  value={`${activeBoss.totalKills ?? "—"} / ${formatDuration(activeBoss.fastestKillMs)}`}
                />
              </div>

              {graphData.points.length ? (
                <div className="profile-wcl-graph-layout">
                  <GraphSvg
                    graph={graphData}
                    activeBossName={activeBoss.encounterName}
                    activeSlice={activeSlice}
                  />
                  <GraphSidePanel
                    activeBoss={activeBoss}
                    activeSlice={activeSlice}
                    activeDifficulty={activeDifficultyValue}
                  />
                </div>
              ) : (
                <div className="profile-wcl-dynamic profile-wcl-dynamic--empty profile-wcl-dynamic--inline">
                  <strong>Немає точок для графіка</strong>
                  <span>
                    Є рейдові пули без parse %. HPS/DPS все одно рахуються по
                    доступних пулах.
                  </span>
                </div>
              )}

              <div
                className="profile-wcl-pulls"
                aria-label="Доступні рейдові пули по босу"
              >
                {pullsForDifficulty(activeBoss.pulls, activeDifficultyValue)
                  .sort((left, right) => pullDate(right) - pullDate(left))
                  .map((pull, index) => (
                    <PullRow
                      key={`${pull.reportCode || activeBoss.encounterName}-${pull.reportFightId ?? pull.startTime ?? index}-${pull.amount ?? pull.percentile ?? index}`}
                      pull={pull}
                      index={index}
                      activeSlice={activeSlice}
                    />
                  ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="profile-wcl-dynamic profile-wcl-dynamic--empty profile-wcl-dynamic--inline">
          <strong>Немає даних по босах для {activeSlice.title}</strong>
          <span>{activeSlice.description}</span>
        </div>
      )}
    </section>
  );
}
