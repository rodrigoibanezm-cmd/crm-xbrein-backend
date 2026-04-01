// /lib/pipedrive/activityDisciplineAudit.js

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

async function activityDisciplineAudit({
  pipeline_id,
  getUserMap,
  getStageMap,
  nowMs,
  stale_days_threshold = 14,
  top_n = 10,
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
  const staleThreshold = normalizePositiveInteger(stale_days_threshold, 14);
  const topN = normalizePositiveInteger(top_n, 10);

  let missing_next_activity_count = 0;
  let missing_expected_close_count = 0;
  let missing_owner_count = 0;
  let missing_stage_count = 0;
  let missing_probability_count = 0;
  let stale_count = 0;

  const discipline_issues = [];

  for (const deal of openDeals) {
    const stale_days = getStaleDays(deal, runtimeNowMs);
    const days_to_expected_close = getDaysToExpectedClose(deal, runtimeNowMs);

    const missing_next_activity = deal.has_next_activity !== true;
    const missing_expected_close = deal.has_expected_close_date !== true;
    const missing_owner = deal.owner_id == null;
    const missing_stage = deal.stage_id == null;
    const missing_probability = deal.probability == null;
    const stale = typeof stale_days === "number" && stale_days >= staleThreshold;
    const overdue_expected_close =
      typeof days_to_expected_close === "number" && days_to_expected_close < 0;

    if (missing_next_activity) missing_next_activity_count += 1;
    if (missing_expected_close) missing_expected_close_count += 1;
    if (missing_owner) missing_owner_count += 1;
    if (missing_stage) missing_stage_count += 1;
    if (missing_probability) missing_probability_count += 1;
    if (stale) stale_count += 1;

    const issue_count = [
      missing_next_activity,
      missing_expected_close,
      missing_owner,
      missing_stage,
      missing_probability,
      stale,
      overdue_expected_close,
    ].filter(Boolean).length;

    if (issue_count === 0) continue;

    discipline_issues.push({
      id: deal.id,
      title: deal.title,
      issue_count,
      missing_next_activity,
      missing_expected_close,
      missing_owner,
      missing_stage,
      missing_probability,
      stale,
      stale_days,
      overdue_expected_close,
      days_to_expected_close,
      value: deal.value,
      currency: deal.currency,
      probability: deal.probability,
      stage_id: deal.stage_id,
      stage_name: deal.stage_id != null ? stageMap?.[deal.stage_id]?.name || null : null,
      owner_id: deal.owner_id,
      owner_name: deal.owner_id != null ? userMap?.[deal.owner_id] || null : null,
      expected_close_date: deal.expected_close_date,
      has_next_activity: deal.has_next_activity,
      update_time: deal.update_time,
      add_time: deal.add_time,
    });
  }

  discipline_issues.sort((a, b) => {
    if ((b.issue_count ?? -1) !== (a.issue_count ?? -1)) {
      return (b.issue_count ?? -1) - (a.issue_count ?? -1);
    }

    const aValueRank = a.value === null ? -1 : a.value;
    const bValueRank = b.value === null ? -1 : b.value;
    return bValueRank - aValueRank;
  });

  return {
    ok: true,
    intent: "activityDisciplineAudit",
    datos: {
      validacion_universo: validation,
      resumen: {
        total_open_deals: openDeals.length,
        stale_days_threshold: staleThreshold,
        missing_next_activity_count,
        missing_expected_close_count,
        missing_owner_count,
        missing_stage_count,
        missing_probability_count,
        stale_count,
      },
      deals: discipline_issues.slice(0, topN),
      alertas: validation.alertas,
    },
  };
}

module.exports = { activityDisciplineAudit };
