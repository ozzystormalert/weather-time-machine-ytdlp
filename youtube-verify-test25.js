
"use strict";

// WEATHER TIME MACHINE — ENGINE 3 — TEST #25
// Independent YouTube metadata and view-count verification.
// Uses the official YouTube Data API.
// Does not modify Blogger or Engines 1 and 2.

const fs = require("node:fs");

const API_KEY = process.env.YOUTUBE_API_KEY || "";
const MIN_VIEWS = 1000;

const QUERY =
  process.env.WEATHER_QUERY ||
  "hurricane sandy 2012 new jersey news";

// Supply recovered IDs through VIDEO_IDS.
// Example: VIDEO_IDS=abcdefghijk,ABCDEFGHIJK
const INPUT = process.env.VIDEO_IDS || "";

function uniqueIds(raw) {
  return [...new Set(
    raw.split(/[\s,;]+/)
      .map(s => s.trim())
      .filter(s => /^[A-Za-z0-9_-]{11}$/.test(s))
  )];
}

function relevance(title, description) {
  const t = String(title || "").toLowerCase();
  const d = String(description || "")
    .toLowerCase()
    .slice(0, 3000);

  const event =
    /\b(sandy|superstorm)\b/.test(t);

  const context =
    /\b(2012|hurricane|storm|flood|surge|aftermath|damage|coast|news|coverage)\b/.test(t);

  const place =
    /\b(new jersey|jersey shore|\bnj\b|atlantic city|seaside heights|hoboken|belmar|point pleasant|asbury park|long beach island|lbi)\b/.test(t + " " + d);

  // Title must identify the event.
  // Description may help establish the location.
  return {
    event,
    context,
    place,
    relevant: event && (context || place)
  };
}

async function verifyBatch(ids) {
  const url = new URL(
    "https://www.googleapis.com/youtube/v3/videos"
  );

  url.searchParams.set(
    "part",
    "snippet,statistics,status"
  );
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("key", API_KEY);

  const response = await fetch(url);

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `HTTP ${response.status}`;

    throw new Error(
      "YouTube API request failed: " + message
    );
  }

  return data.items || [];
}

async function main() {
  console.log(
    "WEATHER TIME MACHINE — ENGINE 3 — TEST #25"
  );
  console.log("OFFICIAL YOUTUBE VERIFICATION");
  console.log("EVENT:", QUERY);
  console.log("MINIMUM VIEWS:", MIN_VIEWS);

  if (!API_KEY) {
    throw new Error(
      "Missing YOUTUBE_API_KEY GitHub Actions secret."
    );
  }

  const ids = uniqueIds(INPUT);

  if (!ids.length) {
    throw new Error(
      "No recovered video IDs supplied in VIDEO_IDS. " +
      "Test #24E IDs must be provided before verification."
    );
  }

  console.log("DISTINCT INPUT IDS:", ids.length);

  const verified = [];
  const rejected = [];
  const unresolved = [];

  for (let start = 0; start < ids.length; start += 50) {
    const batch = ids.slice(start, start + 50);
    const items = await verifyBatch(batch);

    const returned = new Map(
      items.map(item => [item.id, item])
    );

    for (const id of batch) {
      const item = returned.get(id);

      if (!item) {
        unresolved.push({
          id,
          reason: "VIDEO_NOT_RETURNED_BY_API"
        });
        continue;
      }

      const title = item.snippet?.title || "";
      const description =
        item.snippet?.description || "";

      const match = relevance(title, description);

      const rawViews = item.statistics?.viewCount;
      const views =
        rawViews !== undefined &&
        /^\d+$/.test(String(rawViews))
          ? Number(rawViews)
          : null;

      const record = {
        id,
        title,
        channel: item.snippet?.channelTitle || "",
        publishedAt:
          item.snippet?.publishedAt || null,
        views,
        youtubeUrl:
          "https://www.youtube.com/watch?v=" + id,
        relevance: match,
        verificationSource:
          "YouTube Data API videos.list"
      };

      if (!match.relevant) {
        rejected.push({
          ...record,
          reason: "EVENT_RELEVANCE_NOT_ESTABLISHED"
        });
      } else if (views === null) {
        unresolved.push({
          ...record,
          reason: "VIEW_COUNT_UNAVAILABLE"
        });
      } else if (views < MIN_VIEWS) {
        rejected.push({
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

  const result = {
    engine: 3,
    test: 25,
    event: QUERY,
    minimumViews: MIN_VIEWS,
    distinctInputIds: ids.length,
    verifiedQualifyingVideos: verified.length,
    rejectedVideos: rejected.length,
    unresolvedVideos: unresolved.length,
    grade: "N/A",
    gradeStatus:
      "AWAITING_REVIEW_AND_GRADING_RULES",
    verified,
    rejected,
    unresolved
  };

  console.log(
    "\n========== TEST #25 SUMMARY =========="
  );
  console.log(
    "DISTINCT INPUT IDS:",
    ids.length
  );
  console.log(
    "VERIFIED VIDEOS WITH 1000+ VIEWS:",
    verified.length
  );
  console.log(
    "REJECTED VIDEOS:",
    rejected.length
  );
  console.log(
    "UNRESOLVED VIDEOS:",
    unresolved.length
  );
  console.log(
    "A-F GRADE: NOT YET ASSIGNED"
  );

  console.log(
    "\nCOMPLETE VERIFICATION RESULT:",
    JSON.stringify(result, null, 2)
  );

  fs.writeFileSync(
    "engine3-test25-results.json",
    JSON.stringify(result, null, 2)
  );

  console.log(
    "\nRESULT SAVED: engine3-test25-results.json"
  );
  console.log(
    "BLOGGER AND ENGINES 1/2 UNCHANGED."
  );
}

main().catch(error => {
  console.error(
    "TEST #25 FAILED:",
    error.message
  );
  process.exitCode = 1;
});
