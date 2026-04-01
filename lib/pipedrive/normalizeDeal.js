// /lib/pipedrive/normalizeDeal.js

function parseDateTimeMs(value) {
  if (!value || typeof value !== "string") return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function parseDateOnlyToUtcMs(value) {
  if (!value || typeof value !== "string") return null;

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const utcMs = Date.UTC(year, month - 1, day);
  const d = new Date(utcMs);

  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }

  return utcMs;
}

function normalizeStrictNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function normalizeIntegerId(value) {
  const n = normalizeStrictNumber(value);
  if (n === null) return null;
  if (!Number.isInteger(n)) return null;
  return n;
}

function normalizeStatus(value) {
  if (typeof value !== "string") return null;
  const s = value.trim().toLowerCase();
  return s === "open" || s === "won" || s === "lost" ? s : null;
}

function normalizeCurrency(value) {
  if (typeof value !== "string") return null;
  const s = value.trim().toUpperCase();
  if (!s) return null;
  if (!/^[A-Z]{3}$/.test(s)) return null;
  return s;
}

function normalizeTitle(value) {
  if (typeof value !== "string") return "";
  const s = value.trim();
  return s;
}

function normalizeProbability(value) {
  const n = normalizeStrictNumber(value);
  if (n === null) return null;
  return Math.max(0, Math.min(100, n));
}

function extractOwnerId(user_id) {
  if (user_id && typeof user_id === "object") {
    return normalizeIntegerId(user_id.id);
  }
  return normalizeIntegerId(user_id);
}

function normalizeDeal(deal) {
  if (!deal || typeof deal !== "object") {
    return null;
  }

  const expected_close_time_ms = parseDateOnlyToUtcMs(deal.expected_close_date);

  const next_activity_date =
    typeof deal.next_activity_date === "string" && deal.next_activity_date.trim()
      ? deal.next_activity_date.trim()
      : null;

  const next_activity_time =
    typeof deal.next_activity_time === "string" && deal.next_activity_time.trim()
      ? deal.next_activity_time.trim()
      : null;

  return {
    id: normalizeIntegerId(deal.id),
    title: normalizeTitle(deal.title),
    status: normalizeStatus(deal.status),

    value: normalizeStrictNumber(deal.value),
    currency: normalizeCurrency(deal.currency),

    owner_id: extractOwnerId(deal.user_id),
    stage_id: normalizeIntegerId(deal.stage_id),
    pipeline_id: normalizeIntegerId(deal.pipeline_id),

    probability: normalizeProbability(deal.probability),

    add_time: typeof deal.add_time === "string" && deal.add_time.trim() ? deal.add_time.trim() : null,
    update_time:
      typeof deal.update_time === "string" && deal.update_time.trim()
        ? deal.update_time.trim()
        : null,
    won_time: typeof deal.won_time === "string" && deal.won_time.trim() ? deal.won_time.trim() : null,

    add_time_ms: parseDateTimeMs(deal.add_time),
    update_time_ms: parseDateTimeMs(deal.update_time),
    won_time_ms: parseDateTimeMs(deal.won_time),

    expected_close_date: expected_close_time_ms === null ? null : deal.expected_close_date.trim(),
    expected_close_time_ms,
    has_expected_close_date: expected_close_time_ms !== null,

    next_activity_date,
    next_activity_time,
    has_next_activity: next_activity_date !== null || next_activity_time !== null,
  };
}

module.exports = {
  parseDateTimeMs,
  parseDateOnlyToUtcMs,
  normalizeDeal,
};
