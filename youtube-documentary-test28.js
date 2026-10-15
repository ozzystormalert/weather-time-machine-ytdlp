
"use strict";

/*
 WEATHER TIME MACHINE — ENGINE 4 / STEP 4
 TEST #28 — YOUTUBE EDUCATIONAL DOCUMENTARIES

 Independent test. Does not modify Engines 1, 2 or 3.
 Node.js 22. No third-party dependencies.

 Requirements:
 - Official YouTube API discovery and verification
 - New Jersey Hurricane Sandy (2012) relevance
 - Educational/documentary content
 - Duration >= 20 minutes (1200 seconds)
 - Views >= 1000 (configurable)
 - Unique YouTube video IDs
 - Conservative classification with review queue
 - JSON report and GitHub Actions summary
*/

const fs = require("node:fs");

const API_KEY = process.env.YOUTUBE_API_KEY || "";
const MIN_SECONDS = 20 * 60;
const MIN_VIEWS = Number(
  process.env.MIN_VIEWS || "1000"
);
const OUTPUT = "engine4-test28-results.json";

const EVENT = {
  name: "Hurricane Sandy",
  year: 2012,
  location: "New Jersey"
};

const QUERIES = [
  "Hurricane Sandy 2012 New Jersey documentary",
  "Superstorm Sandy New Jersey full documentary",
  "Hurricane Sandy Jersey Shore educational documentary",
  "Hurricane Sandy 2012 New Jersey history documentary",
  "Superstorm Sandy NJ disaster science documentary",
  "Hurricane Sandy New Jersey long form investigation"
];

const MAX_RESULTS_PER_QUERY = 50;

function normalize(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function durationSeconds(iso) {
  // YouTube uses ISO 8601 durations such as PT1H20M15S.
  // Return null when duration cannot be interpreted.
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
    .exec(String(iso || ""));

  if (!match) return null;

  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);

  return (
    days * 86400 +
    hours * 3600 +
    minutes * 60 +
    seconds
  );
}

function formatDuration(seconds) {
  if (seconds === null) return "Unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return h
    ? `${h}h ${m}m ${s}s`
    : `${m}m ${s}s`;
}

function assessRelevance(title, description) {
  const t = normalize(title).toLowerCase();
  const d = normalize(description).toLowerCase();
  const combined = `${t} ${d}`;

  const event =
    /\b(sandy|superstorm sandy)\b/i.test(combined);

  const weather =
    /\b(hurricane|superstorm|storm surge|flooding|flood|coastal storm|weather disaster|storm damage)\b/i
      .test(combined);

  const year =
    /\b2012\b/.test(combined);

  const nj =
    /\b(new jersey|jersey shore|n\.?j\.?|seaside heights|seaside park|atlantic city|hoboken|mantoloking|belmar|point pleasant|asbury park|long beach island|union beach|toms river|brick township|monmouth county|ocean county|keansburg|sea bright|highlands|ortley beach)\b/i
      .test(combined);

  const titleDocumentary =
    /\b(documentary|documentaries|educational|explained|history|historical|investigation|in-depth|science of|case study|full episode|special report)\b/i
      .test(t);

  const descriptionEducational =
    /\b(documentary|educational|explained|history|historical|investigation|in-depth|science|case study|full episode|special report|interviews|analysis)\b/i
      .test(d);

  const negative =
    /\b(trailer|teaser|preview|reaction video|gaming|gameplay|music video|official song|parody|fictional|fiction|movie review)\b/i
      .test(t);

  // A title mentioning "Sandy" alone is not enough.
  const eventRelevant = event && (weather || year);

  // Conservative: only a documentary/educational indicator
  // in the TITLE can qualify automatically.
  // Description-only indicators require manual review.
  const educationalCandidate =
    titleDocumentary || descriptionEducational;

  return {
    eventRelevant,
    newJerseyMentioned: nj,
    yearMentioned: year,
    titleDocumentary,
    descriptionEducational,
    educationalCandidate,
    negative
  };
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
      `${endpoint}: ${
        data.error?.message ||
        `HTTP ${response.status}`
      }`
    );
  }

  return data;
}

function chunk(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

function logSummary(summary) {
  console.log("\n========== TEST #28 SUMMARY ==========");

  for (const [key, value] of Object.entries(summary)) {
    console.log(`${key}: ${value}`);
  }

  console.log(
    "\nClassification is preliminary; final documentary " +
    "eligibility requires content review."
  );
}

function writeReport(report) {
  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(report, null, 2)
  );

  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;

  const s = report.summary;

  const markdown = [
    "# Weather Time Machine — Test #28",
    "",
    "## Step 4: Educational Documentaries",
    "",
    `Event: ${EVENT.name} (${EVENT.year}), ${EVENT.location}`,
    "",
    "| Measurement | Count |",
    "|---|---:|",
    `| Searches completed | ${s.searchesCompleted} |`,
    `| Unique videos discovered | ${s.uniqueVideos} |`,
    `| Preliminary eligible documentaries | ${s.preliminaryEligible} |`,
    `| Needs manual review | ${s.needsReview} |`,
    `| Below 20 minutes | ${s.below20Minutes} |`,
    `| Below view minimum | ${s.belowViewMinimum} |`,
    `| Excluded as unrelated | ${s.unrelated} |`,
    `| Unresolved | ${s.unresolved} |`,
    "",
    "Duration verified using YouTube contentDetails.duration.",
    "",
    "Final grading is not assigned."
  ].join("\n");

  fs.appendFileSync(path, markdown + "\n");
}

async function main() {
  if (!API_KEY) {
    throw new Error(
      "GitHub repository secret YOUTUBE_API_KEY is missing."
    );
  }

  if (!Number.isFinite(MIN_VIEWS) || MIN_VIEWS < 0) {
    throw new Error("Invalid MIN_VIEWS value.");
  }

  console.log(
    "WEATHER TIME MACHINE — STEP 4 — TEST #28"
  );
  console.log("EVENT:", EVENT.name, EVENT.year);
  console.log("LOCATION:", EVENT.location);
  console.log("MINIMUM DURATION:", MIN_SECONDS, "seconds");
  console.log("MINIMUM VIEWS:", MIN_VIEWS);

  const discovered = new Map();
  const searchLog = [];

  for (const query of QUERIES) {
    try {
      const result = await api("search", {
        part: "snippet",
        type: "video",
        q: query,
        maxResults: MAX_RESULTS_PER_QUERY,
        order: "relevance",
        regionCode: "US",
        videoDuration: "long"
      });

      const items = result.items || [];

      console.log(
        "SEARCH:",
        query,
        "RESULTS:",
        items.length
      );

      searchLog.push({
        query,
        status: "SUCCESS",
        returned: items.length,
        nextPageAvailable:
          Boolean(result.nextPageToken)
      });

      for (const item of items) {
        const id = item.id?.videoId;

        if (!id || !/^[\w-]{11}$/.test(id)) {
          continue;
        }

        if (!discovered.has(id)) {
          discovered.set(id, {
            id,
            queries: [query]
          });
        } else {
          const existing = discovered.get(id);

          if (!existing.queries.includes(query)) {
            existing.queries.push(query);
          }
        }
      }
    } catch (error) {
      console.error(
        "SEARCH FAILED:",
        query,
        error.message
      );

      searchLog.push({
        query,
        status: "FAILED",
        returned: 0,
        error: error.message
      });
    }
  }

  const ids = [...discovered.keys()];

  const preliminaryEligible = [];
  const needsReview = [];
  const below20Minutes = [];
  const belowViewMinimum = [];
  const unrelated = [];
  const unresolved = [];

  let detailCalls = 0;

  for (const batch of chunk(ids, 50)) {
    let result;

    try {
      result = await api("videos", {
        part: "snippet,contentDetails,statistics,status",
        id: batch.join(",")
      });
      detailCalls++;
    } catch (error) {
      console.error(
        "DETAIL VERIFICATION FAILED:",
        error.message
      );

      for (const id of batch) {
        unresolved.push({
          id,
          reason: "API_VERIFICATION_FAILED",
          error: error.message
        });
      }
      continue;
    }

    const returned = new Map(
      (result.items || []).map(
        item => [item.id, item]
      )
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

      const title = normalize(
        item.snippet?.title
      );
      const description = normalize(
        item.snippet?.description
      );

      const duration = durationSeconds(
        item.contentDetails?.duration
      );

      const rawViews = item.statistics?.viewCount;
      const views =
        rawViews !== undefined &&
        /^\d+$/.test(String(rawViews))
          ? Number(rawViews)
          : null;

      const relevance = assessRelevance(
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
        durationSeconds: duration,
        durationFormatted:
          formatDuration(duration),
        views,
        url:
          `https://www.youtube.com/watch?v=${id}`,
        searchQueries:
          discovered.get(id).queries,
        relevance,
        verificationSource:
          "YouTube Data API v3"
      };

      // Prioritize duration and event relevance.
      if (duration === null || views === null) {
        unresolved.push({
          ...record,
          reason: "MISSING_DURATION_OR_VIEWS"
        });
      } else if (duration < MIN_SECONDS) {
        below20Minutes.push({
          ...record,
          reason: "BELOW_20_MINUTES"
        });
      } else if (!relevance.eventRelevant) {
        unrelated.push({
          ...record,
          reason: "EVENT_NOT_ESTABLISHED"
        });
      } else if (views < MIN_VIEWS) {
        belowViewMinimum.push({
          ...record,
          reason: "BELOW_MINIMUM_VIEWS"
        });
      } else if (
        !relevance.newJerseyMentioned ||
        !relevance.titleDocumentary ||
        relevance.negative
      ) {
        needsReview.push({
          ...record,
          reason:
            !relevance.newJerseyMentioned
              ? "NEW_JERSEY_NOT_ESTABLISHED"
              : relevance.negative
                ? "POSSIBLE_NON_EDUCATIONAL_CONTENT"
                : "DOCUMENTARY_STATUS_NEEDS_REVIEW"
        });
      } else {
        preliminaryEligible.push({
          ...record,
          status:
            "PRELIMINARY_DOCUMENTARY_CANDIDATE"
        });
      }
    }
  }

  preliminaryEligible.sort(
    (a, b) => b.views - a.views
  );

  needsReview.sort(
    (a, b) => (b.views || 0) - (a.views || 0)
  );

  const searchesCompleted = searchLog.filter(
    item => item.status === "SUCCESS"
  ).length;

  const summary = {
    searchesRequested: QUERIES.length,
    searchesCompleted,
    uniqueVideos: ids.length,
    detailApiCalls: detailCalls,
    preliminaryEligible:
      preliminaryEligible.length,
    needsReview: needsReview.length,
    below20Minutes: below20Minutes.length,
    belowViewMinimum:
      belowViewMinimum.length,
    unrelated: unrelated.length,
    unresolved: unresolved.length
  };

  const report = {
    engine: 4,
    step: 4,
    test: 28,
    event: EVENT,
    searchedAt: new Date().toISOString(),
    criteria: {
      minimumDurationSeconds: MIN_SECONDS,
      minimumViews: MIN_VIEWS,
      documentaryStatus:
        "Preliminary metadata classification",
      finalHumanReviewRequired: true
    },
    searchLog,
    summary,
    grade: "N/A",
    gradeStatus:
      "AWAITING_DOCUMENTARY_REVIEW_AND_GRADING_RULES",
    preliminaryEligible,
    needsReview,
    below20Minutes,
    belowViewMinimum,
    unrelated,
    unresolved
  };

  writeReport(report);
  logSummary(summary);

  console.log(
    "\nPRELIMINARY EDUCATIONAL DOCUMENTARIES:"
  );

  for (const video of preliminaryEligible) {
    console.log(
      `${video.durationFormatted} | ` +
      `${video.views} views | ` +
      `${video.title} | ${video.url}`
    );
  }

  console.log("\nREPORT:", OUTPUT);
  console.log("GRADE: N/A");
  console.log("OTHER ENGINES UNCHANGED");

  if (searchesCompleted !== QUERIES.length ||
      unresolved.length > 0) {
    console.error(
      "INCOMPLETE TEST: Some searches or " +
      "verifications require attention."
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error("TEST #28 FAILED:", error.message);
  process.exitCode = 1;
});
