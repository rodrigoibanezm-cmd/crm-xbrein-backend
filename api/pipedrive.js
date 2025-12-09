const { pipedriveRequest } = require("../lib/pipedriveClient");

/* ---------- AUX ---------- */
async function getStageMap() {
  try {
    const r = await pipedriveRequest("GET", "/stages", {});
    const stages = r.data || [];
    const out = {};
    for (const s of stages) {
      out[s.id] = {
        name: s.name,
        pipeline_name: s.pipeline_name || "(Sin nombre)",
      };
    }
    return out;
  } catch {
    return {};
  }
}

async function fetchDealsPage(status, pipeline_id, start, limit) {
  const query = { status, limit, start };
  if (pipeline_id) query.pipeline_id = pipeline_id;
  const r = await pipedriveRequest("GET", "/deals", { query });
  if (r.status === "error") throw new Error(r.message || "Error listando deals");
  return Array.isArray(r.data) ? r.data : [];
}

async function fetchAllDeals(status, pipeline_id, maxTotal) {
  const limit = 500;
  const concurrency = 5;
  let start = 0;
  let more = true;
  const all = [];

  while (more && all.length < maxTotal) {
    const remaining = maxTotal - all.length;
    const pagesThisBatch = Math.min(concurrency, Math.ceil(remaining / limit));

    const calls = [];
    for (let i = 0; i < pagesThisBatch; i++) {
      calls.push(fetchDealsPage(status, pipeline_id, start + i * limit, limit));
    }

    const results = await Promise.all(calls);

    for (const data of results) {
      for (const d of data) {
        if (all.length < maxTotal) all.push(d);
      }
      if (data.length < limit) {
        more = false;
        break;
      }
    }

    start += pagesThisBatch * limit;
  }

  return all;
}

async function countDealsByStatus(status, pipeline_id) {
  const limit = 500;
  const concurrency = 5;
  let start = 0;
  let total = 0;
  let more = true;

  while (more) {
    const calls = [];
    for (let i = 0; i < concurrency; i++) {
      calls.push(fetchDealsPage(status, pipeline_id, start + i * limit, limit));
    }

    const results = await Promise.all(calls);

    for (const data of results) {
      const len = data.length;
      total += len;
      if (len < limit) {
        more = false;
        break;
      }
    }

    start += concurrency * limit;
  }

  return total;
}

function scoreDeal(deal) {
  let score = 0;

  const value = typeof deal.value === "number" ? deal.value : 0;
  if (value >= 50000) score += 25;
  else if (value >= 10000) score += 15;
  else if (value > 0) score += 5;

  const now = Date.now();
  const addTimeStr = deal.add_time;
  if (addTimeStr) {
    const t = new Date(addTimeStr).getTime();
    if (!Number.isNaN(t)) {
      const diffDays = (now - t) / (1000 * 60 * 60 * 24);
      if (diffDays <= 7) score += 25;
      else if (diffDays <= 30) score += 15;
      else if (diffDays <= 90) score += 5;
    }
  }

  const nextActivity = deal.next_activity_date || deal.next_activity_time;
  if (nextActivity) score += 20;

  const prob = Math.min(100, score);
  return prob;
}

/* ---------- HANDLER ---------- */
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

  const fields = req.body?.fields || ["id", "title"];

  try {
    switch (action) {

      /* ---------- LIST DEALS (rápido) ---------- */
      case "listDeals": {
        const limitVal = typeof limit === "number" ? limit : 20000;
        const statusVal = status || "open";

        const deals = await fetchAllDeals(statusVal, pipeline_id, limitVal);
        const stageMap = await getStageMap();

        const out = deals.map((d) => {
          const o = {};
          for (const k of fields) o[k] = d[k] ?? null;
          if ("stage_id" in o) {
            o.stage_name = stageMap[o.stage_id]?.name || "—";
            o.pipeline_name = stageMap[o.stage_id]?.pipeline_name || null;
          }
          return o;
        });

        return res.status(200).json({ status: "success", data: out });
      }

      /* ---------- LIST PIPELINES ---------- */
      case "listPipelines": {
        const r = await pipedriveRequest("GET", "/pipelines", {});
        if (r.status === "error") return res.status(500).json(r);
        const out = (r.data || []).map((p) => ({
          id: p.id,
          name: p.name,
          url_title: p.url_title,
          active: p.active,
          order_nr: p.order_nr,
        }));
        return res.status(200).json({ status: "success", data: out });
      }

      /* ---------- LIST STAGES ---------- */
      case "listStages": {
        if (!pipeline_id)
          return res.status(400).json({ status: "error", message: "pipeline_id requerido" });

        const r = await pipedriveRequest("GET", `/stages?pipeline_id=${pipeline_id}`, {});
        if (r.status === "error") return res.status(500).json(r);

        const out = (r.data || []).map((s) => ({
          id: s.id,
          name: s.name,
          pipeline_id: s.pipeline_id,
          order_nr: s.order_nr,
          active_flag: s.active_flag,
        }));

        return res.status(200).json({ status: "success", data: out });
      }

      /* ---------- MOVE DEAL ---------- */
      case "moveDealToStage": {
        if (!dealId || !stageId)
          return res.status(400).json({ status: "error", message: "dealId y stageId requeridos" });

        const r = await pipedriveRequest("PUT", `/deals/${dealId}`, {
          body: { stage_id: stageId },
        });

        if (r.status === "error") return res.status(500).json(r);
        return res.status(200).json({ status: "success", data: r.data });
      }

      /* ---------- CREATE ACTIVITY ---------- */
      case "createActivity": {
        if (!activityData)
          return res.status(400).json({ status: "error", message: "activityData requerido" });

        const r = await pipedriveRequest("POST", "/activities", { body: activityData });
        if (r.status === "error") return res.status(500).json(r);
        return res.status(200).json({ status: "success", data: r.data });
      }

      /* ---------- ADD NOTE ---------- */
      case "addNoteToDeal": {
        if (!dealId || !noteText)
          return res.status(400).json({ status: "error", message: "dealId y noteText requeridos" });

        const r = await pipedriveRequest("POST", "/notes", {
          body: { deal_id: dealId, content: noteText },
        });

        if (r.status === "error") return res.status(500).json(r);
        return res.status(200).json({ status: "success", data: r.data });
      }

      /* ---------- SEARCH DEALS ---------- */
      case "searchDeals": {
        if (!term)
          return res.status(400).json({ status: "error", message: "term requerido" });

        const query = { term, fields: "title", exact_match: false };
        const r = await pipedriveRequest("GET", "/deals/search", { query });

        if (r.status === "error") return res.status(500).json(r);

        const out = (r.data?.items || []).map((x) => ({
          id: x.item?.id,
          title: x.item?.title,
          status: x.item?.status,
          pipeline_id: x.item?.pipeline_id,
          stage_id: x.item?.stage_id,
        }));

        return res.status(200).json({ status: "success", data: out });
      }

      /* ---------- GET DEAL ---------- */
      case "getDeal": {
        if (!dealId)
          return res.status(400).json({ status: "error", message: "dealId requerido" });

        const r = await pipedriveRequest("GET", `/deals/${dealId}`, {});
        if (r.status === "error") return res.status(500).json(r);
        return res.status(200).json({ status: "success", data: r.data });
      }

      /* ---------- UPDATE DEAL ---------- */
      case "updateDeal": {
        if (!dealId || !dealData)
          return res.status(400).json({ status: "error", message: "dealId y dealData requeridos" });

        const r = await pipedriveRequest("PUT", `/deals/${dealId}`, {
          body: dealData,
        });

        if (r.status === "error") return res.status(500).json(r);
        return res.status(200).json({ status: "success", data: r.data });
      }

      /* ---------- CREATE DEAL ---------- */
      case "createDeal": {
        if (!dealData)
          return res.status(400).json({ status: "error", message: "dealData requerido" });

        const r = await pipedriveRequest("POST", "/deals", { body: dealData });
        if (r.status === "error") return res.status(500).json(r);
        return res.status(200).json({ status: "success", data: r.data });
      }

      /* ---------- ANALYZE PIPELINE (rápido) ---------- */
      case "analyzePipeline": {
        try {
          const [open, won, lost] = await Promise.all([
            countDealsByStatus("open", pipeline_id),
            countDealsByStatus("won", pipeline_id),
            countDealsByStatus("lost", pipeline_id),
          ]);

          const data = {
            total_abiertos: open,
            total_ganados: won,
            total_perdidos: lost,
          };

          return res.status(200).json({
            status: "success",
            message: "OK",
            ok: true,
            conexion_ok: true,
            datos: data,
            data,
          });
        } catch {
          return res.status(500).json({
            status: "error",
            message: "Error al analizar pipeline",
          });
        }
      }

      /* ---------- EXTRACT FULL DEALS (ML) ---------- */
      case "extractFullDeals": {
        try {
          const statusVal = status || undefined;
          const all = await fetchAllDeals(statusVal, pipeline_id, 200000);

          return res.status(200).json({
            status: "success",
            total: all.length,
            data: all,
          });
        } catch {
          return res.status(500).json({
            status: "error",
            message: "Error al extraer deals completos",
          });
        }
      }

      /* ---------- SCORE DEALS (heurístico) ---------- */
      case "scoreDeals": {
        try {
          const statusVal = status || "open";
          const maxDeals = typeof limit === "number" ? limit : 5000;

          const deals = await fetchAllDeals(statusVal, pipeline_id, maxDeals);

          const scored = deals.map((d) => {
            const s = scoreDeal(d);
            return {
              id: d.id,
              title: d.title,
              value: d.value,
              currency: d.currency,
              status: d.status,
              pipeline_id: d.pipeline_id,
              stage_id: d.stage_id,
              user_id: d.user_id,
              add_time: d.add_time,
              next_activity_date: d.next_activity_date,
              next_activity_time: d.next_activity_time,
              score: s,
            };
          });

          scored.sort((a, b) => b.score - a.score);

          return res.status(200).json({
            status: "success",
            total: scored.length,
            data: scored,
          });
        } catch (err) {
          return res.status(500).json({
            status: "error",
            message: err.message || "Error al calcular score de deals",
          });
        }
      }

      /* ---------- DEFAULT ---------- */
      default:
        return res.status(400).json({
          status: "error",
          message: `Accion desconocida: ${action}`,
        });
    }
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err.message || "Error interno pipedrive.js",
    });
  }
};
