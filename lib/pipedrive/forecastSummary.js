// /lib/pipedrive/forecastSummary.js

const { fetchAllDeals, countDealsByStatus } = require("./pagination");
const { normalizeDeal } = require("./normalizeDeal");
const { getDaysToExpectedClose } = require("./dealDerivatives");
const { buildUniverseValidation } = require("./universeValidation");

function normalizePositiveInteger(value, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.trunc(n);
  return v > 0 ? v : fallback;
}

function buildCurrencySummary(deals, nowMs, d7, d30) {
  const byCurrency = {};

  for (const deal of deals) {
    const currency = deal.currency || "UNKNOWN";
    if (!byCurrency[currency]) {
      byCurrency[currency] = {
        currency,
        open_value: 0,
        weighted_value: 0,
        due_7d_value: 0,
        due_30d_value: 0,
        count: 0,
      };
    }

    const row = byCurrency[currency];
    row.count += 1;

    const value = typeof deal.value === "number" ? deal.value : null;
    const probability = typeof deal.probability === "number" ? deal.probability : null;
    const days_to_expected_close = getDaysToExpectedClose(deal, nowMs);

    if (value !== null) {
      row.open_value += value;

      if (probability !== null) {
        row.weighted_value += value * (probability / 100);
      }

      if (typeof days_to_expected_close === "number" && days_to_expected_close >= 0) {
        if (days_to_expected_close <= d7) {
          row.due_7d_value += value;
        }
        if (days_to_expected_close <= d30) {
          row.due_30d_value += value;
        }
      }
    }
  }

  return Object.values(byCurrency).sort((a, b) => a.currency.localeCompare(b.currency));
}

async function forecastSummary({
  pipeline_id,
  nowMs,
  days7 = 7,
  days30 = 30,
}) {
  const source_count = await countDealsByStatus("open", pipeline_id);
  const openDealsRaw = await fetchAllDeals("open", pipeline_id, 20000);

  const normalizedDeals = openDealsRaw.map(normalizeDeal);
  const openDeals = normalizedDeals.filter((d) => d !== null);

  const validation = buildUniverseValidation({
    source_count,
    raw_count: openDealsRaw.length,
    normalized_count: openDeals.length,
  });

  const runtimeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const d7 = normalizePositiveInteger(days7, 7);
  const d30Base = normalizePositiveInteger(days30, 30);
  const d30 = d30Base < d7 ? d7 : d30Base;

  let open_value_total = 0;
  let weighted_value_total = 0;

  let due_7d_count = 0;
  let due_7d_value = 0;
  let due_30d_count = 0;
  let due_30d_value = 0;

  let with_probability_count = 0;
  let missing_probability_count = 0;
  let with_expected_close_count = 0;
  let missing_expected_close_count = 0;

  for (const deal of openDeals) {
    const value = typeof deal.value === "number" ? deal.value : null;
    const probability = typeof deal.probability === "number" ? deal.probability : null;
    const days_to_expected_close = getDaysToExpectedClose(deal, runtimeNowMs);

    if (value !== null) {
      open_value_total += value;
    }

    if (probability !== null) {
      with_probability_count += 1;
      if (value !== null) {
        weighted_value_total += value * (probability / 100);
      }
    } else {
      missing_probability_count += 1;
    }

    if (deal.has_expected_close_date) {
      with_expected_close_count += 1;
    } else {
      missing_expected_close_count += 1;
    }

    if (typeof days_to_expected_close === "number" && days_to_expected_close >= 0) {
      if (days_to_expected_close <= d7) {
        due_7d_count += 1;
        if (value !== null) due_7d_value += value;
      }

      if (days_to_expected_close <= d30) {
        due_30d_count += 1;
        if (value !== null) due_30d_value += value;
      }
    }
  }

  return {
    ok: true,
    intent: "forecastSummary",
    datos: {
      validacion_universo: validation,
      resumen: {
        total_open_deals: openDeals.length,
        open_value_total,
        weighted_value_total,
        due_7d_count,
        due_7d_value,
        due_30d_count,
        due_30d_value,
        with_probability_count,
        missing_probability_count,
        with_expected_close_count,
        missing_expected_close_count,
        days7: d7,
        days30: d30,
      },
      by_currency: buildCurrencySummary(openDeals, runtimeNowMs, d7, d30),
      alertas: validation.alertas,
    },
  };
}

module.exports = { forecastSummary };
