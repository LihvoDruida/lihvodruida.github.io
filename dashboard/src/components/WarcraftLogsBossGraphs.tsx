"use client";

import { useMemo, useState } from "react";

import type {
  WarcraftLogsBossPull,
  WarcraftLogsBossSummary,
  WarcraftLogsCharacterSummary,
  WarcraftLogsMetricSummary,
} from "@/lib/warcraftLogs";
import { formatStableNumber, formatStableUkCompactDate } from "@/lib/stableUiText";

type GraphPoint = WarcraftLogsBossPull & {
  xPercent: number;
  yPercent: number;
  label: string;
  bossKey: string;
  bossName: string;
  isActive: boolean;
  sortTime: number;
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
  if (value === 99) return "99th Percentile";
  if (value === 95) return "95th Percentile";
  if (value === 75) return "75th Percentile";
  if (value === 50) return "50th Percentile";
  if (value === 25) return "25th Percentile";
  if (value === 10) return "10th Percentile";
  return `${value}th Percentile`;
}

function toCombinedGraphPoints(bosses: WarcraftLogsBossSummary[], activeBoss: WarcraftLogsBossSummary | null): GraphPoint[] {
  const activeBossKey = activeBoss ? bossKey(activeBoss) : null;
  const source = bosses.flatMap((boss) => {
    const key = bossKey(boss);
    return boss.pulls
      .map((pull) => {
        const percent = clampPercent(pull.percentile);
        if (percent === null) return null;
        return {
          boss,
          pull,
          percent,
          sortTime: pullDate(pull),
          key,
        };
      })
      .filter((item): item is { boss: WarcraftLogsBossSummary; pull: WarcraftLogsBossPull; percent: number; sortTime: number; key: string } => Boolean(item));
  });

  const sorted = source.sort((left, right) => {
    if (left.sortTime !== right.sortTime) return left.sortTime - right.sortTime;
    return left.boss.encounterName.localeCompare(right.boss.encounterName, "uk");
  });
  const timed = sorted.filter((item) => item.sortTime > 0);
  const firstTime = timed[0]?.sortTime ?? 0;
  const lastTime = timed[timed.length - 1]?.sortTime ?? 0;
  const range = lastTime > firstTime ? lastTime - firstTime : 0;

  return sorted.map((item, index) => {
    const xPercent = range > 0 && item.sortTime > 0
      ? ((item.sortTime - firstTime) / range) * 100
      : sorted.length <= 1
        ? 50
        : (index / (sorted.length - 1)) * 100;
    return {
      ...item.pull,
      xPercent: Math.max(0, Math.min(100, xPercent)),
      yPercent: item.percent,
      bossKey: item.key,
      bossName: item.boss.encounterName,
      isActive: activeBossKey ? item.key === activeBossKey : true,
      sortTime: item.sortTime,
      label: [
        item.boss.encounterName,
        formatStableUkCompactDate(item.pull.startTime),
        `Parse ${formatPercent(item.pull.percentile)}`,
        item.pull.amount !== null ? `${(item.pull.metric || "amount").toString().toUpperCase()} ${formatAmount(item.pull.amount)}` : null,
        item.pull.killedWith,
        item.pull.itemLevel !== null ? `ilvl ${formatStableNumber(item.pull.itemLevel, 0)}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    };
  });
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
  return summary?.metricLabel || "Amount";
}

function sliceHasUsefulData(summary: WarcraftLogsMetricSummary) {
  return Boolean(
    summary.encounterRankings.length ||
      summary.bossRankings.some((boss) => boss.pulls.length) ||
      summary.bestPerformanceAverage !== null ||
      summary.recentStats.pullCount,
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

function GraphSvg({ points, activeBossName }: { points: GraphPoint[]; activeBossName: string | null }) {
  const activePoints = points.filter((point) => point.isActive).sort((left, right) => left.sortTime - right.sortTime);
  const inactivePoints = points.filter((point) => !point.isActive);
  const polyline = activePoints.map((point) => `${xCoord(point.xPercent)},${yCoord(point.yPercent)}`).join(" ");
  const ticks = graphTicks(points);

  return (
    <div className="profile-wcl-graph" aria-label="Спільний графік parse по рейдових босах">
      <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} role="img" preserveAspectRatio="xMidYMid meet">
        <title>Динаміка parse по всіх рейдових босах</title>
        <rect className="profile-wcl-plot-bg" x={VIEWBOX.left} y={VIEWBOX.top} width={PLOT_WIDTH} height={PLOT_HEIGHT} rx="2" />

        <g className="profile-wcl-svg-legend" aria-hidden="true">
          {PERCENTILE_GUIDES.map((percentile, index) => {
            const x = VIEWBOX.left + index * 132;
            return (
              <g key={percentile} className={`profile-wcl-guide profile-wcl-guide--${percentile}`} transform={`translate(${x} 18)`}>
                <line x1="0" x2="34" y1="0" y2="0" vectorEffect="non-scaling-stroke" />
                <text x="41" y="4">{percentileLabel(percentile)}</text>
              </g>
            );
          })}
          <g className="profile-wcl-legend-pulls" transform={`translate(${VIEWBOX.left + PERCENTILE_GUIDES.length * 132} 18)`}>
            <polygon points={diamondPoints(5, 0, 4)} />
            <text x="16" y="4">{activeBossName || "Selected"} Parses</text>
          </g>
        </g>

        {PERCENTILE_GUIDES.map((percentile) => {
          const y = yCoord(percentile);
          return (
            <g key={percentile} className={`profile-wcl-guide profile-wcl-guide--${percentile}`}>
              <line x1={VIEWBOX.left} x2={VIEWBOX.left + PLOT_WIDTH} y1={y} y2={y} vectorEffect="non-scaling-stroke" />
              <text className="profile-wcl-y-tick" x={VIEWBOX.left - 12} y={y + 4} textAnchor="end">{percentile}</text>
            </g>
          );
        })}

        <line className="profile-wcl-axis" x1={VIEWBOX.left} x2={VIEWBOX.left} y1={VIEWBOX.top} y2={VIEWBOX.top + PLOT_HEIGHT} vectorEffect="non-scaling-stroke" />
        <line className="profile-wcl-axis" x1={VIEWBOX.left} x2={VIEWBOX.left + PLOT_WIDTH} y1={VIEWBOX.top + PLOT_HEIGHT} y2={VIEWBOX.top + PLOT_HEIGHT} vectorEffect="non-scaling-stroke" />
        <text className="profile-wcl-axis-title" transform={`translate(22 ${VIEWBOX.top + PLOT_HEIGHT / 2}) rotate(-90)`} textAnchor="middle">Historical %</text>

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
  const row = (
    <>
      <span><strong>{formatPercent(pull.percentile)}</strong><small>#{index + 1} • {formatStableUkCompactDate(pull.startTime)}{pull.killedWith ? ` • ${pull.killedWith}` : ""}</small></span>
      <span><strong>{formatAmount(pull.amount)}</strong><small>{metricLabel(activeSlice)}</small></span>
      <span><strong>{pull.itemLevel !== null ? formatStableNumber(pull.itemLevel, 0) : "—"}</strong><small>ilvl</small></span>
      <span><strong>{formatDuration(pull.durationMs)}</strong><small>duration</small></span>
      <span><strong>{pull.totalParses ?? "—"}</strong><small>parses</small></span>
    </>
  );

  if (pull.reportUrl) {
    return <a className="profile-wcl-pull-row" href={pull.reportUrl} target="_blank" rel="noreferrer">{row}</a>;
  }
  return <div className="profile-wcl-pull-row">{row}</div>;
}

function availableBosses(activeSlice: WarcraftLogsMetricSummary | null) {
  return (activeSlice?.bossRankings || []).filter((boss) => boss.encounterName && (boss.pulls.length || boss.bestPercentile !== null));
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
      <span>{formatPercent(boss.bestPercentile)} • avg {formatAmount(boss.recentStats.averageAmount)} {label}</span>
    </button>
  );
}

function GraphSidePanel({ activeBoss, activeSlice }: { activeBoss: WarcraftLogsBossSummary; activeSlice: WarcraftLogsMetricSummary }) {
  const killCount = activeBoss.pulls.filter((pull) => pull.killedWith === "Kill").length;
  return (
    <aside className="profile-wcl-graph-side" aria-label="Підсумок вибраного боса">
      <span className="profile-wcl-graph-side__difficulty">{difficultyLabel(activeBoss.difficulty)}</span>
      <strong>{formatPercent(activeBoss.recentStats.averagePercentile ?? activeBoss.medianPercentile ?? activeBoss.bestPercentile)}</strong>
      <small>Median / Avg parse</small>
      <dl>
        <div><dt>Avg %</dt><dd>{formatPercent(activeBoss.recentStats.averagePercentile)}</dd></div>
        <div><dt>Pulls logged</dt><dd>{formatStableNumber(activeBoss.recentStats.pullCount, 0)}</dd></div>
        <div><dt>Kills logged</dt><dd>{formatStableNumber(activeBoss.totalKills ?? killCount, 0)}</dd></div>
        <div><dt>Best {activeSlice.metricLabel}</dt><dd>{formatAmount(activeBoss.recentStats.maxAmount ?? activeBoss.bestAmount)}</dd></div>
        <div><dt>Avg {activeSlice.metricLabel}</dt><dd>{formatAmount(activeBoss.recentStats.averageAmount)}</dd></div>
        <div><dt>Median {activeSlice.metricLabel}</dt><dd>{formatAmount(activeBoss.recentStats.medianAmount)}</dd></div>
        <div><dt>Consistency</dt><dd>{formatPercent(activeBoss.recentStats.consistencyScore)}</dd></div>
        <div><dt>Fastest Kill</dt><dd>{formatDuration(activeBoss.fastestKillMs)}</dd></div>
        <div><dt>All Star Points</dt><dd>{activeBoss.allStarsPoints !== null ? formatStableNumber(activeBoss.allStarsPoints, 2) : "—"}</dd></div>
      </dl>
    </aside>
  );
}

export default function WarcraftLogsBossGraphs({ summary }: { summary: WarcraftLogsCharacterSummary }) {
  const slices = useMemo(() => sortedMetricSummaries(summary), [summary]);
  const [selectedSliceKey, setSelectedSliceKey] = useState<string | null>(null);
  const activeSlice = slices.find((slice) => slice.key === selectedSliceKey) || slices[0] || null;
  const bosses = useMemo(() => availableBosses(activeSlice), [activeSlice]);
  const [selectedBossKey, setSelectedBossKey] = useState<string | null>(null);
  const activeBoss = bosses.find((boss) => bossKey(boss) === selectedBossKey) || bosses[0] || null;
  const graphPoints = useMemo(
    () => toCombinedGraphPoints(bosses, activeBoss),
    [bosses, activeBoss],
  );

  if (!slices.length || !activeSlice) {
    return (
      <div className="profile-wcl-dynamic profile-wcl-dynamic--empty">
        <strong>Warcraft Logs поки не повернув чисті role/metric rankings</strong>
        <span>Блок готовий до окремих HPS/DPS/Tank даних. Пули з невизначеною роллю не змішуються в статистику.</span>
      </div>
    );
  }

  return (
    <section className="profile-wcl-dynamic" aria-label="Динамічні графіки Warcraft Logs по ролях і босах">
      <div className="profile-wcl-dynamic__head">
        <div>
          <span className="eyebrow">Warcraft Logs</span>
          <h3>Чисті role-pulls по рейдових босах</h3>
          <p>Треш і ключі відкидаються. Пули не змішуються між ролями: ДД → DPS, хіл → HPS, танк → tank metrics. Avg/median/max рахуються нашою системою по останніх 10 доступних boss-pulls.</p>
        </div>
        <span className="profile-count-pill">{slices.length} метрик</span>
      </div>

      <div className="profile-wcl-role-tabs" role="tablist" aria-label="Warcraft Logs рольові метрики">
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
            <span>{formatPercent(slice.bestPerformanceAverage)} • avg≤10 {formatAmount(slice.recentStats.averageAmount)} • {slice.recentStats.pullCount} пулів</span>
          </button>
        ))}
      </div>

      <div className="profile-wcl-metric-grid" aria-label={`Підсумок ${activeSlice.title}`}>
        <MetricStat label="Best avg" value={formatPercent(activeSlice.bestPerformanceAverage)} hint={activeSlice.roleLabel} />
        <MetricStat label="Median" value={formatPercent(activeSlice.medianPerformanceAverage)} hint={activeSlice.metricLabel} />
        <MetricStat label={`Max ${activeSlice.metricLabel}`} value={formatAmount(activeSlice.recentStats.maxAmount)} hint="останні 10" />
        <MetricStat label={`Avg ${activeSlice.metricLabel}`} value={formatAmount(activeSlice.recentStats.averageAmount)} hint="останні 10" />
        <MetricStat label={`Median ${activeSlice.metricLabel}`} value={formatAmount(activeSlice.recentStats.medianAmount)} hint="наша формула" />
        <MetricStat label="Стабільність" value={formatPercent(activeSlice.recentStats.consistencyScore)} hint="σ/avg" />
        <MetricStat label="Pulls" value={formatStableNumber(activeSlice.recentStats.pullCount, 0)} hint={activeSlice.sourceLabel} />
      </div>

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
                <MetricStat label="Best parse" value={formatPercent(activeBoss.bestPercentile)} />
                <MetricStat label={`Max ${activeSlice.metricLabel}`} value={formatAmount(activeBoss.recentStats.maxAmount ?? activeBoss.bestAmount)} />
                <MetricStat label={`Avg ${activeSlice.metricLabel}`} value={formatAmount(activeBoss.recentStats.averageAmount)} hint="останні 10" />
                <MetricStat label={`Median ${activeSlice.metricLabel}`} value={formatAmount(activeBoss.recentStats.medianAmount)} />
                <MetricStat label="Kill/Wipe" value={`${activeBoss.recentStats.killCount}/${activeBoss.recentStats.wipeCount}`} />
                <MetricStat label="Kills / Fast" value={`${activeBoss.totalKills ?? "—"} / ${formatDuration(activeBoss.fastestKillMs)}`} />
              </div>

              {graphPoints.length ? (
                <div className="profile-wcl-graph-layout">
                  <GraphSvg points={graphPoints} activeBossName={activeBoss.encounterName} />
                  <GraphSidePanel activeBoss={activeBoss} activeSlice={activeSlice} />
                </div>
              ) : (
                <div className="profile-wcl-dynamic profile-wcl-dynamic--empty profile-wcl-dynamic--inline">
                  <strong>Немає parse-точок для графіка</strong>
                  <span>Є рейдові пули без percentile-точок. Avg/Max HPS-DPS все одно рахуються по доступних boss-pulls.</span>
                </div>
              )}

              <div className="profile-wcl-pulls" aria-label="Доступні рейдові пули по босу">
                {activeBoss.pulls.map((pull, index) => (
                  <PullRow key={`${pull.reportCode || activeBoss.encounterName}-${pull.startTime || index}-${pull.percentile}`} pull={pull} index={index} activeSlice={activeSlice} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="profile-wcl-dynamic profile-wcl-dynamic--empty profile-wcl-dynamic--inline">
          <strong>Немає boss-level даних для {activeSlice.title}</strong>
          <span>{activeSlice.description}</span>
        </div>
      )}
    </section>
  );
}
