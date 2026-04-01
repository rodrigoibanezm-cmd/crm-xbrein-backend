// /lib/pipedrive/priorityDeals.js

const { fetchAllDeals, countDealsByStatus } = require("./pagination");

function parseTimeMs(s) {
  if (!s) return null;
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return null;
  return t;
}

function computePriorityScore(deal, now) {
  let score = 0;
  const reasons = [];

  const value = typeof deal.value === "number" ? deal.value : 0;
  if (value >= 50000) {
    score += 35;
    reasons.push("alto valor");
  } else if (value >= 10000) {
    score += 20;
    reasons.push("valor relevante");
  } else if (value > 0) {
    score += 8;
  }

  const pRaw = deal.probability;
  const probability = typeof pRaw === "number" ? pRaw : Number(pRaw);
  if (Number.isFinite(probability)) {
    if (probability >= 80) {
      score += 25;
      reasons.push("alta probabilidad");
    } else if (probability >= 50) {
      score += 15;
      reasons.push("probabilidad media-alta");
    } else if (probability >= 30) {
      score += 8;
    }
  }

  const expectedCloseMs = parseTimeMs(deal.expected_close_date);
  if (expectedCloseMs != null) {
    const diffDays = Math.floor((expectedCloseMs - now) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 7) {
      score += 20;
      reasons.push("cierre cercano");
    } else if (diffDays >= 0 && diffDays <= 30) {
      score += 10;
    }
  }

  const updateMs = parseTimeMs(deal.update_time) ?? parseTimeMs(deal.add_time);
  if (updateMs != null) {
    const staleDays = Math.floor((now - updateMs) / (1000 * 60 * 60 * 24));
    if (staleDays <= 3) {
      score += 15;
      reasons.push("actividad reciente");
    } else if (staleDays <= 7) {
      score += 8;
    } else if (staleDays >= 14) {
      score -= 15;
      reasons.push("seguimiento débil");
    }
  }

  if (deal.next_activity_date || deal.next_activity_time) {
    score += 10;
    reasons.push("próxima actividad agendada");
  } else {
    score -= 10;
    reasons.push("sin próxima actividad");
  }

  return {
    score,
    reasons,
  };
}

async function priorityDeals({ pipeline_id, getUserMap, top_n = 10 }) {
  const open_count = await countDealsByStatus("open", pipeline_id);
  const openDeals = await fetchAllDeals("open", pipeline_id, 20000);

  const detalle_count = openDeals.length;
  const universo_completo = detalle_count === open_count;

  const userMap = await getUserMap();
  const now = Date.now();
  const topN = Math.max(1, Math.trunc(Number(top_n) || 10));

  const rows = openDeals.map((d) => {
    const uid =
      typeof d.user_id === "object" ? d.user_id?.id ?? null : d.user_id ?? null;

    const { score, reasons } = computePriorityScore(d, now);

    return {
      id: d.id,
      title: d.title || "",
      score,
      reasons,
      value: typeof d.value === "number" ? d.value : 0,
      currency: d.currency || null,
      probability:
        typeof d.probability === "number"
          ? d.probability
          : Number.isFinite(Number(d.probability))
            ? Number(d.probability)
            : null,
      expected_close_date: d.expected_close_date || null,
      next_activity_date: d.next_activity_date || null,
      next_activity_time: d.next_activity_time || null,
      stage_id: typeof d.stage_id === "number" ? d.stage_id : null,
      owner_id: uid ?? null,
      owner_name: uid != null ? userMap?.[uid] || null : null,
      update_time: d.update_time || null,
    };
  });

  rows.sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) {
      return (b.score || 0) - (a.score || 0);
    }
    return (b.value || 0) - (a.value || 0);
  });

  const alertas = [];
  if (!universo_completo) {
    alertas.push(
      `Inconsistencia de universo: open_count=${open_count} vs detalle_count=${detalle_count}.`
    );
  }

  return {
    ok: true,
    intent: "priorityDeals",
    datos: {
      validacion_universo: {
        open_count,
        detalle_count,
        universo_completo,
      },
      total_evaluados: rows.length,
      deals: rows.slice(0, topN),
      alertas,
    },
  };
}

module.exports = { priorityDeals };
