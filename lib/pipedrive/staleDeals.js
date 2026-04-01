// /lib/pipedrive/staleDeals.js

const { fetchAllDeals, countDealsByStatus } = require("./pagination");
const { normalizeDeal } = require("./normalizeDeal");
const { getStaleDays } = require("./dealDerivatives");
const { buildUniverseValidation } = require("./universeValidation");

function normalizePositiveInteger(value, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.trunc(n);
  return v > 0 ? v : fallback;
}

async function staleDeals({
  pipeline_id,
  getUserMap,
  getStageMap,
  days = 14,
  top_n = 20,
  nowMs,
  sharedContext,
}) {
  const source_count =
    sharedContext?.counts?.open ??
    (await countDealsByStatus("open", pipeline_id));

  const openDealsRaw =
    sharedContext?.openDealsRaw ??
    (await fetchAllDeals("open", pipeline_id, 20000));

  const openDeals =
    sharedContext?.openDealsNormalized ??
    openDealsRaw.map(normalizeDeal).filter((d) => d !== null);

  const validation =
    sharedContext?.validation ??
    buildUniverseValidation({
      source_count,
      raw_count: openDealsRaw.length,
      normalized_count: openDeals.length,
    });

  const userMap = sharedContext?.userMap ?? (await getUserMap());
  const stageMap = sharedContext?.stageMap ?? (await getStageMap());

  const runtimeNowMs =
    Number.isFinite(sharedContext?.nowMs) ? sharedContext.nowMs :
    Number.isFinite(nowMs) ? nowMs :
    Date.now();

  const minDays = normalizePositiveInteger(days, 14);
  const topN = normalizePositiveInteger(top_n, 20);

  const deals = [];

  for (const deal of openDeals) {
    const stale_days = getStaleDays(deal, runtimeNowMs);
    if (stale_days === null || stale_days < minDays) continue;

    const stage_name =
      deal.stage_id != null ? stageMap?.[deal.stage_id]?.name || null : null;

    const owner_name =
      deal.owner_id != null ? userMap?.[deal.owner_id] || null : null;

    deals.push({
      id: deal.id,
      title: deal.title,
      stale_days,
      value: deal.value,
      currency: deal.currency,
      stage_id: deal.stage_id,
      stage_name,
      owner_id: deal.owner_id,
      owner_name,
      update_time: deal.update_time,
      add_time: deal.add_time,
    });
  }

  deals.sort((a, b) => {
    if ((b.stale_days ?? -1) !== (a.stale_days ?? -1)) {
      return (b.stale_days ?? -1) - (a.stale_days ?? -1);
    }

    const aValueRank = a.value === null ? -1 : a.value;
    const bValueRank = b.value === null ? -1 : b.value;
    return bValueRank - aValueRank;
  });

  return {
    ok: true,
    intent: "staleDeals",
    datos: {
      validacion_universo: validation,
      threshold_days: minDays,
      total_stale_deals: deals.length,
      deals: deals.slice(0, topN),
      alertas: validation.alertas,
    },
  };
}

module.exports = { staleDeals };
