// /lib/pipedrive/buildAuditContext.js

const { fetchAllDeals, countDealsByStatus } = require("./pagination");
const { normalizeDeal } = require("./normalizeDeal");
const { buildUniverseValidation } = require("./universeValidation");

async function buildAuditContext({
  pipeline_id,
  getUserMap,
  getStageMap,
  nowMs,
}) {
  const [open, won, lost, openDealsRaw, userMap, stageMap] = await Promise.all([
    countDealsByStatus("open", pipeline_id),
    countDealsByStatus("won", pipeline_id),
    countDealsByStatus("lost", pipeline_id),
    fetchAllDeals("open", pipeline_id, 20000),
    getUserMap(),
    getStageMap(),
  ]);

  const openDealsNormalized = openDealsRaw.map(normalizeDeal).filter(Boolean);

  const validation = buildUniverseValidation({
    source_count: open,
    raw_count: openDealsRaw.length,
    normalized_count: openDealsNormalized.length,
  });

  return {
    pipeline_id,
    nowMs: Number.isFinite(nowMs) ? nowMs : Date.now(),
    userMap,
    stageMap,
    counts: { open, won, lost },
    openDealsRaw,
    openDealsNormalized,
    validation,
  };
}

module.exports = { buildAuditContext };
