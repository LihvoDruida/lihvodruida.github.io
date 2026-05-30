"use client";

import { useMemo, useState } from "react";

import type {
  WarcraftLogsBossPull,
  WarcraftLogsBossSummary,
  WarcraftLogsCharacterSummary,
  WarcraftLogsMetricSummary,
} from "@/lib/warcraftLogs";
import { formatStableNumber, formatStableUkCompactDate } from "@/lib/stableUiText";

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

const PERCENTILE_GUIDES = [99, 95, 75, 50, 25, 10] as const;
const SLICE_ORDER = ["healer-hps", "dps-dps", "tank-dps", "tank-hps", "overall"];
const VIEWBOX = { width: 1000, height: 360, left: 58, right: 18, top: 54, bottom: 44 };
const PLOT_WIDTH = VIEWBOX.width - VIEWBOX.left - VIEWBOX.right;
const PLOT_HEIGHT = VIEWBOX.height - VIEWBOX.top - VIEWBOX.bottom;

function clampPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function formatPercent(value: number | null | undefined) {
  const percent = clampPercent(value);
  if (percent === null) return "—";
  return `${formatStableNumber(percent, percent % 1 ? 1 : 0)}%`;
}

function formatProgress(value: number | null | undefined) {
  const percent = clampPercent(value);
  if (percent === null) return "—";
  return `${formatStableNumber(percent, percent % 1 ? 1 : 0)}%`;
}

function formatAmount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 1000) return `${formatStableNumber(value / 1000, value >= 100_000 ? 0 : 1)}k`;
  return formatStableNumber(value, 0);
}

function formatDuration(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
  const seconds = Math.round(value > 10_000 ? value / 1000 : value);
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function difficultyLabel(value: number | null | undefined) {
  if (value === 5) return "MYTHIC";
  if (value === 4) return "HEROIC";
  if (value === 3) return "NORMAL";
  if (value === 2) return "LFR";
  return "RAID";
}

function pullDate(pull: WarcraftLogsBossPull) {
  return pull.startTime ? new Date(pull.startTime).getTime() : 0;
}

function bossKey(boss: Pick<WarcraftLogsBossSummary, "encounterId" | "encounterName">) {
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
  return VIEWBOX.top + ((100 - percent) / 100) * PLOT_HEIGHT;
}

function diamondPoints(cx: number, cy: number, radius: number) {
  return `${cx},${cy - radius} ${cx + radius},${cy} ${cx},${cy + radius} ${cx - radius},${cy}`;
}

function percentileLabel(value: number) {
  if (value === 99) return "99-й перцентиль";
  if (value === 95) return "95-й перцентиль";
  if (value === 75) return "75-й перцентиль";
  if (value === 50) return "50-й перцентиль";
  if (value === 25) return "25-й перцентиль";
  if (value === 10) return "10-й перцентиль";
  return `${value}-й перцентиль`;
}

function toCombinedGraphPoints(
  bosses: WarcraftLogsBossSummary[],
  activeBoss: WarcraftLogsBossSummary | null,
  activeSlice: WarcraftLogsMetricSummary | null,
): GraphData {
  const activeBossKey = activeBoss ? bossKey(activeBoss) : null;
  const primaryDifficulty = activeSlice?.primaryDifficulty ?? null;
  const source = bosses.flatMap((boss) => {
    const key = bossKey(boss);
    return boss.pulls
      .filter((pull) => primaryDifficulty === null || pull.difficulty === primaryDifficulty)
      .map((pull) => ({
        boss,
        pull,
        percent: clampPercent(pull.percentile),
        amount: typeof pull.amount === "number" && Number.isFinite(pull.amount) && pull.amount > 0 ? pull.amount : null,
        sortTime: pullDate(pull),
        key,
      }));
  });

  const hasPercentiles = source.some((item) => item.percent !== null);
  const amountMax = source.reduce(
    (max, item) => item.amount !== null ? Math.max(max, item.amount) : max,
    0,
  );
  const mode: GraphMode = hasPercentiles ? "percentile" : "amount";
  const filtered = source.filter((item) =>
    mode === "percentile" ? item.percent !== null : item.amount !== null && amountMax > 0,
  );

  const sorted = filtered.sort((left, right) => {
    if (left.sortTime !== right.sortTime) return left.sortTime - right.sortTime;
    return left.boss.encounterName.localeCompare(right.boss.encounterName, "uk");
  });
  const timed = sorted.filter((item) => item.sortTime > 0);
  const firstTime = timed[0]?.sortTime ?? 0;
  const lastTime = timed[timed.length - 1]?.sortTime ?? 0;
  const range = lastTime > firstTime ? lastTime - firstTime : 0;

  return {
    mode,
    maxAmount: amountMax > 0 ? amountMax : null,
    points: sorted.map((item, index) => {
      const xPercent = range > 0 && item.sortTime > 0
        ? ((item.sortTime - firstTime) / range) * 100
        : sorted.length <= 1
          ? 50
          : (index / (sorted.length - 1)) * 100;
      const yPercent = mode === "percentile"
        ? item.percent ?? 0
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
          mode === "percentile" ? `Parse ${formatPercent(item.pull.percentile)}` : null,
          item.pull.amount !== null ? `${metricLabel(activeSlice)} ${formatAmount(item.pull.amount)}` : null,
          item.pull.killedWith,
          item.pull.itemLevel !== null ? `ilvl ${formatStableNumber(item.pull.itemLevel, 0)}` : null,
        ]
          .filter(Boolean)
          .join(" • "),
      };
    }),
  };
}

function graphTicks(points: GraphPoint[]): GraphTick[] {
  const timed = [...points].filter((point) => point.sortTime > 0).sort((left, right) => left.sortTime - right.sortTime);
  if (!timed.length) return [];
  if (timed.length === 1) return [{ xPercent: timed[0].xPercent, label: formatStableUkCompactDate(timed[0].startTime) }];

  const target = Math.min(6, timed.length);
  const used = new Set<number>();
  return Array.from({ length: target }, (_, index) => {
    const sourceIndex = Math.round((index / Math.max(1, target - 1)) * (timed.length - 1));
    return timed[sourceIndex];
  })
    .filter((point) => {
      const day = Math.floor(point.sortTime / 86_400_000);
      if (used.has(day)) return false;
      used.add(day);
      return true;
    })
    .map((point) => ({ xPercent: point.xPercent, label: formatStableUkCompactDate(point.startTime) }));
}

function metricLabel(summary: Pick<WarcraftLogsMetricSummary, "metricLabel"> | null | undefined) {
  return summary?.metricLabel || "Показник";
}

function totalAmountLabel(summary: WarcraftLogsMetricSummary) {
  return summary.metric === "hps" ? "Healing" : summary.metric === "dps" ? "Damage" : "Total";
}

function sliceHasUsefulData(summary: WarcraftLogsMetricSummary) {
  if (summary.role === "overall") return false;
  return Boolean(
    summary.recentStats.sampleSize > 0 ||
      summary.recentStats.averagePercentile !== null ||
      summary.bossRankings.some((boss) => boss.recentStats.sampleSize > 0 || boss.bestPercentile !== null),
  );
}

function sortedMetricSummaries(summary: WarcraftLogsCharacterSummary) {
  return [...summary.metricSummaries]
    .filter(sliceHasUsefulData)
    .sort((left, right) => {
      const leftIndex = SLICE_ORDER.indexOf(left.key);
      const rightIndex = SLICE_ORDER.indexOf(right.key);
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    });
}

function GraphSvg({ graph, activeBossName, activeSlice }: { graph: GraphData; activeBossName: string | null; activeSlice: WarcraftLogsMetricSummary }) {
  const points = graph.points;
  const activePoints = points.filter((point) => point.isActive).sort((left, right) => left.sortTime - right.sortTime);
  const inactivePoints = points.filter((point) => !point.isActive);
  const polyline = activePoints.map((point) => `${xCoord(point.xPercent)},${yCoord(point.yPercent)}`).join(" ");
  const ticks = graphTicks(points);

  return (
    <div className="profile-wcl-graph" aria-label="Спільний графік по рейдових босах">
      <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} role="img" preserveAspectRatio="xMidYMid meet">
        <title>Динаміка по всіх рейдових босах</title>
        <rect className="profile-wcl-plot-bg" x={VIEWBOX.left} y={VIEWBOX.top} width={PLOT_WIDTH} height={PLOT_HEIGHT} rx="2" />

        <g className="profile-wcl-svg-legend" aria-hidden="true">
          {PERCENTILE_GUIDES.map((percentile, index) => {
            const x = VIEWBOX.left + index * 132;
            return (
              <g key={percentile} className={`profile-wcl-guide profile-wcl-guide--${percentile}`} transform={`translate(${x} 18)`}>
                <line x1="0" x2="34" y1="0" y2="0" vectorEffect="non-scaling-stroke" />
                <text x="41" y="4">{graph.mode === "percentile" ? percentileLabel(percentile) : formatAmount(((graph.maxAmount || 0) * percentile) / 100)}</text>
              </g>
            );
          })}
          <g className="profile-wcl-legend-pulls" transform={`translate(${VIEWBOX.left + PERCENTILE_GUIDES.length * 132} 18)`}>
            <polygon points={diamondPoints(5, 0, 4)} />
            <text x="16" y="4">{activeBossName || "Вибрано"} {graph.mode === "percentile" ? "Parse" : activeSlice.metricLabel}</text>
          </g>
        </g>

        {PERCENTILE_GUIDES.map((percentile) => {
          const y = yCoord(percentile);
          return (
            <g key={percentile} className={`profile-wcl-guide profile-wcl-guide--${percentile}`}>
              <line x1={VIEWBOX.left} x2={VIEWBOX.left + PLOT_WIDTH} y1={y} y2={y} vectorEffect="non-scaling-stroke" />
              <text className="profile-wcl-y-tick" x={VIEWBOX.left - 12} y={y + 4} textAnchor="end">{graph.mode === "percentile" ? percentile : formatAmount(((graph.maxAmount || 0) * percentile) / 100)}</text>
            </g>
          );
        })}

        <line className="profile-wcl-axis" x1={VIEWBOX.left} x2={VIEWBOX.left} y1={VIEWBOX.top} y2={VIEWBOX.top + PLOT_HEIGHT} vectorEffect="non-scaling-stroke" />
        <line className="profile-wcl-axis" x1={VIEWBOX.left} x2={VIEWBOX.left + PLOT_WIDTH} y1={VIEWBOX.top + PLOT_HEIGHT} y2={VIEWBOX.top + PLOT_HEIGHT} vectorEffect="non-scaling-stroke" />
        <text className="profile-wcl-axis-title" transform={`translate(22 ${VIEWBOX.top + PLOT_HEIGHT / 2}) rotate(-90)`} textAnchor="middle">{graph.mode === "percentile" ? "Parse %" : activeSlice.metricLabel}</text>

        {ticks.map((tick) => {
          const x = xCoord(tick.xPercent);
          return (
            <g key={`${tick.xPercent}-${tick.label}`} className="profile-wcl-x-tick">
              <line x1={x} x2={x} y1={VIEWBOX.top} y2={VIEWBOX.top + PLOT_HEIGHT} vectorEffect="non-scaling-stroke" />
              <text x={x} y={VIEWBOX.top + PLOT_HEIGHT + 25} textAnchor="middle">{tick.label}</text>
            </g>
          );
        })}

        {polyline ? <polyline points={polyline} className="profile-wcl-line" vectorEffect="non-scaling-stroke" /> : null}
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

function MetricStat({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <span className="profile-wcl-mini-stat">
      <strong>{value}</strong>
      <small>{label}</small>
      {hint ? <em>{hint}</em> : null}
    </span>
  );
}

function PullRow({ pull, index, activeSlice }: { pull: WarcraftLogsBossPull; index: number; activeSlice: WarcraftLogsMetricSummary }) {
  const total = pull.metric === "hps" ? pull.healingDone ?? pull.totalAmount : pull.metric === "dps" ? pull.damageDone ?? pull.totalAmount : pull.totalAmount;
  const progress = pull.killedWith === "Wipe" ? pull.bossPercentage : pull.fightPercentage;
  const row = (
    <>
      <span><strong>{formatPercent(pull.percentile)}</strong><small>#{index + 1} • {formatStableUkCompactDate(pull.startTime)}{pull.killedWith ? ` • ${pull.killedWith}` : ""}</small></span>
      <span><strong>{formatAmount(pull.amount)}</strong><small>{metricLabel(activeSlice)}</small></span>
      <span><strong>{formatAmount(total)}</strong><small>{totalAmountLabel(activeSlice)}</small></span>
      <span><strong>{pull.deathCount !== null ? formatStableNumber(pull.deathCount, 0) : "—"}</strong><small>смерті</small></span>
      <span><strong>{progress !== null ? formatProgress(progress) : pull.itemLevel !== null ? formatStableNumber(pull.itemLevel, 0) : "—"}</strong><small>{progress !== null ? "прогрес" : "ilvl"}</small></span>
      <span><strong>{formatDuration(pull.durationMs)}</strong><small>{pull.reportFightId !== null ? `fight ${pull.reportFightId}` : pull.fightSize ? `${pull.fightSize} гравців` : "тривалість"}</small></span>
    </>
  );

  if (pull.reportUrl) {
    return <a className="profile-wcl-pull-row" href={pull.reportUrl} target="_blank" rel="noreferrer">{row}</a>;
  }
  return <div className="profile-wcl-pull-row">{row}</div>;
}


function availableBosses(activeSlice: WarcraftLogsMetricSummary | null) {
  return (activeSlice?.bossRankings || []).filter((boss) =>
    boss.encounterName &&
    (boss.recentStats.sampleSize > 0 || boss.bestPercentile !== null || boss.recentStats.averagePercentile !== null),
  );
}

function BossButton({ boss, active, onClick, label }: { boss: WarcraftLogsBossSummary; active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className={active ? "is-active" : ""}
      role="tab"
      aria-selected={active}
      onClick={onClick}
    >
      <strong>{boss.encounterName}</strong>
      <span>{boss.primaryDifficultyLabel || difficultyLabel(boss.difficulty)} • {formatPercent(boss.bestPercentile)} • середнє {formatAmount(boss.recentStats.averageAmount)} {label}</span>
    </button>
  );
}

function GraphSidePanel({ activeBoss, activeSlice }: { activeBoss: WarcraftLogsBossSummary; activeSlice: WarcraftLogsMetricSummary }) {
  const killCount = activeBoss.pulls.filter((pull) => pull.killedWith === "Kill").length;
  return (
    <aside className="profile-wcl-graph-side" aria-label="Підсумок вибраного боса">
      <span className="profile-wcl-graph-side__difficulty">{activeBoss.primaryDifficultyLabel || difficultyLabel(activeBoss.difficulty)}</span>
      <strong>{formatPercent(activeBoss.recentStats.averagePercentile ?? activeBoss.medianPercentile ?? activeBoss.bestPercentile)}</strong>
      <small>Parse по головній складності</small>
      <dl>
        <div><dt>Parse avg</dt><dd>{formatPercent(activeBoss.recentStats.averagePercentile)}</dd></div>
        <div><dt>Пули</dt><dd>{formatStableNumber(activeBoss.recentStats.pullCount, 0)}</dd></div>
        <div><dt>Кіли</dt><dd>{formatStableNumber(activeBoss.totalKills ?? killCount, 0)}</dd></div>
        <div><dt>Макс. {activeSlice.metricLabel}</dt><dd>{formatAmount(activeBoss.recentStats.maxAmount ?? activeBoss.bestAmount)}</dd></div>
        <div><dt>Зваж. avg</dt><dd>{formatAmount(activeBoss.recentStats.weightedAverageAmount ?? activeBoss.recentStats.averageAmount)}</dd></div>
        <div><dt>Арифм. avg</dt><dd>{formatAmount(activeBoss.recentStats.arithmeticAverageAmount)}</dd></div>
        <div><dt>Медіана</dt><dd>{formatAmount(activeBoss.recentStats.medianAmount)}</dd></div>
        <div><dt>Смерті</dt><dd>{formatStableNumber(activeBoss.recentStats.deathCount, 0)}</dd></div>
        <div><dt>Best wipe</dt><dd>{formatProgress(activeBoss.recentStats.bestBossPercentage)}</dd></div>
        <div><dt>Стабільність</dt><dd>{formatPercent(activeBoss.recentStats.consistencyScore)}</dd></div>
        <div><dt>Найшвидший кіл</dt><dd>{formatDuration(activeBoss.fastestKillMs)}</dd></div>
        <div><dt>All Stars</dt><dd>{activeBoss.allStarsPoints !== null ? formatStableNumber(activeBoss.allStarsPoints, 2) : "—"}</dd></div>
      </dl>
    </aside>
  );
}


function DataCoverageStrip({ summary }: { summary: WarcraftLogsCharacterSummary }) {
  const coverage = summary.sourceCoverage;
  return (
    <div className="profile-wcl-data-strip" aria-label="Покриття Warcraft Logs">
      <span><strong>{formatStableNumber(coverage.reportsChecked, 0)}</strong><small>звіти</small></span>
      <span><strong>{formatStableNumber(coverage.reportBossFightsChecked, 0)}</strong><small>boss fights</small></span>
      <span><strong>{formatStableNumber(coverage.uniqueReportPullRows || coverage.reportPullRows, 0)}</strong><small>чисті пули</small></span>
      <span><strong>{formatStableNumber(coverage.duplicatePullRows, 0)}</strong><small>дублі</small></span>
      <span><strong>{formatStableNumber(coverage.summaryTableRows, 0)}/{formatStableNumber(coverage.deathTableRows, 0)}</strong><small>summary/deaths</small></span>
      <span><strong>{formatStableNumber(coverage.archivedReports, 0)}</strong><small>архівні</small></span>
      {coverage.rateLimitLimitPerHour !== null ? (
        <span><strong>{formatStableNumber(coverage.rateLimitPointsSpentThisHour ?? 0, 0)}/{formatStableNumber(coverage.rateLimitLimitPerHour, 0)}</strong><small>API points</small></span>
      ) : null}
    </div>
  );
}


export default function WarcraftLogsBossGraphs({ summary }: { summary: WarcraftLogsCharacterSummary }) {
  const slices = useMemo(() => sortedMetricSummaries(summary), [summary]);
  const [selectedSliceKey, setSelectedSliceKey] = useState<string | null>(null);
  const activeSlice = slices.find((slice) => slice.key === selectedSliceKey) || slices[0] || null;
  const bosses = useMemo(() => availableBosses(activeSlice), [activeSlice]);
  const [selectedBossKey, setSelectedBossKey] = useState<string | null>(null);
  const activeBoss = bosses.find((boss) => bossKey(boss) === selectedBossKey) || bosses[0] || null;
  const graphData = useMemo(
    () => toCombinedGraphPoints(bosses, activeBoss, activeSlice),
    [bosses, activeBoss, activeSlice],
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
    <section className="profile-wcl-dynamic" aria-label="Динамічні графіки Warcraft Logs по ролях і босах">
      <div className="profile-wcl-dynamic__head">
        <div>
          <span className="eyebrow">Warcraft Logs</span>
          <h3>Чисті пули по рейдових босах</h3>
          <p>Boss-pulls з WCL без трешу й ключів. Основні цифри беруться з найвищої доступної складності.</p>
        </div>
        <span className="profile-count-pill">{slices.length} метрик</span>
      </div>

      <DataCoverageStrip summary={summary} />

      <div className="profile-wcl-role-tabs" role="tablist" aria-label="Рольові метрики Warcraft Logs">
        {slices.map((slice) => (
          <button
            key={slice.key}
            type="button"
            className={slice.key === activeSlice.key ? "is-active" : ""}
            role="tab"
            aria-selected={slice.key === activeSlice.key}
            onClick={() => {
              setSelectedSliceKey(slice.key);
              setSelectedBossKey(null);
            }}
          >
            <strong>{slice.title}</strong>
            <span>{slice.primaryDifficultyLabel || "рейд"} • {formatPercent(slice.bestPerformanceAverage)} • avg≤10 {formatAmount(slice.recentStats.averageAmount)} • {slice.recentStats.sampleSize} записів</span>
          </button>
        ))}
      </div>

      <div className="profile-wcl-metric-grid" aria-label={`Підсумок ${activeSlice.title}`}>
        <MetricStat label="Основна складність" value={activeSlice.primaryDifficultyLabel || "—"} hint="для головних розрахунків" />
        <MetricStat label="Найкращий середній parse" value={formatPercent(activeSlice.bestPerformanceAverage)} hint={activeSlice.roleLabel} />
        <MetricStat label="Медіана parse" value={formatPercent(activeSlice.medianPerformanceAverage)} hint={activeSlice.metricLabel} />
        <MetricStat label={`Макс. ${activeSlice.metricLabel}`} value={formatAmount(activeSlice.recentStats.maxAmount)} hint="останні 10" />
        <MetricStat label={`Зважений ${activeSlice.metricLabel}`} value={formatAmount(activeSlice.recentStats.weightedAverageAmount ?? activeSlice.recentStats.averageAmount)} hint="total / час" />
        <MetricStat label={`Арифм. ${activeSlice.metricLabel}`} value={formatAmount(activeSlice.recentStats.arithmeticAverageAmount)} hint="середнє пулів" />
        <MetricStat label={`Медіана ${activeSlice.metricLabel}`} value={formatAmount(activeSlice.recentStats.medianAmount)} hint="власний розрахунок" />
        <MetricStat label="Стабільність" value={formatPercent(activeSlice.recentStats.consistencyScore)} hint="розкид" />
        <MetricStat label="Пули / смерті" value={`${formatStableNumber(activeSlice.recentStats.pullCount, 0)} / ${formatStableNumber(activeSlice.recentStats.deathCount, 0)}`} hint={activeSlice.sourceLabel} />
      </div>

      {activeSlice.difficultySummaries.length > 1 ? (
        <div className="profile-wcl-difficulty-strip" aria-label="Дані по складностях">
          {activeSlice.difficultySummaries.map((difficulty) => (
            <span key={`${activeSlice.key}-${difficulty.difficulty ?? "unknown"}`} className={difficulty.difficulty === activeSlice.primaryDifficulty ? "is-primary" : ""}>
              <strong>{difficulty.difficultyLabel}</strong>
              <small>{formatAmount(difficulty.recentStats.averageAmount)} {activeSlice.metricLabel} • {difficulty.recentStats.sampleSize} записів</small>
            </span>
          ))}
        </div>
      ) : null}

      {bosses.length ? (
        <>
          <div className="profile-wcl-boss-tabs" role="tablist" aria-label="Боси Warcraft Logs">
            {bosses.map((boss, index) => {
              const key = `${boss.encounterId ?? boss.encounterName}`;
              return (
                <BossButton
                  key={`${key}-${index}`}
                  boss={boss}
                  label={activeSlice.metricLabel}
                  active={activeBoss ? `${activeBoss.encounterId ?? activeBoss.encounterName}` === key : index === 0}
                  onClick={() => setSelectedBossKey(key)}
                />
              );
            })}
          </div>

          {activeBoss ? (
            <div className="profile-wcl-boss-panel" role="tabpanel">
              <div className="profile-wcl-boss-summary">
                <MetricStat label="Складність" value={activeBoss.primaryDifficultyLabel || "—"} />
                <MetricStat label="Найкращий parse" value={formatPercent(activeBoss.bestPercentile)} />
                <MetricStat label={`Макс. ${activeSlice.metricLabel}`} value={formatAmount(activeBoss.recentStats.maxAmount ?? activeBoss.bestAmount)} />
                <MetricStat label={`Зважений ${activeSlice.metricLabel}`} value={formatAmount(activeBoss.recentStats.weightedAverageAmount ?? activeBoss.recentStats.averageAmount)} hint="total / час" />
                <MetricStat label={`Медіана ${activeSlice.metricLabel}`} value={formatAmount(activeBoss.recentStats.medianAmount)} />
                <MetricStat label="Кіл / вайп" value={`${activeBoss.recentStats.killCount}/${activeBoss.recentStats.wipeCount}`} />
                <MetricStat label="Кіли / швидкість" value={`${activeBoss.totalKills ?? "—"} / ${formatDuration(activeBoss.fastestKillMs)}`} />
              </div>

              {graphData.points.length ? (
                <div className="profile-wcl-graph-layout">
                  <GraphSvg graph={graphData} activeBossName={activeBoss.encounterName} activeSlice={activeSlice} />
                  <GraphSidePanel activeBoss={activeBoss} activeSlice={activeSlice} />
                </div>
              ) : (
                <div className="profile-wcl-dynamic profile-wcl-dynamic--empty profile-wcl-dynamic--inline">
                  <strong>Немає точок для графіка</strong>
                  <span>Є рейдові пули без parse %. HPS/DPS все одно рахуються по доступних пулах.</span>
                </div>
              )}

              <div className="profile-wcl-pulls" aria-label="Доступні рейдові пули по босу">
                {activeBoss.pulls
                  .filter((pull) => activeBoss.primaryDifficulty === null || pull.difficulty === activeBoss.primaryDifficulty)
                  .map((pull, index) => (
                    <PullRow key={`${pull.reportCode || activeBoss.encounterName}-${pull.reportFightId ?? pull.startTime ?? index}-${pull.amount ?? pull.percentile ?? index}`} pull={pull} index={index} activeSlice={activeSlice} />
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
