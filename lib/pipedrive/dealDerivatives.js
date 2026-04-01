// /lib/pipedrive/dealDerivatives.js

function daysBetweenMs(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const diff = Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));
  return diff < 0 ? 0 : diff;
}

function getBaseActivityTimeMs(deal) {
  if (!deal || typeof deal !== "object") return null;
  return deal.update_time_ms ?? deal.add_time_ms ?? null;
}

function getStaleDays(deal, nowMs) {
  const baseMs = getBaseActivityTimeMs(deal);
  if (!Number.isFinite(baseMs) || !Number.isFinite(nowMs)) return null;
  return daysBetweenMs(baseMs, nowMs);
}

function getCycleDaysToWon(deal) {
  if (!deal || typeof deal !== "object") return null;
  return daysBetweenMs(deal.add_time_ms, deal.won_time_ms);
}

function getDaysToExpectedClose(deal, nowMs) {
  if (!deal || typeof deal !== "object") return null;
  if (!Number.isFinite(deal.expected_close_time_ms) || !Number.isFinite(nowMs)) return null;
  return Math.floor((deal.expected_close_time_ms - nowMs) / (1000 * 60 * 60 * 24));
}

function hasOverdueExpectedClose(deal, nowMs) {
  const days = getDaysToExpectedClose(deal, nowMs);
  return days !== null && days < 0;
}

function getDealDerivatives(deal, nowMs) {
  const base_activity_time_ms = getBaseActivityTimeMs(deal);
  const stale_days = getStaleDays(deal, nowMs);
  const cycle_days_to_won = getCycleDaysToWon(deal);
  const days_to_expected_close = getDaysToExpectedClose(deal, nowMs);

  return {
    base_activity_time_ms,
    stale_days,
    cycle_days_to_won,
    days_to_expected_close,
    has_overdue_expected_close:
      days_to_expected_close !== null && days_to_expected_close < 0,
    has_expected_close_date: Number.isFinite(deal?.expected_close_time_ms),
    has_next_activity: Boolean(deal?.has_next_activity),
  };
}

module.exports = {
  daysBetweenMs,
  getBaseActivityTimeMs,
  getStaleDays,
  getCycleDaysToWon,
  getDaysToExpectedClose,
  hasOverdueExpectedClose,
  getDealDerivatives,
};
