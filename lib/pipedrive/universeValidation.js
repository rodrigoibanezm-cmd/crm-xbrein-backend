// /lib/pipedrive/universeValidation.js

function normalizeNonNegativeInteger(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function buildUniverseValidation({
  source_count,
  raw_count,
  normalized_count,
}) {
  const source = normalizeNonNegativeInteger(source_count);
  const raw = normalizeNonNegativeInteger(raw_count);
  const normalized = normalizeNonNegativeInteger(normalized_count);

  const alertas = [];

  if (source === null) {
    alertas.push("No se pudo validar universo: source_count inválido o ausente.");
  }

  if (raw === null) {
    alertas.push("No se pudo validar universo: raw_count inválido o ausente.");
  }

  if (normalized === null) {
    alertas.push("No se pudo validar universo: normalized_count inválido o ausente.");
  }

  let discarded_count = null;
  if (raw !== null && normalized !== null) {
    if (normalized > raw) {
      alertas.push(
        `Anomalía de normalización: normalized_count=${normalized} es mayor que raw_count=${raw}.`
      );
    } else {
      discarded_count = raw - normalized;
    }
  }

  const universo_completo_raw =
    source !== null && raw !== null ? raw === source : null;

  const universo_completo_normalized =
    source !== null && normalized !== null ? normalized === source : null;

  if (source !== null && raw !== null && raw !== source) {
    alertas.push(
      `Inconsistencia de extracción: source_count=${source} vs raw_count=${raw}.`
    );
  }

  if (raw !== null && normalized !== null && normalized !== raw) {
    alertas.push(
      `Registros descartados por normalización: raw_count=${raw} vs normalized_count=${normalized}.`
    );
  }

  if (source !== null && normalized !== null && normalized !== source) {
    alertas.push(
      `Inconsistencia de universo normalizado: source_count=${source} vs normalized_count=${normalized}.`
    );
  }

  return {
    source_count: source,
    raw_count: raw,
    normalized_count: normalized,
    discarded_count,
    universo_completo_raw,
    universo_completo_normalized,
    alertas,
  };
}

module.exports = { buildUniverseValidation };
