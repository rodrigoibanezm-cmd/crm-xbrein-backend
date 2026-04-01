// /lib/pipedrive/dealsByOwner.js

const { fetchAllDeals, countDealsByStatus } = require("./pagination");

async function dealsByOwner({ pipeline_id, getUserMap }) {
  const open_count = await countDealsByStatus("open", pipeline_id);
  const openDeals = await fetchAllDeals("open", pipeline_id, 20000);

  const detalle_count = openDeals.length;
  const universo_completo = detalle_count === open_count;

  const userMap = await getUserMap();

  const byOwner = {};
  let currency = null;
  let currencyMixed = false;

  for (const d of openDeals) {
    const uid =
      typeof d.user_id === "object" ? d.user_id?.id ?? null : d.user_id ?? null;

    const owner_id = uid ?? null;
    const owner_name = owner_id != null ? userMap?.[owner_id] || null : null;
    const key = String(owner_id ?? "null");

    if (!byOwner[key]) {
      byOwner[key] = {
        owner_id,
        owner_name,
        count: 0,
        totalValue: 0,
      };
    }

    byOwner[key].count += 1;

    const value = typeof d.value === "number" ? d.value : 0;
    byOwner[key].totalValue += value;

    if (d.currency) {
      if (currency === null) currency = d.currency;
      else if (currency !== d.currency) currencyMixed = true;
    }
  }

  const rows = Object.values(byOwner).sort((a, b) => {
    if ((b.totalValue || 0) !== (a.totalValue || 0)) {
      return (b.totalValue || 0) - (a.totalValue || 0);
    }
    return (b.count || 0) - (a.count || 0);
  });

  const alertas = [];

  if (!universo_completo) {
    alertas.push(
      `Inconsistencia de universo: open_count=${open_count} vs detalle_count=${detalle_count}.`
    );
  }

  if (currencyMixed) {
    currency = null;
    alertas.push("Hay múltiples monedas en los negocios abiertos.");
  }

  return {
    ok: true,
    intent: "dealsByOwner",
    datos: {
      validacion_universo: {
        open_count,
        detalle_count,
        universo_completo,
      },
      currency,
      byOwner: rows,
      alertas,
    },
  };
}

module.exports = { dealsByOwner };
