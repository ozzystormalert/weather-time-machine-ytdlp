
"use strict";

/*
 * WEATHER TIME MACHINE — ENGINE 5
 * VERSION 6.4
 *
 * TARGETED HISTORICAL WEATHER MAP RETRIEVAL REPAIR
 *
 * Node.js 22
 * No external packages
 * No API keys
 * No Bing scraping
 *
 * Preserves:
 *   /health
 *   /audit5
 *   Bing Images research link
 *   Wikimedia Commons discovery
 *   Blogger Step 8A compatibility
 *   Engines 1–4 unchanged
 *
 * New:
 *   Commons API connectivity diagnostics
 *   Controlled concurrent searches
 *   HTTP and timeout error reporting
 *   Map metadata qualification
 *   Photograph rejection
 *
 * IMPORTANT:
 * Metadata qualification is not visual verification.
 * No A–F grades without authenticated historical maps.
 */

const http = require("node:http");

const VERSION = "6.4";
const PORT = Number(process.env.PORT) || 10000;
const HOST = "0.0.0.0";

const COMMONS_API =
  "https://commons.wikimedia.org/w/api.php";

const TIMEOUT_MS = 10000;
const CONCURRENCY = 3;
const SEARCH_LIMIT = 18;
const MAX_FILES = 70;

const USER_AGENT =
  "WeatherTimeMachineEngine5/6.4 " +
  "(historical map research; contact via GitHub repository)";

// ============================================
// HTTP RESPONSES
// ============================================

function respond(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });

  res.end(JSON.stringify(data, null, 2));
}

// ============================================
// TEXT UTILITIES
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

// ============================================
// HISTORICAL EVENT ALIASES
// ============================================

function eventAliases(event, year) {
  const names = [event];

  if (/^superstorm\s+/i.test(event)) {
    names.push(
      event.replace(/^superstorm\s+/i, "")
    );
  }

  if (/^hurricane\s+/i.test(event)) {
    names.push(
      event.replace(/^hurricane\s+/i, "")
    );
  }

  if (
    /\bsandy\b/i.test(event) &&
    (!year || year === "2012")
  ) {
    names.push(
      "Hurricane Sandy",
      "Superstorm Sandy",
      "Sandy"
    );
  }

  return unique(
    names.map(normalize)
  );
}

// ============================================
// CONTROLLED SEARCH QUERIES
// ============================================

function buildQueries(event, state, year) {
  const aliases = eventAliases(event, year);
  const queries = [];

  for (const name of aliases) {
    queries.push(
      `${name} storm track`,
      `${name} weather map`,
      `${name} radar`
    );

    if (year) {
      queries.push(
        `${name} ${year} track`
      );
    }
  }

  queries.push(
    `${event} ${state} map`
  );

  return unique(queries).slice(0, 10);
}

// ============================================
// WIKIMEDIA COMMONS API
// ============================================

async function commonsRequest(params) {
  const url = buildUrl(COMMONS_API, {
    format: "json",
    formatversion: "2",
    origin: "*",
    ...params
  });

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS
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
      throw new Error(
        `HTTP ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(
        `API ${data.error.code || "error"}: ` +
        `${data.error.info || "Unknown API error"}`
      );
    }

    return data;

  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        `Timeout after ${TIMEOUT_MS}ms`
      );
    }

    throw error;

  } finally {
    clearTimeout(timer);
  }
}

// ============================================
// CONTROLLED CONCURRENT EXECUTION
// ============================================

async function runBatch(items, limit, task) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;

      try {
        results[index] = {
          ok: true,
          value: await task(items[index])
        };
      } catch (error) {
        results[index] = {
          ok: false,
          error: String(error.message || error)
        };
      }
    }
  }

  const workerCount = Math.min(
    limit,
    items.length
  );

  await Promise.all(
    Array.from(
      { length: workerCount },
      () => worker()
    )
  );

  return results;
}

// ============================================
// COMMONS CONNECTIVITY TEST
// ============================================

async function checkCommonsConnectivity() {
  try {
    const data = await commonsRequest({
      action: "query",
      meta: "siteinfo",
      siprop: "general"
    });

    return {
      ok: true,
      site:
        data.query?.general?.sitename ||
        "Wikimedia Commons"
    };

  } catch (error) {
    return {
      ok: false,
      error: String(error.message || error)
    };
  }
}

// ============================================
// WEATHER MAP INDICATORS
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
  "track of",
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
// MAP QUALIFICATION
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

  const aliases = eventAliases(event, year);

  const eventMatch = aliases.some(
    name => text.includes(name.toLowerCase())
  );

  const stateMatch =
    text.includes(state.toLowerCase());

  const yearMatch = year
    ? text.includes(year)
    : null;

  const mapTitle =
    /\b(map|chart|radar|track|analysis|forecast|isobar)\b/i
      .test(title);

  let qualification;

  if (
    photoHits.length > 0 &&
    mapHits.length === 0 &&
    !mapTitle
  ) {
    qualification = "rejected_photo";

  } else if (
    mapHits.length === 0 &&
    !mapTitle
  ) {
    qualification = "rejected_non_map";

  } else {
    qualification = "possible_map";
  }

  const rawScore =
    mapHits.length * 12 +
    (mapTitle ? 15 : 0) +
    (eventMatch ? 20 : 0) +
    (stateMatch ? 10 : 0) +
    (yearMatch ? 10 : 0) -
    photoHits.length * 20;

  const relevanceScore = Math.max(
    0,
    Math.min(100, rawScore)
  );

  const reasons = [
    qualification === "possible_map"
      ? "Possible map based on metadata; visual verification required."
      : "Not qualified as a weather map by metadata."
  ];

  if (!eventMatch) {
    reasons.push(
      "Event not confirmed by metadata."
    );
  }

  if (!stateMatch) {
    reasons.push(
      "State not confirmed by metadata."
    );
  }

  if (year && !yearMatch) {
    reasons.push(
      "Year not confirmed by metadata."
    );
  }

  return {
    ...candidate,

    qualification,
    relevanceScore,

    mapTermsFound: mapHits,
    photoTermsFound: photoHits,

    eventMetadataMatch: eventMatch,
    geographyMetadataMatch: stateMatch,
    yearMetadataMatch: yearMatch,

    visualVerified: false,
    provenanceVerified: false,

    authenticityStatus: "not_verified",
    acceptedForGrading: false,

    reasons
  };
}

// ============================================
// EXTRACT COMMONS IMAGE METADATA
// ============================================

function extractCandidate(page) {
  const info = page.imageinfo?.[0];

  if (!info) return null;

  const mime = String(
    info.mime || ""
  ).toLowerCase();

  if (!mime.startsWith("image/")) {
    return null;
  }

  if (!info.url || !info.descriptionurl) {
    return null;
  }

  const metadata = info.extmetadata || {};

  return {
    title: page.title,

    url: info.descriptionurl,
    sourceUrl: info.descriptionurl,
    imageUrl: info.url,
    thumbnailUrl:
      info.thumburl || info.url,

    provider: "Wikimedia Commons",

    mime,

    width: info.width || null,
    height: info.height || null,

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
// HISTORICAL MAP DISCOVERY
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

  const connectivity =
    await checkCommonsConnectivity();

  const diagnostics = [];

  if (!connectivity.ok) {
    return {
      connectivity,
      queries,

      diagnostics: [{
        stage: "connectivity",
        ok: false,
        error: connectivity.error
      }],

      discoveryCompleted: false,
      totalRetrieved: 0,
      titlesFound: 0,

      candidates: [],
      rejected: []
    };
  }

  // Search using controlled concurrency.

  const searchResults = await runBatch(
    queries,
    CONCURRENCY,

    async query => {
      const data = await commonsRequest({
        action: "query",
        list: "search",
        srsearch: query,
        srnamespace: "6",
        srlimit: String(SEARCH_LIMIT)
      });

      return data.query?.search || [];
    }
  );

  const titles = new Set();

  for (
    let index = 0;
    index < queries.length;
    index++
  ) {
    const result = searchResults[index];

    diagnostics.push({
      stage: "search",
      query: queries[index],
      ok: result.ok,
      count: result.ok
        ? result.value.length
        : 0,

      ...(!result.ok
        ? { error: result.error }
        : {})
    });

    if (result.ok) {
      for (const file of result.value) {
        if (file.title) {
          titles.add(file.title);
        }
      }
    }
  }

  const selectedTitles = [
    ...titles
  ].slice(0, MAX_FILES);

  // Retrieve file metadata in smaller groups.

  const groups = [];

  for (
    let index = 0;
    index < selectedTitles.length;
    index += 15
  ) {
    groups.push(
      selectedTitles.slice(
        index,
        index + 15
      )
    );
  }

  const metadataResults = await runBatch(
    groups,
    CONCURRENCY,

    async group => {
      const data = await commonsRequest({
        action: "query",
        prop: "imageinfo",
        titles: group.join("|"),
        iiprop:
          "url|mime|size|extmetadata",
        iiurlwidth: "700"
      });

      return data.query?.pages || [];
    }
  );

  const classified = [];

  for (
    let index = 0;
    index < groups.length;
    index++
  ) {
    const result = metadataResults[index];

    diagnostics.push({
      stage: "metadata",
      batch: index + 1,
      ok: result.ok,
      count: result.ok
        ? result.value.length
        : 0,

      ...(!result.ok
        ? { error: result.error }
        : {})
    });

    if (result.ok) {
      for (const page of result.value) {
        const candidate =
          extractCandidate(page);

        if (candidate) {
          classified.push(
            qualifyCandidate(
              candidate,
              event,
              state,
              year
            )
          );
        }
      }
    }
  }

  classified.sort(
    (a, b) =>
      b.relevanceScore -
      a.relevanceScore
  );

  const candidates = classified.filter(
    item =>
      item.qualification ===
      "possible_map"
  );

  const rejected = classified.filter(
    item =>
      item.qualification !==
      "possible_map"
  );

  return {
    connectivity,
    queries,
    diagnostics,

    discoveryCompleted:
      diagnostics.every(item => item.ok) &&
      titles.size <= MAX_FILES,

    totalRetrieved: classified.length,
    titlesFound: titles.size,

    candidates,
    rejected
  };
}

// ============================================
// OFFICIAL ARCHIVE RESEARCH LINKS
// ============================================

function officialResearchLinks(
  event,
  state,
  year
) {
  return [
    {
      name: "NOAA Historical Map Research",
      type: "official_research_link",

      url: buildUrl(
        "https://www.google.com/search",
        {
          q:
            `site:noaa.gov "${event}" ` +
            `${year} weather map`
        }
      ),

      verifiedCandidate: false
    },

    {
      name: "National Hurricane Center",
      type: "official_research_link",

      url: buildUrl(
        "https://www.google.com/search",
        {
          q:
            `site:nhc.noaa.gov "${event}" ` +
            `${year} track chart`
        }
      ),

      verifiedCandidate: false
    },

    {
      name: "National Weather Service",
      type: "official_research_link",

      url: buildUrl(
        "https://www.google.com/search",
        {
          q:
            `site:weather.gov "${event}" ` +
            `${state} ${year} radar`
        }
      ),

      verifiedCandidate: false
    }
  ];
}

// ============================================
// ENGINE 5 AUDIT ENDPOINT
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
        "Provide event, state and optional four-digit year."
    });
  }

  // Preserve the original Bing query rule:
  // event + state + map (year excluded).

  const query =
    `${event} ${state} map`;

  const researchURL =
    bingImagesUrl(query);

  let discovery;

  try {
    discovery = await discoverMaps(
      event,
      state,
      year
    );

  } catch (error) {
    discovery = {
      connectivity: {
        ok: false,
        error: String(
          error.message || error
        )
      },

      queries: [],

      diagnostics: [{
        stage: "unexpected",
        ok: false,
        error: String(
          error.message || error
        )
      }],

      discoveryCompleted: false,
      totalRetrieved: 0,
      titlesFound: 0,

      candidates: [],
      rejected: []
    };
  }

  const errors =
    discovery.diagnostics.filter(
      item => !item.ok
    );

  return respond(res, 200, {
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

    commonsConnectivity:
      discovery.connectivity,

    discoveryCompleted:
      discovery.discoveryCompleted,

    searchCompleted: false,

    candidateCount:
      discovery.candidates.length,

    rejectedCount:
      discovery.rejected.length,

    totalRetrieved:
      discovery.totalRetrieved,

    titlesFound:
      discovery.titlesFound,

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
          verification: "not_verified"
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
      discovery.candidates.length
        ? "Possible maps found by metadata; visual and historical verification required before grading."
        : discovery.discoveryCompleted
          ? "No possible maps found in the completed limited Wikimedia search. This does not prove that no maps exist."
          : "Discovery incomplete or failed. Inspect diagnostics and discoveryErrors; do not treat missing results as zero."
  });
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

          visualVerification: false,
          finalGradingEnabled: false,

          endpoints: [
            "/",
            "/health",
            "/audit5"
          ],

          message:
            "Controlled Commons retrieval with API diagnostics. Authenticity grading disabled."
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
        message: "Endpoint not found."
      });

    } catch (error) {
      console.error(
        "Engine 5:",
        error
      );

      if (!res.headersSent) {
        return respond(res, 500, {
          status: "error",
          engine: 5,
          message:
            "Internal server error."
        });
      }
    }
  }
);

// ============================================
// START ENGINE 5
// ============================================

server.listen(
  PORT,
  HOST,
  () => {
    console.log(
      `Weather Time Machine Engine 5 v${VERSION} listening on ${PORT}`
    );
  }
);
