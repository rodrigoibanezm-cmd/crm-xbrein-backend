// /lib/pipedrive/topRiskDeals.js

const { fetchAllDeals, countDealsByStatus } = require("./pagination");
const { buildUniverseValidation } = require("./universeValidation");

function parseTimeMs(s) {
  if (!s) return null;
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return null;
  return t;
}

function computeRiskScore(deal, now) {
  let score = 0;
  const reasons = [];

  const value = typeof deal.value === "number" ? deal.value : 0;
  if (value >= 50000) {
    score += 15;
    reasons.push("alto valor expuesto");
  } else if (value >= 10000) {
    score += 8;
  }

  const probabilityRaw =
    typeof deal.probability === "number"
      ? deal.probability
      : Number(deal.probability);

  if (Number.isFinite(probabilityRaw)) {
    const probability = Math.max(0, Math.min(100, probabilityRaw));

    if (probability >= 80) {
      score += 25;
      reasons.push("probabilidad alta");
    } else if (probability >= 60) {
      score += 15;
    } else if (probability <= 20) {
      score += 5;
    }

    const updateMs = parseTimeMs(deal.update_time) ?? parseTimeMs(deal.add_time);
    if (updateMs != null) {
      const staleDays = Math.floor((now - updateMs) / (1000 * 60 * 60 * 24));
      if (probability >= 80 && staleDays >= 14) {
        score += 35;
        reasons.push("probabilidad alta con seguimiento débil");
      } else if (probability >= 60 && staleDays >= 14) {
        score += 20;
      }
    }
  }

  const updateMs = parseTimeMs(deal.update_time) ?? parseTimeMs(deal.add_time);
  let stale_days = null;
  if (updateMs != null) {
    stale_days = Math.floor((now - updateMs) / (1000 * 60 * 60 * 24));
    if (stale_days < 0) stale_days = 0;

    if (stale_days >= 30) {
      score += 30;
      reasons.push("muy estancado");
    } else if (stale_days >= 14) {
      score += 18;
      reasons.push("estancado");
    } else if (stale_days >= 7) {
      score += 8;
    }
  }

  if (!deal.next_activity_date && !deal.next_activity_time) {
    score += 20;
    reasons.push("sin próxima actividad");
  }

  const expectedCloseMs = parseTimeMs(deal.expected_close_date);
  if (expectedCloseMs == null) {
    score += 12;
    reasons.push("sin fecha estimada de cierre");
  } else {
    const diffDays = Math.floor((expectedCloseMs - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      score += 25;
      reasons.push("fecha de cierre vencida");
    } else if (diffDays <= 7) {
      score += 10;
    }
  }

  return {
    score,
    reasons,
    stale_days,
    probability: Number.isFinite(probabilityRaw)
      ? Math.max(0, Math.min(100, probabilityRaw))
      : null,
  };
}

async function topRiskDeals({
  pipeline_id,
  getUserMap,
  top_n = 10,
  nowMs,
  sharedContext,
}) {
  const source_count =
    sharedContext?.counts?.open ??
    (await countDealsByStatus("open", pipeline_id));

  const openDeals =
    sharedContext?.openDealsRaw ??
    (await fetchAllDeals("open", pipeline_id, 20000));

  const validation =
    sharedContext?.validation ??
    buildUniverseValidation({
      source_count,
      raw_count: openDeals.length,
      normalized_count: openDeals.length,
    });

  const userMap = sharedContext?.userMap ?? (await getUserMap());
  const now =
    Number.isFinite(sharedContext?.nowMs) ? sharedContext.nowMs :
    Number.isFinite(nowMs) ? nowMs :
    Date.now();

  const topN = Math.max(1, Math.trunc(Number(top_n) || 10));

  const rows = openDeals.map((d) => {
    const uid =
      typeof d.user_id === "object" ? d.user_id?.id ?? null : d.user_id ?? null;

    const risk = computeRiskScore(d, now);

    return {
      id: d.id,
      title: d.title || "",
      risk_score: risk.score,
      risk_reasons: risk.reasons,
      stale_days: risk.stale_days,
      probability: risk.probability,
      value: typeof d.value === "number" ? d.value : 0,
      currency: d.currency || null,
      expected_close_date: d.expected_close_date || null,
      next_activity_date: d.next_activity_date || null,
      next_activity_time: d.next_activity_time || null,
      stage_id: typeof d.stage_id === "number" ? d.stage_id : null,
      owner_id: uid ?? null,
      owner_name: uid != null ? userMap?.[uid] || null : null,
      update_time: d.update_time || null,
      add_time: d.add_time || null,
    };
  });

  rows.sort((a, b) => {
    if ((b.risk_score || 0) !== (a.risk_score || 0)) {
      return (b.risk_score || 0) - (a.risk_score || 0);
    }
    return (b.value || 0) - (a.value || 0);
  });

  return {
    ok: true,
    intent: "topRiskDeals",
    datos: {
      validacion_universo: validation,
      total_evaluados: rows.length,
      deals: rows.slice(0, topN),
      alertas: validation.alertas,
    },
  };
}

module.exports = { topRiskDeals };
