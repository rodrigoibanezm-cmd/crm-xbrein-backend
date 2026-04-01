// /lib/pipedrive/pipelineSummary.js

const { fetchAllDeals, countDealsByStatus } = require("./pagination");

async function pipelineSummary({ pipeline_id, getStageMap }) {
  const [abiertos, ganados, perdidos] = await Promise.all([
    countDealsByStatus("open", pipeline_id),
    countDealsByStatus("won", pipeline_id),
    countDealsByStatus("lost", pipeline_id),
  ]);

  const openDeals = await fetchAllDeals("open", pipeline_id, 20000);
  const abiertos_detalle = openDeals.length;
  const universo_completo = abiertos_detalle === abiertos;

  const stageMap = await getStageMap();

  let pipeline_abierto_valor = 0;
  let currency = null;
  let currencyMixed = false;
  const byStageAgg = {};

  for (const d of openDeals) {
    const value = typeof d.value === "number" ? d.value : 0;
    pipeline_abierto_valor += value;

    if (d.currency) {
      if (currency === null) currency = d.currency;
      else if (currency !== d.currency) currencyMixed = true;
    }

    const sid = typeof d.stage_id === "number" ? d.stage_id : null;
    const stageMeta = sid != null ? stageMap[sid] || null : null;

    if (!byStageAgg[sid]) {
      byStageAgg[sid] = {
        stage_id: sid,
        stage_name: stageMeta?.name || null,
        order_nr: typeof stageMeta?.order_nr === "number" ? stageMeta.order_nr : null,
        count: 0,
        value: 0,
      };
    }

    byStageAgg[sid].count += 1;
    byStageAgg[sid].value += value;
  }

  const por_etapa = Object.values(byStageAgg).sort((a, b) => {
    const aOrder = typeof a.order_nr === "number" ? a.order_nr : Number.MAX_SAFE_INTEGER;
    const bOrder = typeof b.order_nr === "number" ? b.order_nr : Number.MAX_SAFE_INTEGER;

    if (aOrder !== bOrder) return aOrder - bOrder;

    const aStageId = a.stage_id ?? Number.MAX_SAFE_INTEGER;
    const bStageId = b.stage_id ?? Number.MAX_SAFE_INTEGER;
    return aStageId - bStageId;
  });

  const alertas = [];

  if (!universo_completo) {
    alertas.push(
      `Inconsistencia de universo: abiertos_conteo=${abiertos} vs abiertos_detalle=${abiertos_detalle}.`
    );
  }

  if (currencyMixed) {
    currency = null;
    alertas.push("Hay múltiples monedas en el pipeline abierto.");
  }

  return {
    ok: true,
    intent: "pipelineSummary",
    datos: {
      validacion_universo: {
        abiertos_conteo: abiertos,
        abiertos_detalle,
        universo_completo,
      },
      totales: {
        abiertos,
        ganados,
        perdidos,
        pipeline_abierto_valor,
        currency,
      },
      por_etapa,
      alertas,
    },
  };
}

module.exports = { pipelineSummary };
