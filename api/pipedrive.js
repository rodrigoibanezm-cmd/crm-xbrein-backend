const { pipedriveRequest } = require("../lib/pipedriveClient");

async function getStageMap() {
  try {
    const r = await pipedriveRequest("GET", "/stages", {});
    const stages = r.data || [];
    const stageMap = {};
    for (const s of stages) {
      stageMap[s.id] = {
        name: s.name,
        pipeline_name: s.pipeline_name || "(Sin nombre)",
      };
    }
    return stageMap;
  } catch (err) {
    console.error("Error obteniendo stages:", err.message);
    return {};
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  const {
    action,
    dealId,
    stageId,
    activityData,
    noteText,
    limit,
    status,
    term,
    dealData,
    pipeline_id,
  } = req.body || {};
  let fields = req.body?.fields || ["id", "title"];

  try {
    switch (action) {
      case "listDeals": {
        const limitVal = typeof limit === "number" ? limit : 20000;
        const statusVal = status || "open";

        const query = { status: statusVal, limit: limitVal };
        if (pipeline_id) {
          query.pipeline_id = pipeline_id;
        }

        const r = await pipedriveRequest("GET", "/deals", { query });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        const stageMap = await getStageMap();

        const slimDeals = (r.data || []).map((deal) => {
          const clean = {};
          for (const k of fields) clean[k] = deal[k] ?? null;
          if ("stage_id" in clean) {
            clean["stage_name"] = stageMap[clean.stage_id]?.name || "—";
            clean["pipeline_name"] = stageMap[clean.stage_id]?.pipeline_name || null;
          }
          return clean;
        });

        return res.status(200).json({ status: "success", data: slimDeals });
      }

      case "listPipelines": {
        const r = await pipedriveRequest("GET", "/pipelines", {});
        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        const pipelines = (r.data || []).map((p) => ({
          id: p.id,
          name: p.name,
          url_title: p.url_title,
          active: p.active,
          order_nr: p.order_nr,
        }));

        return res.status(200).json({ status: "success", data: pipelines });
      }

      case "listStages": {
        if (!pipeline_id) {
          return res
            .status(400)
            .json({ status: "error", message: "pipeline_id es obligatorio para listStages" });
        }

        const r = await pipedriveRequest("GET", `/stages?pipeline_id=${pipeline_id}`, {});
        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        const stages = (r.data || []).map((s) => ({
          id: s.id,
          name: s.name,
          pipeline_id: s.pipeline_id,
          order_nr: s.order_nr,
          active_flag: s.active_flag,
        }));

        return res.status(200).json({ status: "success", data: stages });
      }

      case "moveDealToStage": {
        if (!dealId || !stageId) {
          return res.status(400).json({
            status: "error",
            message: "dealId y stageId son obligatorios para moveDealToStage",
          });
        }

        const r = await pipedriveRequest("PUT", `/deals/${dealId}`, {
          body: { stage_id: stageId },
        });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        return res.status(200).json({ status: "success", data: r.data });
      }

      case "createActivity": {
        if (!activityData || typeof activityData !== "object") {
          return res.status(400).json({
            status: "error",
            message: "activityData (objeto) es obligatorio para createActivity",
          });
        }

        const r = await pipedriveRequest("POST", "/activities", { body: activityData });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        return res.status(200).json({ status: "success", data: r.data });
      }

      case "addNoteToDeal": {
        if (!dealId || !noteText) {
          return res.status(400).json({
            status: "error",
            message: "dealId y noteText son obligatorios para addNoteToDeal",
          });
        }

        const r = await pipedriveRequest("POST", "/notes", {
          body: { deal_id: dealId, content: noteText },
        });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        return res.status(200).json({ status: "success", data: r.data });
      }

      case "searchDeals": {
        if (!term) {
          return res
            .status(400)
            .json({ status: "error", message: "term es obligatorio para searchDeals" });
        }

        const query = {
          term,
          fields: "title",
          exact_match: false,
        };

        const r = await pipedriveRequest("GET", "/deals/search", { query });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        const results = (r.data?.items || []).map((item) => ({
          id: item.item?.id,
          title: item.item?.title,
          status: item.item?.status,
          pipeline_id: item.item?.pipeline_id,
          stage_id: item.item?.stage_id,
        }));

        return res.status(200).json({ status: "success", data: results });
      }

      case "getDeal": {
        if (!dealId) {
          return res
            .status(400)
            .json({ status: "error", message: "dealId es obligatorio para getDeal" });
        }

        const r = await pipedriveRequest("GET", `/deals/${dealId}`, {});

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        return res.status(200).json({ status: "success", data: r.data });
      }

      case "updateDeal": {
        if (!dealId || !dealData || typeof dealData !== "object") {
          return res.status(400).json({
            status: "error",
            message: "dealId y dealData (objeto) son obligatorios para updateDeal",
          });
        }

        const r = await pipedriveRequest("PUT", `/deals/${dealId}`, {
          body: dealData,
        });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        return res.status(200).json({ status: "success", data: r.data });
      }

      case "createDeal": {
        if (!dealData || typeof dealData !== "object") {
          return res
            .status(400)
            .json({ status: "error", message: "dealData (objeto) es obligatorio para createDeal" });
        }

        const r = await pipedriveRequest("POST", "/deals", {
          body: dealData,
        });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        return res.status(200).json({ status: "success", data: r.data });
      }

      case 'analyzePipeline': {
  try {
    const [openRes, wonRes, lostRes] = await Promise.all([
      pipedriveRequest('GET', '/deals', { status: 'open', limit: 20000 }),
      pipedriveRequest('GET', '/deals', { status: 'won', limit: 20000 }),
      pipedriveRequest('GET', '/deals', { status: 'lost', limit: 20000 }),
    ]);

    const total_abiertos = Array.isArray(openRes.data) ? openRes.data.length : 0;
    const total_ganados = Array.isArray(wonRes.data) ? wonRes.data.length : 0;
    const total_perdidos = Array.isArray(lostRes.data) ? lostRes.data.length : 0;

    const data = { total_abiertos, total_ganados, total_perdidos };

    return res.status(200).json({
      status: 'success',
      message: 'OK',
      ok: true,
      conexion_ok: true,
      datos: data,
      data,
    });
  } catch (error) {
    console.error('Error analyzePipeline Xbrein:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error al analizar pipeline',
    });
  }
}


      default:
        return res.status(400).json({ status: "error", message: `Accion desconocida: ${action}` });
    }
  } catch (err) {
    return res
      .status(500)
      .json({ status: "error", message: err.message || "Error interno pipedrive.js" });
  }
};

