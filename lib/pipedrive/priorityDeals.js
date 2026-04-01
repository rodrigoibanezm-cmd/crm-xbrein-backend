// /lib/pipedrive/priorityDeals.js

const { fetchAllDeals, countDealsByStatus } = require("./pagination");
const { normalizeDeal } = require("./normalizeDeal");
const { getStaleDays, getDaysToExpectedClose } = require("./dealDerivatives");
const { buildUniverseValidation } = require("./universeValidation");

function normalizePositiveInteger(value, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.trunc(n);
  return v > 0 ? v : fallback;
}

function buildRiskProfile(deal, derivatives) {
  const value = typeof deal?.value === "number" ? deal.value : null;
  const probability = typeof deal?.probability === "number" ? deal.probability : null;
  const stale_days =
    typeof derivatives?.stale_days === "number" ? derivatives.stale_days : null;
  const days_to_expected_close =
    typeof derivatives?.days_to_expected_close === "number"
      ? derivatives.days_to_expected_close
      : null;

  const has_next_activity = deal?.has_next_activity === true;
  const has_expected_close_date = deal?.has_expected_close_date === true;

  let exposureLevel = "none";
  if (value !== null && value >= 50000) exposureLevel = "high";
  else if (value !== null && value >= 10000) exposureLevel = "medium";
  else if (value !== null && value > 0) exposureLevel = "low";

  let timingLevel = "none";
  const stale_critical = stale_days !== null && stale_days >= 30;
  const stale_high = stale_days !== null && stale_days >= 14;
  const stale_medium = stale_days !== null && stale_days >= 7;
  const overdue_expected_close =
    days_to_expected_close !== null && days_to_expected_close < 0;
  const close_due_soon =
    days_to_expected_close !== null && days_to_expected_close >= 0 && days_to_expected_close <= 7;

  if (stale_critical || overdue_expected_close) timingLevel = "high";
  else if (stale_high) timingLevel = "medium";
  else if (stale_medium || close_due_soon) timingLevel = "low";

  let followUpLevel = "none";
  if (!has_next_activity) followUpLevel = "high";

  let forecastLevel = "none";
  if (probability !== null && probability >= 80) forecastLevel = "high";
  else if (probability !== null && probability >= 60) forecastLevel = "medium";
  else if (probability !== null && probability > 0) forecastLevel = "low";

  const missing_expected_close_date = !has_expected_close_date;
  const missing_owner = deal?.owner_id == null;
  const missing_stage = deal?.stage_id == null;
  const missing_value = value == null;
  const missing_probability = probability == null;

  const missingCount = [
    missing_expected_close_date,
    missing_owner,
    missing_stage,
    missing_value,
    missing_probability,
  ].filter(Boolean).length;

  let hygieneLevel = "none";
  if (missingCount >= 3) hygieneLevel = "high";
  else if (missingCount === 2) hygieneLevel = "medium";
  else if (missingCount === 1) hygieneLevel = "low";

  const rankMap = { none: 0, low: 1, medium: 2, high: 3 };
  const overallRank = Math.max(
    rankMap[exposureLevel],
    rankMap[timingLevel],
    rankMap[followUpLevel],
    rankMap[forecastLevel],
    rankMap[hygieneLevel]
  );

  const overall_level =
    Object.keys(rankMap).find((k) => rankMap[k] === overallRank) || "none";

  return {
    overall_level,
    dimensions: {
      exposure: {
        level: exposureLevel,
        value,
        flags: {
          high_value: exposureLevel === "high",
          medium_value: exposureLevel === "medium",
          has_value: value !== null && value > 0,
        },
      },
      timing: {
        level: timingLevel,
        stale_days,
        days_to_expected_close,
        flags: {
          stale_critical,
          stale_high,
          stale_medium,
          overdue_expected_close,
          close_due_soon,
        },
      },
      follow_up: {
        level: followUpLevel,
        flags: {
          has_next_activity,
          missing_next_activity: !has_next_activity,
        },
      },
      forecast: {
        level: forecastLevel,
        probability,
        flags: {
          has_probability: probability !== null,
          high_probability: forecastLevel === "high",
          medium_probability: forecastLevel === "medium",
          low_probability: forecastLevel === "low",
        },
      },
      hygiene: {
        level: hygieneLevel,
        missing_count: missingCount,
        flags: {
          has_expected_close_date,
          missing_expected_close_date,
          missing_owner,
          missing_stage,
          missing_value,
          missing_probability,
        },
      },
    },
  };
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

    const riskProfile = buildRiskProfile(deal, derivatives);
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
