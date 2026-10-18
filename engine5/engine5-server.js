
"use strict";

/*
 WEATHER TIME MACHINE — ENGINE 5
 VERSION 6.6
 HISTORICAL WEATHER MAP AUTHENTICATION TEST

 Node.js 22
 No external packages
 No API key required

 PURPOSE:
 - Read live Engine 5 discovery results
 - Examine actual discovered candidate URLs
 - Check Wikimedia Commons provenance
 - Check image accessibility and signatures
 - Check event, year, geography, and map metadata
 - Reject obvious photographs
 - Preserve honest verification statuses

 IMPORTANT:
 This is an independent test module.
 It does not replace engine5-server.js.
 It does not automatically award A-F grades.
*/

const fs = require("node:fs");
const crypto = require("node:crypto");

const VERSION = "6.6";

const BASE_URL =
  process.env.ENGINE5_URL ||
  "https://weather-time-machine-engine5.onrender.com";

const EVENT = process.env.EVENT || "Superstorm Sandy";
const STATE = process.env.STATE || "New Jersey";
const YEAR = process.env.YEAR || "2012";

const MAX_CANDIDATES = 12;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 20000;

const MAP_WORDS = [
  "radar",
  "weather map",
  "meteorological map",
  "storm track",
  "storm path",
  "forecast map",
  "surface analysis",
  "synoptic chart",
  "satellite imagery",
  "satellite image",
  "precipitation map",
  "pressure chart",
  "hurricane track",
  "weather chart"
];

const PHOTO_WORDS = [
  "storm damage",
  "flood damage",
  "damaged houses",
  "damaged homes",
  "debris",
  "rescue workers",
  "tracking trucks",
  "relief supplies",
  "evacuees",
  "aerial photo",
  "photograph of",
  "photo of"
];

function clean(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(text, words) {
  const value = clean(text).toLowerCase();
  return words.filter(word => value.includes(word));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sha256(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function request(url, options = {}) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent":
          "WeatherTimeMachineEngine5/6.6 " +
          "(historical-map-research)",
        Accept: "*/*",
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(url) {
  const response = await request(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${url}`
    );
  }

  return response.json();
}

function detectImageType(buffer) {
  if (buffer.length < 12) return null;

  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "jpeg";
  }

  if (
    buffer.subarray(0, 8).equals(
      Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10
      ])
    )
  ) {
    return "png";
  }

  if (
    buffer.subarray(0, 6).toString("ascii")
      .startsWith("GIF8")
  ) {
    return "gif";
  }

  if (
    buffer.subarray(0, 4).toString("ascii") ===
      "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") ===
      "WEBP"
  ) {
    return "webp";
  }

  return null;
}

async function downloadImage(url) {
  const parsed = safeUrl(url);

  if (!parsed) {
    return {
      ok: false,
      error: "Invalid image URL"
    };
  }

  try {
    const response = await request(parsed.href);

    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}`
      };
    }

    const reportedLength = Number(
      response.headers.get("content-length") || 0
    );

    if (reportedLength > MAX_IMAGE_BYTES) {
      await response.body?.cancel();

      return {
        ok: false,
        error: "Image exceeds size limit"
      };
    }

    const chunks = [];
    let total = 0;

    for await (const chunk of response.body) {
      total += chunk.length;

      if (total > MAX_IMAGE_BYTES) {
        await response.body?.cancel();

        return {
          ok: false,
          error: "Image exceeds size limit"
        };
      }

      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    const type = detectImageType(buffer);

    if (!type) {
      return {
        ok: false,
        error: "No supported image signature"
      };
    }

    return {
      ok: true,
      type,
      bytes: buffer.length,
      sha256: sha256(buffer),
      contentType:
        response.headers.get("content-type")
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}

function commonsTitle(candidate) {
  const source = safeUrl(
    candidate.sourceURL || candidate.url
  );

  if (!source) return null;

  if (
    source.hostname !== "commons.wikimedia.org"
  ) {
    return null;
  }

  const marker = "/wiki/File:";

  if (!source.pathname.startsWith(marker)) {
    return null;
  }

  return decodeURIComponent(
    source.pathname.slice("/wiki/".length)
  );
}

async function commonsMetadata(candidate) {
  const title = commonsTitle(candidate);

  if (!title) {
    return {
      available: false,
      error: "Not a Wikimedia Commons file"
    };
  }

  const api = new URL(
    "https://commons.wikimedia.org/w/api.php"
  );

  api.searchParams.set("action", "query");
  api.searchParams.set("format", "json");
  api.searchParams.set("prop", "imageinfo");
  api.searchParams.set("titles", title);
  api.searchParams.set("iiprop", "url|size|mime|extmetadata");

  try {
    const json = await readJson(api.href);

    const pages = Object.values(
      json.query?.pages || {}
    );

    const page = pages.find(
      item => Array.isArray(item.imageinfo)
    );

    if (!page) {
      return {
        available: false,
        error: "Commons image metadata not found"
      };
    }

    const info = page.imageinfo[0];
    const metadata = info.extmetadata || {};

    const field = name =>
      clean(
        metadata[name]?.value || ""
      ).replace(/<[^>]*>/g, " ");

    return {
      available: true,
      title: page.title,
      imageUrl: info.url || null,
      width: info.width || null,
      height: info.height || null,
      mime: info.mime || null,
      description: field("ImageDescription"),
      dateTime: field("DateTimeOriginal"),
      credit: field("Credit"),
      artist: field("Artist"),
      license: field("LicenseShortName"),
      source: field("Source")
    };
  } catch (error) {
    return {
      available: false,
      error: error.message
    };
  }
}

function aliases(event) {
  const values = [clean(event)];

  if (/\bsandy\b/i.test(event)) {
    values.push(
      "Sandy",
      "Hurricane Sandy",
      "Superstorm Sandy",
      "Post-Tropical Cyclone Sandy"
    );
  }

  return unique(values);
}

function evaluateMetadata(candidate, metadata) {
  const title = clean(candidate.title);

  const text = [
    title,
    candidate.description,
    metadata.description,
    metadata.title
  ].join(" ").toLowerCase();

  const mapTerms = containsAny(text, MAP_WORDS);
  const photoTerms = containsAny(text, PHOTO_WORDS);

  const eventMatch = aliases(EVENT).some(
    alias => text.includes(alias.toLowerCase())
  );

  const yearMatch =
    text.includes(YEAR) ||
    clean(candidate.date).includes(YEAR) ||
    clean(metadata.dateTime).includes(YEAR);

  const stateMatch =
    text.includes(STATE.toLowerCase()) ||
    (
      STATE.toLowerCase() === "new jersey" &&
      /\b(nj|mid.atlantic|northeast|new york)\b/i
        .test(text)
    );

  const imageMapSignal = mapTerms.length > 0;

  const obviousPhoto =
    photoTerms.length > 0 &&
    !imageMapSignal;

  const reasons = [];

  if (!imageMapSignal) {
    reasons.push(
      "No explicit weather-map indicator"
    );
  }

  if (!eventMatch) {
    reasons.push(
      "Event not confirmed by metadata"
    );
  }

  if (!yearMatch) {
    reasons.push(
      "Historical year not confirmed"
    );
  }

  if (!stateMatch) {
    reasons.push(
      "Geographic relevance requires review"
    );
  }

  if (obviousPhoto) {
    reasons.push(
      "Metadata suggests a photograph"
    );
  }

  return {
    mapTerms,
    photoTerms,
    eventMatch,
    yearMatch,
    geographyMatch: stateMatch,
    obviousPhoto,
    metadataQualified:
      imageMapSignal &&
      eventMatch &&
      yearMatch &&
      !obviousPhoto,
    reasons
  };
}

async function authenticateCandidate(
  candidate,
  index
) {
  const metadata = await commonsMetadata(candidate);

  const checks = evaluateMetadata(
    candidate,
    metadata
  );

  const imageUrl =
    metadata.imageUrl ||
    candidate.imageUrl ||
    candidate.thumbnailUrl ||
    null;

  const image = imageUrl
    ? await downloadImage(imageUrl)
    : {
        ok: false,
        error: "No image URL available"
      };

  let status = "not_evaluated";

  if (checks.obviousPhoto) {
    status = "rejected_non_map";
  } else if (
    checks.metadataQualified &&
    image.ok &&
    metadata.available
  ) {
    status = "pending_visual_verification";
  } else if (
    !checks.metadataQualified
  ) {
    status = "insufficient_metadata";
  }

  return {
    candidateNumber: index + 1,
    title: candidate.title || null,
    sourceURL:
      candidate.sourceURL ||
      candidate.url ||
      null,
    imageURL: imageUrl,
    provider:
      candidate.provider || "Unknown",
    status,
    metadataChecks: checks,
    commonsMetadata: metadata,
    imageCheck: image,
    visualVerified: false,
    provenanceVerified: false,
    authenticated: false,
    acceptedForGrading: false,
    score: null,
    grade: null,
    manualReviewRequired: true,
    reviewQuestions: [
      "Does the image actually depict a weather map?",
      "Is the displayed date consistent with the event?",
      "Does the map cover the correct geographic area?",
      "Does the source establish historical provenance?",
      "Does the map show the requested weather event?"
    ]
  };
}

function auditUrl() {
  const url = new URL(
    "/audit5",
    BASE_URL
  );

  url.searchParams.set("event", EVENT);
  url.searchParams.set("state", STATE);
  url.searchParams.set("year", YEAR);

  return url.href;
}

async function main() {
  const startedAt = new Date().toISOString();

  console.log(
    "Weather Time Machine — Engine 5 v6.6"
  );

  console.log(
    `Event: ${EVENT} | State: ${STATE} | Year: ${YEAR}`
  );

  const report = {
    engine: 5,
    version: VERSION,
    test: "Historical Map Authentication",
    startedAt,
    event: EVENT,
    state: STATE,
    year: YEAR,
    status: "not_evaluated",
    discovery: null,
    candidates: [],
    summary: null,
    score: null,
    grade: null,
    finalGrade: false,
    error: null
  };

  try {
    const audit = await readJson(auditUrl());

    if (audit.engine !== 5) {
      throw new Error(
        "Unexpected discovery engine response"
      );
    }

    report.discovery = {
      sourceVersion: audit.version,
      discoveryCompleted:
        audit.discoveryCompleted === true,
      searchCompleted:
        audit.searchCompleted === true,
      candidateCount:
        Number(audit.candidateCount || 0),
      rejectedCount:
        Number(audit.rejectedCount || 0),
      discoveryError:
        audit.discoveryError || null
    };

    const candidates = Array.isArray(
      audit.candidates
    )
      ? audit.candidates.slice(
          0,
          MAX_CANDIDATES
        )
      : [];

    for (
      let i = 0;
      i < candidates.length;
      i++
    ) {
      const result =
        await authenticateCandidate(
          candidates[i],
          i
        );

      report.candidates.push(result);

      console.log(
        `${i + 1}/${candidates.length}: ` +
        `${result.status} — ${result.title}`
      );
    }

    const pending =
      report.candidates.filter(
        item =>
          item.status ===
          "pending_visual_verification"
      ).length;

    const rejected =
      report.candidates.filter(
        item =>
          item.status === "rejected_non_map"
      ).length;

    report.summary = {
      examined: report.candidates.length,
      pendingVisualVerification: pending,
      rejectedNonMaps: rejected,
      authenticatedMaps: 0,
      finalGradingEnabled: false
    };

    report.status = "not_evaluated";
  } catch (error) {
    report.error = error.message;

    console.error(
      "Authentication test error:",
      error.message
    );
  }

  report.completedAt =
    new Date().toISOString();

  fs.writeFileSync(
    "engine5-v66-authentication-results.json",
    JSON.stringify(report, null, 2)
  );

  console.log(
    "\nReport: " +
    "engine5-v66-authentication-results.json"
  );

  console.log(
    "Final grade: NOT EVALUATED"
  );

  console.log(
    "Manual historical-map review remains required."
  );

  if (report.error) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
