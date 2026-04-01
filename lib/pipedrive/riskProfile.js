// /lib/pipedrive/riskProfile.js

function toSeverity(level) {
  if (level >= 3) return "high";
  if (level === 2) return "medium";
  if (level === 1) return "low";
  return "none";
}

function buildExposureProfile(dimensions) {
  let level = 0;

  if (dimensions?.exposure?.high_value) level = 3;
  else if (dimensions?.exposure?.medium_value) level = 2;
  else if (dimensions?.exposure?.has_value) level = 1;

  return {
    level: toSeverity(level),
    value: dimensions?.exposure?.value ?? null,
    flags: {
      high_value: dimensions?.exposure?.high_value === true,
      medium_value: dimensions?.exposure?.medium_value === true,
      has_value: dimensions?.exposure?.has_value === true,
    },
  };
}

function buildTimingProfile(dimensions) {
  let level = 0;

  if (dimensions?.timing?.stale_critical || dimensions?.timing?.overdue_expected_close) {
    level = 3;
  } else if (dimensions?.timing?.stale_high) {
    level = 2;
  } else if (
    dimensions?.timing?.stale_medium ||
    dimensions?.timing?.close_due_soon
  ) {
    level = 1;
  }

  return {
    level: toSeverity(level),
    stale_days: dimensions?.timing?.stale_days ?? null,
    days_to_expected_close: dimensions?.timing?.days_to_expected_close ?? null,
    flags: {
      stale_critical: dimensions?.timing?.stale_critical === true,
      stale_high: dimensions?.timing?.stale_high === true,
      stale_medium: dimensions?.timing?.stale_medium === true,
      overdue_expected_close: dimensions?.timing?.overdue_expected_close === true,
      close_due_soon: dimensions?.timing?.close_due_soon === true,
    },
  };
}

function buildFollowUpProfile(dimensions) {
  let level = 0;

  if (dimensions?.follow_up?.missing_next_activity) level = 3;
  else if (dimensions?.follow_up?.has_next_activity) level = 0;

  return {
    level: toSeverity(level),
    flags: {
      has_next_activity: dimensions?.follow_up?.has_next_activity === true,
      missing_next_activity: dimensions?.follow_up?.missing_next_activity === true,
    },
  };
}

function buildForecastProfile(dimensions) {
  let level = 0;

  if (dimensions?.forecast?.high_probability) level = 3;
  else if (dimensions?.forecast?.medium_probability) level = 2;
  else if (dimensions?.forecast?.low_probability) level = 1;
  else if (dimensions?.forecast?.has_probability) level = 1;

  return {
    level: toSeverity(level),
    probability: dimensions?.forecast?.probability ?? null,
    flags: {
      has_probability: dimensions?.forecast?.has_probability === true,
      high_probability: dimensions?.forecast?.high_probability === true,
      medium_probability: dimensions?.forecast?.medium_probability === true,
      low_probability: dimensions?.forecast?.low_probability === true,
    },
  };
}

function buildHygieneProfile(dimensions) {
  let level = 0;

  const missing_expected_close_date =
    dimensions?.hygiene?.missing_expected_close_date === true;
  const missing_owner = dimensions?.hygiene?.missing_owner === true;
  const missing_stage = dimensions?.hygiene?.missing_stage === true;
  const missing_value = dimensions?.hygiene?.missing_value === true;
  const missing_probability = dimensions?.hygiene?.missing_probability === true;

  const missingCount = [
    missing_expected_close_date,
    missing_owner,
    missing_stage,
    missing_value,
    missing_probability,
  ].filter(Boolean).length;

  if (missingCount >= 3) level = 3;
  else if (missingCount === 2) level = 2;
  else if (missingCount === 1) level = 1;

  return {
    level: toSeverity(level),
    missing_count: missingCount,
    flags: {
      has_expected_close_date: dimensions?.hygiene?.has_expected_close_date === true,
      missing_expected_close_date,
      missing_owner,
      missing_stage,
      missing_value,
      missing_probability,
    },
  };
}

function buildRiskProfile(dimensions) {
  const exposure = buildExposureProfile(dimensions);
  const timing = buildTimingProfile(dimensions);
  const follow_up = buildFollowUpProfile(dimensions);
  const forecast = buildForecastProfile(dimensions);
  const hygiene = buildHygieneProfile(dimensions);

  const severityRank = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
  };

  const overallRank = Math.max(
    severityRank[exposure.level] || 0,
    severityRank[timing.level] || 0,
    severityRank[follow_up.level] || 0,
    severityRank[forecast.level] || 0,
    severityRank[hygiene.level] || 0
  );

  const overall_level =
    Object.keys(severityRank).find((k) => severityRank[k] === overallRank) || "none";

  return {
    overall_level,
    dimensions: {
      exposure,
      timing,
      follow_up,
      forecast,
      hygiene,
    },
  };
}

module.exports = {
  buildExposureProfile,
  buildTimingProfile,
  buildFollowUpProfile,
  buildForecastProfile,
  buildHygieneProfile,
  buildRiskProfile,
};
