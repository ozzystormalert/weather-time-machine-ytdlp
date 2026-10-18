
"use strict";

/*
 * WEATHER TIME MACHINE — ENGINE 5
 * VERSION 6.5
 *
 * TARGETED HTTP 429 RATE-LIMIT REPAIR
 *
 * Node.js 22
 * No external packages
 * No API key
 * No Bing scraping
 *
 * REPAIR:
 * - Sequential Wikimedia Commons requests
 * - Retry-After support
 * - Exponential backoff with jitter
 * - Fewer search queries
 * - Fewer metadata requests
 * - Search and metadata in one API request
 * - In-memory result caching
 * - Shared request queue
 * - Detailed diagnostics
 *
 * PRESERVES:
 * - /health
 * - /audit5
 * - Bing Images research links
 * - Wikimedia Commons discovery
 * - Blogger Step 8A compatibility
 * - Engines 1–4 unchanged
 *
 * IMPORTANT:
 * A search result is not authenticated evidence.
 * Metadata qualification is not visual verification.
 * Final A–F grading remains disabled.
 */

const http = require("node:http");

const VERSION = "6.5";

const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";

const COMMONS_API =
  "https://commons.wikimedia.org/w/api.php";

const USER_AGENT =
  "WeatherTimeMachineEngine5/6.5 " +
  "(historical weather map research; " +
  "https://github.com/ozzystormalert/weather-time-machine-ytdlp)";

const CONFIG = {
  timeoutMs: 15000,

  // Keep requests modest.
  maxSearchQueries: 3,
  searchLimit: 10,
  maxCandidates: 20,

  // Minimum spacing between requests.
  requestIntervalMs: 2500,

  // Maximum retry attempts after first request.
  maxRetries: 2,

  // Retry backoff.
  initialBackoffMs: 5000,
  maximumBackoffMs: 30000,

  // Respect Retry-After, but bound the wait.
  maximumRetryAfterMs: 60000,

  // Cache results to avoid repeated API traffic.
  cacheTtlMs: 30 * 60 * 1000,

  // Avoid unlimited memory use.
  maximumCacheEntries: 100,

  // Limit incoming simultaneous audits.
  maximumActiveAudits: 2
};

// ============================================
// HTTP RESPONSE
// ============================================

function respond(res, status, payload) {
  if (res.headersSent) return;

  const body = JSON.stringify(payload, null, 2);

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

// ============================================
// UTILITIES
// ============================================

function normalize(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

function buildUrl(base, params) {
  const url = new URL(base);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function bingImagesUrl(query) {
  return buildUrl(
    "https://www.bing.com/images/search",
    { q: query }
  );
}

function googleSearchUrl(query) {
  return buildUrl(
    "https://www.google.com/search",
    { q: query }
  );
}

// ============================================
// GLOBAL REQUEST QUEUE
// ============================================

let requestQueue = Promise.resolve();
let lastRequestTime = 0;

function queueCommonsRequest(task) {
  const job = requestQueue.then(async () => {
    const elapsed =
      Date.now() - lastRequestTime;

    const wait = Math.max(
      0,
      CONFIG.requestIntervalMs - elapsed
    );

    if (wait > 0) {
      await sleep(wait);
    }

    lastRequestTime = Date.now();

    return task();
  });

  // Preserve queue even after failures.
  requestQueue = job.catch(() => {});

  return job;
}

// ============================================
// RETRY-AFTER PARSING
// ============================================

function parseRetryAfter(value) {
  if (!value) return null;

  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.max(
      0,
      Math.round(seconds * 1000)
    );
  }

  const date = Date.parse(value);

  if (Number.isFinite(date)) {
    return Math.max(
      0,
      date - Date.now()
    );
  }

  return null;
}

// ============================================
// WIKIMEDIA API ERROR
// ============================================

class CommonsError extends Error {
  constructor(message, details = {}) {
    super(message);

    this.name = "CommonsError";

    this.status =
      details.status ?? null;

    this.retryAfterMs =
      details.retryAfterMs ?? null;

    this.retryable =
      details.retryable ?? false;
  }
}

// ============================================
// SINGLE HTTP ATTEMPT
// ============================================

async function commonsAttempt(params) {
  const url = buildUrl(COMMONS_API, {
    action: "query",
    format: "json",
    formatversion: "2",
    ...params
  });

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    CONFIG.timeoutMs
  );

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT
      },

      signal: controller.signal
    });

    if (!response.ok) {
      const retryAfterMs =
        parseRetryAfter(
          response.headers.get("retry-after")
        );

      throw new CommonsError(
        `HTTP ${response.status}`,
        {
          status: response.status,

          retryAfterMs,

          retryable:
            response.status === 429 ||
            response.status === 500 ||
            response.status === 502 ||
            response.status === 503 ||
            response.status === 504
        }
      );
    }

    const data = await response.json();

    if (data.error) {
      const code =
        data.error.code || "unknown";

      throw new CommonsError(
        `API ${code}: ${
          data.error.info || "Unknown error"
        }`,
        {
          retryable:
            code === "maxlag" ||
            code === "ratelimited"
        }
      );
    }

    return data;

  } catch (error) {
    if (error.name === "AbortError") {
      throw new CommonsError(
        `Timeout after ${CONFIG.timeoutMs}ms`,
        {
          retryable: true
        }
      );
    }

    throw error;

  } finally {
    clearTimeout(timer);
  }
}

// ============================================
// RETRY LOGIC
// ============================================

async function commonsRequest(params, label) {
  const attempts = [];

  for (
    let attempt = 0;
    attempt <= CONFIG.maxRetries;
    attempt++
  ) {
    try {
      const data = await queueCommonsRequest(
        () => commonsAttempt(params)
      );

      return {
        ok: true,
        data,
        attempts,
        attemptCount: attempt + 1
      };

    } catch (error) {
      const retryable =
        error.retryable === true;

      const entry = {
        attempt: attempt + 1,
        error: String(
          error.message || error
        ),
        status: error.status ?? null,
        retryable
      };

      attempts.push(entry);

      if (
        !retryable ||
        attempt >= CONFIG.maxRetries
      ) {
        return {
          ok: false,
          error: entry.error,
          attempts,
          attemptCount: attempt + 1
        };
      }

      const exponential =
        CONFIG.initialBackoffMs *
        Math.pow(2, attempt);

      const jitter =
        Math.floor(Math.random() * 1000);

      const requestedWait =
        error.retryAfterMs ?? 0;

      const waitMs = Math.min(
        CONFIG.maximumRetryAfterMs,
        Math.max(
          exponential + jitter,
          requestedWait
        )
      );

      attempts[
        attempts.length - 1
      ].waitMs = waitMs;

      // Waiting happens inside the shared queue,
      // preventing other audits from immediately
      // bypassing the rate-limit cooldown.
      await queueCommonsRequest(
        () => sleep(waitMs)
      );
    }
  }

  return {
    ok: false,
    error: "Retry limit exceeded.",
    attempts
  };
}

// ============================================
// EVENT ALIASES
// ============================================

function eventAliases(event, year) {
  const aliases = [event];

  if (/^superstorm\s+/i.test(event)) {
    aliases.push(
      event.replace(/^superstorm\s+/i, "")
    );
  }

  if (/^hurricane\s+/i.test(event)) {
    aliases.push(
      event.replace(/^hurricane\s+/i, "")
    );
  }

  if (
    /\bsandy\b/i.test(event) &&
    (!year || year === "2012")
  ) {
    aliases.push(
      "Hurricane Sandy",
      "Superstorm Sandy",
      "Sandy"
    );
  }

  return unique(
    aliases.map(normalize)
  );
}

// ============================================
// FOCUSED SEARCH QUERIES
// ============================================

function buildQueries(event, state, year) {
  const aliases = eventAliases(
    event,
    year
  );

  const shortName =
    aliases.find(
      name =>
        name.length < event.length
    ) || event;

  return unique([
    `${shortName} storm track`,
    `${shortName} weather map`,
    `${event} ${year || ""} map`.trim()
  ]).slice(
    0,
    CONFIG.maxSearchQueries
  );
}

// ============================================
// WEATHER MAP FILTERS
// ============================================

const MAP_TERMS = [
  "weather map",
  "storm track",
  "track map",
  "track chart",
  "hurricane track",
  "cyclone track",
  "meteorological",
  "radar",
  "surface analysis",
  "synoptic",
  "forecast cone",
  "storm surge map",
  "isobar",
  "weather chart",
  "wind field",
  "precipitation map",
  "pressure map",
  "storm path"
];

const PHOTO_TERMS = [
  "storm damage",
  "aerial photo",
  "aerial photograph",
  "photograph of",
  "photo of",
  "tracking trucks",
  "relief supplies",
  "destroyed home",
  "damaged house",
  "flooded street",
  "debris",
  "rescue workers"
];

// ============================================
// CANDIDATE EXTRACTION
// ============================================

function extractCandidate(page) {
  const info =
    page.imageinfo?.[0];

  if (!info) return null;

  const mime = String(
    info.mime || ""
  ).toLowerCase();

  if (!mime.startsWith("image/")) {
    return null;
  }

  if (!info.url) {
    return null;
  }

  const metadata =
    info.extmetadata || {};

  return {
    title: page.title,

    url:
      info.descriptionurl ||
      `https://commons.wikimedia.org/wiki/${
        encodeURIComponent(
          page.title.replace(/ /g, "_")
        )
      }`,

    sourceUrl:
      info.descriptionurl || null,

    imageUrl: info.url,

    thumbnailUrl:
      info.thumburl || info.url,

    provider:
      "Wikimedia Commons",

    mime,

    width:
      info.width || null,

    height:
      info.height || null,

    description: stripHtml(
      metadata.ImageDescription?.value
    ),

    date: stripHtml(
      metadata.DateTimeOriginal?.value ||
      metadata.DateTime?.value
    ),

    artist: stripHtml(
      metadata.Artist?.value
    ),

    license: stripHtml(
      metadata.LicenseShortName?.value
    )
  };
}

// ============================================
// METADATA QUALIFICATION
// ============================================

function qualifyCandidate(
  candidate,
  event,
  state,
  year
) {
  const title = candidate.title
    .replace(/^File:/i, "")
    .replace(/\.[^.]+$/, "")
    .replace(/_/g, " ");

  const text = [
    title,
    candidate.description,
    candidate.date
  ].join(" ").toLowerCase();

  const mapHits = MAP_TERMS.filter(
    term => text.includes(term)
  );

  const photoHits = PHOTO_TERMS.filter(
    term => text.includes(term)
  );

  const aliases =
    eventAliases(event, year);

  const eventMatch =
    aliases.some(
      name =>
        text.includes(
          name.toLowerCase()
        )
    );

  const stateMatch =
    text.includes(
      state.toLowerCase()
    );

  const yearMatch = year
    ? text.includes(year)
    : null;

  const mapTitle =
    /\b(map|chart|radar|track|analysis|forecast|isobar)\b/i
      .test(title);

  let qualification;

  if (
    photoHits.length > 0 &&
    !mapTitle &&
    mapHits.length === 0
  ) {
    qualification =
      "rejected_photo";

  } else if (
    mapHits.length === 0 &&
    !mapTitle
  ) {
    qualification =
      "rejected_non_map";

  } else {
    qualification =
      "possible_map";
  }

  const rawScore =
    mapHits.length * 12 +
    (mapTitle ? 15 : 0) +
    (eventMatch ? 20 : 0) +
    (stateMatch ? 10 : 0) +
    (yearMatch ? 10 : 0) -
    photoHits.length * 20;

  return {
    ...candidate,

    qualification,

    relevanceScore:
      Math.max(
        0,
        Math.min(
          100,
          rawScore
        )
      ),

    mapTermsFound:
      mapHits,

    photoTermsFound:
      photoHits,

    eventMetadataMatch:
      eventMatch,

    geographyMetadataMatch:
      stateMatch,

    yearMetadataMatch:
      yearMatch,

    visualVerified: false,
    provenanceVerified: false,

    authenticityStatus:
      "not_verified",

    acceptedForGrading: false,

    reasons: [
      qualification === "possible_map"
        ? "Possible map based on metadata."
        : "Not qualified as a weather map.",

      "Visual and historical verification required."
    ]
  };
}

// ============================================
// IN-MEMORY AUDIT CACHE
// ============================================

const auditCache = new Map();
const activeAudits = new Map();

function getCachedAudit(key) {
  const item = auditCache.get(key);

  if (!item) return null;

  if (
    Date.now() >= item.expiresAt
  ) {
    auditCache.delete(key);
    return null;
  }

  return item.data;
}

function setCachedAudit(key, data) {
  if (
    auditCache.size >=
    CONFIG.maximumCacheEntries
  ) {
    const oldest =
      auditCache.keys().next().value;

    auditCache.delete(oldest);
  }

  auditCache.set(key, {
    data,
    expiresAt:
      Date.now() +
      CONFIG.cacheTtlMs
  });
}

// ============================================
// COMMONS DISCOVERY
// ============================================

async function discoverMaps(
  event,
  state,
  year
) {
  const queries = buildQueries(
    event,
    state,
    year
  );

  const diagnostics = [];
  const pagesByTitle = new Map();

  let successfulQueries = 0;
  let failedQueries = 0;
  let totalSearchHits = 0;

  // Each query retrieves file metadata
  // directly, avoiding separate metadata batches.

  for (const query of queries) {
    const result = await commonsRequest(
      {
        generator: "search",

        gsrsearch: query,
        gsrnamespace: "6",
        gsrlimit:
          CONFIG.searchLimit,

        prop: "imageinfo",

        iiprop:
          "url|mime|size|extmetadata",

        iiurlwidth: "700"
      },

      query
    );

    diagnostics.push({
      stage:
        "search_and_metadata",

      query,

      ok: result.ok,

      attemptCount:
        result.attemptCount,

      attempts:
        result.attempts,

      ...(!result.ok
        ? { error: result.error }
        : {})
    });

    if (!result.ok) {
      failedQueries++;
      continue;
    }

    successfulQueries++;

    const pages =
      result.data.query?.pages || [];

    totalSearchHits += pages.length;

    for (const page of pages) {
      if (
        page.title &&
        !pagesByTitle.has(page.title)
      ) {
        pagesByTitle.set(
          page.title,
          page
        );
      }
    }

    if (
      pagesByTitle.size >=
      CONFIG.maxCandidates
    ) {
      break;
    }
  }

  const classified = [];

  for (
    const page of
    pagesByTitle.values()
  ) {
    const candidate =
      extractCandidate(page);

    if (!candidate) continue;

    classified.push(
      qualifyCandidate(
        candidate,
        event,
        state,
        year
      )
    );
  }

  classified.sort(
    (a, b) =>
      b.relevanceScore -
      a.relevanceScore
  );

  const candidates =
    classified.filter(
      item =>
        item.qualification ===
        "possible_map"
    );

  const rejected =
    classified.filter(
      item =>
        item.qualification !==
        "possible_map"
    );

  const discoveryCompleted =
    failedQueries === 0 &&
    successfulQueries > 0;

  return {
    queries,

    diagnostics,

    discoveryCompleted,

    searchCompleted:
      discoveryCompleted,

    successfulQueries,
    failedQueries,

    totalSearchHits,

    totalRetrieved:
      classified.length,

    titlesFound:
      pagesByTitle.size,

    candidates,
    rejected
  };
}

// ============================================
// OFFICIAL RESEARCH LINKS
// ============================================

function officialResearchLinks(
  event,
  state,
  year
) {
  return [
    {
      name:
        "NOAA Historical Weather Maps",

      type:
        "official_research_link",

      url: googleSearchUrl(
        `site:noaa.gov "${event}" ` +
        `${year} weather map`
      ),

      verifiedCandidate: false
    },

    {
      name:
        "National Hurricane Center",

      type:
        "official_research_link",

      url: googleSearchUrl(
        `site:nhc.noaa.gov "${event}" ` +
        `${year} track chart`
      ),

      verifiedCandidate: false
    },

    {
      name:
        "National Weather Service",

      type:
        "official_research_link",

      url: googleSearchUrl(
        `site:weather.gov "${event}" ` +
        `${state} ${year} radar`
      ),

      verifiedCandidate: false
    }
  ];
}

// ============================================
// BUILD AUDIT RESULT
// ============================================

async function buildAudit(
  event,
  state,
  year
) {
  const query =
    `${event} ${state} map`;

  const researchURL =
    bingImagesUrl(query);

  const discovery =
    await discoverMaps(
      event,
      state,
      year
    );

  const errors =
    discovery.diagnostics.filter(
      item => !item.ok
    );

  return {
    status: "not_evaluated",

    engine: 5,
    version: VERSION,

    category:
      "Historical Weather Maps",

    source:
      "Wikimedia Commons + Bing Images + NOAA/NHC research links",

    apiKeyRequired: false,
    automatedSearch: true,

    metadataQualification: true,
    visualVerification: false,
    finalGradingEnabled: false,

    event,
    state,
    year: year || null,

    query,

    researchURL,
    researchUrl: researchURL,

    commonsQueries:
      discovery.queries,

    discoveryCompleted:
      discovery.discoveryCompleted,

    searchCompleted:
      discovery.searchCompleted,

    successfulQueries:
      discovery.successfulQueries,

    failedQueries:
      discovery.failedQueries,

    totalSearchHits:
      discovery.totalSearchHits,

    totalRetrieved:
      discovery.totalRetrieved,

    titlesFound:
      discovery.titlesFound,

    candidateCount:
      discovery.candidates.length,

    rejectedCount:
      discovery.rejected.length,

    candidates:
      discovery.candidates,

    rejected:
      discovery.rejected,

    evidence:
      discovery.candidates.map(
        item => ({
          title: item.title,
          url: item.sourceUrl,
          imageUrl: item.imageUrl,

          verification:
            "not_verified"
        })
      ),

    officialResearch:
      officialResearchLinks(
        event,
        state,
        year
      ),

    diagnostics:
      discovery.diagnostics,

    discoveryErrors:
      errors,

    discoveryError:
      errors.map(
        item => item.error
      ).join("; ") || null,

    score: null,
    grade: null,
    finalGrade: false,

    message:
      discovery.candidates.length > 0
        ? "Possible historical weather maps found. Authentication required before grading."
        : discovery.discoveryCompleted
          ? "No possible maps found in the limited completed Wikimedia search. Other archives may contain maps."
          : "Wikimedia discovery incomplete. Inspect diagnostics. Do not assign zero or an A-F grade."
  };
}

// ============================================
// AUDIT ENDPOINT
// ============================================

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

  if (
    !event ||
    !state ||
    event.length > 200 ||
    state.length > 100 ||
    year.length > 20 ||
    (year && !/^\d{4}$/.test(year))
  ) {
    return respond(res, 400, {
      status: "error",
      engine: 5,

      message:
        "Event and state are required. Year must contain four digits when provided."
    });
  }

  const key = JSON.stringify([
    event.toLowerCase(),
    state.toLowerCase(),
    year
  ]);

  const cached =
    getCachedAudit(key);

  if (cached) {
    return respond(res, 200, {
      ...cached,
      cacheHit: true
    });
  }

  let auditPromise =
    activeAudits.get(key);

  if (!auditPromise) {
    if (
      activeAudits.size >=
      CONFIG.maximumActiveAudits
    ) {
      return respond(res, 503, {
        status: "busy",
        engine: 5,

        message:
          "Engine 5 is processing other audits. Please try again shortly."
      });
    }

    auditPromise =
      buildAudit(
        event,
        state,
        year
      );

    activeAudits.set(
      key,
      auditPromise
    );
  }

  try {
    const result =
      await auditPromise;

    // Cache completed searches only.
    // Do not cache incomplete failures
    // for the full TTL.

    if (result.discoveryCompleted) {
      setCachedAudit(
        key,
        result
      );
    }

    return respond(res, 200, {
      ...result,
      cacheHit: false
    });

  } catch (error) {
    return respond(res, 200, {
      status: "not_evaluated",

      engine: 5,
      version: VERSION,

      event,
      state,
      year: year || null,

      discoveryCompleted: false,
      searchCompleted: false,

      candidateCount: 0,
      candidates: [],

      discoveryError:
        String(error.message || error),

      score: null,
      grade: null,
      finalGrade: false,

      message:
        "Audit failed. Historical map evidence was not evaluated."
    });

  } finally {
    if (
      activeAudits.get(key) ===
      auditPromise
    ) {
      activeAudits.delete(key);
    }
  }
}

// ============================================
// HTTP SERVER
// ============================================

const server = http.createServer(
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
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
        return respond(res, 200, {
          status: "ok",

          engine: 5,
          version: VERSION,

          source:
            "Wikimedia Commons + Bing Images + NOAA/NHC research links",

          apiKeyRequired: false,

          automatedSearch: true,
          metadataQualification: true,

          rateLimitProtection: true,
          retryAfterSupport: true,
          sequentialRequests: true,
          resultCaching: true,

          visualVerification: false,
          finalGradingEnabled: false,

          endpoints: [
            "/",
            "/health",
            "/audit5"
          ],

          message:
            "Rate-limit protection enabled. Historical map authenticity grading remains disabled."
        });
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

          version: VERSION,

          health: "/health",

          auditExample:
            "/audit5?event=Superstorm%20Sandy&state=New%20Jersey&year=2012"
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

      return respond(res, 500, {
        status: "error",
        engine: 5,

        message:
          "Internal server error."
      });
    }
  }
);

// ============================================
// START SERVER
// ============================================

server.listen(
  PORT,
  HOST,
  () => {
    console.log(
      `Weather Time Machine Engine 5 v${VERSION} listening on port ${PORT}`
    );
  }
);
