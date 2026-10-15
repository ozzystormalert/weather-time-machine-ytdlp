
"use strict";

// WEATHER TIME MACHINE
// ENGINE 3 — TEST #27
// STEP 3: NEWS COVERAGE OF THE WEATHER EVENT
//
// Independent GitHub test.
// Does not modify Tests 24E, 25, or 26.
// Uses YouTube Data API v3.
// Requires Node.js 22 and YOUTUBE_API_KEY.

const fs = require("node:fs");

const API_KEY = process.env.YOUTUBE_API_KEY || "";
const MIN_VIEWS = 1000;
const EVENT = "Hurricane Sandy";
const YEAR = 2012;
const LOCATION = "New Jersey";

const SEARCH_QUERIES = [
  "Hurricane Sandy 2012 New Jersey news coverage",
  "Hurricane Sandy 2012 New Jersey breaking news",
  "Hurricane Sandy 2012 Jersey Shore TV news",
  "Superstorm Sandy 2012 NJ flooding news report",
  "Hurricane Sandy 2012 Seaside Heights news",
  "Hurricane Sandy 2012 Atlantic City news"
];

const NEWS_CHANNELS = [
  /associated press/i,
  /\bap archive\b/i,
  /\babc news\b/i,
  /\bcbs news\b/i,
  /\bcnn\b/i,
  /\bfox news\b/i,
  /\bnbc news\b/i,
  /\bnbc new york\b/i,
  /\babc7\b/i,
  /\b6abc\b/i,
  /\bnews 12\b/i,
  /\bpbs\b/i,
  /\breuters\b/i,
  /\bnew york times\b/i,
  /\bnj spotlight news\b/i,
  /\bwcbs\b/i,
  /\bwnbc\b/i,
  /\bwabc\b/i,
  /\bkyw\b/i,
  /\bwtxf\b/i
];

function normalize(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function api(endpoint, params) {
  const url = new URL(
    `https://www.googleapis.com/youtube/v3/${endpoint}`
  );

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  url.searchParams.set("key", API_KEY);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `${endpoint}: ${data.error?.message ||
      `HTTP ${response.status}`}`
    );
  }

  return data;
}

function groups(values, size) {
  const output = [];

  for (let i = 0; i < values.length; i += size) {
    output.push(values.slice(i, i + size));
  }

  return output;
}

function analyzeVideo(title, description, channel) {
  const t = normalize(title).toLowerCase();
  const d = normalize(description).toLowerCase();
  const c = normalize(channel).toLowerCase();
  const combined = `${t} ${d}`;

  const eventTitle =
    /\b(sandy|superstorm)\b/.test(t);

  const eventDescription =
    /\b(hurricane sandy|superstorm sandy)\b/.test(d);

  const eventMatch =
    eventTitle || eventDescription;

  const locationMatch =
    /\b(new jersey|jersey shore|nj|n\.j\.|seaside heights|seaside park|atlantic city|hoboken|mantoloking|belmar|point pleasant|asbury park|long beach island|union beach|sea bright|keansburg|monmouth county|ocean county|brick township|toms river)\b/
      .test(combined);

  const newsChannel =
    NEWS_CHANNELS.some(regex => regex.test(c));

  const newsTitle =
    /\b(news|breaking|report|reports|coverage|live|raw footage|broadcast|press conference|newscast)\b/
      .test(t);

  const documentary =
    /\b(documentary|full documentary|explained|educational|lecture|lesson|school project)\b/
      .test(t);

  const unrelatedFollowup =
    /\b(boardwalk fire|roller coaster history|nor'easter caused|hurricane irene)\b/
      .test(t);

  const newsEvidence =
    newsChannel || newsTitle;

  let category = "MANUAL_REVIEW";
  let reason = "NEWS_STATUS_NOT_CONFIRMED";

  if (!eventMatch) {
    category = "EXCLUDED";
    reason = "SANDY_EVENT_NOT_ESTABLISHED";
  } else if (!locationMatch) {
    category = "MANUAL_REVIEW";
    reason = "NEW_JERSEY_LOCATION_NOT_ESTABLISHED";
  } else if (unrelatedFollowup) {
    category = "MANUAL_REVIEW";
    reason = "POSSIBLY_DIFFERENT_EVENT";
  } else if (documentary) {
    category = "MANUAL_REVIEW";
    reason = "DOCUMENTARY_OR_EDUCATIONAL_CONTENT";
  } else if (newsEvidence) {
    category = "NEWS_CANDIDATE";
    reason = "AUTOMATED_NEWS_EVIDENCE";
  }

  return {
    category,
    reason,
    eventMatch,
    locationMatch,
    newsChannel,
    newsTitle,
    documentary,
    unrelatedFollowup
  };
}

async function main() {
  if (!API_KEY) {
    throw new Error(
      "Missing GitHub repository secret YOUTUBE_API_KEY"
    );
  }

  console.log(
    "WEATHER TIME MACHINE — ENGINE 3 — TEST #27"
  );
  console.log("CATEGORY: YOUTUBE NEWS COVERAGE");
  console.log("EVENT:", EVENT, YEAR);
  console.log("LOCATION:", LOCATION);
  console.log("MINIMUM VIEWS:", MIN_VIEWS);

  const discovered = new Map();
  const searchLog = [];
  const apiErrors = [];
  let detailCalls = 0;

  for (const query of SEARCH_QUERIES) {
    try {
      const data = await api("search", {
        part: "snippet",
        q: query,
        type: "video",
        maxResults: 50,
        order: "relevance",
        regionCode: "US"
      });

      const items = data.items || [];

      searchLog.push({
        query,
        status: "SUCCESS",
        results: items.length,
        nextPageAvailable: Boolean(data.nextPageToken)
      });

      console.log(
        `SEARCH SUCCESS: ${items.length} | ${query}`
      );

      for (const item of items) {
        const id = item.id?.videoId;

        if (!/^[A-Za-z0-9_-]{11}$/.test(id || "")) {
          continue;
        }

        if (!discovered.has(id)) {
          discovered.set(id, {
            id,
            foundBy: []
          });
        }

        const entry = discovered.get(id);

        if (!entry.foundBy.includes(query)) {
          entry.foundBy.push(query);
        }
      }
    } catch (error) {
      apiErrors.push({
        stage: "search",
        query,
        message: error.message
      });

      searchLog.push({
        query,
        status: "FAILED",
        error: error.message
      });

      console.error(
        "SEARCH FAILED:",
        query,
        error.message
      );
    }
  }

  const ids = [...discovered.keys()];
  const newsCandidates = [];
  const belowMinimum = [];
  const manualReview = [];
  const excluded = [];
  const unresolved = [];

  for (const batch of groups(ids, 50)) {
    let data;

    try {
      data = await api("videos", {
        part: "snippet,statistics,status",
        id: batch.join(",")
      });

      detailCalls++;
    } catch (error) {
      apiErrors.push({
        stage: "details",
        message: error.message,
        ids: batch
      });

      for (const id of batch) {
        unresolved.push({
          id,
          reason: "API_DETAILS_REQUEST_FAILED"
        });
      }

      continue;
    }

    const returned = new Map(
      (data.items || []).map(item => [item.id, item])
    );

    for (const id of batch) {
      const item = returned.get(id);

      if (!item) {
        unresolved.push({
          id,
          reason: "VIDEO_NOT_RETURNED"
        });
        continue;
      }

      const title = normalize(item.snippet?.title);
      const description = normalize(
        item.snippet?.description
      );
      const channel = normalize(
        item.snippet?.channelTitle
      );

      const rawViews = item.statistics?.viewCount;
      const views =
        rawViews !== undefined &&
        /^\d+$/.test(String(rawViews))
          ? Number(rawViews)
          : null;

      const classification = analyzeVideo(
        title,
        description,
        channel
      );

      const record = {
        id,
        title,
        channel,
        publishedAt: item.snippet?.publishedAt || null,
        views,
        url: `https://www.youtube.com/watch?v=${id}`,
        foundBy: discovered.get(id).foundBy,
        classification,
        verificationSource:
          "YouTube Data API videos.list"
      };

      if (views === null) {
        unresolved.push({
          ...record,
          reason: "VIEW_COUNT_UNAVAILABLE"
        });
      } else if (
        classification.category === "EXCLUDED"
      ) {
        excluded.push(record);
      } else if (views < MIN_VIEWS) {
        belowMinimum.push({
          ...record,
          reason: "BELOW_1000_VIEWS"
        });
      } else if (
        classification.category === "NEWS_CANDIDATE"
      ) {
        newsCandidates.push(record);
      } else {
        manualReview.push(record);
      }
    }
  }

  const byViews = (a, b) => b.views - a.views;

  newsCandidates.sort(byViews);
  belowMinimum.sort(byViews);
  manualReview.sort(byViews);
  excluded.sort(byViews);

  const successfulSearches =
    searchLog.filter(s => s.status === "SUCCESS").length;

  const report = {
    engine: 3,
    test: 27,
    category: "News Coverage of the Weather Event",
    source: "YouTube",
    event: EVENT,
    year: YEAR,
    location: LOCATION,
    minimumViews: MIN_VIEWS,
    searchedAt: new Date().toISOString(),
    summary: {
      searchesRequested: SEARCH_QUERIES.length,
      searchesCompleted: successfulSearches,
      detailApiCalls: detailCalls,
      distinctVideoIds: ids.length,
      newsCandidates1000Plus: newsCandidates.length,
      belowMinimum: belowMinimum.length,
      manualReview1000Plus: manualReview.length,
      excluded: excluded.length,
      unresolved: unresolved.length,
      apiErrors: apiErrors.length
    },
    grading: {
      grade: "N/A",
      status: "NOT_YET_ASSIGNED",
      note:
        "News candidates are automatically classified. " +
        "Manual verification and original A-F thresholds " +
        "are required before final grading."
    },
    searchLog,
    apiErrors,
    newsCandidates,
    belowMinimum,
    manualReview,
    excluded,
    unresolved
  };

  fs.writeFileSync(
    "engine3-test27-results.json",
    JSON.stringify(report, null, 2)
  );

  console.log(
    "\n========== TEST #27 SUMMARY =========="
  );

  for (const [name, value] of Object.entries(
    report.summary
  )) {
    console.log(`${name}: ${value}`);
  }

  console.log(
    "\n========== NEWS CANDIDATES =========="
  );

  for (const video of newsCandidates) {
    console.log(
      `${video.views} views | ${video.title} | ${video.url}`
    );
  }

  console.log(
    "\nAUTOMATED NEWS CANDIDATES ARE NOT FINAL APPROVALS."
  );

  console.log(
    "GRADE: N/A — AWAITING FINAL REVIEW"
  );

  console.log(
    "REPORT: engine3-test27-results.json"
  );

  console.log(
    "BLOGGER, ENGINES 1/2, AND TESTS 24E/25/26 UNCHANGED."
  );

  if (
    successfulSearches !== SEARCH_QUERIES.length ||
    apiErrors.length > 0 ||
    unresolved.length > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error("TEST #27 FAILED:", error.message);
  process.exitCode = 1;
});
