
"use strict";

/*
 WEATHER TIME MACHINE — ENGINE 5
 Historical Weather Map Verification
 Step 8A

 Node.js 22
 No external npm packages
 Independent of Engines 1–4

 Discovery: Wikimedia Commons API

 IMPORTANT:
 Metadata-based candidate discovery is NOT final
 visual verification. Never award a final grade
 unless acceptable map evidence is verified.
*/

const http = require("node:http");

const PORT = Number(process.env.PORT || 10000);

const COMMONS_API =
  "https://commons.wikimedia.org/w/api.php";

const USER_AGENT =
  "WeatherTimeMachineEngine5/1.0 " +
  "(historical weather map research)";

const MIN_RESULTS = 1;
const MAX_SEARCH_RESULTS = 30;
const MAX_EVIDENCE = 15;

const MAP_TERMS = [
  "map",
  "chart",
  "radar",
  "satellite",
  "isobar",
  "isohyet",
  "precipitation",
  "rainfall",
  "storm track",
  "hurricane track",
  "wind speed",
  "wind gust",
  "storm surge",
  "flood extent",
  "weather analysis",
  "surface analysis",
  "synoptic",
  "meteorological"
];

const REJECT_TERMS = [
  "portrait",
  "selfie",
  "photograph of",
  "photo of",
  "people standing",
  "family photo",
  "damage photograph",
  "damage photo",
  "street photograph",
  "building photograph",
  "artwork",
  "painting",
  "cartoon",
  "comic",
  "decorative",
  "logo",
  "poster",
  "advertisement",
  "advertising"
];

const METEOROLOGICAL_TERMS = [
  "rain",
  "rainfall",
  "precipitation",
  "wind",
  "gust",
  "storm",
  "hurricane",
  "tropical",
  "cyclone",
  "flood",
  "surge",
  "radar",
  "satellite",
  "pressure",
  "weather",
  "meteorological",
  "isobar",
  "isohyet",
  "temperature",
  "snow",
  "blizzard",
  "tornado",
  "synoptic"
];

function normalize(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function lower(value) {
  return normalize(value).toLowerCase();
}

function tokens(value) {
  const stopWords = new Set([
    "the", "and", "for", "with", "from",
    "storm", "weather", "historic",
    "historical", "great", "major",
    "of", "in", "on", "a", "an",
    "new", "event"
  ]);

  return lower(value)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(word =>
      word.length > 2 &&
      !stopWords.has(word)
    );
}

function includesAny(text, terms) {
  const value = lower(text);

  return terms.some(term =>
    value.includes(term)
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function stripYear(event) {
  return normalize(event)
    .replace(/\b(?:18|19|20)\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchQuery(event, state) {
  return [
    stripYear(event),
    normalize(state),
    "map"
  ].filter(Boolean).join(" ");
}

function googleImagesURL(event, state) {
  return (
    "https://www.google.com/search?tbm=isch&q=" +
    encodeURIComponent(searchQuery(event, state))
  );
}

function json(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type":
      "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type",
    "Cache-Control": "no-store"
  });

  response.end(
    JSON.stringify(body, null, 2)
  );
}

function buildCommonsURL(query) {
  const url = new URL(COMMONS_API);

  const params = {
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6",
    gsrlimit: String(MAX_SEARCH_RESULTS),
    prop: "imageinfo|categories",
    iiprop: "url|extmetadata|size|mime",
    cllimit: "max",
    format: "json",
    formatversion: "2",
    origin: "*"
  };

  for (const [key, value] of
    Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

async function fetchCommons(query) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    20000
  );

  try {
    const response = await fetch(
      buildCommonsURL(query),
      {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "application/json"
        },
        signal: controller.signal
      }
    );

    if (!response.ok) {
      throw new Error(
        "Wikimedia Commons HTTP " +
        response.status
      );
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(
        data.error.info ||
        "Wikimedia Commons API error"
      );
    }

    return data.query?.pages || [];
  } finally {
    clearTimeout(timeout);
  }
}

function extractMetadata(page) {
  const info = page.imageinfo?.[0] || {};
  const metadata = info.extmetadata || {};

  const description = normalize(
    metadata.ImageDescription?.value
  );

  const categories = (
    page.categories || []
  ).map(item =>
    normalize(item.title)
  );

  const title = normalize(
    page.title || ""
  ).replace(/^File:/i, "");

  const text = [
    title,
    description,
    ...categories
  ].join(" ");

  return {
    title,
    description,
    categories,
    text,
    mime: info.mime || "",
    imageURL: info.url || "",
    pageURL:
      info.descriptionurl ||
      "https://commons.wikimedia.org/wiki/" +
      encodeURIComponent(page.title || ""),
    width: Number(info.width || 0),
    height: Number(info.height || 0)
  };
}

function evaluateCandidate(
  page,
  event,
  state,
  year
) {
  const image = extractMetadata(page);
  const text = lower(image.text);

  const eventWords = unique(
    tokens(stripYear(event))
  );

  const matchedEventWords =
    eventWords.filter(word =>
      text.includes(word)
    );

  const eventMatch =
    eventWords.length > 0 &&
    matchedEventWords.length ===
      eventWords.length;

  const stateName = lower(state);

  const stateMatch =
    Boolean(stateName) &&
    text.includes(stateName);

  const mapMatch =
    includesAny(text, MAP_TERMS);

  const weatherMatch =
    includesAny(
      text,
      METEOROLOGICAL_TERMS
    );

  const rejectedVisualType =
    includesAny(text, REJECT_TERMS);

  const imageMime =
    /^image\//i.test(image.mime);

  const yearString =
    String(year || "").trim();

  const yearsInMetadata = unique(
    (text.match(
      /\b(?:18|19|20)\d{2}\b/g
    ) || [])
  );

  const yearMatch =
    Boolean(yearString) &&
    yearsInMetadata.includes(yearString);

  const conflictingYear =
    Boolean(yearString) &&
    yearsInMetadata.length > 0 &&
    !yearMatch;

  const reasons = [];

  if (!imageMime) {
    reasons.push(
      "Not a supported image MIME type"
    );
  }

  if (!mapMatch) {
    reasons.push(
      "No map-type metadata found"
    );
  }

  if (!weatherMatch) {
    reasons.push(
      "No meteorological content identified"
    );
  }

  if (!eventMatch) {
    reasons.push(
      "Historical event not sufficiently matched"
    );
  }

  if (!stateMatch) {
    reasons.push(
      "Selected state not identified in metadata"
    );
  }

  if (rejectedVisualType) {
    reasons.push(
      "Metadata indicates a photograph, " +
      "artwork, or decorative image"
    );
  }

  if (conflictingYear) {
    reasons.push(
      "Metadata year does not match selected event"
    );
  }

  const candidate =
    imageMime &&
    mapMatch &&
    weatherMatch &&
    eventMatch &&
    stateMatch &&
    !rejectedVisualType &&
    !conflictingYear;

  let relevanceScore = 0;

  if (imageMime) relevanceScore += 5;
  if (mapMatch) relevanceScore += 25;
  if (weatherMatch) relevanceScore += 20;
  if (eventMatch) relevanceScore += 25;
  if (stateMatch) relevanceScore += 15;
  if (yearMatch) relevanceScore += 10;

  if (rejectedVisualType) {
    relevanceScore = Math.max(
      0,
      relevanceScore - 40
    );
  }

  if (conflictingYear) {
    relevanceScore = Math.max(
      0,
      relevanceScore - 35
    );
  }

  return {
    title: image.title,
    url: image.pageURL,
    imageURL: image.imageURL,
    description: image.description,
    width: image.width,
    height: image.height,
    mime: image.mime,
    candidate,
    visuallyVerified: false,
    historicallyVerified: false,
    metadataRelevanceScore:
      relevanceScore,
    checks: {
      eventMatch,
      stateMatch,
      yearMatch,
      mapMatch,
      weatherMatch,
      rejectedVisualType,
      conflictingYear
    },
    reasons,
    verificationStatus:
      candidate
        ? "CANDIDATE — VISUAL REVIEW REQUIRED"
        : "REJECTED BY METADATA"
  };
}

async function runAudit(
  event,
  state,
  year
) {
  const query = searchQuery(
    event,
    state
  );

  const searches = unique([
    [
      stripYear(event),
      state,
      "weather map"
    ].join(" "),
    [
      stripYear(event),
      state,
      "rainfall wind storm track map"
    ].join(" "),
    [
      stripYear(event),
      state,
      "meteorological chart"
    ].join(" ")
  ]);

  const responses = await Promise.all(
    searches.map(query =>
      fetchCommons(query)
    )
  );

  const pages = new Map();

  for (const group of responses) {
    for (const page of group) {
      pages.set(
        String(page.pageid),
        page
      );
    }
  }

  const evaluated = [
    ...pages.values()
  ].map(page =>
    evaluateCandidate(
      page,
      event,
      state,
      year
    )
  );

  const candidates = evaluated
    .filter(item => item.candidate)
    .sort(
      (a, b) =>
        b.metadataRelevanceScore -
        a.metadataRelevanceScore
    )
    .slice(0, MAX_EVIDENCE);

  const rejectedCount =
    evaluated.filter(
      item => !item.candidate
    ).length;

  return {
    status: "not_evaluated",
    engine: 5,
    category:
      "Historical Weather Maps",
    event,
    state,
    year: year || null,
    query,
    researchURL:
      googleImagesURL(event, state),
    source:
      "Wikimedia Commons API",
    searchCompleted: true,
    searchedCount: evaluated.length,
    candidateCount: candidates.length,
    rejectedCount,
    minimumResults: MIN_RESULTS,
    candidates,
    evidence: candidates.map(item => ({
      title: item.title,
      url: item.url,
      imageURL: item.imageURL,
      provider: "Wikimedia Commons",
      verified: false
    })),
    score: null,
    grade: null,
    finalGrade: false,
    message:
      candidates.length > 0
        ? "Historical weather map candidates " +
          "found. Visual and historical " +
          "verification is still required."
        : "No acceptable historical weather " +
          "maps verified. Do not assign zero " +
          "until a complete verification " +
          "process confirms none exist."
  };
}

const server = http.createServer(
  async (request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods":
          "GET, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type"
      });

      response.end();
      return;
    }

    const url = new URL(
      request.url,
      "http://localhost"
    );

    if (
      request.method === "GET" &&
      url.pathname === "/health"
    ) {
      return json(response, 200, {
        status: "ok",
        engine: 5,
        source: "Wikimedia Commons",
        apiKeyRequired: false,
        historicalMapsOnly: true,
        visualVerification: false,
        finalGradingEnabled: false
      });
    }

    if (
      request.method === "GET" &&
      url.pathname === "/audit5"
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
        return json(response, 400, {
          status: "error",
          message:
            "Event and state are required."
        });
      }

      try {
        const result = await runAudit(
          event,
          state,
          year
        );

        return json(
          response,
          200,
          result
        );
      } catch (error) {
        console.error(
          "Engine 5 audit error:",
          error.message
        );

        return json(response, 502, {
          status: "not_evaluated",
          engine: 5,
          score: null,
          grade: null,
          message:
            "Historical map verification " +
            "could not be completed.",
          error: error.message
        });
      }
    }

    return json(response, 404, {
      status: "error",
      message:
        "Endpoint not found.",
      availableEndpoints: [
        "/health",
        "/audit5?event=Superstorm%20Sandy&state=New%20Jersey&year=2012"
      ]
    });
  }
);

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    "Weather Time Machine Engine 5 " +
    "listening on port " + PORT
  );
});
