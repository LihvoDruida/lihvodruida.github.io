import type {
  RaiderIoCharacterDetails,
  RaiderIoScoreSegmentKey,
} from "@/lib/raiderIo";
import type {
  WarcraftLogsCharacterSummary,
  WarcraftLogsMetricSummary,
  WarcraftLogsRoleKey,
} from "@/lib/warcraftLogs";

export type CharacterPerformanceSignal = {
  key: string;
  label: string;
  value: string;
  hint: string;
  tone: "good" | "warn" | "neutral";
};

export type CharacterPerformanceRoleSummary = {
  key: string;
  title: string;
  role: WarcraftLogsRoleKey;
  metric: string;
  bosses: number;
  pulls: number;
  bestAverage: number | null;
  medianAverage: number | null;
  maxAmount: number | null;
  averageAmount: number | null;
  medianAmount: number | null;
  consistencyScore: number | null;
};

export type CharacterPerformanceEcosystem = {
  overallScore: number | null;
  raidScore: number | null;
  mythicPlusScore: number | null;
  dataConfidence: number;
  sampleSummary: string;
  signals: CharacterPerformanceSignal[];
  roles: CharacterPerformanceRoleSummary[];
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function weightedAverage(items: Array<{ value: number | null; weight: number }>) {
  const valid = items.filter((item): item is { value: number; weight: number } => item.value !== null && item.weight > 0);
  const weight = valid.reduce((sum, item) => sum + item.weight, 0);
  return weight > 0 ? valid.reduce((sum, item) => sum + item.value * item.weight, 0) / weight : null;
}

function formatScore(value: number | null) {
  return value === null ? "—" : String(Math.round(value));
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function rioRoleScore(details: RaiderIoCharacterDetails, role: RaiderIoScoreSegmentKey) {
  return finiteNumber(details.snapshot?.currentScores?.[role]?.score);
}

function normalizedRioScore(details: RaiderIoCharacterDetails) {
  const score = finiteNumber(details.snapshot?.currentScore) ?? rioRoleScore(details, "all");
  if (score === null) return null;
  // Internal season-agnostic scale: 3500+ is treated as capped for dashboard comparison, not as an official Raider.IO percentile.
  return clamp((score / 3500) * 100);
}

function normalizedRaidScore(summary: WarcraftLogsMetricSummary) {
  const best = finiteNumber(summary.bestPerformanceAverage);
  const median = finiteNumber(summary.medianPerformanceAverage);
  const recent = finiteNumber(summary.recentStats.averagePercentile ?? summary.recentStats.medianPercentile);
  const consistency = finiteNumber(summary.recentStats.consistencyScore);
  return weightedAverage([
    { value: best, weight: 0.35 },
    { value: median, weight: 0.25 },
    { value: recent, weight: 0.25 },
    { value: consistency, weight: 0.15 },
  ]);
}

function usefulMetric(summary: WarcraftLogsMetricSummary) {
  if (summary.role === "overall") return false;
  return Boolean(
    summary.bossRankings.length ||
      summary.recentStats.pullCount ||
      summary.bestPerformanceAverage !== null ||
      summary.medianPerformanceAverage !== null,
  );
}

function strongestRaidSlice(wcl: WarcraftLogsCharacterSummary) {
  const candidates = wcl.metricSummaries.filter(usefulMetric);
  if (!candidates.length) return null;
  return candidates
    .map((summary) => ({ summary, score: normalizedRaidScore(summary) ?? 0 }))
    .sort((left, right) => right.score - left.score)[0]?.summary ?? null;
}

function dataConfidence(input: { rio: RaiderIoCharacterDetails; wcl: WarcraftLogsCharacterSummary }) {
  const rioRuns = input.rio.bestRuns.length + input.rio.recentRuns.length + input.rio.highestRuns.length;
  const wclPulls = input.wcl.metricSummaries.reduce((sum, summary) => sum + summary.recentStats.pullCount, 0);
  const reports = input.wcl.sourceCoverage.reportsChecked;
  return clamp((Math.min(rioRuns, 20) / 20) * 35 + (Math.min(wclPulls, 30) / 30) * 45 + (Math.min(reports, 10) / 10) * 20);
}

function signal(key: string, label: string, value: string, hint: string, tone: CharacterPerformanceSignal["tone"]): CharacterPerformanceSignal {
  return { key, label, value, hint, tone };
}

export function buildCharacterPerformanceEcosystem(input: {
  rio: RaiderIoCharacterDetails;
  wcl: WarcraftLogsCharacterSummary;
  itemLevel: number | null;
}): CharacterPerformanceEcosystem {
  const raidSlice = strongestRaidSlice(input.wcl);
  const raidScore = raidSlice ? normalizedRaidScore(raidSlice) : null;
  const mythicPlusScore = normalizedRioScore(input.rio);
  const gearScore = finiteNumber(input.itemLevel) !== null ? clamp(((input.itemLevel as number) / 300) * 100) : null;
  const overallScore = weightedAverage([
    { value: raidScore, weight: 0.5 },
    { value: mythicPlusScore, weight: 0.35 },
    { value: gearScore, weight: 0.15 },
  ]);
  const confidence = dataConfidence({ rio: input.rio, wcl: input.wcl });
  const totalPulls = input.wcl.metricSummaries.reduce((sum, summary) => sum + summary.recentStats.pullCount, 0);
  const roleTotals = input.wcl.sourceCoverage.roleTotals;

  const signals: CharacterPerformanceSignal[] = [
    signal(
      "overall",
      "Індекс ефективності",
      formatScore(overallScore),
      "Зведена оцінка з рейдів, ключів і ilvl.",
      overallScore !== null && overallScore >= 70 ? "good" : overallScore !== null && overallScore < 45 ? "warn" : "neutral",
    ),
    signal(
      "raid",
      "Raid/WCL",
      formatScore(raidScore),
      raidSlice ? `${raidSlice.title}: best ${formatPercent(raidSlice.bestPerformanceAverage)}, avg≤10 ${formatPercent(raidSlice.recentStats.averagePercentile)}` : "Недостатньо чистих рейдових пулів.",
      raidScore !== null && raidScore >= 70 ? "good" : raidScore !== null && raidScore < 45 ? "warn" : "neutral",
    ),
    signal(
      "mplus",
      "M+ / Raider.IO",
      formatScore(mythicPlusScore),
      `Score ${input.rio.snapshot?.currentScore ? Math.round(input.rio.snapshot.currentScore) : "—"}, найкращі ключі ${input.rio.bestRunStats.runCount}.`,
      mythicPlusScore !== null && mythicPlusScore >= 70 ? "good" : mythicPlusScore !== null && mythicPlusScore < 35 ? "warn" : "neutral",
    ),
    signal(
      "confidence",
      "Довіра до даних",
      formatPercent(confidence),
      `WCL pulls ${totalPulls}, reports ${input.wcl.sourceCoverage.reportsChecked}, RIO runs ${input.rio.bestRuns.length + input.rio.recentRuns.length}.`,
      confidence >= 60 ? "good" : confidence < 30 ? "warn" : "neutral",
    ),
  ];

  const roles = input.wcl.metricSummaries
    .filter(usefulMetric)
    .map<CharacterPerformanceRoleSummary>((summary) => ({
      key: summary.key,
      title: summary.title,
      role: summary.role,
      metric: summary.metricLabel,
      bosses: summary.bossRankings.length,
      pulls: summary.recentStats.pullCount,
      bestAverage: summary.bestPerformanceAverage,
      medianAverage: summary.medianPerformanceAverage,
      maxAmount: summary.recentStats.maxAmount,
      averageAmount: summary.recentStats.averageAmount,
      medianAmount: summary.recentStats.medianAmount,
      consistencyScore: summary.recentStats.consistencyScore,
    }));

  const sampleSummary = [
    `${input.rio.bestRunStats.runCount} найкращі ключі`,
    `${input.rio.recentRunStats.runCount} останні ключі`,
    `${input.wcl.sourceCoverage.reportsChecked} WCL звіти`,
    `${roleTotals.healer} хіл / ${roleTotals.dps} дд / ${roleTotals.tank} танк боїв`,
  ].join(" • ");

  return {
    overallScore,
    raidScore,
    mythicPlusScore,
    dataConfidence: confidence,
    sampleSummary,
    signals,
    roles,
  };
}
