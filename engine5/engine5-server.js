
"use strict";

/**
 * Weather Time Machine — Engine 5
 * Bing Images research-link edition (no API key, no scraping).
 *
 * Independent service. Does not alter Engines 1–4 or Blogger research links.
 * This service provides research URLs, NOT image verification or grades.
 */

const http = require("node:http");

const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";

function respond(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(body);
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function bingImagesUrl(query) {
  const url = new URL("https://www.bing.com/images/search");
  url.searchParams.set("q", query);
  return url.toString();
}

function handleAudit(url, res) {
  const event = normalize(url.searchParams.get("event"));
  const state = normalize(url.searchParams.get("state"));
  const year = normalize(url.searchParams.get("year"));

  if (!event || !state) {
    return respond(res, 400, {
      status: "error",
      engine: 5,
      message: "Both event and state are required.",
      example: "/audit5?event=Superstorm%20Sandy&state=New%20Jersey&year=2012"
    });
  }

  if (event.length > 200 || state.length > 100 || year.length > 20) {
    return respond(res, 400, {
      status: "error",
      engine: 5,
      message: "One or more query parameters are too long."
    });
  }

  // Research query is EXACTLY event + state + "map"; year is excluded.
  const query = `${event} ${state} map`;
  const researchURL = bingImagesUrl(query);

  return respond(res, 200, {
    status: "not_evaluated",
    engine: 5,
    category: "Historical Weather Maps",
    source: "Bing Images",
    apiKeyRequired: false,
    automatedSearch: false,
    visualVerification: false,
    finalGradingEnabled: false,
    event,
    state,
    year: year || null,
    query,
    researchURL,
    researchUrl: researchURL,
    searchCompleted: false,
    candidateCount: null,
    rejectedCount: null,
    candidates: [],
    evidence: [],
    score: null,
    grade: null,
    finalGrade: false,
    message: "Open the Bing Images research URL to review historical weather maps. No images were fetched or verified. Grade remains Not Evaluated."
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  if (req.method !== "GET") {
    return respond(res, 405, {
      status: "error",
      message: "GET only."
    });
  }

  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch {
    return respond(res, 400, {
      status: "error",
      message: "Invalid URL."
    });
  }

  if (url.pathname === "/health") {
    return respond(res, 200, {
      status: "ok",
      engine: 5,
      source: "Bing Images",
      apiKeyRequired: false,
      automatedSearch: false,
      visualVerification: false,
      finalGradingEnabled: false
    });
  }

  if (url.pathname === "/audit5") {
    return handleAudit(url, res);
  }

  if (url.pathname === "/") {
    return respond(res, 200, {
      name: "Weather Time Machine — Engine 5",
      source: "Bing Images",
      health: "/health",
      auditExample: "/audit5?event=Superstorm%20Sandy&state=New%20Jersey&year=2012",
      message: "Research-link service only. No automated map verification or grading."
    });
  }

  return respond(res, 404, {
    status: "error",
    message: "Endpoint not found."
  });
});

server.listen(PORT, HOST, () => {
  console.log(
    `Weather Time Machine Engine 5 — Bing Images edition listening on port ${PORT}`
  );
});
