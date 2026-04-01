// /lib/pipedrive/improvementPlan.js

const { pipelineSummary } = require("./pipelineSummary");
const { staleDeals } = require("./staleDeals");
const { priorityDeals } = require("./priorityDeals");
const { activityDisciplineAudit } = require("./activityDisciplineAudit");
const { successFactorsAnalysis } = require("./successFactorsAnalysis");

function uniqueAlertas(...sources) {
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

function toArray(x) {
  return Array.isArray(x) ? x : [];
}

function buildRecommendation({
  priority,
  code,
  title,
  why,
  impact,
  action_7d,
  evidence,
}) {
  return {
    priority,
    code,
    title,
    why,
    impact,
    action_7d,
    evidence,
  };
}

function buildCoreRecommendations({
  pipeline,
  stale,
  priority,
  discipline,
  success,
}) {
  const recommendations = [];

  const staleSummary = stale?.datos || {};
  const staleDealsList = toArray(staleSummary.deals);
  const staleCount = staleSummary.total_stale_deals ?? 0;
  const staleThreshold = staleSummary.threshold_days ?? 14;

  const disciplineSummary = discipline?.datos?.resumen || {};
  const disciplineDeals = toArray(discipline?.datos?.deals);

  const pipelineTotals = pipeline?.datos?.totales || {};
  const byStage = toArray(pipeline?.datos?.por_etapa);

  const successFactors = toArray(success?.datos?.success_factors);
  const comparativeGaps = success?.datos?.comparative_gaps || {};
  const wonSummary = success?.datos?.won_summary || {};
  const lostSummary = success?.datos?.lost_summary || {};

  const priorityDealsList = toArray(priority?.datos?.deals);
  const highPriorityCount = priorityDealsList.filter(
    (d) => (d?.priority_rank ?? 0) >= 6
  ).length;

  if (disciplineSummary.missing_next_activity_count > 0 || staleCount > 0) {
    recommendations.push(
      buildRecommendation({
        priority: 1,
        code: "recovery_follow_up",
        title: "Recuperar seguimiento operativo de negocios abiertos",
        why:
          "Hay negocios abiertos sin próxima actividad registrada y/o con señales de estancamiento.",
        impact:
          "Reduce riesgo de pérdida evitable y mejora velocidad de avance comercial.",
        action_7d: [
          `Intervenir primero los negocios con ${staleThreshold}+ días sin movimiento.`,
          "Asignar próxima actividad obligatoria a cada negocio crítico.",
          "Revisar diariamente el top de negocios con mayor issue_count o priority_rank.",
        ],
        evidence: {
          stale_count: staleCount,
          stale_threshold_days: staleThreshold,
          missing_next_activity_count:
            disciplineSummary.missing_next_activity_count ?? 0,
          top_stale_deals: staleDealsList.slice(0, 5).map((d) => ({
            id: d.id,
            title: d.title,
            stale_days: d.stale_days,
            owner_name: d.owner_name,
            value: d.value,
          })),
        },
      })
    );
  }

  if (
    disciplineSummary.missing_expected_close_count > 0 ||
    disciplineSummary.missing_probability_count > 0
  ) {
    recommendations.push(
      buildRecommendation({
        priority: 2,
        code: "forecast_hygiene",
        title: "Corregir disciplina de forecast y calidad mínima de datos",
        why:
          "Existen negocios activos sin fecha estimada de cierre y/o sin probabilidad registrada.",
        impact:
          "Mejora confiabilidad del forecast, priorización y control ejecutivo del pipeline.",
        action_7d: [
          "Hacer barrido sobre negocios abiertos sin expected_close_date.",
          "Exigir probabilidad explícita en todas las oportunidades activas.",
          "Bloquear revisión semanal del pipeline si faltan esos campos críticos.",
        ],
        evidence: {
          missing_expected_close_count:
            disciplineSummary.missing_expected_close_count ?? 0,
          missing_probability_count:
            disciplineSummary.missing_probability_count ?? 0,
          top_discipline_issues: disciplineDeals.slice(0, 5).map((d) => ({
            id: d.id,
            title: d.title,
            issue_count: d.issue_count,
            missing_expected_close: d.missing_expected_close,
            missing_probability: d.missing_probability,
            owner_name: d.owner_name,
          })),
        },
      })
    );
  }

  if (successFactors.length > 0) {
    recommendations.push(
      buildRecommendation({
        priority: 3,
        code: "replicate_success_patterns",
        title: "Estandarizar variables asociadas a cierres exitosos",
        why:
          "El contraste descriptivo entre negocios ganados y perdidos muestra diferencias operativas y de disciplina que conviene replicar.",
        impact:
          "Aumenta consistencia comercial y acerca más negocios abiertos al patrón de éxito observado.",
        action_7d: [
          "Convertir los factores asociados a éxito en checklist comercial obligatorio.",
          "Revisar los negocios abiertos prioritarios contra ese checklist.",
          "Usar esos factores en la reunión semanal de pipeline y coaching.",
        ],
        evidence: {
          success_factors: successFactors.slice(0, 5),
          next_activity_rate_gap: comparativeGaps.next_activity_rate_gap ?? null,
          expected_close_rate_gap:
            comparativeGaps.expected_close_rate_gap ?? null,
          probability_avg_gap: comparativeGaps.probability_avg_gap ?? null,
          cycle_days_median_gap:
            comparativeGaps.cycle_days_median_gap ?? null,
          won_total_deals: wonSummary.total_deals ?? null,
          lost_total_deals: lostSummary.total_deals ?? null,
        },
      })
    );
  }

  if (highPriorityCount > 0) {
    recommendations.push(
      buildRecommendation({
        priority: 4,
        code: "focus_priority_deals",
        title: "Concentrar la gestión semanal en el subconjunto de mayor impacto",
        why:
          "Hay oportunidades que combinan exposición, presión temporal y señales de riesgo/higiene.",
        impact:
          "Maximiza foco comercial y protege ingresos potenciales en el corto plazo.",
        action_7d: [
          "Definir dueño y próximo paso explícito para cada negocio prioritario.",
          "Revisar estos negocios al inicio y cierre de cada jornada.",
          "Escalar inmediatamente los casos con alta exposición y timing crítico.",
        ],
        evidence: {
          high_priority_count: highPriorityCount,
          top_priority_deals: priorityDealsList.slice(0, 5).map((d) => ({
            id: d.id,
            title: d.title,
            priority_rank: d.priority_rank,
            owner_name: d.owner_name,
            value: d.value,
            stage_name: d.stage_name,
          })),
        },
      })
    );
  }

  if (byStage.length > 0) {
    const topStage = [...byStage].sort((a, b) => (b.count || 0) - (a.count || 0))[0];

    recommendations.push(
      buildRecommendation({
        priority: 5,
        code: "stage_control",
        title: "Reforzar control ejecutivo de concentración por etapa",
        why:
          "La acumulación de negocios en ciertas etapas puede ocultar fricción operativa o falsa sensación de avance.",
        impact:
          "Mejora visibilidad del cuello de botella y ordena la gestión del pipeline.",
        action_7d: [
          "Revisar la etapa con mayor concentración y su criterio real de permanencia.",
          "Separar negocios realmente activos de los que solo siguen abiertos administrativamente.",
          "Definir regla de salida o escalamiento para permanencias anómalas.",
        ],
        evidence: {
          pipeline_open_count: pipelineTotals.abiertos ?? null,
          pipeline_open_value: pipelineTotals.pipeline_abierto_valor ?? null,
          top_stage: topStage || null,
        },
      })
    );
  }

  recommendations.sort((a, b) => (a.priority || 999) - (b.priority || 999));

  return recommendations;
}

async function improvementPlan({
  pipeline_id,
  getUserMap,
  getStageMap,
  nowMs,
  top_n = 10,
}) {
  const [
    pipeline,
    stale,
    priority,
    discipline,
    success,
  ] = await Promise.all([
    pipelineSummary({ pipeline_id, getStageMap }),
    staleDeals({
      pipeline_id,
      getUserMap,
      getStageMap,
      nowMs,
      days: 14,
      top_n,
    }),
    priorityDeals({
      pipeline_id,
      getUserMap,
      getStageMap,
      nowMs,
      top_n,
    }),
    activityDisciplineAudit({
      pipeline_id,
      getUserMap,
      getStageMap,
      nowMs,
      stale_days_threshold: 14,
      top_n,
    }),
    successFactorsAnalysis({
      pipeline_id,
      top_n,
    }),
  ]);

  const recommendations = buildCoreRecommendations({
    pipeline,
    stale,
    priority,
    discipline,
    success,
  });

  const alertas = uniqueAlertas(
    pipeline?.datos?.alertas,
    stale?.datos?.alertas,
    priority?.datos?.alertas,
    discipline?.datos?.alertas,
    success?.datos?.alertas
  );

  return {
    ok: true,
    intent: "improvementPlan",
    datos: {
      recommendations,
      alertas,
      source_modules: {
        pipeline_summary: pipeline?.datos || null,
        stale_deals: stale?.datos || null,
        priority_deals: priority?.datos || null,
        activity_discipline_audit: discipline?.datos || null,
        success_factors_analysis: success?.datos || null,
      },
    },
  };
}

module.exports = { improvementPlan };
