{
  "openapi": "3.1.0",
  "info": {
    "title": "Promarco CRM Executive API",
    "version": "2.1.0",
    "description": "API ejecutiva CRM sobre Pipedrive. Usa /api/crm como router principal para análisis, auditoría, disciplina operativa, riesgo actual, riesgo emergente, factores asociados a éxito y plan de mejora."
  },
  "servers": [
    {
      "url": "https://crm-xbrein-backend.vercel.app"
    }
  ],
  "paths": {
    "/api/crm": {
      "post": {
        "operationId": "crm",
        "summary": "Acciones ejecutivas CRM sobre Pipedrive",
        "description": "Router ejecutivo principal. crmExecutiveAudit es una acción compuesta que agrega pipeline, owners, stale deals, riesgos, prioridad, patrones de cierres ganados, forecast, disciplina operativa, factores asociados a éxito y plan de mejora.",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["action"],
                "properties": {
                  "action": {
                    "type": "string",
                    "enum": [
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
                      "crmExecutiveAudit"
                    ],
                    "description": "Acción a ejecutar en el router /api/crm"
                  },
                  "pipeline_id": {
                    "type": "integer",
                    "description": "ID del pipeline en Pipedrive. Opcional; si se omite, el backend usa el universo disponible según la lógica de cada motor."
                  },
                  "top_n": {
                    "type": "integer",
                    "description": "Máximo de elementos a devolver en rankings o listados."
                  },
                  "days": {
                    "type": "integer",
                    "description": "Umbral de días para staleDeals. También se reutiliza como stale_days_threshold en activityDisciplineAudit."
                  },
                  "horizon_days": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 365,
                    "description": "Horizonte variable, en días, para proyectar riesgo emergente en emergingRiskDeals."
                  },
                  "days7": {
                    "type": "integer",
                    "description": "Horizonte corto para forecastSummary."
                  },
                  "days30": {
                    "type": "integer",
                    "description": "Horizonte extendido para forecastSummary."
                  },
                  "nowMs": {
                    "type": "integer",
                    "description": "Timestamp en milisegundos para cálculos deterministas."
                  }
                },
                "additionalProperties": false
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK"
          }
        }
      }
    }
  }
}