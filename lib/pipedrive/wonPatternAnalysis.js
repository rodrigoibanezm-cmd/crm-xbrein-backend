// /lib/pipedrive/wonPatternAnalysis.js

const { fetchAllDeals, countDealsByStatus } = require("./pagination");

function parseTimeMs(s) {
  if (!s) return null;
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return null;
  return t;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

async function wonPatternAnalysis({ pipeline_id, getUserMap, top_n = 10 }) {
  const won_count = await countDealsByStatus("won", pipeline_id);
  const wonDeals = await fetchAllDeals("won", pipeline_id, 20000);

  const detalle_count = wonDeals.length;
  const universo_completo = detalle_count === won_count;

  const userMap = await getUserMap();
  const topN = Math.max(1, Math.trunc(Number(top_n) || 10));

  const cycleTimes = [];
  const values = [];
  let withProbability = 0;
  let withExpectedCloseDate = 0;
  let withNextActivity = 0;
  const byOwner = {};
  const rows = [];

  for (const d of wonDeals) {
    const uid =
      typeof d.user_id === "object" ? d.user_id?.id ?? null : d.user_id ?? null;

    const owner_id = uid ?? null;
    const owner_name = owner_id != null ? userMap?.[owner_id] || null : null;

    const addMs = parseTimeMs(d.add_time);
    const wonMs = parseTimeMs(d.won_time) ?? parseTimeMs(d.update_time);

    let cycle_days = null;
    if (addMs != null && wonMs != null) {
      cycle_days = Math.floor((wonMs - addMs) / (1000 * 60 * 60 * 24));
      if (cycle_days < 0) cycle_days = 0;
      cycleTimes.push(cycle_days);
    }

    const value = typeof d.value === "number" ? d.value : 0;
    values.push(value);

    const probability =
      typeof d.probability === "number"
        ? d.probability
        : Number.isFinite(Number(d.probability))
          ? Number(d.probability)
          : null;

    if (probability !== null) withProbability += 1;
    if (d.expected_close_date) withExpectedCloseDate += 1;
    if (d.next_activity_date || d.next_activity_time) withNextActivity += 1;

    if (!byOwner[String(owner_id ?? "null")]) {
      byOwner[String(owner_id ?? "null")] = {
        owner_id,
        owner_name,
        won_count: 0,
        total_value: 0,
      };
    }

    byOwner[String(owner_id ?? "null")].won_count += 1;
    byOwner[String(owner_id ?? "null")].total_value += value;

    rows.push({
      id: d.id,
      title: d.title || "",
      value,
      currency: d.currency || null,
      cycle_days,
      probability,
      expected_close_date: d.expected_close_date || null,
      next_activity_date: d.next_activity_date || null,
      next_activity_time: d.next_activity_time || null,
      owner_id,
      owner_name,
      add_time: d.add_time || null,
      won_time: d.won_time || null,
    });
  }

  const avg_cycle_days = cycleTimes.length
    ? Math.round(cycleTimes.reduce((acc, x) => acc + x, 0) / cycleTimes.length)
    : null;

  const median_cycle_days = median(cycleTimes);

  const avg_value = values.length
    ? Math.round(values.reduce((acc, x) => acc + x, 0) / values.length)
    : null;

  const median_value = median(values);

  const ownerRanking = Object.values(byOwner).sort((a, b) => {
    if ((b.won_count || 0) !== (a.won_count || 0)) {
      return (b.won_count || 0) - (a.won_count || 0);
    }
    return (b.total_value || 0) - (a.total_value || 0);
  });

  const alertas = [];
  if (!universo_completo) {
    alertas.push(
      `Inconsistencia de universo: won_count=${won_count} vs detalle_count=${detalle_count}.`
    );
  }

  const patrones = [];

  if (avg_cycle_days !== null) {
    patrones.push({
      variable: "cycle_days",
      hallazgo: `Los negocios ganados muestran un ciclo promedio de ${avg_cycle_days} días.`,
    });
  }

  if (median_value !== null) {
    patrones.push({
      variable: "value",
      hallazgo: `La mediana de valor en negocios ganados es ${median_value}.`,
    });
  }

  patrones.push({
    variable: "expected_close_date",
    hallazgo: `${withExpectedCloseDate}/${detalle_count} negocios ganados tenían fecha estimada de cierre registrada.`,
  });

  patrones.push({
    variable: "next_activity",
    hallazgo: `${withNextActivity}/${detalle_count} negocios ganados tenían actividad futura registrada en algún momento del flujo disponible.`,
  });

  patrones.push({
    variable: "probability",
    hallazgo: `${withProbability}/${detalle_count} negocios ganados tenían probabilidad registrada.`,
  });

  return {
    ok: true,
    intent: "wonPatternAnalysis",
    datos: {
      validacion_universo: {
        won_count,
        detalle_count,
        universo_completo,
      },
      resumen: {
        total_won: detalle_count,
        avg_cycle_days,
        median_cycle_days,
        avg_value,
        median_value,
      },
      patrones,
      top_owners: ownerRanking.slice(0, topN),
      muestra_negocios: rows.slice(0, topN),
      alertas,
    },
  };
}

module.exports = { wonPatternAnalysis };
