
"use strict";

// WEATHER TIME MACHINE — ENGINE 3 — TEST #27
// News coverage relevance and verified YouTube views.
// Standalone test; does not modify Tests 25 or 26.
// Node.js 22. No external packages.

const fs = require("node:fs");

const KEY = process.env.YOUTUBE_API_KEY || "";
const MIN_VIEWS = 1000;

const QUERIES = [
  "Hurricane Sandy 2012 New Jersey news coverage",
  "Hurricane Sandy 2012 Jersey Shore news report",
  "Hurricane Sandy 2012 Atlantic City news",
  "Hurricane Sandy 2012 Seaside Heights news",
  "Hurricane Sandy 2012 Hoboken flooding news",
  "Superstorm Sandy 2012 New Jersey breaking news"
];

const NJ =
  /\b(new jersey|jersey shore|n\.?j\.?|seaside heights|seaside park|atlantic city|hoboken|mantoloking|belmar|point pleasant|asbury park|long beach island|union beach|monmouth county|ocean county|brick township|keansburg|sea bright|long branch|highlands)\b/i;

const EVENT =
  /\b(hurricane sandy|superstorm sandy|sandy's|sandy aftermath|sandy damage|sandy flooding|sandy storm)\b/i;

const NEWS =
  /\b(news|report|coverage|breaking|live|reporter|broadcast|footage|raw video|interview|evacuation|storm surge|flooding|aftermath|damage|devastation|destroyed|rescue|landfall|storm chaser)\b/i;

const EDUCATION =
  /\b(documentary|explained|lesson|lecture|classroom|educational|full history|science of|animation|simulation)\b/i;

const LATER =
  /\b(years? later|anniversary|lookback|looking back|retrospective|remembering|recovery|rebuilding|rebuild|still recovering|ten years|10 years|five years|5 years|one year later)\b/i;

const NEWS_CHANNEL =
  /\b(news|abc|nbc|cbs|cnn|fox|pbs|ap archive|associated press|reuters|weather channel|nj spotlight|new york times|abc7|6abc|wabc|wnbc|wcbs|wnew|news 12|nj\.com)\b/i;

function clean(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function api(endpoint, params) {
  const url = new URL(
    "https://www.googleapis.com/youtube/v3/" + endpoint
  );

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set("key", KEY);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      endpoint + ": " +
      (data.error?.message || response.status)
    );
  }

  return data;
}

function classify(item) {
  const title = clean(item.snippet?.title);
  const description = clean(item.snippet?.description);
  const channel = clean(item.snippet?.channelTitle);
  const publishedAt = item.snippet?.publishedAt || null;

  const text = title + " " + description;
  const hasEvent = EVENT.test(text);
  const hasNJ = NJ.test(text);
  const newsSignals =
    NEWS.test(title) || NEWS_CHANNEL.test(channel);
  const educational = EDUCATION.test(title);
  const retrospective = LATER.test(title);
  const publishedYear = publishedAt
    ? Number(publishedAt.slice(0, 4))
    : null;

  const viewsRaw = item.statistics?.viewCount;
  const views =
    viewsRaw !== undefined &&
    /^\d+$/.test(String(viewsRaw))
      ? Number(viewsRaw)
      : null;

  let category;
  let reason;

  if (!hasEvent) {
    category = "excluded";
    reason = "SANDY_EVENT_NOT_ESTABLISHED";
  } else if (!hasNJ) {
    category = "review";
    reason = "NEW_JERSEY_NOT_ESTABLISHED";
  } else if (educational) {
    category = "review";
    reason = "POSSIBLE_EDUCATIONAL_DOCUMENTARY";
  } else if (!newsSignals) {
    category = "review";
    reason = "NEWS_COVERAGE_NOT_ESTABLISHED";
  } else if (retrospective) {
    category = "retrospective";
    reason = "LATER_NEWS_RETROSPECTIVE";
  } else if (views === null) {
    category = "unresolved";
    reason = "VIEW_COUNT_UNAVAILABLE";
  } else if (views < MIN_VIEWS) {
    category = "belowMinimum";
    reason = "BELOW_1000_VIEWS";
  } else {
    category = "candidate";
    reason = "PASSES_AUTOMATED_NEWS_FILTER";
  }

  return {
    id: item.id,
    title,
    channel,
    publishedAt,
    publishedYear,
    views,
    url: "https://www.youtube.com/watch?v=" + item.id,
    category,
    reason,
    evidence: {
      sandyEvent: hasEvent,
      newJersey: hasNJ,
      newsSignals,
      educational,
      retrospective
    }
  };
}

async function main() {
  if (!KEY) {
    throw new Error("Missing YOUTUBE_API_KEY secret");
  }

  console.log("ENGINE 3 — TEST #27");
  console.log("NEWS COVERAGE — HURRICANE SANDY 2012 NJ");
  console.log("MINIMUM VIEWS:", MIN_VIEWS);

  const discovered = new Map();
  const searchLog = [];

  for (const query of QUERIES) {
    try {
      const data = await api("search", {
        part: "snippet",
        type: "video",
        q: query,
        maxResults: 50,
        regionCode: "US",
        order: "relevance"
      });

      const items = data.items || [];

      for (const item of items) {
        const id = item.id?.videoId;
        if (/^[A-Za-z0-9_-]{11}$/.test(id || "")) {
          if (!discovered.has(id)) {
            discovered.set(id, []);
          }
          discovered.get(id).push(query);
        }
      }

      searchLog.push({
        query,
        status: "SUCCESS",
        returned: items.length,
        morePages: Boolean(data.nextPageToken)
      });

      console.log("SEARCH OK:", query, items.length);
    } catch (error) {
      searchLog.push({
        query,
        status: "FAILED",
        error: error.message
      });
      console.log("SEARCH FAILED:", error.message);
    }
  }

  const ids = [...discovered.keys()];
  if (!ids.length) {
    throw new Error("No YouTube IDs discovered");
  }

  const categories = {
    candidate: [],
    belowMinimum: [],
    retrospective: [],
    review: [],
    excluded: [],
    unresolved: []
  };

  let detailCalls = 0;

  for (let i = 0; i < ids.length; i += 50) {
    const group = ids.slice(i, i + 50);

    const data = await api("videos", {
      part: "snippet,statistics",
      id: group.join(",")
    });

    detailCalls++;

    const returned = new Map(
      (data.items || []).map(v => [v.id, v])
    );

    for (const id of group) {
      const item = returned.get(id);

      if (!item) {
        categories.unresolved.push({
          id,
          reason: "VIDEO_NOT_RETURNED"
        });
        continue;
      }

      const record = classify(item);
      record.searchQueries = discovered.get(id);
      categories[record.category].push(record);
    }
  }

  for (const name of Object.keys(categories)) {
    categories[name].sort(
      (a, b) => (b.views || 0) - (a.views || 0)
    );
  }

  const summary = {
    searchesCompleted: searchLog.filter(
      x => x.status === "SUCCESS"
    ).length,
    searchesRequested: QUERIES.length,
    detailCalls,
    distinctVideos: ids.length,
    newsCandidates1000Plus:
      categories.candidate.length,
    newsBelow1000:
      categories.belowMinimum.length,
    laterRetrospectives:
      categories.retrospective.length,
    needsManualReview:
      categories.review.length,
    excluded:
      categories.excluded.length,
    unresolved:
      categories.unresolved.length
  };

  const result = {
    engine: 3,
    test: 27,
    category: "News Coverage of Weather Event",
    event: "Hurricane Sandy",
    year: 2012,
    location: "New Jersey",
    minimumViews: MIN_VIEWS,
    testedAt: new Date().toISOString(),
    searchLog,
    summary,
    grade: "N/A",
    gradeStatus: "PENDING_MANUAL_REVIEW_AND_THRESHOLDS",
    limitations: [
      "This is a sampled search, not all of YouTube.",
      "Metadata filters may produce false positives.",
      "Upload date does not prove footage recording date.",
      "Retrospectives are separated, not automatically counted.",
      "News candidates require final editorial validation."
    ],
    ...categories
  };

  fs.writeFileSync(
    "engine3-test27-results.json",
    JSON.stringify(result, null, 2)
  );

  console.log("\n========== TEST #27 SUMMARY ==========");
  for (const [key, value] of Object.entries(summary)) {
    console.log(key + ": " + value);
  }

  console.log("\nNEWS CANDIDATES WITH 1000+ VIEWS:");
  for (const v of categories.candidate) {
    console.log(
      v.views + " views | " + v.title + " | " + v.url
    );
  }

  console.log("\nA-F GRADE: NOT YET ASSIGNED");
  console.log("REPORT: engine3-test27-results.json");

  if (summary.searchesCompleted !== QUERIES.length) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error("TEST #27 FAILED:", error.message);
  process.exitCode = 1;
});
