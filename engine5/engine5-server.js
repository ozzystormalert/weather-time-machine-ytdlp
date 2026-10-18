
"use strict";

/*
 WEATHER TIME MACHINE — ENGINE 5
 VERSION 6.3

 HISTORICAL WEATHER MAP DISCOVERY REPAIR

 Node.js 22
 No external packages
 No API keys
 No Bing scraping

 PRESERVES:
 - Existing /health endpoint
 - Existing /audit5 endpoint
 - Bing Images research URL
 - Wikimedia Commons discovery
 - Blogger Step 8A compatibility
 - Engines 1–4 unchanged

 NEW:
 - Alternate event-name searches
 - Broader Wikimedia Commons discovery
 - NOAA/NHC official-source research links
 - Map-focused metadata qualification
 - Photograph rejection
 - Search completion diagnostics
 - Candidate evidence and source links

 IMPORTANT:
 Official research links are not automatically
 verified map evidence.

 Metadata matching is not visual authentication.

 No A–F grade may be issued until actual
 historical map authenticity is verified.
*/

const http = require("node:http");

const PORT =
  Number(process.env.PORT) || 10000;

const HOST = "0.0.0.0";

const VERSION = "6.3";

const COMMONS_API =
  "https://commons.wikimedia.org/w/api.php";

const MAX_RESULTS = 35;

const MAX_CANDIDATES = 100;

const TIMEOUT_MS = 18000;

const USER_AGENT =
  "WeatherTimeMachine-Engine5/6.3 " +
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
// UTILITIES
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

    return (
      url.protocol === "https:" ||
      url.protocol === "http:"
    )
      ? url.toString()
      : null;

  } catch {

    return null;
  }
}

function unique(values) {

  return [...new Set(
    values.filter(Boolean)
  )];
}

function containsPhrase(text, phrase) {

  const haystack =
    String(text || "")
      .toLowerCase();

  const needle =
    String(phrase || "")
      .toLowerCase()
      .trim();

  if (!needle) {
    return false;
  }

  return haystack.includes(needle);
}

// ========================================
// RESEARCH URL BUILDERS
// ========================================

function bingImagesUrl(query) {

  const url = new URL(
    "https://www.bing.com/images/search"
  );

  url.searchParams.set("q", query);

  return url.toString();
}

function googleSearchUrl(query) {

  const url = new URL(
    "https://www.google.com/search"
  );

  url.searchParams.set("q", query);

  return url.toString();
}

function commonsSearchUrl(query) {

  const url = new URL(
    "https://commons.wikimedia.org/w/index.php"
  );

  url.searchParams.set(
    "search",
    query
  );

  url.searchParams.set(
    "title",
    "Special:MediaSearch"
  );

  url.searchParams.set(
    "type",
    "image"
  );

  return url.toString();
}

// ========================================
// EVENT ALIASES
// ========================================

function eventAliases(event, year) {

  const original =
    normalize(event);

  const lower =
    original.toLowerCase();

  const aliases = [
    original
  ];

  /*
   Generic prefix variants.

   Examples:
   Superstorm Sandy -> Sandy
   Hurricane Sandy -> Sandy
  */

  const prefixes = [

    "superstorm ",

    "hurricane ",

    "tropical storm ",

    "tropical cyclone ",

    "winter storm ",

    "the "

  ];

  for (const prefix of prefixes) {

    if (
      lower.startsWith(prefix)
    ) {

      aliases.push(
        original.slice(
          prefix.length
        )
      );
    }
  }

  /*
   Known historical naming variants.

   These expand searches; they do not
   establish historical identity.
  */

  if (
    lower.includes("sandy") &&
    (!year || year === "2012")
  ) {

    aliases.push(
      "Hurricane Sandy",
      "Superstorm Sandy",
      "Post-Tropical Cyclone Sandy",
      "Sandy"
    );
  }

  return unique(
    aliases.map(normalize)
  );
}

// ========================================
// COMMONS API
// ========================================

async function commonsRequest(params) {

  const url = new URL(
    COMMONS_API
  );

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

          "User-Agent":
            USER_AGENT,

          "Accept":
            "application/json"
        },

        signal:
          controller.signal
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
// BUILD BROADER SEARCHES
// ========================================

function buildQueries(
  event,
  state,
  year
) {

  const aliases =
    eventAliases(
      event,
      year
    );

  const queries = [];

  for (const alias of aliases) {

    queries.push(

      `${alias} map`,

      `${alias} track`,

      `${alias} weather`,

      `${alias} radar`

    );

    if (year) {

      queries.push(
        `${alias} ${year} map`
      );
    }
  }

  queries.push(

    `${event} ${state}`,

    `${event} storm track`,

    `${event} meteorological chart`

  );

  return unique(
    queries
  ).slice(0, 16);
}

// ========================================
// SEARCH COMMONS
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
// GET FILE DETAILS
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
// EXTRACT FILE CANDIDATE
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

  if (
    !mime.startsWith("image/")
  ) {
    return null;
  }

  const metadata =
    info.extmetadata || {};

  const imageUrl =
    safeHttpUrl(
      info.url
    );

  const sourceUrl =
    safeHttpUrl(
      info.descriptionurl
    );

  if (
    !imageUrl ||
    !sourceUrl
  ) {
    return null;
  }

  return {

    title:
      page.title,

    url:
      sourceUrl,

    sourceUrl,

    imageUrl,

    thumbnailUrl:
      safeHttpUrl(
        info.thumburl ||
        info.url
      ),

    provider:
      "Wikimedia Commons",

    mime,

    width:
      info.width || null,

    height:
      info.height || null,

    description:
      stripHtml(
        metadata.ImageDescription?.value
      ),

    credit:
      stripHtml(
        metadata.Credit?.value
      ),

    artist:
      stripHtml(
        metadata.Artist?.value
      ),

    date:
      stripHtml(
        metadata.DateTimeOriginal?.value
      ),

    license:
      stripHtml(
        metadata.LicenseShortName?.value
      )
  };
}

// ========================================
// WEATHER MAP KEYWORDS
// ========================================

const MAP_TERMS = [

  "weather map",
  "meteorological map",
  "synoptic chart",
  "surface analysis",
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
  "precipitation map",
  "rainfall map",
  "wind field",
  "wind speed map",
  "pressure map",
  "isobar",
  "temperature map",
  "storm surge map",
  "inundation map",
  "weather analysis",
  "weather radar",
  "tropical cyclone track",
  "best track",
  "storm path",
  "storm trajectory"

];

const PHOTO_TERMS = [

  "storm damage",
  "aerial photo",
  "aerial photograph",
  "damage photograph",
  "damage photo",
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
  "rescue workers",
  "relief supplies",
  "tracking trucks",
  "photo of",
  "photograph of"

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
  "surge",
  "cyclone"

];

// ========================================
// CANDIDATE QUALIFICATION
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
    .replace(/_/g, " ");

  const text = [

    title,

    candidate.description,

    candidate.date

  ]
    .join(" ")
    .toLowerCase();

  const titleText =
    title.toLowerCase();

  const mapHits =
    MAP_TERMS.filter(
      term =>
        containsPhrase(
          text,
          term
        )
    );

  const photoHits =
    PHOTO_TERMS.filter(
      term =>
        containsPhrase(
          text,
          term
        )
    );

  const titleHits =
    MAP_TITLE_TERMS.filter(
      term =>
        containsPhrase(
          titleText,
          term
        )
    );

  const aliases =
    eventAliases(
      event,
      year
    );

  const eventMatched =
    aliases.some(
      alias =>
        containsPhrase(
          text,
          alias
        )
    );

  const stateMatched =
    containsPhrase(
      text,
      state
    );

  const yearMatched =
    year
      ? containsPhrase(
          text,
          year
        )
      : false;

  const reasons = [];

  let relevanceScore = 0;

  relevanceScore +=
    mapHits.length * 12;

  relevanceScore +=
    titleHits.length * 8;

  if (eventMatched) {
    relevanceScore += 20;
  }

  if (stateMatched) {
    relevanceScore += 10;
  }

  if (yearMatched) {
    relevanceScore += 10;
  }

  relevanceScore -=
    photoHits.length * 25;

  let qualification =
    "possible_map";

  if (
    photoHits.length > 0 &&
    mapHits.length === 0
  ) {

    qualification =
      "rejected_photo";

    reasons.push(
      "Photograph or non-map imagery indicated by metadata."
    );

  } else if (
    mapHits.length === 0 &&
    titleHits.length === 0
  ) {

    qualification =
      "rejected_non_map";

    reasons.push(
      "No weather-map indicators identified."
    );

  } else {

    reasons.push(
      "Possible weather-map candidate; authentication required."
    );
  }

  if (!eventMatched) {

    reasons.push(
      "Event not confirmed."
    );
  }

  if (!stateMatched) {

    reasons.push(
      "State not confirmed."
    );
  }

  if (
    year &&
    !yearMatched
  ) {

    reasons.push(
      "Year not confirmed."
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
          relevanceScore
        )
      ),

    mapTermsFound:
      mapHits,

    photoTermsFound:
      photoHits,

    eventMetadataMatch:
      eventMatched,

    geographyMetadataMatch:
      stateMatched,

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
// DISCOVERY ENGINE
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

  const titles =
    new Set();

  const errors = [];

  let successfulQueries = 0;

  for (const query of queries) {

    try {

      const results =
        await searchCommons(
          query
        );

      successfulQueries++;

      for (const result of results) {

        if (result.title) {

          titles.add(
            result.title
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

  const selectedTitles =
    [...titles].slice(
      0,
      MAX_CANDIDATES
    );

  const rawCandidates = [];

  for (
    let i = 0;
    i < selectedTitles.length;
    i += 15
  ) {

    try {

      const pages =
        await getFileDetails(
          selectedTitles.slice(
            i,
            i + 15
          )
        );

      for (const page of pages) {

        const candidate =
          extractCandidate(
            page
          );

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

  const classified =
    rawCandidates.map(
      candidate =>
        qualifyCandidate(
          candidate,
          event,
          state,
          year
        )
    );

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

  return {

    queries,

    successfulQueries,

    discoveryCompleted:
      successfulQueries ===
        queries.length &&
      errors.length === 0,

    totalRetrieved:
      classified.length,

    candidates,

    rejected,

    errors
  };
}

// ========================================
// OFFICIAL SOURCE RESEARCH LINKS
// ========================================

function officialSources(
  event,
  state,
  year
) {

  const aliases =
    eventAliases(
      event,
      year
    );

  const primary =
    aliases.find(
      alias =>
        alias.toLowerCase()
          .startsWith("hurricane ")
    ) || aliases[0];

  return [

    {

      name:
        "NOAA Historical Weather Maps",

      type:
        "official_research_link",

      url:
        googleSearchUrl(
          `site:noaa.gov "${primary}" ${year} weather map`
        ),

      verifiedCandidate:
        false
    },

    {

      name:
        "National Hurricane Center",

      type:
        "official_research_link",

      url:
        googleSearchUrl(
          `site:nhc.noaa.gov "${primary}" ${year} track map`
        ),

      verifiedCandidate:
        false
    },

    {

      name:
        "NOAA Weather Archives",

      type:
        "official_research_link",

      url:
        googleSearchUrl(
          `site:weather.gov "${primary}" ${state} ${year} radar map`
        ),

      verifiedCandidate:
        false
    }

  ];
}

// ========================================
// EVIDENCE LIST
// ========================================

function buildEvidence(candidates) {

  return candidates.map(
    item => ({

      title:
        item.title,

      url:
        item.sourceUrl,

      provider:
        item.provider,

      imageUrl:
        item.imageUrl,

      thumbnailUrl:
        item.thumbnailUrl,

      description:
        item.description,

      date:
        item.date,

      qualification:
        item.qualification,

      relevanceScore:
        item.relevanceScore,

      verification:
        "not_verified"
    })
  );
}

// ========================================
// AUDIT ENDPOINT
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

  if (
    !event ||
    !state
  ) {

    return respond(
      res,
      400,
      {

        status: "error",

        engine: 5,

        message:
          "Event and state required."
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
   Preserve original Bing rule:
   event + state + map
   Year excluded.
  */

  const query =
    `${event} ${state} map`;

  const researchURL =
    bingImagesUrl(
      query
    );

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

      totalRetrieved: 0,

      candidates: [],

      rejected: [],

      errors: [{

        message:
          error.message
      }]
    };
  }

  const evidence =
    buildEvidence(
      discovery.candidates
    );

  const officialResearch =
    officialSources(
      event,
      state,
      year
    );

  const discoveryError =
    discovery.errors.length
      ? discovery.errors
          .map(
            item =>
              item.message
          )
          .join("; ")
      : null;

  return respond(
    res,
    200,
    {

      status:
        "not_evaluated",

      engine: 5,

      version:
        VERSION,

      category:
        "Historical Weather Maps",

      source:
        "Wikimedia Commons + Bing Images + NOAA/NHC research",

      apiKeyRequired: false,

      automatedSearch: true,

      visualVerification: false,

      finalGradingEnabled: false,

      event,

      state,

      year:
        year || null,

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

      officialResearch,

      score: null,

      grade: null,

      finalGrade: false,

      verification: {

        metadataQualification:
          true,

        possibleMapsFound:
          discovery.candidates.length,

        rejectedNonMaps:
          discovery.rejected.length,

        visualAuthenticityVerified:
          false,

        completedHistoricalAudit:
          false
      },

      discoveryError,

      message:
        discovery.candidates.length
          ? "Possible historical weather maps discovered. Visual and historical authentication required before grading."
          : "No qualified maps found in the current automated discovery. Official archive research links are provided. Grade remains Not Evaluated."
    }
  );
}

// ========================================
// HEALTH
// ========================================

function healthResponse(res) {

  return respond(
    res,
    200,
    {

      status:
        "ok",

      engine: 5,

      version:
        VERSION,

      source:
        "Wikimedia Commons + Bing Images + NOAA/NHC research",

      apiKeyRequired:
        false,

      automatedSearch:
        true,

      metadataQualification:
        true,

      visualVerification:
        false,

      finalGradingEnabled:
        false,

      endpoints: [

        "/",

        "/health",

        "/audit5"

      ],

      message:
        "Expanded historical weather map discovery enabled. Authenticity grading remains disabled."
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
        req.method ===
        "OPTIONS"
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
        req.method !==
        "GET"
      ) {

        return respond(
          res,
          405,
          {

            status:
              "error",

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

            status:
              "error",

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
          url.pathname ===
          "/"
        ) {

          return respond(
            res,
            200,
            {

              name:
                "Weather Time Machine — Engine 5",

              version:
                VERSION,

              source:
                "Wikimedia Commons + Bing Images + NOAA/NHC research",

              health:
                "/health",

              auditExample:
                "/audit5?event=Superstorm%20Sandy&state=New%20Jersey&year=2012",

              message:
                "Expanded historical weather map discovery service. Final grading requires verified evidence."
            }
          );
        }

        return respond(
          res,
          404,
          {

            status:
              "error",

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

              status:
                "error",

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
// START ENGINE
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
