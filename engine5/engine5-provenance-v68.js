
"use strict";

/*
 WEATHER TIME MACHINE — ENGINE 5
 VERSION 6.8
 HISTORICAL WEATHER MAP PROVENANCE VERIFICATION

 Independent research test
 Node.js 22
 No external packages
 No API key
 No automated historical authenticity or A–F grades

 PRESERVES:
 - Engine 5 v6.5 production server
 - Blogger Step 8A
 - Engines 1–4
*/

const fs = require("node:fs");

const BASE =
  process.env.ENGINE5_URL ||
  "https://weather-time-machine-engine5.onrender.com";

const EVENT = process.env.EVENT || "Superstorm Sandy";
const STATE = process.env.STATE || "New Jersey";
const YEAR = process.env.YEAR || "2012";

const OUTPUT = "engine5-v68-provenance-results.json";

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const strip = value =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const imageWords =
  /\b(radar|storm[ -]?track|track|path|synoptic|surface analysis|weather map|weather chart|forecast cone|isobar|pressure chart|satellite|goes|precipitation)\b/i;

const photoWords =
  /\b(damage|debris|flooded street|rescue|photograph of|photo of)\b/i;

const trustedNames =
  /\b(NOAA|NHC|National Hurricane Center|National Weather Service|NWS|NASA|GOES|NESDIS|Hurricane Research Division)\b/i;

const retryStatuses = new Set([
  429, 500, 502, 503, 504
]);

function retryAfter(value) {
  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const date = Date.parse(value || "");

  return Number.isFinite(date)
    ? Math.max(0, date - Date.now())
    : 0;
}

async function request(
  url,
  accept = "application/json"
) {
  let lastError;

  for (let attempt = 0; attempt < 4; attempt++) {
    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      25000
    );

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "WeatherTimeMachineEngine5-v68/1.0 " +
            "(independent research verification)",
          Accept: accept
        }
      });

      if (response.ok) {
        return response;
      }

      lastError = `HTTP ${response.status}`;

      if (
        !retryStatuses.has(response.status) ||
        attempt === 3
      ) {
        throw new Error(lastError);
      }

      const delay = Math.min(
        60000,
        Math.max(
          retryAfter(
            response.headers.get("retry-after")
          ),
          4000 * 2 ** attempt
        ) +
        Math.floor(Math.random() * 500)
      );

      await response.body?.cancel();
      await sleep(delay);

    } catch (error) {
      lastError = error.message;

      if (attempt === 3) {
        throw new Error(lastError);
      }

      await sleep(4000 * 2 ** attempt);

    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(
    lastError || "Request failed"
  );
}

function commonsName(candidate) {
  for (const source of [
    candidate.title,
    candidate.sourceURL,
    candidate.sourceUrl,
    candidate.url
  ]) {
    const match = String(source || "")
      .match(
        /(?:File:|\/wiki\/File:)([^?#]+)/i
      );

    if (match) {
      try {
        return (
          "File:" +
          decodeURIComponent(match[1])
            .replace(/_/g, " ")
        );
      } catch {
        return (
          "File:" +
          match[1].replace(/_/g, " ")
        );
      }
    }
  }

  return null;
}

function yearEvidence(
  title,
  date,
  description
) {
  // Remove HHMM UTC times before detecting years.
  // Example: 1818 UTC must not become year 1818.

  const titleClean = String(title || "")
    .replace(
      /\b(?:[01]\d|2[0-3])[0-5]\d\s*UTC\b/gi,
      " UTC"
    );

  const years = value => [
    ...new Set(
      String(value || "")
        .match(/\b(?:18|19|20)\d{2}\b/g) || []
    )
  ];

  const eventYears = [
    ...new Set([
      ...years(titleClean),
      ...years(date)
    ])
  ];

  const otherYears = years(description);

  return {
    eventYears,
    otherYears,
    requestedYearMatch:
      eventYears.includes(YEAR),
    conflictingEventYear:
      eventYears.length > 0 &&
      !eventYears.includes(YEAR),
    descriptionYearsNotEventDates: true
  };
}

function metadataField(
  metadata,
  keys
) {
  for (const key of keys) {
    const item = metadata?.[key];

    if (item) {
      return strip(
        item.value ?? item
      );
    }
  }

  return "";
}

function evaluate(
  candidate,
  info
) {
  const title = strip(
    candidate.title || info.title
  );

  const description =
    metadataField(
      info.extmetadata,
      [
        "ImageDescription",
        "ObjectName"
      ]
    ) ||
    strip(candidate.description);

  const date =
    metadataField(
      info.extmetadata,
      [
        "DateTimeOriginal",
        "DateTime",
        "DateTimeDigitized"
      ]
    ) ||
    strip(candidate.date);

  const author = metadataField(
    info.extmetadata,
    [
      "Artist",
      "Credit",
      "Attribution",
      "Source"
    ]
  );

  const license = metadataField(
    info.extmetadata,
    [
      "LicenseShortName",
      "License"
    ]
  );

  const combined = [
    title,
    description,
    author
  ].join(" ");

  const year = yearEvidence(
    title,
    date,
    description
  );

  const eventMatch =
    /\bsandy\b/i.test(combined) &&
    /\bsandy\b/i.test(EVENT);

  const mapTypeMatch =
    imageWords.test(combined);

  const photoOnly =
    photoWords.test(combined) &&
    !mapTypeMatch;

  const agencyAttribution =
    trustedNames.test(
      author + " " + description
    );

  const stateMatch =
    combined.toLowerCase()
      .includes(STATE.toLowerCase()) ||
    /\bNJ\b|mid.atlantic|northeast|new york/i
      .test(combined);

  const reasons = [];

  let status = "manual_review_required";

  if (year.conflictingEventYear) {
    status =
      "rejected_conflicting_event_year";

    reasons.push(
      "Explicit title/observation date " +
      "conflicts with requested year"
    );

  } else if (!eventMatch) {
    status = "rejected_event_mismatch";

    reasons.push(
      "Event not confirmed in source metadata"
    );

  } else if (photoOnly) {
    status = "rejected_obvious_photo";

    reasons.push(
      "Photographic subject without " +
      "weather-map indicators"
    );

  } else {
    if (!year.requestedYearMatch) {
      reasons.push(
        "Historical event year not " +
        "independently confirmed"
      );
    }

    if (!mapTypeMatch) {
      reasons.push(
        "Weather-map type not confirmed"
      );
    }

    if (!agencyAttribution) {
      reasons.push(
        "Original scientific source " +
        "attribution needs confirmation"
      );
    }

    if (!stateMatch) {
      reasons.push(
        "New Jersey geographic coverage " +
        "needs visual review"
      );
    }

    reasons.push(
      "Original imagery and scientific " +
      "provenance require human review"
    );
  }

  return {
    status,
    reasons,

    metadata: {
      title,
      description,
      date,
      author,
      license,

      sourcePage:
        info.descriptionurl ||
        candidate.sourceURL ||
        candidate.url ||
        null,

      mime: info.mime || null,
      bytes: info.size ?? null,
      sha1: info.sha1 || null
    },

    checks: {
      eventMatch,
      mapTypeMatch,
      photoOnly,
      agencyAttribution,
      stateMatch,
      ...year
    },

    visualVerified: false,
    provenanceVerified: false,
    authenticated: false,
    acceptedForGrading: false,
    score: null,
    grade: null
  };
}

async function main() {
  const report = {
    engine: 5,
    version: "6.8",

    test:
      "Historical Map Provenance Verification",

    startedAt:
      new Date().toISOString(),

    event: EVENT,
    state: STATE,
    year: YEAR,

    status: "not_evaluated",
    sourceVersion: null,

    candidates: [],
    summary: {},

    score: null,
    grade: null,
    finalGrade: false,

    visualVerification: false,
    provenanceVerification: false
  };

  try {
    const auditUrl = new URL(
      "/audit5",
      BASE
    );

    for (const [key, value] of Object.entries({
      event: EVENT,
      state: STATE,
      year: YEAR
    })) {
      auditUrl.searchParams.set(
        key,
        value
      );
    }

    const audit = await (
      await request(auditUrl)
    ).json();

    if (
      audit.engine !== 5 ||
      !Array.isArray(audit.candidates)
    ) {
      throw new Error(
        "Unexpected /audit5 response"
      );
    }

    report.sourceVersion =
      audit.version;

    report.discoveryCompleted =
      audit.discoveryCompleted === true;

    report.searchCompleted =
      audit.searchCompleted === true;

    if (
      !report.discoveryCompleted ||
      !report.searchCompleted
    ) {
      report.discoveryWarning =
        "Discovery incomplete; absence " +
        "of results cannot be scored";
    }

    const total = Math.min(
      audit.candidates.length,
      20
    );

    for (
      let i = 0;
      i < total;
      i++
    ) {
      const candidate =
        audit.candidates[i];

      const name =
        commonsName(candidate);

      let entry = {
        candidateNumber: i + 1,
        title: candidate.title || null,
        commonsTitle: name
      };

      if (!name) {
        entry.status =
          "metadata_unavailable";

        entry.error =
          "Missing Commons file title";

        report.candidates.push(entry);
        continue;
      }

      try {
        const api = new URL(
          "https://commons.wikimedia.org/w/api.php"
        );

        const params = {
          action: "query",
          format: "json",
          prop: "imageinfo",

          iiprop:
            "url|size|mime|sha1|extmetadata",

          titles: name
        };

        for (
          const [key, value]
          of Object.entries(params)
        ) {
          api.searchParams.set(
            key,
            value
          );
        }

        const payload = await (
          await request(api)
        ).json();

        const page = Object.values(
          payload.query?.pages || {}
        )[0];

        if (
          !page ||
          page.missing !== undefined ||
          !page.imageinfo?.[0]
        ) {
          throw new Error(
            "Commons metadata not found"
          );
        }

        entry = {
          ...entry,
          ...evaluate(
            candidate,
            page.imageinfo[0]
          )
        };

      } catch (error) {
        entry.status =
          "metadata_unavailable";

        entry.error =
          String(error.message);
      }

      report.candidates.push(entry);

      console.log(
        `${i + 1}/${total}: ` +
        `${entry.status} — ` +
        `${candidate.title || name}`
      );

      if (i < total - 1) {
        await sleep(2500);
      }
    }

  } catch (error) {
    report.error =
      String(error.message);

    process.exitCode = 1;
  }

  const count = status =>
    report.candidates.filter(
      item => item.status === status
    ).length;

  report.summary = {
    examined:
      report.candidates.length,

    manualReviewRequired:
      count("manual_review_required"),

    rejectedConflictingYear:
      count(
        "rejected_conflicting_event_year"
      ),

    rejectedEventMismatch:
      count("rejected_event_mismatch"),

    rejectedObviousPhoto:
      count("rejected_obvious_photo"),

    metadataUnavailable:
      count("metadata_unavailable"),

    authenticatedMaps: 0,
    finalGradingEnabled: false
  };

  report.completedAt =
    new Date().toISOString();

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(
      report,
      null,
      2
    )
  );

  console.log(
    `Report: ${OUTPUT}`
  );

  console.log(
    JSON.stringify(report.summary)
  );

  console.log(
    "Final grade: NOT EVALUATED — " +
    "independent provenance and visual " +
    "authentication required"
  );

  if (report.error) {
    console.error(
      "ERROR:",
      report.error
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
