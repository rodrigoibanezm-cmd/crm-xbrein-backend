function buildBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) throw new Error("Host no disponible");
  return `${proto}://${host}`;
}

async function callCrmRouter(req, args) {
  const response = await fetch(`${buildBaseUrl(req)}/api/crm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = { ok: false, message: "Respuesta inválida de /api/crm" };
  }

  return { ok: response.ok, status: response.status, payload };
}

module.exports = { callCrmRouter };
