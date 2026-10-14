
"use strict";

const { chromium } = require("playwright");

// WEATHER TIME MACHINE — ENGINE 3 — TEST #24
// PROVISIONAL A–F GRADING
// No changes to Blogger or Engines 1 and 2.

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

function grade(count) {
  if (count >= 20) return "A";
  if (count >= 15) return "B";
  if (count >= 10) return "C";
  if (count >= 5) return "D";
  return "F";
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
        const ownText = (element.innerText || "").trim();

        return viewPattern.test(ownText) &&
          ![...element.children].some(child =>
            viewPattern.test(
              (child.innerText || "").trim()
            )
          );
      }).map(element =>
        (element.innerText || "").match(viewPattern)?.[0]
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
      "WEATHER TIME MACHINE — ENGINE 3 — TEST #24"
    );
    console.log("PROVISIONAL A–F GRADING");
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

    const unique = new Map();

    for (const row of qualifying) {
      if (!row.id) continue;

      if (!unique.has(row.id)) {
        unique.set(row.id, {
          id: row.id,
          title: row.title,
          reportedViews: row.views,
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
      }
    }

    const unresolved = qualifying.filter(
      row => !row.id
    );

    const count = unique.size;

    // An F requires a successful search and sufficient
    // identification coverage. Otherwise use N/A.
    const completeEnough =
      successfulSearches === SEARCHES.length &&
      observations.length > 0 &&
      unresolved.length === 0;

    const provisionalGrade = completeEnough
      ? grade(count)
      : "N/A";

    const result = {
      engine: 3,
      test: 24,
      query: BASE_QUERY,
      grade: provisionalGrade,
      gradeStatus:
        completeEnough
          ? "PROVISIONAL"
          : "INSUFFICIENT_DATA",
      gradingSource:
        "Bing-reported view counts",
      minimumViews: MIN_VIEWS,
      uniqueQualifyingCandidates: count,
      independentlyVerified: 0,
      unresolvedQualifyingCards: unresolved.length,
      successfulSearches,
      totalSearches: SEARCHES.length,
      candidates: [...unique.values()]
    };

    console.log("\n==============================");
    console.log("TEST #24 — GRADING SUMMARY");
    console.log("==============================");

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
      "CARDS WITH VIEW COUNTS:",
      withViews.length
    );

    console.log(
      "CARDS WITH 1000+ VIEWS:",
      qualifying.length
    );

    console.log(
      "DISTINCT YOUTUBE ID CANDIDATES:",
      count
    );

    console.log(
      "UNRESOLVED QUALIFYING CARDS:",
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

    if (completeEnough) {
      console.log(
        "TEST #24 PASSED — PROVISIONAL GRADING CALCULATED."
      );
    } else {
      console.log(
        "TEST #24 INCOMPLETE — GRADE N/A."
      );
    }

    console.log(
      "TEST #25 STILL REQUIRED FOR INDEPENDENT VERIFICATION."
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
