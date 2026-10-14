
"use strict";

const { chromium } = require("playwright");

// WEATHER TIME MACHINE — ENGINE 3 — TEST #23
// Independent YouTube verification of Test #22 candidates.
// Diagnostic only. No Blogger or A-F grading changes.

const MIN_VIEWS = 1000;

const CANDIDATES = [
  ["SAfxet_hvPQ", "Sandy residents prep sandbags for potential flooding", 2000],
  ["oTjITQIhgn4", "From the archives: Superstorm Sandy's devastation in New Jersey in 2012", 4000],
  ["_rf-4fgUOUE", "Superstorm, Hurricane Sandy 2012: Superstorm Sandy Wipes Out Seaside Heights, New Jersey", 202000],
  ["fMGhdW2RHKc", "Superstorm Sandy Hits Sea Bright NJ 2012", 5500],
  ["PAgKoHiG9UA", "Hurricane Sandy hits Sea Bright, NJ", 9700],
  ["3eCGWuXu3_I", "Superstorm Sandy 10 Years Later, a Comprehensive Lookback at the Disaster", 57000],
  ["9QkBtxiowiA", "Most dramatic footage of Superstorm Sandy", 195300],
  ["7oiJhI38SrM", "Sandy makes landfall in US East Coast", 2200],
  ["Y6TKmsReh88", "1,000 Miles Wide: The True Story of Hurricane Sandy", 1100],
  ["ASr7Vrb04lc", "The track of Hurricane Sandy (2012)", 84300],
  ["wroRU3yDBqw", "Sandy: The Storm That Almost Ended New York Forever", 353500],
  ["WTyjw9YLgog", "Marking a decade since Superstorm Sandy", 6200],
  ["SEj9bc2bH3E", "2012: Hurricane Sandy", 2000],
  ["RcLrl242WZQ", "Sandy: New York City's Nightmare Hurricane", 245400],
  ["RbMX2A545Wo", "Hurricane Sandy Aftermath Video: Inside the Chaos of Breezy Point", 562500]
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleMatches(expected, actual) {
  const a = normalize(expected);
  const b = normalize(actual);

  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  const words = a.split(" ").filter(w => w.length > 3);
  if (!words.length) return false;

  const actualWords = new Set(b.split(" "));
  const matches = words.filter(w => actualWords.has(w)).length;

  return matches / words.length >= 0.65;
}

function parseCount(value) {
  if (value === null || value === undefined) return null;

  const text = String(value).replace(/,/g, "").trim();
  if (/^\d+$/.test(text)) return Number(text);

  const match = text.match(/^([\d.]+)\s*([KMB])$/i);
  if (!match) return null;

  const multiplier = {
    K: 1000,
    M: 1000000,
    B: 1000000000
  }[match[2].toUpperCase()];

  return Math.round(Number(match[1]) * multiplier);
}

async function getOembed(context, id) {
  const url =
    "https://www.youtube.com/oembed?url=" +
    encodeURIComponent("https://www.youtube.com/watch?v=" + id) +
    "&format=json";

  try {
    const response = await context.request.get(url, {
      timeout: 15000,
      failOnStatusCode: false
    });

    if (!response.ok()) {
      return {
        available: false,
        status: response.status(),
        title: null
      };
    }

    const data = await response.json();

    return {
      available: true,
      status: response.status(),
      title: data.title || null,
      author: data.author_name || null
    };
  } catch (error) {
    return {
      available: false,
      status: null,
      title: null,
      error: error.message
    };
  }
}

async function getYoutubeViews(context, id) {
  const url = "https://www.youtube.com/watch?v=" + id;

  try {
    const response = await context.request.get(url, {
      timeout: 20000,
      failOnStatusCode: false,
      headers: {
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (!response.ok()) {
      return {
        views: null,
        status: response.status(),
        source: "unavailable"
      };
    }

    const html = await response.text();

    // Prefer the video-specific YouTube player response.
    const patterns = [
      /"videoDetails"\s*:\s*\{[\s\S]{0,12000}?"viewCount"\s*:\s*"(\d+)"/,
      /"viewCount"\s*:\s*"(\d+)"/,
      /itemprop="interactionCount"\s+content="(\d+)"/,
      /content="(\d+)"\s+itemprop="interactionCount"/
    ];

    for (let i = 0; i < patterns.length; i++) {
      const match = html.match(patterns[i]);

      if (match) {
        return {
          views: parseCount(match[1]),
          status: response.status(),
          source: i === 0
            ? "youtube-video-details"
            : "youtube-page-candidate"
        };
      }
    }

    return {
      views: null,
      status: response.status(),
      source: "not-extracted"
    };
  } catch (error) {
    return {
      views: null,
      status: null,
      source: "request-error",
      error: error.message
    };
  }
}

(async () => {
  console.log(
    "WEATHER TIME MACHINE — ENGINE 3 — TEST #23"
  );
  console.log(
    "YOUTUBE ID, TITLE AND VIEW-COUNT VERIFICATION"
  );
  console.log("MINIMUM VIEWS:", MIN_VIEWS);
  console.log("INPUT CANDIDATES:", CANDIDATES.length);

  const browser = await chromium.launch({
    headless: true
  });

  try {
    const context = await browser.newContext({
      locale: "en-US",
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) " +
        "AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36"
    });

    const results = [];
    const seen = new Set();

    for (const [id, expectedTitle, bingViews] of CANDIDATES) {
      console.log("\nCHECKING:", id);

      if (seen.has(id)) {
        results.push({
          id,
          status: "DUPLICATE",
          reason: "Already checked"
        });
        continue;
      }

      seen.add(id);

      const identity = await getOembed(context, id);
      const count = await getYoutubeViews(context, id);

      const titleConfirmed =
        identity.available &&
        titleMatches(expectedTitle, identity.title);

      const viewsConfirmed =
        count.views !== null &&
        count.views >= MIN_VIEWS &&
        count.source === "youtube-video-details";

      let status;

      if (!identity.available || count.views === null) {
        status = "UNVERIFIED";
      } else if (!titleConfirmed) {
        status = "TITLE_MISMATCH";
      } else if (!viewsConfirmed) {
        status = count.views < MIN_VIEWS
          ? "BELOW_THRESHOLD"
          : "UNVERIFIED";
      } else {
        status = "VERIFIED";
      }

      const result = {
        id,
        url: "https://www.youtube.com/watch?v=" + id,
        expectedTitle,
        youtubeTitle: identity.title,
        titleConfirmed,
        bingViews,
        youtubeViews: count.views,
        viewSource: count.source,
        oembedHttpStatus: identity.status,
        youtubeHttpStatus: count.status,
        status
      };

      results.push(result);

      console.log(JSON.stringify(result, null, 2));
    }

    const countStatus = status =>
      results.filter(r => r.status === status).length;

    console.log("\n=================================");
    console.log("TEST #23 — VERIFICATION SUMMARY");
    console.log("=================================");

    console.log("INPUT CANDIDATES:", CANDIDATES.length);
    console.log("UNIQUE IDS:", seen.size);
    console.log("VERIFIED:", countStatus("VERIFIED"));
    console.log("UNVERIFIED:", countStatus("UNVERIFIED"));
    console.log("TITLE MISMATCH:", countStatus("TITLE_MISMATCH"));
    console.log("BELOW 1000 VIEWS:", countStatus("BELOW_THRESHOLD"));
    console.log("DUPLICATES:", countStatus("DUPLICATE"));

    console.log("\nFINAL STATUS");

    const allVerified =
      results.length > 0 &&
      results.every(r => r.status === "VERIFIED");

    if (allVerified) {
      console.log(
        "ALL INPUT CANDIDATES VERIFIED."
      );
      console.log(
        "NOTE: Search completeness and grading still require testing."
      );
    } else {
      console.log(
        "VERIFICATION INCOMPLETE — REVIEW RESULTS."
      );
      console.log(
        "DO NOT ACTIVATE A-F GRADING."
      );
    }

    console.log(
      "TEST #23 FINISHED — BLOGGER AND ENGINES 1/2 UNCHANGED."
    );

    // Diagnostic run: exit successfully if the checks completed.
    // The VERIFICATION SUMMARY, not the green icon,
    // determines whether the data passed.
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error("TEST #23 ERROR:", error);
  process.exitCode = 1;
});
