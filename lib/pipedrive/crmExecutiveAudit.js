// /lib/pipedrive/crmExecutiveAudit.js

const { buildAuditContext } = require("./buildAuditContext");
const { pipelineSummary } = require("./pipelineSummary");
const { dealsByOwner } = require("./dealsByOwner");
const { staleDeals } = require("./staleDeals");
const { topRiskDeals } = require("./topRiskDeals");
const { priorityDeals } = require("./priorityDeals");
const { wonPatternAnalysis } = require("./wonPatternAnalysis");
const { forecastSummary } = require("./forecastSummary");
const { activityDisciplineAudit } = require("./activityDisciplineAudit");
const { successFactorsAnalysis } = require("./successFactorsAnalysis");

function mergeAlertas(...sources) {
  const out = [];
  const seen = new Set();

  for (const src of sources) {
    const arr = Array.isArray(src) ? src : [];
    for (const item of arr) {
      const key = String(item);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
  }

  return out;
}

async function timed(label, fn, timings) {
  const t0 = Date.now();
  try {
    const result = await fn();
    timings[label] = Date.now() - t0;
    return result;
  } catch (err) {
    timings[label] = Date.now() - t0;
    throw err;
  }
}

async function crmExecutiveAudit({
  pipeline_id,
  getUserMap,
  getStageMap,
  nowMs,
  sharedContext,
}) {
  const timings = {};
  const totalStart = Date.now();

  const ctx = await timed(
    "buildAuditContext",
    async () =>
      sharedContext ??
      (await buildAuditContext({
        pipeline_id,
        getUserMap,
        getStageMap,
        nowMs,
      })),
    timings
  );

  const [
    pipeline,
    owners,
    stale,
    risk,
    priority,
    won,
    forecast,
    discipline,
    successFactors,
  ] = await Promise.all([
    timed(
      "pipelineSummary",
      () => pipelineSummary({ pipeline_id, getStageMap, sharedContext: ctx }),
      timings
    ),
    timed(
      "dealsByOwner",
      () => dealsByOwner({ pipeline_id, getUserMap, sharedContext: ctx }),
      timings
    ),
    timed(
      "staleDeals",
      () =>
        staleDeals({
          pipeline_id,
          getUserMap,
          getStageMap,
          nowMs,
          days: 14,
          top_n: 10,
          sharedContext: ctx,
        }),
      timings
    ),
    timed(
      "topRiskDeals",
      () =>
        topRiskDeals({
          pipeline_id,
          getUserMap,
          getStageMap,
          nowMs,
          top_n: 10,
          sharedContext: ctx,
        }),
      timings
    ),
    timed(
      "priorityDeals",
      () =>
        priorityDeals({
          pipeline_id,
          getUserMap,
          getStageMap,
          nowMs,
          top_n: 10,
          sharedContext: ctx,
        }),
      timings
    ),
    timed(
      "wonPatternAnalysis",
      () =>
        wonPatternAnalysis({
          pipeline_id,
          getUserMap,
          top_n: 10,
          sharedContext: ctx,
        }),
      timings
    ),
    timed(
      "forecastSummary",
      () =>
        forecastSummary({
          pipeline_id,
          nowMs,
          days7: 7,
          days30: 30,
          sharedContext: ctx,
        }),
      timings
    ),
    timed(
      "activityDisciplineAudit",
      () =>
        activityDisciplineAudit({
          pipeline_id,
          getUserMap,
          getStageMap,
          nowMs,
          stale_days_threshold: 14,
          top_n: 10,
          sharedContext: ctx,
        }),
      timings
    ),
    timed(
      "successFactorsAnalysis",
      () =>
        successFactorsAnalysis({
          pipeline_id,
          top_n: 10,
          sharedContext: ctx,
        }),
      timings
    ),
  ]);

  const alertas = mergeAlertas(
    ctx?.validation?.alertas,
    pipeline?.datos?.alertas,
    owners?.datos?.alertas,
    stale?.datos?.alertas,
    risk?.datos?.alertas,
    priority?.datos?.alertas,
    won?.datos?.alertas,
    forecast?.datos?.alertas,
    discipline?.datos?.alertas,
    successFactors?.datos?.alertas
  );

  timings.total = Date.now() - totalStart;

  return {
    ok: true,
    intent: "crmExecutiveAudit",
    datos: {
      pipeline_summary: pipeline?.datos || null,
      deals_by_owner: owners?.datos || null,
      stale_deals: stale?.datos || null,
      top_risk_deals: risk?.datos || null,
      priority_deals: priority?.datos || null,
      won_analysis: won?.datos || null,
      forecast_summary: forecast?.datos || null,
      activity_discipline_audit: discipline?.datos || null,
      success_factors_analysis: successFactors?.datos || null,
      improvement_plan: null,
      alertas,
    },
    debug_timing_ms: timings,
  };
}

module.exports = { crmExecutiveAudit };
