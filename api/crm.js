// /api/crm.js

const { pipedriveRequest } = require("../lib/pipedriveClient");
const { pipelineSummary } = require("../lib/pipedrive/pipelineSummary");
const { dealsByOwner } = require("../lib/pipedrive/dealsByOwner");
const { staleDeals } = require("../lib/pipedrive/staleDeals");
const { topRiskDeals } = require("../lib/pipedrive/topRiskDeals");
const { priorityDeals } = require("../lib/pipedrive/priorityDeals");
const { wonPatternAnalysis } = require("../lib/pipedrive/wonPatternAnalysis");
const { forecastSummary } = require("../lib/pipedrive/forecastSummary");
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

    for (const u of users) {
      out[u.id] = u.name || u.email || null;
    }

    return out;
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "Method not allowed",
    });
  }

  const {
    action,
    pipeline_id,
    top_n,
    days,
    days7,
    days30,
    nowMs,
  } = req.body || {};

  try {
    switch (action) {
      case "pipelineSummary": {
        const result = await pipelineSummary({
          pipeline_id,
          getStageMap,
        });
        return res.status(200).json(result);
      }

      case "dealsByOwner": {
        const result = await dealsByOwner({
          pipeline_id,
          getUserMap,
        });
        return res.status(200).json(result);
      }

      case "staleDeals": {
        const result = await staleDeals({
          pipeline_id,
          getUserMap,
          getStageMap,
          days,
          top_n,
          nowMs,
        });
        return res.status(200).json(result);
      }

      case "topRiskDeals": {
        const result = await topRiskDeals({
          pipeline_id,
          getUserMap,
          getStageMap,
          top_n,
          nowMs,
        });
        return res.status(200).json(result);
      }

      case "priorityDeals": {
        const result = await priorityDeals({
          pipeline_id,
          getUserMap,
          getStageMap,
          top_n,
          nowMs,
        });
        return res.status(200).json(result);
      }

      case "wonPatternAnalysis": {
        const result = await wonPatternAnalysis({
          pipeline_id,
          getUserMap,
          top_n,
        });
        return res.status(200).json(result);
      }

      case "forecastSummary": {
        const result = await forecastSummary({
          pipeline_id,
          nowMs,
          days7,
          days30,
        });
        return res.status(200).json(result);
      }

      case "crmExecutiveAudit": {
        const result = await crmExecutiveAudit({
          pipeline_id,
          getUserMap,
          getStageMap,
          nowMs,
        });
        return res.status(200).json(result);
      }

      default:
        return res.status(400).json({
          ok: false,
          message: `Accion desconocida: ${action}`,
        });
    }
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message || "Error interno crm.js",
    });
  }
};
