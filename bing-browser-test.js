
"use strict";

const { chromium } = require("playwright");

// WEATHER TIME MACHINE — ENGINE 3 — TEST #24 CORRECTED
// Provisional A-F grading with relevance filtering.
// No changes to Blogger, Engines 1/2, or verified grades.

const BASE_QUERY =
  process.env.WEATHER_QUERY ||
  "hurricane sandy 2012 new jersey news";

const MIN_VIEWS = 1000;

const ROOT_QUERY = BASE_QUERY
  .replace(/\s+news\s*$/i, "")
  .trim();

const SEARCHES = [...new Set([
  BASE_QUERY,
  ROOT_QUERY + " footage",
  ROOT_QUERY + " youtube",
  ROOT_QUERY + " local news"
])];

// Provisional grading thresholds.
function grade(count) {
  if (count >= 20) return "A";
  if (count >= 15) return "B";
  if (count >= 10) return "C";
  if (count >= 5) return "D";
  return "F";
}

function parseViews(value) {
  const match = String(value || "").match(
    /\b(\d[\d,.]*)\s*([KMB])?\s*views?\b/i
  );

  if (!match) return null;

  const number = Number(match[1].replace(/,/g, ""));
  const multiplier = {
    K: 1000,
    M: 1000000,
    B: 1000000000
  }[(match[2] || "").toUpperCase()] || 1;

  return Number.isFinite(number)
    ? Math.round(number * multiplier)
    : null;
}

function decode(value) {
  let result = String(value || "");

  for (let i = 0; i < 5; i++) {
    const previous = result;

    result = result
      .replace(/&amp;|&#38;/gi, "&")
      .replace(/&quot;|&#34;/gi, '"')
      .replace(/\\u0026/gi, "&")
      .replace(/\\u003d/gi, "=")
      .replace(/\\u002f/gi, "/")
      .replace(/\\\//g, "/");

    try {
      result = decodeURIComponent(result);
    } catch (_) {}

    if (result === previous) break;
  }

  return result;
}

function youtubeIds(value) {
  const source = decode(value);
  const ids = new Set();

  const patterns = [
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?[^\s"'<>]*?[?&]v=([A-Za-z0-9_-]{11})/gi,
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?v=([A-Za-z0-9_-]{11})/gi,
    /youtu\.be\/([A-Za-z0-9_-]{11})/gi,
    /youtube(?:-nocookie)?\.com\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/gi
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      ids.add(match[1]);
    }
  }

  return [...ids];
}

// Test #24 event relevance rules.
// These rules are specific to Hurricane Sandy in New Jersey.
// Other events must be configured separately.
function relevance(title) {
  const text = String(title || "").toLowerCase();

  const event =
    /\b(sandy|superstorm)\b/.test(text);

  const place =
    /\b(new jersey|jersey shore|nj|atlantic city|seaside heights|hoboken|belmar|point pleasant|asbury park|long beach island|lbi)\b/.test(text);

  const weather =
    /\b(hurricane|storm surge|coastal flooding|flooding|evacuation|landfall)\b/.test(text);

  const year =
    /\b2012\b/.test(text);

  const strict =
    event && (place || year);

  const broad =
    event || (weather && place);

  return {
    strict,
    broad,
    category: strict
      ? "STRICT"
      : broad
        ? "BROAD"
        : "EXCLUDED"
  };
}

async function extract(page) {
  return page.evaluate(() => {
    const nodes = [
      ...document.querySelectorAll(".mc_vtvc.b_canvas")
    ];

    const viewPattern =
      /\b\d[\d,.]*\s*[KMB]?\s*views?\b/i;

    return nodes.map((node, index) => {
      const titleElement = node.querySelector(
        ".mc_vtvc_title, [class*='title'], a[title]"
      );

      const title = (
        titleElement?.getAttribute("title") ||
        titleElement?.innerText ||
        node.getAttribute("aria-label") ||
        ""
      ).trim();

      const text = (node.innerText || "").trim();

      const labels = [
        ...node.querySelectorAll("*")
      ].filter(element => {
        const ownText =
          (element.innerText || "").trim();

        return viewPattern.test(ownText) &&
          ![...element.children].some(child =>
            viewPattern.test(
              (child.innerText || "").trim()
            )
          );
      }).map(element =>
        (element.innerText || "")
          .match(viewPattern)?.[0]
      ).filter(Boolean);

      const evidence = [];

      for (const element of [
        node,
        ...node.querySelectorAll(
          "[mmeta], [vrhdata], [ourl], [href], [data-mmeta]"
        )
      ]) {
        for (const attribute of element.attributes || []) {
          if (
            /mmeta|vrhdata|ourl|href|video|media|url|data-id/i
              .test(attribute.name)
          ) {
            evidence.push(attribute.value);
          }
        }
      }

      return {
        index,
        title: title.slice(0, 250),
        label:
          labels[0] ||
          text.match(viewPattern)?.[0] ||
          "",
        evidence
      };
    });
  });
}

function identify(card) {
  const ids = new Set();

  for (const value of card.evidence) {
    for (const id of youtubeIds(value)) {
      ids.add(id);
    }
  }

  const candidates = [...ids];

  return {
    id: candidates.length === 1
      ? candidates[0]
      : null,
    candidates,
    identityStatus:
      candidates.length === 1
        ? "BING_ID_CANDIDATE"
        : candidates.length > 1
          ? "AMBIGUOUS"
          : "MISSING"
  };
}

(async () => {
  const browser = await chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage({
      viewport: {
        width: 1440,
        height: 900
      },
      locale: "en-US"
    });

    const observations = [];
    let successfulSearches = 0;

    console.log(
      "WEATHER TIME MACHINE — ENGINE 3 — TEST #24 CORRECTED"
    );
    console.log("EVENT QUERY:", BASE_QUERY);
    console.log("MINIMUM VIEWS:", MIN_VIEWS);

    for (let i = 0; i < SEARCHES.length; i++) {
      const query = SEARCHES[i];

      const url =
        "https://www.bing.com/videos/search?q=" +
        encodeURIComponent(query);

      console.log(
        "\nSEARCH",
        i + 1,
        "OF",
        SEARCHES.length,
        query
      );

      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 45000
        });

        await page.waitForTimeout(4500);

        console.log(
          "HTTP STATUS:",
          response?.status()
        );

        if (!response || response.status() !== 200) {
          continue;
        }

        successfulSearches++;

        const cards = await extract(page);

        console.log(
          "BING CARDS:",
          cards.length
        );

        for (const card of cards) {
          const identity = identify(card);

          observations.push({
            search: i + 1,
            title: card.title,
            views: parseViews(card.label),
            viewLabel: card.label,
            relevance: relevance(card.title),
            ...identity
          });
        }
      } catch (error) {
        console.log(
          "SEARCH ERROR:",
          error.message
        );
      }
    }

    const withViews = observations.filter(
      row => row.views !== null
    );

    const qualifying = withViews.filter(
      row => row.views >= MIN_VIEWS
    );

    const relevant = qualifying.filter(
      row => row.relevance.broad
    );

    const excluded = qualifying.filter(
      row => !row.relevance.broad
    );

    const unresolved = relevant.filter(
      row => !row.id
    );

    const unique = new Map();

    for (const row of relevant) {
      if (!row.id) continue;

      if (!unique.has(row.id)) {
        unique.set(row.id, {
          id: row.id,
          title: row.title,
          reportedViews: row.views,
          relevance: row.relevance.category,
          searches: [row.search],
          youtubeUrl:
            "https://www.youtube.com/watch?v=" +
            row.id,
          verification: "UNVERIFIED"
        });
      } else {
        const existing = unique.get(row.id);

        existing.reportedViews = Math.max(
          existing.reportedViews,
          row.views
        );

        if (!existing.searches.includes(row.search)) {
          existing.searches.push(row.search);
        }

        if (row.relevance.strict) {
          existing.relevance = "STRICT";
        }
      }
    }

    const count = unique.size;

    // Unresolved relevant cards are reported as uncertainty.
    // They do not automatically suppress the provisional grade.
    // No F is assigned if zero candidates were identified.
    const sufficientData =
      successfulSearches === SEARCHES.length &&
      count > 0;

    const provisionalGrade = sufficientData
      ? grade(count)
      : "N/A";

    const result = {
      engine: 3,
      test: 24,
      query: BASE_QUERY,
      provisionalGrade,
      gradeStatus: sufficientData
        ? "PROVISIONAL_UNVERIFIED"
        : "INSUFFICIENT_DATA",
      gradingSource:
        "Bing-reported video views",
      minimumViews: MIN_VIEWS,
      uniqueRelevantCandidates: count,
      unresolvedRelevantCards: unresolved.length,
      excludedCardObservations: excluded.length,
      independentlyVerified: 0,
      successfulSearches,
      totalSearches: SEARCHES.length,
      candidates: [...unique.values()]
    };

    console.log("\n================================");
    console.log("TEST #24 — CORRECTED GRADING SUMMARY");
    console.log("================================");

    console.log(
      "SEARCHES COMPLETED:",
      successfulSearches,
      "OF",
      SEARCHES.length
    );

    console.log(
      "TOTAL CARD OBSERVATIONS:",
      observations.length
    );

    console.log(
      "CARDS WITH 1000+ VIEWS:",
      qualifying.length
    );

    console.log(
      "RELEVANT 1000+ CARD OBSERVATIONS:",
      relevant.length
    );

    console.log(
      "EXCLUDED CARD OBSERVATIONS:",
      excluded.length
    );

    console.log(
      "DISTINCT RELEVANT YOUTUBE ID CANDIDATES:",
      count
    );

    console.log(
      "UNRESOLVED RELEVANT CARDS:",
      unresolved.length
    );

    console.log(
      "INDEPENDENTLY VERIFIED:",
      0
    );

    console.log(
      "PROVISIONAL GRADE:",
      provisionalGrade
    );

    console.log(
      "GRADE STATUS:",
      result.gradeStatus
    );

    console.log(
      "\nGRADING RESULT:",
      JSON.stringify(result, null, 2)
    );

    console.log("\nFINAL STATUS");

    if (sufficientData) {
      console.log(
        "TEST #24 COMPLETED — PROVISIONAL A-F GRADE CALCULATED."
      );
    } else {
      console.log(
        "TEST #24 INCOMPLETE — INSUFFICIENT RELEVANT DATA."
      );
    }

    console.log(
      "TEST #25 REQUIRED — INDEPENDENT VIDEO VERIFICATION."
    );

    console.log(
      "BLOGGER AND ENGINES 1/2 UNCHANGED."
    );

  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(
    "ENGINE 3 TEST #24 ERROR:",
    error
  );
  process.exitCode = 1;
});
