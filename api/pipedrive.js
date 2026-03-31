const { pipedriveRequest } = require("../lib/pipedriveClient");
const {
  fetchDealsPageMeta,
  fetchAllDeals,
  countDealsByStatus,
} = require("../lib/pipedrive/pagination");

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

async function getUserMap() {
  try {
    const r = await pipedriveRequest("GET", "/users", {});
    const users = r.data || [];
    const out = {};
    for (const u of users) out[u.id] = u.name || u.email || null;
    return out;
  } catch {
    return {};
  }
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

  return Math.min(100, score);
}

function clampInt(x, def, min, max) {
  const raw = typeof x === "number" ? x : Number(x);
  const n = Number.isFinite(raw) ? raw : def;
  const v = Math.trunc(n);
  return Math.max(min, Math.min(max, v));
}

function parseTimeMs(s) {
  if (!s) return null;
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return null;
  return t;
}

function upsertTopAging(topArr, item, topN) {
  topArr.push(item);
  topArr.sort((a, b) => (b.aging_days || 0) - (a.aging_days || 0));
  if (topArr.length > topN) topArr.length = topN;
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
    aging_days,
    top_n,
    sample_n,
    maxTotal,
    days7,
    days30,
  } = req.body || {};

  const fields = req.body?.fields;

  try {
    switch (action) {
      case "openDealsStats": {
        const statusVal = status || "open";
        const statuses = statusVal === "all" ? ["open", "won", "lost"] : [statusVal];

        const agingDays = clampInt(aging_days, 30, 1, 365);
        const topN = clampInt(top_n, 20, 1, 50);
        const sampleN = clampInt(sample_n, 0, 0, 200);

        const alertas = [];
        if (statusVal === "all") {
          alertas.push("status=all agregado desde open+won+lost.");
        }
        if (sampleN > 0) {
          alertas.push(
            "sample está deshabilitado por defecto; si se usa, debe ser determinista (pendiente)."
          );
        }

        const stageMap = await getStageMap();

        let count = 0;
        let totalValue = 0;

        const byStageAgg = {};
        const topAging = [];
        const sample = [];

        let currency = null;
        let currencyMixed = false;

        const pageLimit = 500;
        const concurrency = 5;

        for (const st of statuses) {
          let start = 0;
          let more = true;

          while (more) {
            const calls = [];
            for (let i = 0; i < concurrency; i++) {
              calls.push(fetchDealsPageMeta(st, pipeline_id, start + i * pageLimit, pageLimit));
            }

            const results = await Promise.all(calls);

            for (const page of results) {
              for (const d of page.data) {
                count += 1;

                const v = typeof d.value === "number" ? d.value : 0;
                totalValue += v;

                if (d.currency) {
                  if (currency === null) currency = d.currency;
                  else if (currency !== d.currency) currencyMixed = true;
                }

                const sid = typeof d.stage_id === "number" ? d.stage_id : null;
                if (!byStageAgg[sid]) {
                  byStageAgg[sid] = {
                    stageId: sid,
                    stageName: sid ? stageMap[sid]?.name || null : null,
                    count: 0,
                    value: 0,
                  };
                }
                byStageAgg[sid].count += 1;
                byStageAgg[sid].value += v;

                const tUpdate = parseTimeMs(d.update_time);
                const tAdd = parseTimeMs(d.add_time);
                const base = tUpdate ?? tAdd;
                let aging = 0;
                if (base) {
                  aging = Math.floor((Date.now() - base) / (1000 * 60 * 60 * 24));
                  if (aging < 0) aging = 0;
                }

                if (aging >= agingDays) {
                  upsertTopAging(
                    topAging,
                    {
                      id: d.id,
                      title: d.title || "",
                      aging_days: aging,
                      value: typeof d.value === "number" ? d.value : null,
                      stage_id: typeof d.stage_id === "number" ? d.stage_id : null,
                      owner_id:
                        typeof d.user_id === "object" ? d.user_id?.id ?? null : d.user_id ?? null,
                      update_time: d.update_time || null,
                    },
                    topN
                  );
                }
              }
            }

            if (results.some((x) => !x.more)) more = false;
            start += concurrency * pageLimit;
          }
        }

        if (currencyMixed) {
          currency = null;
          alertas.push(
            "Hay múltiples monedas en el universo; totalValue es suma nominal (currency=null)."
          );
        }

        const byStage = Object.values(byStageAgg).sort((a, b) => {
          const ai = a.stageId ?? Number.MAX_SAFE_INTEGER;
          const bi = b.stageId ?? Number.MAX_SAFE_INTEGER;
          return ai - bi;
        });

        return res.status(200).json({
          ok: true,
          intent: "openDealsStats",
          datos: {
            count,
            totalValue,
            currency,
            byStage,
            topAging,
            sample,
          },
          alertas,
        });
      }

      case "openDealsByOwner": {
        const statusVal = status || "open";
        const hardCap = clampInt(limit, 5000, 1, 20000);

        const deals = await fetchAllDeals(statusVal, pipeline_id, hardCap);
        const userMap = await getUserMap();

        const byOwner = {};
        let currency = null;
        let currencyMixed = false;

        for (const d of deals) {
          const uid =
            typeof d.user_id === "object" ? d.user_id?.id ?? null : d.user_id ?? null;

          const ownerId = uid ?? null;
          const ownerName = ownerId != null ? userMap?.[ownerId] || null : null;
          const key = String(ownerId ?? "null");

          if (!byOwner[key]) {
            byOwner[key] = {
              owner_id: ownerId,
              owner_name: ownerName,
              count: 0,
              totalValue: 0,
            };
          }

          byOwner[key].count += 1;

          const v = typeof d.value === "number" ? d.value : 0;
          byOwner[key].totalValue += v;

          if (d.currency) {
            if (currency === null) currency = d.currency;
            else if (currency !== d.currency) currencyMixed = true;
          }
        }

        const rows = Object.values(byOwner).sort(
          (a, b) => (b.totalValue || 0) - (a.totalValue || 0)
        );

        return res.status(200).json({
          status: "success",
          ok: true,
          intent: "openDealsByOwner",
          datos: {
            status: statusVal,
            pipeline_id: pipeline_id ?? null,
            currency: currencyMixed ? null : currency,
            currencyMixed,
            byOwner: rows,
          },
          data: rows,
          alertas: currencyMixed
            ? ["Hay múltiples monedas; totales nominales por vendedor, currency=null."]
            : [],
        });
      }

      case "forecastByOwner": {
        const statusVal = status || "open";
        const hardCap = clampInt(limit, 5000, 1, 20000);

        let d7 = clampInt(days7, 7, 1, 365);
        let d30 = clampInt(days30, 30, 1, 365);
        if (d30 < d7) d30 = d7;

        const deals = await fetchAllDeals(statusVal, pipeline_id, hardCap);
        const userMap = await getUserMap();

        const byOwner = {};
        let currency = null;
        let currencyMixed = false;

        const now = Date.now();
        const msDay = 24 * 60 * 60 * 1000;

        for (const d of deals) {
          const uid =
            typeof d.user_id === "object" ? d.user_id?.id ?? null : d.user_id ?? null;

          const ownerId = uid ?? null;
          const ownerName = ownerId != null ? userMap?.[ownerId] || null : null;
          const key = String(ownerId ?? "null");

          if (!byOwner[key]) {
            byOwner[key] = {
              owner_id: ownerId,
              owner_name: ownerName,
              count: 0,
              totalValue: 0,
              weightedValue: 0,
              due_7d_count: 0,
              due_7d_value: 0,
              due_30d_count: 0,
              due_30d_value: 0,
              unknown_probability_count: 0,
              unknown_close_date_count: 0,
            };
          }

          const row = byOwner[key];
          row.count += 1;

          const value = typeof d.value === "number" ? d.value : 0;
          row.totalValue += value;

          if (d.currency) {
            if (currency === null) currency = d.currency;
            else if (currency !== d.currency) currencyMixed = true;
          }

          const pRaw = d.probability;
          const pNum = typeof pRaw === "number" ? pRaw : Number(pRaw);
          if (Number.isFinite(pNum)) {
            const p = Math.max(0, Math.min(100, pNum));
            row.weightedValue += value * (p / 100);
          } else {
            row.unknown_probability_count += 1;
          }

          const t = parseTimeMs(d.expected_close_date);
          if (t != null) {
            const diffDays = Math.floor((t - now) / msDay);
            if (diffDays >= 0 && diffDays <= d7) {
              row.due_7d_count += 1;
              row.due_7d_value += value;
            }
            if (diffDays >= 0 && diffDays <= d30) {
              row.due_30d_count += 1;
              row.due_30d_value += value;
            }
          } else {
            row.unknown_close_date_count += 1;
          }
        }

        const rows = Object.values(byOwner).sort(
          (a, b) => (b.weightedValue || 0) - (a.weightedValue || 0)
        );

        return res.status(200).json({
          status: "success",
          ok: true,
          intent: "forecastByOwner",
          datos: {
            status: statusVal,
            pipeline_id: pipeline_id ?? null,
            days7: d7,
            days30: d30,
            currency: currencyMixed ? null : currency,
            currencyMixed,
            byOwner: rows,
          },
          data: rows,
          alertas: currencyMixed
            ? ["Hay múltiples monedas; totales nominales por vendedor, currency=null."]
            : [],
        });
      }

      case "listDeals": {
        if (!Array.isArray(fields) || fields.length < 1) {
          return res.status(400).json({
            status: "error",
            message: "fields requerido (array) para listDeals",
          });
        }

        const limitVal = clampInt(limit, 2000, 1, 5000);
        const statusVal = status || "open";

        const deals = await fetchAllDeals(statusVal, pipeline_id, limitVal);
        const stageMap = await getStageMap();

        const needsOwnerName = fields.includes("owner_name");
        const userMap = needsOwnerName ? await getUserMap() : null;

        const out = deals.map((d) => {
          const o = {};
          for (const k of fields) o[k] = d[k] ?? null;

          if ("stage_id" in o) {
            o.stage_name = stageMap[o.stage_id]?.name || "—";
            o.pipeline_name = stageMap[o.stage_id]?.pipeline_name || null;
          }

          if (needsOwnerName) {
            const uid =
              typeof d.user_id === "object" ? d.user_id?.id ?? null : d.user_id ?? null;
            o.owner_name = uid != null ? userMap?.[uid] || null : null;
          }

          return o;
        });

        return res.status(200).json({
          status: "success",
          ok: true,
          intent: "listDeals",
          datos: out,
          data: out,
        });
      }

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

        return res.status(200).json({
          status: "success",
          ok: true,
          intent: "listPipelines",
          datos: out,
          data: out,
        });
      }

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

        return res.status(200).json({
          status: "success",
          ok: true,
          intent: "listStages",
          datos: out,
          data: out,
        });
      }

      case "moveDealToStage": {
        if (!dealId || !stageId)
          return res.status(400).json({ status: "error", message: "dealId y stageId requeridos" });

        const r = await pipedriveRequest("PUT", `/deals/${dealId}`, {
          body: { stage_id: stageId },
        });

        if (r.status === "error") return res.status(500).json(r);

        return res.status(200).json({
          status: "success",
          ok: true,
          intent: "moveDealToStage",
          datos: r.data,
          data: r.data,
        });
      }

      case "createActivity": {
        if (!activityData)
          return res.status(400).json({ status: "error", message: "activityData requerido" });

        const r = await pipedriveRequest("POST", "/activities", { body: activityData });
        if (r.status === "error") return res.status(500).json(r);

        return res.status(200).json({
          status: "success",
          ok: true,
          intent: "createActivity",
          datos: r.data,
          data: r.data,
        });
      }

      case "addNoteToDeal": {
        if (!dealId || !noteText)
          return res.status(400).json({ status: "error", message: "dealId y noteText requeridos" });

        const r = await pipedriveRequest("POST", "/notes", {
          body: { deal_id: dealId, content: noteText },
        });

        if (r.status === "error") return res.status(500).json(r);

        return res.status(200).json({
          status: "success",
          ok: true,
          intent: "addNoteToDeal",
          datos: r.data,
          data: r.data,
        });
      }

      case "searchDeals": {
        if (!term) return res.status(400).json({ status: "error", message: "term requerido" });

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

        return res.status(200).json({
          status: "success",
          ok: true,
          intent: "searchDeals",
          datos: out,
          data: out,
        });
      }

      case "getDeal": {
        if (!dealId)
          return res.status(400).json({ status: "error", message: "dealId requerido" });

        const r = await pipedriveRequest("GET", `/deals/${dealId}`, {});
        if (r.status === "error") return res.status(500).json(r);

        return res.status(200).json({
          status: "success",
          ok: true,
          intent: "getDeal",
          datos: r.data,
          data: r.data,
        });
      }

      case "updateDeal": {
        if (!dealId || !dealData)
          return res.status(400).json({ status: "error", message: "dealId y dealData requeridos" });

        const r = await pipedriveRequest("PUT", `/deals/${dealId}`, { body: dealData });
        if (r.status === "error") return res.status(500).json(r);

        return res.status(200).json({
          status: "success",
          ok: true,
          intent: "updateDeal",
          datos: r.data,
          data: r.data,
        });
      }

      case "createDeal": {
        if (!dealData)
          return res.status(400).json({ status: "error", message: "dealData requerido" });

        const r = await pipedriveRequest("POST", "/deals", { body: dealData });
        if (r.status === "error") return res.status(500).json(r);

        return res.status(200).json({
          status: "success",
          ok: true,
          intent: "createDeal",
          datos: r.data,
          data: r.data,
        });
      }

      case "analyzePipeline": {
        try {
          const [open, won, lost] = await Promise.all([
            countDealsByStatus("open", pipeline_id),
            countDealsByStatus("won", pipeline_id),
            countDealsByStatus("lost", pipeline_id),
          ]);

          return res.status(200).json({
            ok: true,
            intent: "analyzePipeline",
            datos: {
              total_abiertos: open,
              total_ganados: won,
              total_perdidos: lost,
            },
            alertas: [],
          });
        } catch {
          return res.status(500).json({
            status: "error",
            message: "Error al analizar pipeline",
          });
        }
      }

      case "extractFullDeals": {
        try {
          const statusVal = status || "open";
          const hard = clampInt(maxTotal, 5000, 1, 20000);
          const all = await fetchAllDeals(statusVal, pipeline_id, hard);

          return res.status(200).json({
            status: "success",
            ok: true,
            intent: "extractFullDeals",
            datos: { total: all.length, hard_cap: hard, data: all },
            total: all.length,
            hard_cap: hard,
            data: all,
          });
        } catch {
          return res.status(500).json({
            status: "error",
            message: "Error al extraer deals completos",
          });
        }
      }

      case "scoreDeals": {
        try {
          const statusVal = status || "open";
          const maxDeals = clampInt(limit, 5000, 1, 5000);

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
            ok: true,
            intent: "scoreDeals",
            datos: scored,
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

      case "countDeals": {
        try {
          const statusVal = status || "open";
          const total = await countDealsByStatus(statusVal, pipeline_id);

          return res.status(200).json({
            status: "success",
            ok: true,
            intent: "countDeals",
            datos: { status_consultado: statusVal, total },
            status_consultado: statusVal,
            total,
          });
        } catch (err) {
          return res.status(500).json({
            status: "error",
            message: err.message || "Error al contar deals",
          });
        }
      }

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
