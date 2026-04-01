// /lib/pipedrive/successFactorsAnalysis.js

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

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((acc, x) => acc + x, 0) / values.length;
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function rate(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

function summarizeDeals(deals) {
  const values = [];
  const probabilities = [];
  const cycleDays = [];

  let withExpectedClose = 0;
  let withNextActivity = 0;
  let missingOwner = 0;
  let missingStage = 0;
  let missingProbability = 0;

  const byOwner = {};
  const byStage = {};

  let totalValue = 0;

  for (const deal of deals) {
    if (typeof deal.value === "number") {
      values.push(deal.value);
      totalValue += deal.value;
    }

    if (typeof deal.probability === "number") {
      probabilities.push(deal.probability);
    } else {
      missingProbability += 1;
    }

    if (deal.has_expected_close_date === true) withExpectedClose += 1;
    if (deal.has_next_activity === true) withNextActivity += 1;
    if (deal.owner_id == null) missingOwner += 1;
    if (deal.stage_id == null) missingStage += 1;

    const cycle_days_to_won = getCycleDaysToWon(deal);
    if (typeof cycle_days_to_won === "number") {
      cycleDays.push(cycle_days_to_won);
    }

    const ownerKey = String(deal.owner_id ?? "null");
    if (!byOwner[ownerKey]) {
      byOwner[ownerKey] = {
        owner_id: deal.owner_id,
        count: 0,
        total_value: 0,
      };
    }
    byOwner[ownerKey].count += 1;
    byOwner[ownerKey].total_value += typeof deal.value === "number" ? deal.value : 0;

    const stageKey = String(deal.stage_id ?? "null");
    if (!byStage[stageKey]) {
      byStage[stageKey] = {
        stage_id: deal.stage_id,
        count: 0,
        total_value: 0,
      };
    }
    byStage[stageKey].count += 1;
    byStage[stageKey].total_value += typeof deal.value === "number" ? deal.value : 0;
  }

  const totalDeals = deals.length;

  const owner_distribution = Object.values(byOwner).sort((a, b) => {
    if ((b.count ?? 0) !== (a.count ?? 0)) return (b.count ?? 0) - (a.count ?? 0);
    return (b.total_value ?? 0) - (a.total_value ?? 0);
  });

  const stage_distribution = Object.values(byStage).sort((a, b) => {
    if ((b.count ?? 0) !== (a.count ?? 0)) return (b.count ?? 0) - (a.count ?? 0);
    return (b.total_value ?? 0) - (a.total_value ?? 0);
  });

  return {
    total_deals: totalDeals,
    total_value: totalValue,
    value_avg: average(values),
    value_median: median(values),
    probability_avg: average(probabilities),
    cycle_days_avg: average(cycleDays),
    cycle_days_median: median(cycleDays),
    expected_close_rate: rate(withExpectedClose, totalDeals),
    next_activity_rate: rate(withNextActivity, totalDeals),
    missing_owner_rate: rate(missingOwner, totalDeals),
    missing_stage_rate: rate(missingStage, totalDeals),
    missing_probability_rate: rate(missingProbability, totalDeals),
    owner_distribution,
    stage_distribution,
  };
}

function buildComparativeGaps(wonSummary, lostSummary) {
  return {
    total_deals_gap:
      wonSummary.total_deals !== null && lostSummary.total_deals !== null
        ? wonSummary.total_deals - lostSummary.total_deals
        : null,

    next_activity_rate_gap:
      wonSummary.next_activity_rate !== null && lostSummary.next_activity_rate !== null
        ? wonSummary.next_activity_rate - lostSummary.next_activity_rate
        : null,

    expected_close_rate_gap:
      wonSummary.expected_close_rate !== null && lostSummary.expected_close_rate !== null
        ? wonSummary.expected_close_rate - lostSummary.expected_close_rate
        : null,

    probability_avg_gap:
      wonSummary.probability_avg !== null && lostSummary.probability_avg !== null
        ? wonSummary.probability_avg - lostSummary.probability_avg
        : null,

    value_avg_gap:
      wonSummary.value_avg !== null && lostSummary.value_avg !== null
        ? wonSummary.value_avg - lostSummary.value_avg
        : null,

    value_median_gap:
      wonSummary.value_median !== null && lostSummary.value_median !== null
        ? wonSummary.value_median - lostSummary.value_median
        : null,

    cycle_days_avg_gap:
      wonSummary.cycle_days_avg !== null && lostSummary.cycle_days_avg !== null
        ? wonSummary.cycle_days_avg - lostSummary.cycle_days_avg
        : null,

    cycle_days_median_gap:
      wonSummary.cycle_days_median !== null && lostSummary.cycle_days_median !== null
        ? wonSummary.cycle_days_median - lostSummary.cycle_days_median
        : null,

    missing_owner_rate_gap:
      wonSummary.missing_owner_rate !== null && lostSummary.missing_owner_rate !== null
        ? wonSummary.missing_owner_rate - lostSummary.missing_owner_rate
        : null,

    missing_stage_rate_gap:
      wonSummary.missing_stage_rate !== null && lostSummary.missing_stage_rate !== null
        ? wonSummary.missing_stage_rate - lostSummary.missing_stage_rate
        : null,

    missing_probability_rate_gap:
      wonSummary.missing_probability_rate !== null &&
      lostSummary.missing_probability_rate !== null
        ? wonSummary.missing_probability_rate - lostSummary.missing_probability_rate
        : null,
  };
}

function computeAssociatedSuccessFactors(wonSummary, lostSummary) {
  const factors = [];

  function pushFactor(key, label, interpretation, won_value, lost_value, gap) {
    factors.push({
      key,
      label,
      interpretation,
      won_value,
      lost_value,
      gap,
    });
  }

  const nextActivityGap =
    wonSummary.next_activity_rate !== null && lostSummary.next_activity_rate !== null
      ? wonSummary.next_activity_rate - lostSummary.next_activity_rate
      : null;

  if (nextActivityGap !== null && nextActivityGap > 0) {
    pushFactor(
      "next_activity_coverage",
      "Cobertura de próxima actividad",
      "Mayor presencia en negocios ganados",
      wonSummary.next_activity_rate,
      lostSummary.next_activity_rate,
      nextActivityGap
    );
  }

  const expectedCloseGap =
    wonSummary.expected_close_rate !== null && lostSummary.expected_close_rate !== null
      ? wonSummary.expected_close_rate - lostSummary.expected_close_rate
      : null;

  if (expectedCloseGap !== null && expectedCloseGap > 0) {
    pushFactor(
      "expected_close_coverage",
      "Cobertura de fecha estimada de cierre",
      "Mayor disciplina en negocios ganados",
      wonSummary.expected_close_rate,
      lostSummary.expected_close_rate,
      expectedCloseGap
    );
  }

  const probabilityGap =
    wonSummary.probability_avg !== null && lostSummary.probability_avg !== null
      ? wonSummary.probability_avg - lostSummary.probability_avg
      : null;

  if (probabilityGap !== null && probabilityGap > 0) {
    pushFactor(
      "probability_avg",
      "Probabilidad promedio declarada",
      "Nivel más alto en negocios ganados",
      wonSummary.probability_avg,
      lostSummary.probability_avg,
      probabilityGap
    );
  }

  const cycleGap =
    wonSummary.cycle_days_median !== null && lostSummary.cycle_days_median !== null
      ? lostSummary.cycle_days_median - wonSummary.cycle_days_median
      : null;

  if (cycleGap !== null && cycleGap > 0) {
    pushFactor(
      "cycle_days_median",
      "Velocidad de cierre (mediana)",
      "Menor duración en negocios ganados",
      wonSummary.cycle_days_median,
      lostSummary.cycle_days_median,
      cycleGap
    );
  }

  const valueGap =
    wonSummary.value_median !== null && lostSummary.value_median !== null
      ? wonSummary.value_median - lostSummary.value_median
      : null;

  if (valueGap !== null && valueGap > 0) {
    pushFactor(
      "value_median",
      "Valor mediano del negocio",
      "Mayor ticket en negocios ganados",
      wonSummary.value_median,
      lostSummary.value_median,
      valueGap
    );
  }

  const hygieneProbabilityGap =
    wonSummary.missing_probability_rate !== null &&
    lostSummary.missing_probability_rate !== null
      ? lostSummary.missing_probability_rate - wonSummary.missing_probability_rate
      : null;

  if (hygieneProbabilityGap !== null && hygieneProbabilityGap > 0) {
    pushFactor(
      "probability_hygiene",
      "Disciplina de probabilidad",
      "Menor ausencia de probabilidad en negocios ganados",
      wonSummary.missing_probability_rate,
      lostSummary.missing_probability_rate,
      hygieneProbabilityGap
    );
  }

  factors.sort((a, b) => {
    const ag = a.gap === null ? -1 : a.gap;
    const bg = b.gap === null ? -1 : b.gap;
    return bg - ag;
  });

  return factors;
}

async function successFactorsAnalysis({
  pipeline_id,
  top_n = 10,
}) {
  const wonSourceCount = await countDealsByStatus("won", pipeline_id);
  const lostSourceCount = await countDealsByStatus("lost", pipeline_id);

  const wonDealsRaw = await fetchAllDeals("won", pipeline_id, 20000);
  const lostDealsRaw = await fetchAllDeals("lost", pipeline_id, 20000);

  const wonDeals = wonDealsRaw.map(normalizeDeal).filter((d) => d !== null);
  const lostDeals = lostDealsRaw.map(normalizeDeal).filter((d) => d !== null);

  const wonValidation = buildUniverseValidation({
    source_count: wonSourceCount,
    raw_count: wonDealsRaw.length,
    normalized_count: wonDeals.length,
  });

  const lostValidation = buildUniverseValidation({
    source_count: lostSourceCount,
    raw_count: lostDealsRaw.length,
    normalized_count: lostDeals.length,
  });

  const topN = normalizePositiveInteger(top_n, 10);

  const won_summary = summarizeDeals(wonDeals);
  const lost_summary = summarizeDeals(lostDeals);

  const comparative_gaps = buildComparativeGaps(won_summary, lost_summary);
  const success_factors = computeAssociatedSuccessFactors(won_summary, lost_summary);

  const alertas = [...wonValidation.alertas, ...lostValidation.alertas];

  return {
    ok: true,
    intent: "successFactorsAnalysis",
    datos: {
      validacion_universo: {
        won: wonValidation,
        lost: lostValidation,
      },
      won_summary: {
        ...won_summary,
        owner_distribution: won_summary.owner_distribution.slice(0, topN),
        stage_distribution: won_summary.stage_distribution.slice(0, topN),
      },
      lost_summary: {
        ...lost_summary,
        owner_distribution: lost_summary.owner_distribution.slice(0, topN),
        stage_distribution: lost_summary.stage_distribution.slice(0, topN),
      },
      comparative_gaps,
      success_factors: success_factors.slice(0, topN),
      alertas,
    },
  };
}

module.exports = { successFactorsAnalysis };
