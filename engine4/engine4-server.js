
"use strict";

/*
 WEATHER TIME MACHINE — ENGINE 4
 Step 7: Educational Documentary Verification

 RULES
 - Search YouTube using WEATHER EVENT NAME + STATE only.
 - Do not add year, educational, documentary or historical
   to the YouTube search query.
 - Minimum duration: 20 minutes (1200 seconds).
 - NO minimum view count.
 - Verify video duration using the YouTube Data API.
 - Score event relevance and educational suitability.
 - Grade A through F.
 - Keep Engine 3 independent.

 Node.js 22 — no external npm packages required.
 Environment: YOUTUBE_API_KEY
 Endpoint: GET /audit4
 Health: GET /health
*/

const http = require("node:http");

const PORT = Number(process.env.PORT || 10000);
const API_KEY = process.env.YOUTUBE_API_KEY || "";
const MIN_SECONDS = 1200;
const MAX_RESULTS = 50;

function clean(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripYear(value) {
  return clean(value)
    .replace(/\b(?:18|19|20)\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchTerm(event, state) {
  // Only event name + state, never an added year or
  // documentary/educational/historical search words.
  const eventName = stripYear(event)
    .replace(/\b(?:educational|documentary|historical)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [eventName, clean(state)]
    .filter(Boolean)
    .join(" ");
}

function parseDuration(iso) {
  const match = String(iso || "").match(
    /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
  );

  if (!match) return null;

  return (
    Number(match[1] || 0) * 86400 +
    Number(match[2] || 0) * 3600 +
    Number(match[3] || 0) * 60 +
    Number(match[4] || 0)
  );
}

function durationText(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function grade(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "of",
  "in", "on", "at", "a", "an", "to", "storm",
  "weather", "event"
]);

function tokens(value) {
  return [...new Set(
    normalize(value)
      .split(" ")
      .filter(word => word.length >= 3 && !STOP_WORDS.has(word))
  )];
}

function relevance(video, event, state, year) {
  const title = normalize(video.title);
  const description = normalize(video.description);
  const channel = normalize(video.channelTitle);

  const combined = `${title} ${description}`;
  const eventTokens = tokens(stripYear(event));

  const matching = eventTokens.filter(word =>
    combined.includes(word)
  );

  const eventRatio = eventTokens.length
    ? matching.length / eventTokens.length
    : 0;

  const stateName = normalize(state);
  const stateMatch = stateName && combined.includes(stateName);

  const yearText = String(year || "").trim();
  const yearMatch = yearText && combined.includes(yearText);

  const educationTerms = [
    "documentary",
    "explained",
    "history",
    "retrospective",
    "analysis",
    "science",
    "meteorology",
    "educational",
    "lecture",
    "investigation",
    "interview",
    "recovery",
    "resilience",
    "impact",
    "aftermath"
  ];

  const educationalMatch = educationTerms.some(term =>
    `${combined} ${channel}`.includes(term)
  );

  let score = Math.round(eventRatio * 45);

  if (stateMatch) score += 25;
  if (yearMatch) score += 10;
  if (educationalMatch) score += 20;

  score = Math.min(100, score);

  return {
    score,
    grade: grade(score),
    eventMatch: eventRatio >= 0.5,
    stateMatch: Boolean(stateMatch),
    yearMatch: Boolean(yearMatch),
    educationalMatch
  };
}

async function youtube(endpoint, params) {
  const url = new URL(
    `https://www.googleapis.com/youtube/v3/${endpoint}`
  );

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  url.searchParams.set("key", API_KEY);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000)
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message || `YouTube HTTP ${response.status}`;

    throw new Error(message);
  }

  return data;
}

async function audit(event, state, year) {
  if (!API_KEY) {
    throw new Error(
      "YOUTUBE_API_KEY is not configured on the server."
    );
  }

  const query = searchTerm(event, state);

  if (!stripYear(event) || !clean(state)) {
    throw new Error("Event name and state are required.");
  }

  const search = await youtube("search", {
    part: "snippet",
    type: "video",
    q: query,
    maxResults: MAX_RESULTS,
    videoDuration: "long",
    safeSearch: "moderate"
  });

  const ids = [...new Set(
    (search.items || [])
      .map(item => item.id?.videoId)
      .filter(Boolean)
  )];

  if (!ids.length) {
    return {
      engine: 4,
      status: "not_evaluated",
      reason: "No videos returned by YouTube search.",
      query,
      videos: []
    };
  }

  const details = await youtube("videos", {
    part: "snippet,contentDetails,statistics,status",
    id: ids.join(",")
  });

  const accepted = [];
  let rejectedShort = 0;
  let rejectedRelevance = 0;

  for (const item of details.items || []) {
    const seconds = parseDuration(
      item.contentDetails?.duration
    );

    if (seconds === null || seconds < MIN_SECONDS) {
      rejectedShort++;
      continue;
    }

    if (item.status?.embeddable === false) {
      // A non-embeddable video can still be opened on YouTube.
      // Do not reject it solely for that reason.
    }

    const video = {
      id: item.id,
      title: clean(item.snippet?.title),
      description: clean(item.snippet?.description),
      channelTitle: clean(item.snippet?.channelTitle),
      publishedAt: item.snippet?.publishedAt || null,
      durationSeconds: seconds,
      duration: durationText(seconds),
      views: Number(item.statistics?.viewCount || 0),
      url: `https://www.youtube.com/watch?v=${item.id}`
    };

    const result = relevance(video, event, state, year);

    // Reject obvious unrelated videos, regardless of duration.
    if (!result.eventMatch || result.score < 40) {
      rejectedRelevance++;
      continue;
    }

    accepted.push({
      ...video,
      ...result
    });
  }

  accepted.sort(
    (a, b) =>
      b.score - a.score ||
      b.durationSeconds - a.durationSeconds
  );

  const average = accepted.length
    ? Math.round(
        accepted.reduce((sum, video) => sum + video.score, 0) /
        accepted.length
      )
    : null;

  return {
    engine: 4,
    step: 7,
    category: "Educational Documentary (20+ minutes)",
    status: accepted.length ? "evaluated" : "not_evaluated",
    query,
    event: clean(event),
    state: clean(state),
    year: String(year || ""),
    minimumDurationSeconds: MIN_SECONDS,
    minimumViews: 0,
    searched: ids.length,
    rejectedShort,
    rejectedRelevance,
    qualifyingCount: accepted.length,
    score: average,
    grade: average === null ? null : grade(average),
    videos: accepted
  };
}

function sendJSON(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  });

  res.end(JSON.stringify(payload, null, 2));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJSON(res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/health") {
    sendJSON(res, 200, {
      status: "ok",
      engine: 4,
      youtubeApiConfigured: Boolean(API_KEY),
      minimumDurationSeconds: MIN_SECONDS,
      minimumViews: 0
    });
    return;
  }

  if (url.pathname === "/audit4") {
    if (req.method !== "GET") {
      sendJSON(res, 405, {
        status: "error",
        message: "Use GET /audit4"
      });
      return;
    }

    const event =
      url.searchParams.get("event") ||
      url.searchParams.get("event_name") ||
      "";

    const state =
      url.searchParams.get("state") ||
      url.searchParams.get("location") ||
      "";

    const year = url.searchParams.get("year") || "";

    if (!event || !state) {
      sendJSON(res, 400, {
        status: "error",
        message: "Event and state are required."
      });
      return;
    }

    try {
      const result = await audit(event, state, year);
      sendJSON(res, 200, result);
    } catch (error) {
      sendJSON(res, 502, {
        engine: 4,
        status: "not_evaluated",
        message: error.message
      });
    }

    return;
  }

  sendJSON(res, 404, {
    status: "error",
    message: "Endpoint not found",
    endpoints: ["/health", "/audit4"]
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Weather Time Machine Engine 4 listening on port ${PORT}`
  );
});
