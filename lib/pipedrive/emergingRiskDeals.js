const { fetchAllDeals, countDealsByStatus } = require("./pagination");
const { buildUniverseValidation } = require("./universeValidation");

const DAY_MS = 24 * 60 * 60 * 1000;

function parseTimeMs(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  return Math.max(min, Math.min(max, safe));
}

function riskAt(deal, now) {
  let score = 0;
  const reasons = [];
  const updateMs = parseTimeMs(deal.update_time) ?? parseTimeMs(deal.add_time);
  const staleDays = updateMs == null ? null : Math.max(0, Math.floor((now - updateMs) / DAY_MS));
  const probabilityRaw = Number(deal.probability);
  const probability = Number.isFinite(probabilityRaw)
    ? Math.max(0, Math.min(100, probabilityRaw))
    : null;

  if (staleDays != null) {
    if (staleDays >= 30) {
      score += 30;
      reasons.push("muy estancado");
    } else if (staleDays >= 14) {
      score += 18;
      reasons.push("estancado");
    } else if (staleDays >= 7) score += 8;
  }

  if (!deal.next_activity_date && !deal.next_activity_time) {
    score += 20;
    reasons.push("sin próxima actividad");
  }

  const closeMs = parseTimeMs(deal.expected_close_date);
  if (closeMs == null) {
    score += 12;
    reasons.push("sin fecha estimada de cierre");
  } else {
    const diffDays = Math.floor((closeMs - now) / DAY_MS);
    if (diffDays < 0) {
      score += 25;
      reasons.push("fecha de cierre vencida");
    } else if (diffDays <= 7) score += 10;
  }

  if (probability >= 80 && staleDays >= 14) {
    score += 35;
    reasons.push("probabilidad alta con seguimiento débil");
  } else if (probability >= 60 && staleDays >= 14) score += 20;

  return { score, reasons, stale_days: staleDays, probability };
}

async function emergingRiskDeals({ pipeline_id, getUserMap, horizon_days, top_n, nowMs }) {
  const sourceCount = await countDealsByStatus("open", pipeline_id);
  const deals = await fetchAllDeals("open", pipeline_id, 20000);
  const validation = buildUniverseValidation({
    source_count: sourceCount,
    raw_count: deals.length,
    normalized_count: deals.length,
  });
  const userMap = await getUserMap();
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const horizonDays = clampInt(horizon_days, 30, 1, 365);
  const topN = clampInt(top_n, 10, 1, 50);
  const future = now + horizonDays * DAY_MS;

  const rows = deals
    .map((deal) => {
      const current = riskAt(deal, now);
      const projected = riskAt(deal, future);
      const delta = projected.score - current.score;
      if (delta <= 0 || current.score >= 60) return null;
      const uid = typeof deal.user_id === "object" ? deal.user_id?.id ?? null : deal.user_id ?? null;
      return {
        id: deal.id,
        title: deal.title || "",
        current_risk_score: current.score,
        projected_risk_score: projected.score,
        risk_increase: delta,
        emerging_reasons: projected.reasons.filter((reason) => !current.reasons.includes(reason)),
        stale_days_now: current.stale_days,
        stale_days_projected: projected.stale_days,
        probability: current.probability,
        value: typeof deal.value === "number" ? deal.value : 0,
        currency: deal.currency || null,
        expected_close_date: deal.expected_close_date || null,
        next_activity_date: deal.next_activity_date || null,
        stage_id: typeof deal.stage_id === "number" ? deal.stage_id : null,
        owner_id: uid,
        owner_name: uid != null ? userMap?.[uid] || null : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.risk_increase - a.risk_increase || b.projected_risk_score - a.projected_risk_score || b.value - a.value);

  return {
    ok: true,
    intent: "emergingRiskDeals",
    datos: {
      horizonte_dias: horizonDays,
      validacion_universo: validation,
      total_evaluados: deals.length,
      total_riesgo_emergente: rows.length,
      deals: rows.slice(0, topN),
      alertas: validation.alertas,
    },
  };
}

module.exports = { emergingRiskDeals };
