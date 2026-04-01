// /lib/pipedrive/wonPatternAnalysis.js

const { fetchAllDeals, countDealsByStatus } = require("./pagination");
const { normalizeDeal } = require("./normalizeDeal");
const { getCycleDaysToWon } = require("./dealDerivatives");
const { buildUniverseValidation } = require("./universeValidation");

function normalizePositiveInteger(value, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.trunc(n);
  return v > 0 ? v : fallback;
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((acc, x) => acc + x, 0) / values.length;
}

async function wonPatternAnalysis({
  pipeline_id,
  getUserMap,
  top_n = 10,
}) {
  const source_count = await countDealsByStatus("won", pipeline_id);
  const wonDealsRaw = await fetchAllDeals("won", pipeline_id, 20000);

  const normalizedDeals = wonDealsRaw.map(normalizeDeal);
  const wonDeals = normalizedDeals.filter((d) => d !== null);

  const validation = buildUniverseValidation({
    source_count,
    raw_count: wonDealsRaw.length,
    normalized_count: wonDeals.length,
  });

  const userMap = await getUserMap();
  const topN = normalizePositiveInteger(top_n, 10);

  const cycleDays = [];
  const values = [];
  const probabilities = [];
  const expectedCloseCoverage = [];
  const nextActivityCoverage = [];
  const byOwner = {};
  const byStage = {};

  for (const deal of wonDeals) {
    const cycle_days_to_won = getCycleDaysToWon(deal);

    if (typeof cycle_days_to_won === "number") cycleDays.push(cycle_days_to_won);
    if (typeof deal.value === "number") values.push(deal.value);
    if (typeof deal.probability === "number") probabilities.push(deal.probability);

    expectedCloseCoverage.push(deal.has_expected_close_date === true);
    nextActivityCoverage.push(deal.has_next_activity === true);

    const ownerKey = String(deal.owner_id ?? "null");
    if (!byOwner[ownerKey]) {
      byOwner[ownerKey] = {
        owner_id: deal.owner_id,
        owner_name: deal.owner_id != null ? userMap?.[deal.owner_id] || null : null,
        won_count: 0,
        total_value: 0,
      };
    }
    byOwner[ownerKey].won_count += 1;
    byOwner[ownerKey].total_value += typeof deal.value === "number" ? deal.value : 0;

    const stageKey = String(deal.stage_id ?? "null");
    if (!byStage[stageKey]) {
      byStage[stageKey] = {
        stage_id: deal.stage_id,
        won_count: 0,
      };
    }
    byStage[stageKey].won_count += 1;
  }

  const owner_ranking = Object.values(byOwner).sort((a, b) => {
    if ((b.won_count ?? 0) !== (a.won_count ?? 0)) {
      return (b.won_count ?? 0) - (a.won_count ?? 0);
    }
    return (b.total_value ?? 0) - (a.total_value ?? 0);
  });

  const stage_distribution = Object.values(byStage).sort((a, b) => {
    return (b.won_count ?? 0) - (a.won_count ?? 0);
  });

  const expected_close_rate =
    expectedCloseCoverage.length > 0
      ? expectedCloseCoverage.filter(Boolean).length / expectedCloseCoverage.length
      : null;

  const next_activity_rate =
    nextActivityCoverage.length > 0
      ? nextActivityCoverage.filter(Boolean).length / nextActivityCoverage.length
      : null;

  const resumen = {
    total_won: wonDeals.length,
    cycle_days_avg: average(cycleDays),
    cycle_days_median: median(cycleDays),
    value_avg: average(values),
    value_median: median(values),
    probability_avg: average(probabilities),
    expected_close_rate,
    next_activity_rate,
  };

  return {
    ok: true,
    intent: "wonPatternAnalysis",
    datos: {
      validacion_universo: validation,
      resumen,
      owner_ranking: owner_ranking.slice(0, topN),
      stage_distribution,
      alertas: validation.alertas,
    },
  };
}

module.exports = { wonPatternAnalysis };
