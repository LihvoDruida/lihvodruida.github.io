"use client";

import { useMemo, useState } from "react";

import type { WarcraftLogsBossPull, WarcraftLogsBossSummary } from "@/lib/warcraftLogs";
import { formatStableNumber, formatStableUkCompactDate } from "@/lib/stableUiText";

type GraphPoint = WarcraftLogsBossPull & {
  x: number;
  y: number;
  label: string;
};

const PERCENTILE_GUIDES = [99, 95, 75, 50, 25, 10] as const;

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
    const x = usable.length <= 1 ? 50 : 6 + (index / (usable.length - 1)) * 88;
    const y = 96 - percent * 0.88;
    return {
      ...pull,
      x,
      y,
      label: [
        formatStableUkCompactDate(pull.startTime),
        `Parse ${formatPercent(pull.percentile)}`,
        pull.amount !== null ? `Amount ${formatAmount(pull.amount)}` : null,
        pull.itemLevel !== null ? `ilvl ${formatStableNumber(pull.itemLevel, 0)}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    };
  });
}

function GraphSvg({ points }: { points: GraphPoint[] }) {
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="profile-wcl-graph" aria-label="Графік parse по обраному босу">
      <svg viewBox="0 0 100 100" role="img" preserveAspectRatio="none">
        <title>Динаміка parse по босу</title>
        {PERCENTILE_GUIDES.map((percentile) => {
          const y = 96 - percentile * 0.88;
          return (
            <g key={percentile} className={`profile-wcl-guide profile-wcl-guide--${percentile}`}>
              <line x1="4" x2="98" y1={y} y2={y} vectorEffect="non-scaling-stroke" />
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
            r="1.7"
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

function PullRow({ pull, index }: { pull: WarcraftLogsBossPull; index: number }) {
  const row = (
    <>
      <span><strong>{formatPercent(pull.percentile)}</strong><small>Parse #{index + 1}</small></span>
      <span><strong>{formatAmount(pull.amount)}</strong><small>{pull.metric?.toUpperCase() || "Amount"}</small></span>
      <span><strong>{pull.itemLevel !== null ? formatStableNumber(pull.itemLevel, 0) : "—"}</strong><small>ilvl</small></span>
      <span><strong>{formatDuration(pull.durationMs)}</strong><small>{formatStableUkCompactDate(pull.startTime)}</small></span>
      <span><strong>{pull.killedWith || "—"}</strong><small>{pull.source === "encounter" ? "Log pull" : "Best row"}</small></span>
    </>
  );

  if (pull.reportUrl) {
    return <a className="profile-wcl-pull-row" href={pull.reportUrl} target="_blank" rel="noreferrer">{row}</a>;
  }
  return <div className="profile-wcl-pull-row">{row}</div>;
}

export default function WarcraftLogsBossGraphs({ bosses }: { bosses: WarcraftLogsBossSummary[] }) {
  const availableBosses = useMemo(
    () => bosses.filter((boss) => boss.encounterName && boss.pulls.length),
    [bosses],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeBoss = availableBosses[selectedIndex] || availableBosses[0] || null;
  const points = useMemo(
    () => toGraphPoints(activeBoss?.pulls || []),
    [activeBoss],
  );

  if (!availableBosses.length) {
    return (
      <div className="profile-wcl-dynamic profile-wcl-dynamic--empty">
        <strong>Динаміка по босах недоступна</strong>
        <span>Warcraft Logs повернув лише загальний snapshot без історії пулів. Коли API віддасть encounter history, тут зʼявиться графік до 10 останніх доступних пулів по кожному босу.</span>
      </div>
    );
  }

  return (
    <section className="profile-wcl-dynamic" aria-label="Динамічні графіки Warcraft Logs по босах">
      <div className="profile-wcl-dynamic__head">
        <div>
          <span className="eyebrow">Boss history</span>
          <h3>Динаміка по босах</h3>
          <p>Перемикай босів — графік і таблиця змінюються без перезавантаження сторінки. Показуємо до 10 доступних пулів.</p>
        </div>
        <span className="profile-count-pill">{availableBosses.length} босів</span>
      </div>

      <div className="profile-wcl-boss-tabs" role="tablist" aria-label="Боси Warcraft Logs">
        {availableBosses.map((boss, index) => (
          <button
            key={`${boss.encounterId ?? boss.encounterName}-${index}`}
            type="button"
            className={index === selectedIndex ? "is-active" : ""}
            role="tab"
            aria-selected={index === selectedIndex}
            onClick={() => setSelectedIndex(index)}
          >
            <strong>{boss.encounterName}</strong>
            <span>{formatPercent(boss.bestPercentile)} • {boss.pulls.length} pulls</span>
          </button>
        ))}
      </div>

      {activeBoss ? (
        <div className="profile-wcl-boss-panel" role="tabpanel">
          <div className="profile-wcl-boss-summary">
            <span><strong>{formatPercent(activeBoss.bestPercentile)}</strong><small>Best</small></span>
            <span><strong>{formatPercent(activeBoss.medianPercentile)}</strong><small>Median</small></span>
            <span><strong>{formatAmount(activeBoss.bestAmount)}</strong><small>{activeBoss.metric?.toUpperCase() || "Amount"}</small></span>
            <span><strong>{activeBoss.totalKills ?? "—"}</strong><small>Kills logged</small></span>
          </div>

          {points.length ? <GraphSvg points={points} /> : (
            <div className="profile-wcl-dynamic profile-wcl-dynamic--empty profile-wcl-dynamic--inline">
              <strong>Немає точок для графіка</strong>
              <span>По цьому босу є рядок ranking, але немає percentile-історії, з якої можна побудувати графік.</span>
            </div>
          )}

          <div className="profile-wcl-pulls" aria-label="Останні доступні пули по босу">
            {activeBoss.pulls.map((pull, index) => (
              <PullRow key={`${pull.reportCode || activeBoss.encounterName}-${pull.startTime || index}-${pull.percentile}`} pull={pull} index={index} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
