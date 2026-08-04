const { crmTool } = require("./crmTool");
const { callCrmRouter } = require("./callCrmRouter");

function result(id, value) {
  return { jsonrpc: "2.0", id, result: value };
}

function error(id, code, message, data) {
  const payload = { code, message };
  if (data !== undefined) payload.data = data;
  return { jsonrpc: "2.0", id: id ?? null, error: payload };
}

async function handleRequest(req, message) {
  const { id, method, params } = message || {};

  if (method === "initialize") {
    return result(id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "nexusg-crm", version: "1.0.0" },
    });
  }

  if (method === "notifications/initialized") return null;
  if (method === "ping") return result(id, {});
  if (method === "tools/list") return result(id, { tools: [crmTool] });

  if (method === "tools/call") {
    if (params?.name !== crmTool.name) return error(id, -32602, "Tool no encontrada");
    const routed = await callCrmRouter(req, params.arguments || {});
    const text = JSON.stringify(routed.payload);
    return result(id, {
      content: [{ type: "text", text }],
      structuredContent: routed.payload,
      isError: !routed.ok,
    });
  }

  return error(id, -32601, "Método no encontrado");
}

module.exports = { error, handleRequest };
