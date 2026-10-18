
"use strict";

/*
 WEATHER TIME MACHINE — ENGINE 5
 HISTORICAL WEATHER MAP EVIDENCE SERVER

 Version: 6.1
 Node.js: 22
 Dependencies: None
 API keys: None

 PURPOSE:
 - Preserve existing Blogger /audit5 integration.
 - Preserve Bing Images research links.
 - Retrieve real candidate files from Wikimedia Commons.
 - Inspect available source metadata.
 - Reject clearly unsupported candidate formats.
 - Return image evidence for further review.
 - Never fabricate historical authenticity or grades.

 IMPORTANT:
 Wikimedia search results are candidate evidence only.
 A real map must still be visually and historically
 authenticated before a final A-F grade is awarded.

 Does not modify Engines 1-4.
 Does not modify Blogger HTML.
*/

const http = require("node:http");

const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";

const COMMONS_API =
  "https://commons.wikimedia.org/w/api.php";

const MAX_RESULTS = 15;
const TIMEOUT_MS = 15000;

const USER_AGENT =
  "WeatherTimeMachine-Engine5/6.1 " +
  "(historical weather research)";

// ==========================================
// HTTP RESPONSE
// ==========================================

function respond(res, status, payload) {

  const body = JSON.stringify(
    payload,
    null,
    2
  );

  res.writeHead(status, {
    "Content-Type":
      "application/json; charset=utf-8",

    "Access-Control-Allow-Origin": "*",

    "Access-Control-Allow-Methods":
      "GET, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Cache-Control": "no-store",

    "X-Content-Type-Options": "nosniff"
  });

  res.end(body);
}

// ==========================================
// TEXT UTILITIES
// ==========================================

function normalize(value) {

  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value) {

  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function safeHttpUrl(value) {

  try {

    const url = new URL(value);

    return (
      url.protocol === "https:" ||
      url.protocol === "http:"
    ) ? url.toString() : null;

  } catch {

    return null;
  }
}

// ==========================================
// BING IMAGES RESEARCH LINK
// ==========================================

function bingImagesUrl(query) {

  const url = new URL(
    "https://www.bing.com/images/search"
  );

  url.searchParams.set("q", query);

  return url.toString();
}

// ==========================================
// COMMONS API REQUEST
// ==========================================

async function commonsRequest(params) {

  const url = new URL(COMMONS_API);

  url.searchParams.set(
    "format",
    "json"
  );

  url.searchParams.set(
    "formatversion",
    "2"
  );

  url.searchParams.set(
    "origin",
    "*"
  );

  for (const [key, value] of
    Object.entries(params)) {

    url.searchParams.set(
      key,
      String(value)
    );
  }

  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS
  );

  try {

    const response = await fetch(
      url,
      {
        method: "GET",

        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "application/json"
        },

        signal: controller.signal
      }
    );

    if (!response.ok) {

      throw new Error(
        "Commons HTTP " +
        response.status
      );
    }

    const data = await response.json();

    if (data.error) {

      throw new Error(
        data.error.info ||
        "Commons API error"
      );
    }

    return data;

  } finally {

    clearTimeout(timeout);
  }
}

// ==========================================
// SEARCH REAL COMMONS FILES
// ==========================================

async function searchCommons(
  event,
  state,
  year
) {

  /*
   Bing research remains exactly:
   event + state + map

   Commons discovery uses a separate query.
   The year helps narrow historical results.
  */

  const searchQuery = [
    event,
    state,
    year,
    "map"
  ]
    .filter(Boolean)
    .join(" ");

  const data = await commonsRequest({

    action: "query",

    list: "search",

    srsearch: searchQuery,

    srnamespace: 6,

    srlimit: MAX_RESULTS
  });

  const matches =
    data.query?.search || [];

  if (!matches.length) {

    return {
      query: searchQuery,
      candidates: [],
      searchCompleted: true
    };
  }

  const titles = matches
    .map(item => item.title)
    .filter(Boolean);

  const details = await commonsRequest({

    action: "query",

    prop: "imageinfo",

    titles: titles.join("|"),

    iiprop:
      "url|mime|size|extmetadata",

    iiurlwidth: 900
  });

  const pages =
    details.query?.pages || [];

  const candidates = [];

  for (const page of pages) {

    const info =
      page.imageinfo?.[0];

    if (!info) {
      continue;
    }

    const mime =
      String(info.mime || "")
        .toLowerCase();

    const supported =
      mime.startsWith("image/");

    if (!supported) {
      continue;
    }

    const metadata =
      info.extmetadata || {};

    const description = stripHtml(
      metadata.ImageDescription?.value
    );

    const credit = stripHtml(
      metadata.Credit?.value
    );

    const artist = stripHtml(
      metadata.Artist?.value
    );

    const date = stripHtml(
      metadata.DateTimeOriginal?.value
    );

    const license = stripHtml(
      metadata.LicenseShortName?.value
    );

    const imageUrl =
      safeHttpUrl(info.url);

    const thumbnailUrl =
      safeHttpUrl(
        info.thumburl || info.url
      );

    const sourceUrl =
      safeHttpUrl(
        info.descriptionurl
      );

    if (!imageUrl || !sourceUrl) {
      continue;
    }

    const candidate = {

      title: page.title,

      url: sourceUrl,

      sourceUrl,

      imageUrl,

      thumbnailUrl,

      provider:
        "Wikimedia Commons",

      mime,

      width: info.width || null,

      height: info.height || null,

      description,

      credit,

      artist,

      date,

      license,

      metadataAvailable:
        Boolean(
          description ||
          credit ||
          artist ||
          date
        ),

      visualVerified: false,

      provenanceVerified: false,

      eventVerified: false,

      geographyVerified: false,

      dateVerified: false,

      authenticityStatus:
        "not_verified",

      acceptedForGrading: false
    };

    candidates.push(candidate);
  }

  return {
    query: searchQuery,
    candidates,
    searchCompleted: true
  };
}

// ==========================================
// EVIDENCE SUMMARY
// ==========================================

function buildEvidence(candidates) {

  return candidates.map(
    candidate => ({

      title: candidate.title,

      url: candidate.sourceUrl,

      provider: candidate.provider,

      imageUrl: candidate.imageUrl,

      thumbnailUrl:
        candidate.thumbnailUrl,

      description:
        candidate.description,

      date: candidate.date,

      verification:
        "not_verified"
    })
  );
}

// ==========================================
// MAP AUDIT ENDPOINT
// ==========================================

async function handleAudit(url, res) {

  const event = normalize(
    url.searchParams.get("event")
  );

  const state = normalize(
    url.searchParams.get("state")
  );

  const year = normalize(
    url.searchParams.get("year")
  );

  if (!event || !state) {

    return respond(res, 400, {

      status: "error",

      engine: 5,

      message:
        "Both event and state are required."
    });
  }

  if (
    event.length > 200 ||
    state.length > 100 ||
    year.length > 20
  ) {

    return respond(res, 400, {

      status: "error",

      engine: 5,

      message:
        "Query parameters are too long."
    });
  }

  if (
    year &&
    !/^\d{4}$/.test(year)
  ) {

    return respond(res, 400, {

      status: "error",

      engine: 5,

      message:
        "Year must contain four digits."
    });
  }

  // Preserve original Bing search rule.
  // Year is excluded from Bing query.

  const query =
    `${event} ${state} map`;

  const researchURL =
    bingImagesUrl(query);

  let candidates = [];

  let discoveryCompleted = false;

  let discoveryError = null;

  let commonsQuery = null;

  try {

    const discovery =
      await searchCommons(
        event,
        state,
        year
      );

    candidates =
      discovery.candidates;

    commonsQuery =
      discovery.query;

    discoveryCompleted =
      discovery.searchCompleted;

  } catch (error) {

    discoveryError =
      error.message;

    console.error(
      "Engine 5 discovery error:",
      error.message
    );
  }

  const evidence =
    buildEvidence(candidates);

  /*
   IMPORTANT GRADING SAFEGUARD

   A Commons search is NOT a completed
   historical authenticity audit.

   Even when candidates exist, the
   engine has not visually verified
   whether they are genuine maps.

   Therefore:
   - No unsupported A-F grades.
   - No automatic zero.
   - No fabricated verification.
  */

  return respond(res, 200, {

    status: "not_evaluated",

    engine: 5,

    version: "6.1",

    category:
      "Historical Weather Maps",

    source:
      "Wikimedia Commons + Bing Images",

    apiKeyRequired: false,

    automatedSearch: true,

    visualVerification: false,

    finalGradingEnabled: false,

    event,

    state,

    year: year || null,

    query,

    researchURL,

    researchUrl: researchURL,

    commonsQuery,

    discoveryCompleted,

    searchCompleted: false,

    candidateCount:
      candidates.length,

    rejectedCount: null,

    candidates,

    evidence,

    score: null,

    grade: null,

    finalGrade: false,

    verification: {

      imageCandidatesRetrieved:
        candidates.length > 0,

      sourceMetadataCollected:
        candidates.some(
          c => c.metadataAvailable
        ),

      visualAuthenticityVerified:
        false,

      eventVerified: false,

      yearVerified: false,

      geographyVerified: false,

      completedHistoricalAudit:
        false
    },

    discoveryError,

    message:
      discoveryError
        ? "Historical map discovery encountered an error. Verification remains Not Evaluated."
        : candidates.length
          ? "Historical image candidates retrieved. Review actual map content, source, event, year and location before assigning a grade."
          : "No candidates returned by this Commons query. This is not proof that historical maps do not exist. Grade remains Not Evaluated."
  });
}

// ==========================================
// HEALTH ENDPOINT
// ==========================================

function healthResponse(res) {

  return respond(res, 200, {

    status: "ok",

    engine: 5,

    version: "6.1",

    source:
      "Wikimedia Commons + Bing Images",

    apiKeyRequired: false,

    automatedSearch: true,

    visualVerification: false,

    finalGradingEnabled: false,

    endpoints: [
      "/",
      "/health",
      "/audit5"
    ],

    message:
      "Live historical map candidate discovery enabled. Final authenticity grading remains disabled until verified."
  });
}

// ==========================================
// HTTP SERVER
// ==========================================

const server = http.createServer(
  async (req, res) => {

    if (req.method === "OPTIONS") {

      res.writeHead(204, {

        "Access-Control-Allow-Origin":
          "*",

        "Access-Control-Allow-Methods":
          "GET, OPTIONS",

        "Access-Control-Allow-Headers":
          "Content-Type"
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

      url = new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
      );

    } catch {

      return respond(res, 400, {

        status: "error",

        message: "Invalid URL."
      });
    }

    try {

      if (url.pathname === "/health") {

        return healthResponse(res);
      }

      if (url.pathname === "/audit5") {

        return await handleAudit(
          url,
          res
        );
      }

      if (url.pathname === "/") {

        return respond(res, 200, {

          name:
            "Weather Time Machine — Engine 5",

          version: "6.1",

          source:
            "Wikimedia Commons + Bing Images",

          health: "/health",

          auditExample:
            "/audit5?event=Superstorm%20Sandy&state=New%20Jersey&year=2012",

          message:
            "Historical map candidate discovery service. Authenticity verification is required before grading."
        });
      }

      return respond(res, 404, {

        status: "error",

        message:
          "Endpoint not found."
      });

    } catch (error) {

      console.error(
        "Engine 5 server error:",
        error
      );

      if (!res.headersSent) {

        return respond(res, 500, {

          status: "error",

          engine: 5,

          message:
            "Internal Engine 5 error."
        });
      }
    }
  }
);

// ==========================================
// START SERVER
// ==========================================

server.listen(
  PORT,
  HOST,
  () => {

    console.log(
      "Weather Time Machine Engine 5 " +
      "v6.1 listening on port " +
      PORT
    );
  }
);
