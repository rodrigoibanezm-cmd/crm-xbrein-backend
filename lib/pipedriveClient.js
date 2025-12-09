const BASE_URL = process.env.PIPEDRIVE_BASE_URL;
const API_TOKEN = process.env.PIPEDRIVE_API_TOKEN;

async function pipedriveRequest(method, endpoint, options = {}) {
  const { query = {}, body = null } = options || {};

  if (!BASE_URL || !API_TOKEN) {
    return {
      status: "error",
      message: "Pipedrive env vars missing (PIPEDRIVE_BASE_URL / PIPEDRIVE_API_TOKEN)",
      data: null,
    };
  }

  const url = new URL(endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`);

  url.searchParams.set("api_token", API_TOKEN);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  }

  const fetchOptions = {
    method: method.toUpperCase(),
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body && method.toUpperCase() !== "GET") {
    fetchOptions.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url.toString(), fetchOptions);
    const json = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        status: "error",
        message:
          (json && (json.error || json.error_info || json.message)) ||
          `HTTP ${response.status}`,
        data: json,
      };
    }

    return {
      status: "success",
      message: "OK",
      data: json && json.data !== undefined ? json.data : json,
    };
  } catch (error) {
    return {
      status: "error",
      message: error.message || "Error en llamada a Pipedrive",
      data: null,
    };
  }
}

module.exports = {
  pipedriveRequest,
};
