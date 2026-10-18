
"use strict";

/*
 WEATHER TIME MACHINE — ENGINE 5
 VERSION 6.2

 HISTORICAL WEATHER MAP QUALIFICATION

 Node.js 22
 No external packages
 No API key
 No Bing scraping

 PRESERVES:
 - /health
 - /audit5
 - Bing Images research
 - Wikimedia Commons discovery
 - Blogger Step 8A compatibility
 - Engines 1–4 (unchanged)

 NEW:
 - Weather-map candidate qualification
 - Photograph rejection
 - Event, year and geography metadata checks
 - Ranked candidate results
 - Rejection explanations
 - Verification safeguards

 IMPORTANT:
 Metadata classification is NOT visual verification.
 Candidate results are NOT authenticated maps.
 Final A–F grading remains disabled.
*/

const http = require("node:http");

const PORT =
  Number(process.env.PORT) || 10000;

const HOST = "0.0.0.0";

const VERSION = "6.2";

const COMMONS_API =
  "https://commons.wikimedia.org/w/api.php";

const MAX_RESULTS = 20;

const MAX_CANDIDATES = 40;

const TIMEOUT_MS = 18000;

const USER_AGENT =
  "WeatherTimeMachine-Engine5/6.2 " +
  "(historical weather research)";

// ========================================
// HTTP RESPONSE
// ========================================

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

    "X-Content-Type-Options":
      "nosniff"
  });

  res.end(body);
}

// ========================================
// TEXT HELPERS
// ========================================

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
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function safeHttpUrl(value) {

  try {

    const url = new URL(value);

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }

    return url.toString();

  } catch {

    return null;
  }
}

function escapeRegex(value) {

  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function containsPhrase(text, phrase) {

  if (!phrase) {
    return false;
  }

  const pattern = new RegExp(
    "(^|[^a-z0-9])" +
    escapeRegex(
      phrase.toLowerCase()
    ) +
    "([^a-z0-9]|$)",
    "i"
  );

  return pattern.test(
    text.toLowerCase()
  );
}

function unique(values) {

  return [...new Set(
    values.filter(Boolean)
  )];
}

// ========================================
// BING RESEARCH URL
// ========================================

function bingImagesUrl(query) {

  const url = new URL(
    "https://www.bing.com/images/search"
  );

  url.searchParams.set("q", query);

  return url.toString();
}

// ========================================
// WIKIMEDIA COMMONS API
// ========================================

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

  for (
    const [key, value]
    of Object.entries(params)
  ) {

    url.searchParams.set(
      key,
      String(value)
    );
  }

  const controller =
    new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS
  );

  try {

    const response = await fetch(
      url,
      {

        headers: {

          "User-Agent": USER_AGENT,

          "Accept":
            "application/json"
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

    const data =
      await response.json();

    if (data.error) {

      throw new Error(
        data.error.info ||
        "Commons API error"
      );
    }

    return data;

  } finally {

    clearTimeout(timer);
  }
}

// ========================================
// SEARCH QUERY BUILDING
// ========================================

function buildQueries(event, state, year) {

  /*
   Search multiple map-specific phrases.

   The original Bing research query
   remains event + state + map.

   These are Commons discovery queries.
  */

  return unique([

    [event, state, "weather map"]
      .join(" "),

    [event, year, "storm track map"]
      .filter(Boolean)
      .join(" "),

    [event, state, year, "radar"]
      .filter(Boolean)
      .join(" "),

    [event, year, "meteorological map"]
      .filter(Boolean)
      .join(" "),

    [event, state, "map"]
      .join(" ")

  ]);
}

// ========================================
// COMMONS FILE SEARCH
// ========================================

async function searchCommons(query) {

  const data = await commonsRequest({

    action: "query",

    list: "search",

    srsearch: query,

    srnamespace: 6,

    srlimit: MAX_RESULTS
  });

  return (
    data.query?.search || []
  );
}

// ========================================
// FILE METADATA LOOKUP
// ========================================

async function getFileDetails(titles) {

  if (!titles.length) {
    return [];
  }

  const data = await commonsRequest({

    action: "query",

    prop: "imageinfo",

    titles: titles.join("|"),

    iiprop:
      "url|mime|size|extmetadata",

    iiurlwidth: 900
  });

  return (
    data.query?.pages || []
  );
}

// ========================================
// CANDIDATE EXTRACTION
// ========================================

function extractCandidate(page) {

  const info =
    page.imageinfo?.[0];

  if (!info) {
    return null;
  }

  const mime =
    String(info.mime || "")
      .toLowerCase();

  if (!mime.startsWith("image/")) {
    return null;
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

  const imageUrl = safeHttpUrl(
    info.url
  );

  const thumbnailUrl = safeHttpUrl(
    info.thumburl || info.url
  );

  const sourceUrl = safeHttpUrl(
    info.descriptionurl
  );

  if (!imageUrl || !sourceUrl) {
    return null;
  }

  return {

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
      )
  };
}

// ========================================
// MAP AND PHOTO KEYWORDS
// ========================================

const MAP_TERMS = [

  "weather map",

  "historical weather map",

  "meteorological map",

  "synoptic chart",

  "surface analysis",

  "surface weather",

  "weather chart",

  "storm track",

  "track map",

  "track chart",

  "hurricane track",

  "cyclone track",

  "forecast cone",

  "radar map",

  "radar image",

  "radar reflectivity",

  "doppler radar",

  "satellite imagery",

  "satellite image",

  "precipitation map",

  "rainfall map",

  "wind field",

  "wind speed map",

  "pressure map",

  "isobar",

  "temperature map",

  "flood inundation map",

  "storm surge map",

  "weather analysis",

  "weather radar"

];

const PHOTO_TERMS = [

  "storm damage",

  "damage photo",

  "damage photograph",

  "aerial photo",

  "aerial photograph",

  "street photo",

  "street photograph",

  "flood damage",

  "damaged house",

  "damaged homes",

  "destroyed home",

  "destroyed homes",

  "flooded street",

  "flooded road",

  "downed trees",

  "fallen trees",

  "debris",

  "aftermath photo",

  "aftermath photograph",

  "people evacuating",

  "rescue workers",

  "news photograph",

  "photograph of",

  "photo of"

];

const MAP_TITLE_TERMS = [

  "map",

  "chart",

  "radar",

  "track",

  "isobar",

  "analysis",

  "meteorological",

  "weather",

  "forecast",

  "precipitation",

  "inundation",

  "surge"

];

// ========================================
// EVENT MATCHING
// ========================================

function eventMatch(text, event) {

  const full =
    event.toLowerCase();

  if (containsPhrase(text, full)) {
    return true;
  }

  const ignored = new Set([

    "the",
    "great",
    "storm",
    "hurricane",
    "tropical",
    "superstorm",
    "cyclone",
    "flood",
    "blizzard",
    "tornado",
    "outbreak",
    "of",
    "and"
  ]);

  const words = event
    .toLowerCase()
    .split(/\s+/)
    .filter(word =>
      word.length >= 4 &&
      !ignored.has(word)
    );

  return words.some(word =>
    containsPhrase(text, word)
  );
}

// ========================================
// GEOGRAPHIC MATCHING
// ========================================

function geographyMatch(text, state) {

  return containsPhrase(
    text,
    state
  );
}

// ========================================
// YEAR MATCHING
// ========================================

function yearMatch(text, year) {

  if (!year) {
    return false;
  }

  return containsPhrase(
    text,
    year
  );
}

// ========================================
// CLASSIFY IMAGE CANDIDATE
// ========================================

function qualifyCandidate(
  candidate,
  event,
  state,
  year
) {

  const title = candidate.title
    .replace(/^File:/i, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]/g, " ");

  const metadataText = [

    title,

    candidate.description,

    candidate.date

  ].join(" ").toLowerCase();

  const titleText =
    title.toLowerCase();

  const mapHits =
    MAP_TERMS.filter(term =>
      containsPhrase(
        metadataText,
        term
      )
    );

  const photoHits =
    PHOTO_TERMS.filter(term =>
      containsPhrase(
        metadataText,
        term
      )
    );

  const mapTitleHits =
    MAP_TITLE_TERMS.filter(term =>
      containsPhrase(
        titleText,
        term
      )
    );

  const eventMatched =
    eventMatch(
      metadataText,
      event
    );

  const geographyMatched =
    geographyMatch(
      metadataText,
      state
    );

  const yearMatched =
    yearMatch(
      metadataText,
      year
    );

  const reasons = [];

  let qualification =
    "possible_map";

  let score = 0;

  score +=
    mapHits.length * 12;

  score +=
    mapTitleHits.length * 8;

  if (eventMatched) {
    score += 15;
  }

  if (geographyMatched) {
    score += 10;
  }

  if (yearMatched) {
    score += 10;
  }

  score -=
    photoHits.length * 20;

  /*
   Strong photo indicators override
   weak map keyword matches.

   A storm-damage photo should not
   qualify merely because its
   description mentions a map.
  */

  if (
    photoHits.length > 0 &&
    mapTitleHits.length === 0
  ) {

    qualification =
      "rejected_photo";

    reasons.push(
      "Metadata describes a photograph or storm-damage scene."
    );

  } else if (
    mapHits.length === 0 &&
    mapTitleHits.length === 0
  ) {

    qualification =
      "rejected_non_map";

    reasons.push(
      "No weather-map indicators found in title or metadata."
    );

  } else if (
    mapHits.length > 0 ||
    mapTitleHits.length > 0
  ) {

    qualification =
      "possible_map";

    reasons.push(
      "Map-related terms found; visual verification required."
    );
  }

  if (!eventMatched) {

    reasons.push(
      "Selected event not confirmed by metadata."
    );
  }

  if (!geographyMatched) {

    reasons.push(
      "Selected state not confirmed by metadata."
    );
  }

  if (!yearMatched) {

    reasons.push(
      "Selected year not confirmed by metadata."
    );
  }

  return {

    ...candidate,

    qualification,

    relevanceScore:
      Math.max(
        0,
        Math.min(
          100,
          score
        )
      ),

    mapTermsFound:
      mapHits,

    photoTermsFound:
      photoHits,

    eventMetadataMatch:
      eventMatched,

    geographyMetadataMatch:
      geographyMatched,

    yearMetadataMatch:
      yearMatched,

    reasons,

    visualVerified: false,

    provenanceVerified: false,

    eventVerified: false,

    geographyVerified: false,

    dateVerified: false,

    authenticityStatus:
      "not_verified",

    acceptedForGrading: false
  };
}

// ========================================
// DISCOVER AND CLASSIFY
// ========================================

async function discoverMaps(
  event,
  state,
  year
) {

  const queries =
    buildQueries(
      event,
      state,
      year
    );

  const titleSet =
    new Set();

  const errors = [];

  let successfulQueries = 0;

  for (const query of queries) {

    try {

      const matches =
        await searchCommons(query);

      successfulQueries++;

      for (const item of matches) {

        if (item.title) {

          titleSet.add(
            item.title
          );
        }
      }

    } catch (error) {

      errors.push({
        query,
        message:
          error.message
      });
    }
  }

  const titles = [
    ...titleSet
  ].slice(
    0,
    MAX_CANDIDATES
  );

  const rawCandidates = [];

  /*
   MediaWiki accepts multiple titles.
   Batch requests prevent oversized URLs.
  */

  for (
    let i = 0;
    i < titles.length;
    i += 15
  ) {

    try {

      const batch =
        titles.slice(
          i,
          i + 15
        );

      const pages =
        await getFileDetails(
          batch
        );

      for (const page of pages) {

        const candidate =
          extractCandidate(page);

        if (candidate) {

          rawCandidates.push(
            candidate
          );
        }
      }

    } catch (error) {

      errors.push({

        stage:
          "metadata",

        message:
          error.message
      });
    }
  }

  const qualified =
    rawCandidates.map(
      candidate =>
        qualifyCandidate(
          candidate,
          event,
          state,
          year
        )
    );

  qualified.sort(
    (a, b) =>
      b.relevanceScore -
      a.relevanceScore
  );

  const possibleMaps =
    qualified.filter(
      candidate =>
        candidate.qualification ===
        "possible_map"
    );

  const rejected =
    qualified.filter(
      candidate =>
        candidate.qualification !==
        "possible_map"
    );

  return {

    queries,

    successfulQueries,

    discoveryCompleted:
      successfulQueries ===
        queries.length &&
      errors.length === 0,

    candidates:
      possibleMaps,

    rejected,

    errors,

    totalRetrieved:
      qualified.length
  };
}

// ========================================
// BUILD EVIDENCE LIST
// ========================================

function buildEvidence(candidates) {

  return candidates.map(
    candidate => ({

      title:
        candidate.title,

      url:
        candidate.sourceUrl,

      provider:
        candidate.provider,

      imageUrl:
        candidate.imageUrl,

      thumbnailUrl:
        candidate.thumbnailUrl,

      description:
        candidate.description,

      date:
        candidate.date,

      qualification:
        candidate.qualification,

      relevanceScore:
        candidate.relevanceScore,

      verification:
        "not_verified"
    })
  );
}

// ========================================
// MAIN AUDIT ENDPOINT
// ========================================

async function handleAudit(
  url,
  res
) {

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

    return respond(
      res,
      400,
      {

        status: "error",

        engine: 5,

        message:
          "Event and state are required."
      }
    );
  }

  if (
    event.length > 200 ||
    state.length > 100 ||
    year.length > 20
  ) {

    return respond(
      res,
      400,
      {

        status: "error",

        engine: 5,

        message:
          "Query parameters too long."
      }
    );
  }

  if (
    year &&
    !/^\d{4}$/.test(year)
  ) {

    return respond(
      res,
      400,
      {

        status: "error",

        engine: 5,

        message:
          "Year must contain four digits."
      }
    );
  }

  /*
   Original Bing research rule:
   event + state + map
   Year excluded.
  */

  const query =
    `${event} ${state} map`;

  const researchURL =
    bingImagesUrl(query);

  let discovery;

  try {

    discovery =
      await discoverMaps(
        event,
        state,
        year
      );

  } catch (error) {

    discovery = {

      queries: [],

      successfulQueries: 0,

      discoveryCompleted: false,

      candidates: [],

      rejected: [],

      errors: [{
        message:
          error.message
      }],

      totalRetrieved: 0
    };
  }

  const evidence =
    buildEvidence(
      discovery.candidates
    );

  const discoveryError =
    discovery.errors.length
      ? discovery.errors
          .map(e => e.message)
          .join("; ")
      : null;

  return respond(
    res,
    200,
    {

      status:
        "not_evaluated",

      engine: 5,

      version: VERSION,

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

      researchUrl:
        researchURL,

      commonsQueries:
        discovery.queries,

      discoveryCompleted:
        discovery.discoveryCompleted,

      searchCompleted: false,

      candidateCount:
        discovery.candidates.length,

      rejectedCount:
        discovery.rejected.length,

      totalRetrieved:
        discovery.totalRetrieved,

      candidates:
        discovery.candidates,

      rejected:
        discovery.rejected,

      evidence,

      score: null,

      grade: null,

      finalGrade: false,

      verification: {

        metadataQualification:
          true,

        possibleMapsFound:
          discovery.candidates.length,

        photographsOrNonMapsRejected:
          discovery.rejected.length,

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
        discovery.candidates.length
          ? "Possible historical weather maps found. Metadata qualification completed; visual and historical authentication remain required."
          : "No qualifying map candidates found in this search. This does not establish that historical maps are absent. Grade remains Not Evaluated."
    }
  );
}

// ========================================
// HEALTH ENDPOINT
// ========================================

function healthResponse(res) {

  return respond(
    res,
    200,
    {

      status: "ok",

      engine: 5,

      version: VERSION,

      source:
        "Wikimedia Commons + Bing Images",

      apiKeyRequired: false,

      automatedSearch: true,

      metadataQualification: true,

      visualVerification: false,

      finalGradingEnabled: false,

      endpoints: [
        "/",
        "/health",
        "/audit5"
      ],

      message:
        "Historical weather map metadata qualification enabled. Final grades require authenticated maps."
    }
  );
}

// ========================================
// HTTP SERVER
// ========================================

const server =
  http.createServer(
    async (req, res) => {

      if (
        req.method === "OPTIONS"
      ) {

        res.writeHead(
          204,
          {

            "Access-Control-Allow-Origin":
              "*",

            "Access-Control-Allow-Methods":
              "GET, OPTIONS",

            "Access-Control-Allow-Headers":
              "Content-Type"
          }
        );

        return res.end();
      }

      if (
        req.method !== "GET"
      ) {

        return respond(
          res,
          405,
          {

            status: "error",

            message:
              "GET only."
          }
        );
      }

      let url;

      try {

        url = new URL(
          req.url,
          `http://${req.headers.host || "localhost"}`
        );

      } catch {

        return respond(
          res,
          400,
          {

            status: "error",

            message:
              "Invalid URL."
          }
        );
      }

      try {

        if (
          url.pathname ===
          "/health"
        ) {

          return healthResponse(
            res
          );
        }

        if (
          url.pathname ===
          "/audit5"
        ) {

          return await handleAudit(
            url,
            res
          );
        }

        if (
          url.pathname === "/"
        ) {

          return respond(
            res,
            200,
            {

              name:
                "Weather Time Machine — Engine 5",

              version: VERSION,

              source:
                "Wikimedia Commons + Bing Images",

              health:
                "/health",

              auditExample:
                "/audit5?event=Superstorm%20Sandy&state=New%20Jersey&year=2012",

              message:
                "Historical weather map qualification service. Final authenticity verification required."
            }
          );
        }

        return respond(
          res,
          404,
          {

            status: "error",

            message:
              "Endpoint not found."
          }
        );

      } catch (error) {

        console.error(
          "Engine 5 error:",
          error
        );

        if (
          !res.headersSent
        ) {

          return respond(
            res,
            500,
            {

              status: "error",

              engine: 5,

              message:
                "Internal Engine 5 error."
            }
          );
        }
      }
    }
  );

// ========================================
// START ENGINE 5
// ========================================

server.listen(
  PORT,
  HOST,
  () => {

    console.log(
      "Weather Time Machine " +
      "Engine 5 v" +
      VERSION +
      " listening on port " +
      PORT
    );
  }
);
