// /lib/pipedrive/staleDeals.js

const { fetchAllDeals, countDealsByStatus } = require("./pagination");

function parseTimeMs(s) {
  if (!s) return null;
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return null;
  return t;
}

async function staleDeals({ pipeline_id, getUserMap, days = 14, top_n = 20 }) {
  const open_count = await countDealsByStatus("open", pipeline_id);
  const openDeals = await fetchAllDeals("open", pipeline_id, 20000);

  const detalle_count = openDeals.length;
  const universo_completo = detalle_count === open_count;

  const userMap = await getUserMap();
  const now = Date.now();
  const minDays = Math.max(1, Math.trunc(Number(days) || 14));
  const topN = Math.max(1, Math.trunc(Number(top_n) || 20));

  const rows = [];

  for (const d of openDeals) {
    const tUpdate = parseTimeMs(d.update_time);
    const tAdd = parseTimeMs(d.add_time);
    const base = tUpdate ?? tAdd;

    let stale_days = 0;
    if (base) {
      stale_days = Math.floor((now - base) / (1000 * 60 * 60 * 24));
      if (stale_days < 0) stale_days = 0;
    }

    if (stale_days < minDays) continue;

    const uid =
      typeof d.user_id === "object" ? d.user_id?.id ?? null : d.user_id ?? null;

    rows.push({
      id: d.id,
      title: d.title || "",
      stale_days,
      value: typeof d.value === "number" ? d.value : 0,
      currency: d.currency || null,
      stage_id: typeof d.stage_id === "number" ? d.stage_id : null,
      owner_id: uid ?? null,
      owner_name: uid != null ? userMap?.[uid] || null : null,
      update_time: d.update_time || null,
      add_time: d.add_time || null,
    });
  }

  rows.sort((a, b) => {
    if ((b.stale_days || 0) !== (a.stale_days || 0)) {
      return (b.stale_days || 0) - (a.stale_days || 0);
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
    intent: "staleDeals",
    datos: {
      validacion_universo: {
        open_count,
        detalle_count,
        universo_completo,
      },
      threshold_days: minDays,
      total_stale_deals: rows.length,
      deals: rows.slice(0, topN),
      alertas,
    },
  };
}

module.exports = { staleDeals };
