const ACTIONS = [
  "pipelineSummary",
  "dealsByOwner",
  "staleDeals",
  "topRiskDeals",
  "emergingRiskDeals",
  "priorityDeals",
  "wonPatternAnalysis",
  "forecastSummary",
  "activityDisciplineAudit",
  "successFactorsAnalysis",
  "improvementPlan",
  "crmExecutiveAudit",
];

const inputSchema = {
  type: "object",
  required: ["action"],
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ACTIONS,
      description: "Acción ejecutiva a ejecutar mediante /api/crm.",
    },
    pipeline_id: { type: "integer", description: "ID opcional del pipeline." },
    top_n: { type: "integer", minimum: 1, description: "Máximo de resultados." },
    days: { type: "integer", minimum: 1, description: "Umbral temporal en días." },
    horizon_days: {
      type: "integer",
      minimum: 1,
      maximum: 365,
      description: "Horizonte del riesgo emergente.",
    },
    days7: { type: "integer", minimum: 1, description: "Horizonte corto de forecast." },
    days30: { type: "integer", minimum: 1, description: "Horizonte extendido de forecast." },
    nowMs: { type: "integer", description: "Timestamp para cálculos deterministas." },
  },
};

const crmTool = {
  name: "crm",
  title: "NexusG CRM Executive",
  description: "Ejecuta análisis ejecutivos CRM usando exclusivamente el router /api/crm.",
  inputSchema,
};

module.exports = { ACTIONS, crmTool };
