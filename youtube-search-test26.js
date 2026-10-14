
"use strict";

// WEATHER TIME MACHINE — ENGINE 3 — TEST #26
// Expanded YouTube discovery + official view verification.
// Separate from Tests #24E and #25.
// Node.js 22; no external packages required.

const fs = require("node:fs");

const KEY = process.env.YOUTUBE_API_KEY || "";
const MIN_VIEWS = 1000;
const EVENT = "Hurricane Sandy";
const YEAR = 2012;
const LOCATION = "New Jersey";

const SEARCHES = [
  "Hurricane Sandy 2012 New Jersey",
  "Hurricane Sandy 2012 Jersey Shore footage",
  "Hurricane Sandy 2012 New Jersey news",
  "Superstorm Sandy 2012 NJ flooding",
  "Hurricane Sandy 2012 Seaside Heights",
  "Hurricane Sandy 2012 Atlantic City"
];

// One page of up to 50 videos per query.
// Six searches = six search.list API requests.
const MAX_RESULTS = 50;

function clean(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function youtube(endpoint, params) {
  const url = new URL(
    `https://www.googleapis.com/youtube/v3/${endpoint}`
  );

  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, String(value));
  }

  url.searchParams.set("key", KEY);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `${endpoint}: ${data.error?.message ||
        "HTTP " + response.status}`
    );
  }

  return data;
}

function classify(title, description) {
  const t = clean(title).toLowerCase();
  const d = clean(description).toLowerCase();
  const combined = `${t} ${d}`;

  const sandy =
    /\b(sandy|superstorm sandy)\b/.test(combined);

  const storm =
    /\b(hurricane|superstorm|storm surge|flood|flooding|aftermath|storm damage)\b/
      .test(combined);

  const year =
    /\b2012\b/.test(combined);

  const nj =
    /\b(new jersey|jersey shore|\bnj\b|seaside heights|seaside park|atlantic city|hoboken|belmar|point pleasant|asbury park|long beach island|mantoloking|brick township|toms river|ocean county|monmouth county)\b/
      .test(combined);

  const titleSandy =
    /\b(sandy|superstorm)\b/.test(t);

  // Require a Sandy event reference plus storm or year context.
  // Keep NJ evidence separate from general Sandy coverage.
  const eventRelevant =
    sandy && (storm || year || titleSandy);

  const newJerseyRelevant =
    eventRelevant && nj;

  return {
    eventRelevant,
    newJerseyRelevant,
    yearMentioned: year,
    locationMentioned: nj,
    reviewRequired:
      eventRelevant && !nj
  };
}

function batches(array, size) {
  const result = [];

  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }

  return result;
}

async function main() {
  if (!KEY) {
    throw new Error(
      "Missing GitHub secret YOUTUBE_API_KEY"
    );
  }

  console.log(
    "WEATHER TIME MACHINE — ENGINE 3 — TEST #26"
  );
  console.log("EVENT:", EVENT, YEAR);
  console.log("LOCATION:", LOCATION);
  console.log("MINIMUM VIEWS:", MIN_VIEWS);

  const found = new Map();
  const searchLog = [];
  let searchCalls = 0;
  let detailCalls = 0;

  for (const query of SEARCHES) {
    try {
      const data = await youtube("search", {
        part: "snippet",
        type: "video",
        q: query,
        maxResults: MAX_RESULTS,
        order: "relevance",
        regionCode: "US"
      });

      searchCalls++;

      const items = data.items || [];

      console.log(
        "SEARCH:",
        query,
        "RESULTS:",
        items.length
      );

      searchLog.push({
        query,
        returned: items.length,
        nextPageAvailable:
          Boolean(data.nextPageToken),
        status: "SUCCESS"
      });

      for (const item of items) {
        const id = item.id?.videoId;

        if (!id ||
            !/^[A-Za-z0-9_-]{11}$/.test(id)) {
          continue;
        }

        if (!found.has(id)) {
          found.set(id, {
            id,
            searchQueries: [query]
          });
        } else {
          const record = found.get(id);

          if (!record.searchQueries.includes(query)) {
            record.searchQueries.push(query);
          }
        }
      }
    } catch (error) {
      console.log(
        "SEARCH FAILED:",
        query,
        error.message
      );

      searchLog.push({
        query,
        returned: 0,
        status: "FAILED",
        error: error.message
      });
    }
  }

  const ids = [...found.keys()];

  console.log(
    "DISTINCT DISCOVERED VIDEO IDS:",
    ids.length
  );

  if (!ids.length) {
    throw new Error(
      "No videos discovered. Review search errors."
    );
  }

  const verified = [];
  const belowMinimum = [];
  const review = [];
  const unrelated = [];
  const unresolved = [];

  for (const group of batches(ids, 50)) {
    const data = await youtube("videos", {
      part: "snippet,statistics,status",
      id: group.join(",")
    });

    detailCalls++;

    const returned = new Map(
      (data.items || []).map(
        item => [item.id, item]
      )
    );

    for (const id of group) {
      const item = returned.get(id);

      if (!item) {
        unresolved.push({
          id,
          reason: "NOT_RETURNED_BY_YOUTUBE_API"
        });
        continue;
      }

      const title = clean(
        item.snippet?.title
      );

      const description = clean(
        item.snippet?.description
      );

      const rawViews =
        item.statistics?.viewCount;

      const views =
        rawViews !== undefined &&
        /^\d+$/.test(String(rawViews))
          ? Number(rawViews)
          : null;

      const relevance = classify(
        title,
        description
      );

      const record = {
        id,
        title,
        channel:
          item.snippet?.channelTitle || "",
        publishedAt:
          item.snippet?.publishedAt || null,
        views,
        url:
          `https://www.youtube.com/watch?v=${id}`,
        searchQueries:
          found.get(id).searchQueries,
        relevance,
        verificationSource:
          "YouTube Data API videos.list"
      };

      if (!relevance.eventRelevant) {
        unrelated.push({
          ...record,
          reason: "EVENT_NOT_ESTABLISHED"
        });
      } else if (!relevance.newJerseyRelevant) {
        review.push({
          ...record,
          reason: "NEW_JERSEY_NOT_ESTABLISHED"
        });
      } else if (views === null) {
        unresolved.push({
          ...record,
          reason: "VIEW_COUNT_UNAVAILABLE"
        });
      } else if (views < MIN_VIEWS) {
        belowMinimum.push({
          ...record,
          reason: "BELOW_1000_VIEWS"
        });
      } else {
        verified.push({
          ...record,
          status: "VERIFIED_1000_PLUS"
        });
      }
    }
  }

  verified.sort(
    (a, b) => b.views - a.views
  );

  const completedSearches =
    searchLog.filter(
      s => s.status === "SUCCESS"
    ).length;

  const result = {
    engine: 3,
    test: 26,
    event: EVENT,
    year: YEAR,
    location: LOCATION,
    minimumViews: MIN_VIEWS,
    searchedAt: new Date().toISOString(),
    searchLog,
    summary: {
      searchesCompleted:
        completedSearches,
      searchesRequested:
        SEARCHES.length,
      searchApiCalls: searchCalls,
      detailsApiCalls: detailCalls,
      uniqueDiscoveredIds: ids.length,
      verifiedNewJersey1000Plus:
        verified.length,
      newJerseyBelow1000:
        belowMinimum.length,
      locationNeedsReview:
        review.length,
      unrelated:
        unrelated.length,
      unresolved:
        unresolved.length
    },
    grade: "N/A",
    gradeStatus:
      "AWAITING_GRADING_RULES_AND_COVERAGE_REVIEW",
    coverageNote:
      "Searches are sampled, not exhaustive. " +
      "Relevance uses title and description heuristics.",
    verified,
    belowMinimum,
    review,
    unrelated,
    unresolved
  };

  fs.writeFileSync(
    "engine3-test26-results.json",
    JSON.stringify(result, null, 2)
  );

  console.log(
    "\n========== TEST #26 SUMMARY =========="
  );

  for (const [key, value] of Object.entries(
    result.summary
  )) {
    console.log(
      `${key}: ${value}`
    );
  }

  console.log(
    "\nVERIFIED NEW JERSEY VIDEOS 1000+ VIEWS:"
  );

  for (const video of verified) {
    console.log(
      `${video.views} views | ${video.title} | ${video.url}`
    );
  }

  console.log(
    "\nGRADE: N/A — COVERAGE REVIEW REQUIRED"
  );

  console.log(
    "REPORT: engine3-test26-results.json"
  );

  console.log(
    "BLOGGER AND ENGINES 1/2 UNCHANGED."
  );

  if (completedSearches !== SEARCHES.length) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(
    "TEST #26 FAILED:",
    error.message
  );
  process.exitCode = 1;
});
