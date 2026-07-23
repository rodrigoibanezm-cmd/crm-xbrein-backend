// /api/crm.js

const { pipedriveRequest } = require("../lib/pipedriveClient");
const { pipelineSummary } = require("../lib/pipedrive/pipelineSummary");
const { dealsByOwner } = require("../lib/pipedrive/dealsByOwner");
const { staleDeals } = require("../lib/pipedrive/staleDeals");
const { topRiskDeals } = require("../lib/pipedrive/topRiskDeals");
const { emergingRiskDeals } = require("../lib/pipedrive/emergingRiskDeals");
const { priorityDeals } = require("../lib/pipedrive/priorityDeals");
const { wonPatternAnalysis } = require("../lib/pipedrive/wonPatternAnalysis");
const { forecastSummary } = require("../lib/pipedrive/forecastSummary");
const { activityDisciplineAudit } = require("../lib/pipedrive/activityDisciplineAudit");
const { successFactorsAnalysis } = require("../lib/pipedrive/successFactorsAnalysis");
const { improvementPlan } = require("../lib/pipedrive/improvementPlan");
const { crmExecutiveAudit } = require("../lib/pipedrive/crmExecutiveAudit");

async function getStageMap() {
  try {
    const r = await pipedriveRequest("GET", "/stages", {});
    const stages = Array.isArray(r.data) ? r.data : [];
    const out = {};
    for (const s of stages) {
      out[s.id] = {
        id: s.id,
        name: s.name || null,
        order_nr: typeof s.order_nr === "number" ? s.order_nr : null,
        pipeline_id: typeof s.pipeline_id === "number" ? s.pipeline_id : null,
        pipeline_name: s.pipeline_name || null,
      };
    }
    return out;
  } catch {
    return {};
  }
}

async function getUserMap() {
  try {
    const r = await pipedriveRequest("GET", "/users", {});
    const users = Array.isArray(r.data) ? r.data : [];
    const out = {};
    for (const u of users) out[u.id] = u.name || u.email || null;
    return out;
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const {
    action,
    pipeline_id,
    top_n,
    days,
    days7,
    days30,
    horizon_days,
    nowMs,
  } = req.body || {};

  try {
    switch (action) {
      case "pipelineSummary":
        return res.status(200).json(await pipelineSummary({ pipeline_id, getStageMap }));
      case "dealsByOwner":
        return res.status(200).json(await dealsByOwner({ pipeline_id, getUserMap }));
      case "staleDeals":
        return res.status(200).json(await staleDeals({
          pipeline_id, getUserMap, getStageMap, days, top_n, nowMs,
        }));
      case "topRiskDeals":
        return res.status(200).json(await topRiskDeals({
          pipeline_id, getUserMap, getStageMap, top_n, nowMs,
        }));
      case "emergingRiskDeals":
        return res.status(200).json(await emergingRiskDeals({
          pipeline_id, getUserMap, horizon_days, top_n, nowMs,
        }));
      case "priorityDeals":
        return res.status(200).json(await priorityDeals({
          pipeline_id, getUserMap, getStageMap, top_n, nowMs,
        }));
      case "wonPatternAnalysis":
        return res.status(200).json(await wonPatternAnalysis({ pipeline_id, getUserMap, top_n }));
      case "forecastSummary":
        return res.status(200).json(await forecastSummary({ pipeline_id, nowMs, days7, days30 }));
      case "activityDisciplineAudit":
        return res.status(200).json(await activityDisciplineAudit({
          pipeline_id, getUserMap, getStageMap, nowMs, stale_days_threshold: days, top_n,
        }));
      case "successFactorsAnalysis":
        return res.status(200).json(await successFactorsAnalysis({ pipeline_id, top_n }));
      case "improvementPlan":
        return res.status(200).json(await improvementPlan({
          pipeline_id, getUserMap, getStageMap, nowMs, top_n,
        }));
      case "crmExecutiveAudit":
        return res.status(200).json(await crmExecutiveAudit({
          pipeline_id, getUserMap, getStageMap, nowMs,
        }));
      default:
        return res.status(400).json({ ok: false, message: `Accion desconocida: ${action}` });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message || "Error interno crm.js" });
  }
};
