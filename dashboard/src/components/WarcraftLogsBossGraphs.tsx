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

function toGraphPoints(pulls: WarcraftLogsBossPull[]): GraphPoint[] {
  const usable = pulls
    .filter((pull) => clampPercent(pull.percentile) !== null)
    .sort((left, right) => pullDate(left) - pullDate(right));

  return usable.map((pull, index) => {
    const percent = clampPercent(pull.percentile) ?? 0;
    const x = usable.length <= 1 ? 50 : 7 + (index / (usable.length - 1)) * 88;
    const y = 95 - percent * 0.86;
    return {
      ...pull,
      x,
      y,
      label: [
        formatStableUkCompactDate(pull.startTime),
        `Parse ${formatPercent(pull.percentile)}`,
        pull.amount !== null ? `${(pull.metric || "amount").toString().toUpperCase()} ${formatAmount(pull.amount)}` : null,
        pull.itemLevel !== null ? `ilvl ${formatStableNumber(pull.itemLevel, 0)}` : null,
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

function GraphSvg({ points }: { points: GraphPoint[] }) {
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="profile-wcl-graph" aria-label="Графік parse по обраному босу">
      <svg viewBox="0 0 100 100" role="img" preserveAspectRatio="none">
        <title>Динаміка parse по босу</title>
        {PERCENTILE_GUIDES.map((percentile) => {
          const y = 95 - percentile * 0.86;
          return (
            <g key={percentile} className={`profile-wcl-guide profile-wcl-guide--${percentile}`}>
              <line x1="5" x2="98" y1={y} y2={y} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {polyline ? <polyline points={polyline} className="profile-wcl-line" vectorEffect="non-scaling-stroke" /> : null}
        {points.map((point, index) => (
          <circle
            key={`${point.reportCode || "pull"}-${point.startTime || index}-${point.percentile}`}
            className="profile-wcl-point"
            cx={point.x}
            cy={point.y}
            r="1.85"
            vectorEffect="non-scaling-stroke"
          >
            <title>{point.label}</title>
          </circle>
        ))}
      </svg>
      <div className="profile-wcl-graph__legend" aria-hidden="true">
        {PERCENTILE_GUIDES.map((percentile) => <span key={percentile}>{percentile}</span>)}
      </div>
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
  const activeBoss = bosses.find((boss) => `${boss.encounterId ?? boss.encounterName}` === selectedBossKey) || bosses[0] || null;
  const points = useMemo(
    () => toGraphPoints(activeBoss?.pulls || []),
    [activeBoss],
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

              {points.length ? <GraphSvg points={points} /> : (
                <div className="profile-wcl-dynamic profile-wcl-dynamic--empty profile-wcl-dynamic--inline">
                  <strong>Немає точок для графіка</strong>
                  <span>По цьому босу є рейдові пули понад 3 хв, але без percentile-точок. Avg/Max HPS-DPS все одно рахуються по доступних пулах.</span>
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
