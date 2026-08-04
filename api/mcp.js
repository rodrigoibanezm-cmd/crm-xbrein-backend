const { error, handleRequest } = require("../lib/mcp/protocol");

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const sameHost = host && new URL(origin).host === host;
  const defaults = [
    "https://chatgpt.com",
    "https://chat.openai.com",
    "https://platform.openai.com",
  ];
  const configured = (process.env.MCP_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return sameHost || defaults.includes(origin) || configured.includes(origin);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (!originAllowed(req)) {
    return res.status(403).json(error(null, -32000, "Origin no permitido"));
  }

  if (req.method === "GET") {
    return res.status(405).json(error(null, -32000, "SSE no habilitado"));
  }

  if (req.method !== "POST") {
    return res.status(405).json(error(null, -32600, "Método HTTP no permitido"));
  }

  try {
    const message = req.body;
    if (!message || message.jsonrpc !== "2.0" || !message.method) {
      return res.status(400).json(error(message?.id, -32600, "Solicitud JSON-RPC inválida"));
    }

    const response = await handleRequest(req, message);
    if (!response) return res.status(202).end();

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json(error(req.body?.id, -32603, "Error interno MCP", err.message));
  }
};
