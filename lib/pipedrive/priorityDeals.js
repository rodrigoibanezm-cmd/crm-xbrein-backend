// /lib/pipedrive/priorityDeals.js

const { fetchAllDeals, countDealsByStatus } = require("./pagination");
const { normalizeDeal } = require("./normalizeDeal");
const { getStaleDays, getDaysToExpectedClose } = require("./dealDerivatives");
const { buildUniverseValidation } = require("./universeValidation");
const { buildRiskDimensions } = require("./riskModel");
const { buildRiskProfile } = require("./riskProfile");

function normalizePositiveInteger(value, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.trunc(n);
  return v > 0 ? v : fallback;
}

function computePrioritySignals(riskProfile, derivatives) {
  const exposureLevel = riskProfile?.dimensions?.exposure?.level || "none";
  const timingLevel = riskProfile?.dimensions?.timing?.level || "none";
  const followUpLevel = riskProfile?.dimensions?.follow_up?.level || "none";
  const hygieneLevel = riskProfile?.dimensions?.hygiene?.level || "none";
  const forecastLevel = riskProfile?.dimensions?.forecast?.level || "none";

  const stale_days =
    typeof derivatives?.stale_days === "number" ? derivatives.stale_days : null;

  const days_to_expected_close =
    typeof derivatives?.days_to_expected_close === "number"
      ? derivatives.days_to_expected_close
      : null;

  let priority_rank = 0;

  if (exposureLevel === "high") priority_rank += 3;
  else if (exposureLevel === "medium") priority_rank += 2;
  else if (exposureLevel === "low") priority_rank += 1;

  if (timingLevel === "high") priority_rank += 3;
  else if (timingLevel === "medium") priority_rank += 2;
  else if (timingLevel === "low") priority_rank += 1;

  if (followUpLevel === "high") priority_rank += 2;
  else if (followUpLevel === "medium") priority_rank += 1;

  const priority_flags = {
    high_exposure: exposureLevel === "high",
    timing_pressure: timingLevel === "high" || timingLevel === "medium",
    missing_follow_up: followUpLevel === "high",
    strong_forecast_signal: forecastLevel === "high",
    hygiene_issue: hygieneLevel === "high" || hygieneLevel === "medium",
    overdue_expected_close:
      riskProfile?.dimensions?.timing?.flags?.overdue_expected_close === true,
    stale_high:
      riskProfile?.dimensions?.timing?.flags?.stale_high === true ||
      riskProfile?.dimensions?.timing?.flags?.stale_critical === true,
  };

  return {
    priority_rank,
    stale_days,
    days_to_expected_close,
    priority_flags,
  };
}

async function priorityDeals({
  pipeline_id,
  getUserMap,
  getStageMap,
  top_n = 10,
  nowMs,
}) {
  const source_count = await countDealsByStatus("open", pipeline_id);
  const openDealsRaw = await fetchAllDeals("open", pipeline_id, 20000);

  const normalizedDeals = openDealsRaw.map(normalizeDeal);
  const openDeals = normalizedDeals.filter((d) => d !== null);

  const validation = buildUniverseValidation({
    source_count,
    raw_count: openDealsRaw.length,
    normalized_count: openDeals.length,
  });

  const userMap = await getUserMap();
  const stageMap = await getStageMap();

  const runtimeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const topN = normalizePositiveInteger(top_n, 10);

  const deals = openDeals.map((deal) => {
    const days_to_expected_close = getDaysToExpectedClose(deal, runtimeNowMs);

    const derivatives = {
      stale_days: getStaleDays(deal, runtimeNowMs),
      days_to_expected_close,
      has_overdue_expected_close:
        typeof days_to_expected_close === "number" && days_to_expected_close < 0,
    };

    const dimensions = buildRiskDimensions(deal, derivatives);
    const riskProfile = buildRiskProfile(dimensions);
    const priority = computePrioritySignals(riskProfile, derivatives);

    return {
      id: deal.id,
      title: deal.title,
      priority_rank: priority.priority_rank,
      priority_flags: priority.priority_flags,
      risk_profile: riskProfile,
      stale_days: priority.stale_days,
      days_to_expected_close: priority.days_to_expected_close,
      value: deal.value,
      currency: deal.currency,
      probability: deal.probability,
      expected_close_date: deal.expected_close_date,
      has_expected_close_date: deal.has_expected_close_date,
      has_next_activity: deal.has_next_activity,
      next_activity_date: deal.next_activity_date,
      next_activity_time: deal.next_activity_time,
      stage_id: deal.stage_id,
      stage_name: deal.stage_id != null ? stageMap?.[deal.stage_id]?.name || null : null,
      owner_id: deal.owner_id,
      owner_name: deal.owner_id != null ? userMap?.[deal.owner_id] || null : null,
      update_time: deal.update_time,
      add_time: deal.add_time,
    };
  });

  deals.sort((a, b) => {
    if ((b.priority_rank ?? -1) !== (a.priority_rank ?? -1)) {
      return (b.priority_rank ?? -1) - (a.priority_rank ?? -1);
    }

    const aValueRank = a.value === null ? -1 : a.value;
    const bValueRank = b.value === null ? -1 : b.value;
    return bValueRank - aValueRank;
  });

  return {
    ok: true,
    intent: "priorityDeals",
    datos: {
      validacion_universo: validation,
      total_evaluados: deals.length,
      deals: deals.slice(0, topN),
      alertas: validation.alertas,
    },
  };
}

module.exports = { priorityDeals };
