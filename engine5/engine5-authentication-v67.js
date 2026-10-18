
"use strict";

/*
 WEATHER TIME MACHINE — ENGINE 5
 VERSION 6.7
 IMAGE RETRIEVAL AND MAP QUALIFICATION REPAIR

 Node.js 22
 No external packages
 No API key
 No final grading

 PRESERVES:
 - Engine 5 v6.5 production server
 - Blogger Step 8A
 - Engines 1–4
*/

const fs = require("node:fs");
const crypto = require("node:crypto");

const BASE =
  process.env.ENGINE5_URL ||
  "https://weather-time-machine-engine5.onrender.com";

const EVENT = process.env.EVENT || "Superstorm Sandy";
const STATE = process.env.STATE || "New Jersey";
const YEAR = process.env.YEAR || "2012";

const OUT = "engine5-v67-authentication-results.json";

const MAX_CANDIDATES = 20;
const MAX_BYTES = 15 * 1024 * 1024;
const WAIT_BETWEEN_IMAGES_MS = 3000;
const MAX_RETRIES = 3;
const TIMEOUT_MS = 25000;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const clean = x =>
  String(x ?? "").replace(/\s+/g, " ").trim();

const plain = x =>
  clean(x).replace(/<[^>]*>/g, " ");

const hostAllowed = url => {
  try {
    const u = new URL(url);

    return (
      u.protocol === "https:" &&
      (
        u.hostname === "upload.wikimedia.org" ||
        u.hostname === "commons.wikimedia.org"
      )
    );
  } catch {
    return false;
  }
};

function imageType(b) {
  if (b.length < 12) return null;

  if (
    b[0] === 255 &&
    b[1] === 216 &&
    b[2] === 255
  ) {
    return "jpeg";
  }

  if (
    b.subarray(0, 8).equals(
      Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10
      ])
    )
  ) {
    return "png";
  }

  if (
    b.toString("ascii", 0, 4) === "GIF8"
  ) {
    return "gif";
  }

  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  return null;
}

function retryAfter(value) {
  if (!value) return 0;

  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const date = Date.parse(value);

  return Number.isFinite(date)
    ? Math.max(0, date - Date.now())
    : 0;
}

async function fetchTimed(url, headers = {}) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS
  );

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "WeatherTimeMachineEngine5/6.7 (research test)",
        ...headers
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  const r = await fetchTimed(url, {
    Accept: "application/json"
  });

  if (!r.ok) {
    throw new Error(
      `Audit endpoint HTTP ${r.status}`
    );
  }

  return r.json();
}

async function imageDownload(url) {
  if (!hostAllowed(url)) {
    return {
      ok: false,
      error: "Unapproved image host",
      attempts: 0
    };
  }

  const errors = [];

  for (
    let attempt = 0;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      const r = await fetchTimed(url, {
        Accept: "image/*"
      });

      if (!r.ok) {
        const error = `HTTP ${r.status}`;

        errors.push(error);

        const transient = [
          429, 500, 502, 503, 504
        ].includes(r.status);

        if (
          !transient ||
          attempt === MAX_RETRIES
        ) {
          break;
        }

        const delay = Math.min(
          60000,
          Math.max(
            retryAfter(
              r.headers.get("retry-after")
            ),
            5000 * 2 ** attempt
          ) +
          Math.floor(Math.random() * 750)
        );

        await r.body?.cancel();

        await sleep(delay);

        continue;
      }

      const declared = Number(
        r.headers.get("content-length") || 0
      );

      if (declared > MAX_BYTES) {
        await r.body?.cancel();

        return {
          ok: false,
          error: "Image exceeds 15 MB",
          attempts: attempt + 1,
          errors
        };
      }

      const chunks = [];
      let bytes = 0;

      for await (const chunk of r.body) {
        bytes += chunk.length;

        if (bytes > MAX_BYTES) {
          await r.body?.cancel();

          return {
            ok: false,
            error: "Image exceeds 15 MB",
            attempts: attempt + 1,
            errors
          };
        }

        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);
      const type = imageType(buffer);

      if (!type) {
        return {
          ok: false,
          error: "Unsupported image signature",
          attempts: attempt + 1,
          errors
        };
      }

      return {
        ok: true,
        type,
        bytes,
        sha256: crypto
          .createHash("sha256")
          .update(buffer)
          .digest("hex"),
        attempts: attempt + 1,
        errors
      };

    } catch (e) {
      errors.push(clean(e.message));

      if (attempt === MAX_RETRIES) {
        break;
      }

      await sleep(
        Math.min(
          30000,
          5000 * 2 ** attempt
        )
      );
    }
  }

  return {
    ok: false,
    error:
      errors.at(-1) ||
      "Download failed",
    attempts: errors.length,
    errors
  };
}

const MAP_WORDS = [
  "radar",
  "storm track",
  "track map",
  "track chart",
  "track.png",
  "track.gif",
  "storm path",
  "path.png",
  "path.gif",
  "weather map",
  "surface analysis",
  "synoptic",
  "meteorological",
  "isobar",
  "pressure chart",
  "forecast cone",
  "satellite image",
  "satellite imagery",
  "precipitation map",
  "weather chart"
];

const PHOTO_WORDS = [
  "storm damage",
  "flooded street",
  "debris",
  "damaged house",
  "rescue workers",
  "tracking trucks",
  "relief supplies",
  "photograph of",
  "photo of"
];

function eventNames(event) {
  const out = [event.toLowerCase()];

  if (/\bsandy\b/i.test(event)) {
    out.push(
      "sandy",
      "hurricane sandy",
      "superstorm sandy"
    );
  }

  return [...new Set(out)];
}

function yearTokens(s) {
  return [
    ...new Set(
      (
        s.match(/(?:18|19|20)\d{2}/g) ||
        []
      )
    )
  ];
}

function qualify(c) {
  const title = plain(c.title)
    .replace(/^File:/i, "")
    .replace(/_/g, " ");

  const desc = plain(c.description);
  const date = plain(c.date);

  const text =
    `${title} ${desc}`.toLowerCase();

  const mapWords = MAP_WORDS.filter(
    w => text.includes(w)
  );

  const photoWords = PHOTO_WORDS.filter(
    w => text.includes(w)
  );

  const eventMatch = eventNames(EVENT)
    .some(w => text.includes(w));

  const titleYears = yearTokens(title);
  const dateYears = yearTokens(date);

  const explicitYears = [
    ...new Set([
      ...titleYears,
      ...dateYears
    ])
  ];

  const conflictingYear =
    explicitYears.length > 0 &&
    !explicitYears.includes(YEAR);

  const yearMatch =
    explicitYears.includes(YEAR);

  const geoMatch =
    text.includes(
      STATE.toLowerCase()
    ) ||
    (
      STATE.toLowerCase() ===
        "new jersey" &&
      /\b(nj|mid.atlantic|northeast|nyc|new york)\b/i
        .test(text)
    );

  const obviousPhoto =
    photoWords.length > 0 &&
    mapWords.length === 0;

  let status = "insufficient_metadata";
  const reasons = [];

  if (conflictingYear) {
    status = "rejected_wrong_year";

    reasons.push(
      `Explicit year(s) ${explicitYears.join(", ")} conflict with ${YEAR}`
    );

  } else if (!eventMatch) {
    status = "rejected_wrong_event";

    reasons.push(
      "Requested event not found in metadata"
    );

  } else if (obviousPhoto) {
    status = "rejected_non_map";

    reasons.push(
      "Photographic content indicated, no map terms"
    );

  } else if (mapWords.length === 0) {
    reasons.push(
      "No recognized map or radar indicator"
    );

  } else if (!yearMatch) {
    reasons.push(
      "Year not independently confirmed in title/date"
    );

  } else {
    status =
      "pending_visual_verification";
  }

  if (!geoMatch) {
    reasons.push(
      "Geographic coverage requires review"
    );
  }

  return {
    status,
    reasons,
    mapWords,
    photoWords,
    eventMatch,
    yearMatch,
    explicitYears,
    geoMatch
  };
}

async function main() {
  const report = {
    engine: 5,
    version: "6.7",
    test:
      "Image Retrieval and Map Qualification",
    startedAt:
      new Date().toISOString(),
    event: EVENT,
    state: STATE,
    year: YEAR,
    status: "not_evaluated",
    candidates: [],
    summary: {},
    score: null,
    grade: null,
    finalGrade: false,
    authenticatedMaps: 0,
    visualVerification: false,
    provenanceVerification: false
  };

  try {
    const url = new URL(
      "/audit5",
      BASE
    );

    url.searchParams.set(
      "event",
      EVENT
    );

    url.searchParams.set(
      "state",
      STATE
    );

    url.searchParams.set(
      "year",
      YEAR
    );

    const audit =
      await fetchJson(url);

    if (
      audit.engine !== 5 ||
      !Array.isArray(audit.candidates)
    ) {
      throw new Error(
        "Invalid Engine 5 discovery response"
      );
    }

    report.discovery = {
      sourceVersion:
        audit.version,

      discoveryCompleted:
        audit.discoveryCompleted === true,

      searchCompleted:
        audit.searchCompleted === true,

      candidateCount:
        audit.candidateCount,

      discoveryError:
        audit.discoveryError || null
    };

    const candidates =
      audit.candidates.slice(
        0,
        MAX_CANDIDATES
      );

    for (
      let i = 0;
      i < candidates.length;
      i++
    ) {
      const c = candidates[i];

      const checks =
        qualify(c);

      const imageUrl =
        c.imageUrl ||
        c.thumbnailUrl ||
        null;

      let image = {
        ok: false,
        skipped: true,
        error:
          "Rejected or insufficient metadata"
      };

      if (
        checks.status ===
        "pending_visual_verification"
      ) {
        if (i > 0) {
          await sleep(
            WAIT_BETWEEN_IMAGES_MS
          );
        }

        image = imageUrl
          ? await imageDownload(imageUrl)
          : {
              ok: false,
              error: "No image URL"
            };
      }

      const status =
        checks.status ===
          "pending_visual_verification" &&
        !image.ok
          ? "download_unavailable"
          : checks.status;

      report.candidates.push({
        candidateNumber: i + 1,
        title: c.title || null,

        sourceURL:
          c.sourceUrl ||
          c.url ||
          null,

        imageURL: imageUrl,
        status,
        metadataChecks: checks,
        imageCheck: image,

        visualVerified: false,
        provenanceVerified: false,
        authenticated: false,
        acceptedForGrading: false,

        score: null,
        grade: null,

        manualReviewRequired:
          status ===
          "pending_visual_verification"
      });

      console.log(
        `${i + 1}/${candidates.length}: ` +
        `${status} — ` +
        `${c.title || "Untitled"}`
      );
    }

    const count = status =>
      report.candidates.filter(
        c => c.status === status
      ).length;

    report.summary = {
      examined:
        report.candidates.length,

      downloaded:
        report.candidates.filter(
          c => c.imageCheck.ok
        ).length,

      pendingVisualVerification:
        count(
          "pending_visual_verification"
        ),

      downloadUnavailable:
        count(
          "download_unavailable"
        ),

      rejectedWrongYear:
        count(
          "rejected_wrong_year"
        ),

      rejectedWrongEvent:
        count(
          "rejected_wrong_event"
        ),

      rejectedNonMap:
        count(
          "rejected_non_map"
        ),

      insufficientMetadata:
        count(
          "insufficient_metadata"
        ),

      authenticatedMaps: 0,
      finalGradingEnabled: false
    };

  } catch (e) {
    report.error =
      clean(e.message);

    process.exitCode = 1;
  }

  report.completedAt =
    new Date().toISOString();

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      report,
      null,
      2
    )
  );

  console.log(
    `Report: ${OUT}`
  );

  console.log(
    "Final grade: NOT EVALUATED — " +
    "visual and provenance review required"
  );

  if (report.error) {
    console.error(
      "ERROR:",
      report.error
    );
  }
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
