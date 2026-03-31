const { pipedriveRequest } = require("../pipedriveClient");

async function fetchDealsPageMeta(status, pipeline_id, start, limit) {
  const query = { status, limit, start };
  if (pipeline_id) query.pipeline_id = pipeline_id;

  const r = await pipedriveRequest("GET", "/deals", { query });
  if (r.status === "error") {
    throw new Error(r.message || "Error listando deals");
  }

  const data = Array.isArray(r.data) ? r.data : [];
  const more =
    r.additional_data?.pagination?.more_items_in_collection === true ||
    r.additional_data?.pagination?.more_items_in_collection === 1;

  return { data, more };
}

async function fetchAllDeals(status, pipeline_id, maxTotal) {
  const limit = 500;
  const concurrency = 5;
  let start = 0;
  const all = [];
  let more = true;

  while (more && all.length < maxTotal) {
    const remaining = maxTotal - all.length;
    const pagesThisBatch = Math.min(concurrency, Math.ceil(remaining / limit));

    const calls = [];
    for (let i = 0; i < pagesThisBatch; i++) {
      calls.push(fetchDealsPageMeta(status, pipeline_id, start + i * limit, limit));
    }

    const results = await Promise.all(calls);

    for (const page of results) {
      for (const d of page.data) {
        if (all.length < maxTotal) all.push(d);
      }
      if (!page.more) {
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
  let start = 0;
  let total = 0;
  let more = true;

  while (more) {
    const page = await fetchDealsPageMeta(status, pipeline_id, start, limit);
    total += page.data.length;
    more = page.more;
    start += limit;
  }

  return total;
}

module.exports = {
  fetchDealsPageMeta,
  fetchAllDeals,
  countDealsByStatus,
};
