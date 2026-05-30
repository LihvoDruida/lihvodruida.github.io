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
  x: number;
  y: number;
  label: string;
  bossKey: string;
  bossName: string;
  isActive: boolean;
  sortTime: number;
};

const PERCENTILE_GUIDES = [99, 95, 75, 50, 25, 10] as const;
const SLICE_ORDER = ["healer-hps", "dps-dps", "tank-dps", "tank-hps", "overall"];

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
    const x = range > 0 && item.sortTime > 0
      ? 7 + ((item.sortTime - firstTime) / range) * 88
      : sorted.length <= 1
        ? 50
        : 7 + (index / (sorted.length - 1)) * 88;
    const y = 95 - item.percent * 0.86;
    return {
      ...item.pull,
      x,
      y,
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
  const polyline = activePoints.map((point) => `${point.x},${point.y}`).join(" ");
  const firstDate = points.find((point) => point.sortTime > 0)?.startTime ?? null;
  const lastDate = [...points].reverse().find((point) => point.sortTime > 0)?.startTime ?? null;

  return (
    <div className="profile-wcl-graph" aria-label="Спільний графік parse по рейдових босах">
      <div className="profile-wcl-graph__caption">
        <strong>{activeBossName || "Усі боси"}</strong>
        <span>Усі точки на графіку, активний бос підсвічений</span>
      </div>
      <svg viewBox="0 0 100 100" role="img" preserveAspectRatio="none">
        <title>Динаміка parse по всіх рейдових босах</title>
        {PERCENTILE_GUIDES.map((percentile) => {
          const y = 95 - percentile * 0.86;
          return (
            <g key={percentile} className={`profile-wcl-guide profile-wcl-guide--${percentile}`}>
              <line x1="5" x2="98" y1={y} y2={y} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {polyline ? <polyline points={polyline} className="profile-wcl-line" vectorEffect="non-scaling-stroke" /> : null}
        {inactivePoints.map((point, index) => (
          <circle
            key={graphPointKey(point, index)}
            className="profile-wcl-point profile-wcl-point--muted"
            cx={point.x}
            cy={point.y}
            r="1.15"
            vectorEffect="non-scaling-stroke"
          >
            <title>{point.label}</title>
          </circle>
        ))}
        {activePoints.map((point, index) => (
          <circle
            key={graphPointKey(point, index)}
            className="profile-wcl-point profile-wcl-point--active"
            cx={point.x}
            cy={point.y}
            r="2.05"
            vectorEffect="non-scaling-stroke"
          >
            <title>{point.label}</title>
          </circle>
        ))}
      </svg>
      <div className="profile-wcl-graph__legend" aria-hidden="true">
        {PERCENTILE_GUIDES.map((percentile) => <span key={percentile}>{percentile}</span>)}
      </div>
      {firstDate || lastDate ? (
        <div className="profile-wcl-graph__xaxis" aria-hidden="true">
          <span>{formatStableUkCompactDate(firstDate)}</span>
          <span>{formatStableUkCompactDate(lastDate)}</span>
        </div>
      ) : null}
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
      <span>{formatPercent(boss.bestPercentile)} • {formatAmount(boss.recentStats.averageAmount)} {label}</span>
    </button>
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
        <strong>Warcraft Logs поки не повернув role/metric rankings</strong>
        <span>Блок готовий до HPS/DPS/Tank даних. Щойно в персонажа зʼявляться публічні логи або WCL API віддасть rankings, тут зʼявляться компактні графіки й до 10 пулів пулів.</span>
      </div>
    );
  }

  return (
    <section className="profile-wcl-dynamic" aria-label="Динамічні графіки Warcraft Logs по ролях і босах">
      <div className="profile-wcl-dynamic__head">
        <div>
          <span className="eyebrow">Warcraft Logs</span>
          <h3>Рейдові боси, до 10 пулів ≥3 хв</h3>
          <p>Тільки рейдові боси: треш і ключі відкидаються. У середнє входять доступні пули понад 3 хвилини, максимум 10 останніх.</p>
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
            <span>{formatPercent(slice.bestPerformanceAverage)} • avg≤10 {formatAmount(slice.recentStats.averageAmount)}</span>
          </button>
        ))}
      </div>

      <div className="profile-wcl-metric-grid" aria-label={`Підсумок ${activeSlice.title}`}>
        <MetricStat label="Best avg" value={formatPercent(activeSlice.bestPerformanceAverage)} hint={activeSlice.roleLabel} />
        <MetricStat label="Median" value={formatPercent(activeSlice.medianPerformanceAverage)} hint={activeSlice.metricLabel} />
        <MetricStat label={`Max ${activeSlice.metricLabel}`} value={formatAmount(activeSlice.recentStats.maxAmount)} hint="до 10 пулів" />
        <MetricStat label={`Avg ${activeSlice.metricLabel}`} value={formatAmount(activeSlice.recentStats.averageAmount)} hint="до 10 пулів" />
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
                <MetricStat label={`Avg ${activeSlice.metricLabel}`} value={formatAmount(activeBoss.recentStats.averageAmount)} hint="до 10 пулів" />
                <MetricStat label="Kills / Fast" value={`${activeBoss.totalKills ?? "—"} / ${formatDuration(activeBoss.fastestKillMs)}`} />
              </div>

              {graphPoints.length ? <GraphSvg points={graphPoints} activeBossName={activeBoss.encounterName} /> : (
                <div className="profile-wcl-dynamic profile-wcl-dynamic--empty profile-wcl-dynamic--inline">
                  <strong>Немає точок для графіка</strong>
                  <span>Є рейдові пули понад 3 хв, але без percentile-точок. Avg/Max HPS-DPS все одно рахуються по доступних пулах.</span>
                </div>
              )}

              <div className="profile-wcl-pulls" aria-label="Доступні рейдові пули по босу понад 3 хв">
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
