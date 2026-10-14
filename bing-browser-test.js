
"use strict";
const { chromium } = require("playwright");

// WEATHER TIME MACHINE — ENGINE 3 — TEST #24E
// Search recovery and evidence-based relevance diagnosis.
// No A-F grading. No changes to Blogger or Engines 1/2.

const QUERY =
  process.env.WEATHER_QUERY ||
  "hurricane sandy 2012 new jersey news";

const MIN_VIEWS = 1000;

const ROOT = QUERY
  .replace(/\s+news\s*$/i, "")
  .trim();

const SEARCHES = [
  {
    kind: "videos",
    q: `${ROOT} news site:youtube.com`
  },
  {
    kind: "videos",
    q: `${ROOT} footage site:youtube.com`
  },
  {
    kind: "web",
    q: `${ROOT} site:youtube.com/watch`
  },
  {
    kind: "web",
    q: `${ROOT} local news site:youtube.com/watch`
  }
];

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function parseViews(value) {
  const match = String(value || "").match(
    /\b(\d[\d,.]*)\s*([KMB])?\s*views?\b/i
  );

  if (!match) return null;

  const number = Number(
    match[1].replace(/,/g, "")
  );

  const multiplier = {
    K: 1000,
    M: 1000000,
    B: 1000000000
  }[(match[2] || "").toUpperCase()] || 1;

  return Number.isFinite(number)
    ? Math.round(number * multiplier)
    : null;
}

function decode(raw) {
  let text = String(raw || "");

  for (let i = 0; i < 4; i++) {
    const previous = text;

    text = text
      .replace(/&amp;|&#38;/gi, "&")
      .replace(/&quot;|&#34;/gi, '"')
      .replace(/\\u0026/gi, "&")
      .replace(/\\u003d/gi, "=")
      .replace(/\\u002f/gi, "/")
      .replace(/\\\//g, "/");

    try {
      text = decodeURIComponent(text);
    } catch (_) {}

    if (text === previous) break;
  }

  return text;
}

function idsIn(raw) {
  const text = decode(raw);
  const ids = new Set();

  const patterns = [
    /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/watch\?[^\s"'<>]*?\bv=([\w-]{11})(?![\w-])/gi,

    /(?:https?:\/\/)?youtu\.be\/([\w-]{11})(?![\w-])/gi,

    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:shorts|live|embed)\/([\w-]{11})(?![\w-])/gi
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      ids.add(match[1]);
    }
  }

  return [...ids];
}

function eventCheck(title) {
  const text = String(title || "").toLowerCase();

  // Diagnostic rules for Hurricane Sandy 2012.
  // Other weather events require their own relevance rules.

  const sandy =
    /\b(sandy|superstorm)\b/.test(text);

  const nj =
    /\b(new jersey|jersey shore|\bnj\b|atlantic city|seaside heights|hoboken|belmar|point pleasant|asbury park|long beach island|lbi)\b/.test(text);

  const context =
    /\b(2012|hurricane|storm|flood|surge|aftermath|coast|damage|news|coverage|satellite)\b/.test(text);

  return {
    sandy,
    nj,
    context,

    relevant:
      sandy && (nj || context),

    review:
      sandy && !nj && !context
  };
}

async function extract(page, kind) {
  return page.evaluate(kind => {
    const selectors =
      kind === "videos"
        ? [
            ".mc_vtvc.b_canvas",
            ".mc_vtvc"
          ]
        : [
            "li.b_algo",
            ".b_algo"
          ];

    let nodes = [];

    for (const selector of selectors) {
      nodes = [
        ...document.querySelectorAll(selector)
      ];

      if (nodes.length) break;
    }

    return nodes.map((element, index) => {
      const heading = element.querySelector(
        kind === "web"
          ? "h2 a, h2"
          : ".mc_vtvc_title, a[title], [class*='title']"
      );

      const title = (
        heading?.getAttribute("title") ||
        heading?.textContent ||
        element.getAttribute("aria-label") ||
        ""
      )
        .trim()
        .slice(0, 250);

      const text = (
        element.innerText || ""
      ).slice(0, 1000);

      const links = [
        ...element.querySelectorAll("a[href]")
      ]
        .map(link =>
          link.getAttribute("href") || ""
        )
        .slice(0, 30);

      const attributes = [];

      const metadataElements = [
        element,
        ...element.querySelectorAll(
          "[mmeta],[data-mmeta],[ourl],[vrhdata],[data-url]"
        )
      ];

      for (const node of metadataElements) {
        for (const attribute of node.attributes || []) {
          if (
            /href|url|mmeta|vrhdata|ourl/i.test(
              attribute.name
            )
          ) {
            attributes.push(
              attribute.value.slice(0, 6000)
            );
          }
        }
      }

      return {
        index,
        title,
        text,
        links,
        attrs: attributes
      };
    });
  }, kind);
}

function inspect(card, search) {
  const direct = [
    ...new Set(
      card.links.flatMap(idsIn)
    )
  ];

  const metadata = [
    ...new Set(
      card.attrs.flatMap(idsIn)
    )
  ];

  const ids = [
    ...new Set([
      ...direct,
      ...metadata
    ])
  ];

  const id =
    direct.length === 1
      ? direct[0]
      : direct.length === 0 &&
        metadata.length === 1
        ? metadata[0]
        : null;

  const viewMatch = card.text.match(
    /\b\d[\d,.]*\s*[KMB]?\s*views?\b/i
  );

  const viewLabel =
    viewMatch ? viewMatch[0] : null;

  const views = parseViews(viewLabel);

  const relevance = eventCheck(card.title);

  const reasons = [];

  if (!card.title) {
    reasons.push("MISSING_TITLE");
  }

  if (!id) {
    reasons.push(
      ids.length > 1
        ? "AMBIGUOUS_YOUTUBE_IDS"
        : "MISSING_YOUTUBE_ID"
    );
  }

  if (!relevance.relevant) {
    reasons.push(
      relevance.review
        ? "EVENT_TITLE_REQUIRES_REVIEW"
        : "TITLE_NOT_EVENT_MATCH"
    );
  }

  if (views === null) {
    reasons.push("VIEW_COUNT_UNAVAILABLE");
  } else if (views < MIN_VIEWS) {
    reasons.push("BELOW_1000_VIEWS");
  }

  const candidate =
    Boolean(id) &&
    relevance.relevant &&
    views !== null &&
    views >= MIN_VIEWS;

  return {
    search: search.kind,
    query: search.q,
    index: card.index,
    title: card.title,
    id,
    possibleIds: ids,

    identitySource:
      direct.length === 1
        ? "DIRECT_LINK"
        : metadata.length === 1
          ? "CARD_METADATA"
          : "UNRESOLVED",

    youtubeUrl: id
      ? `https://www.youtube.com/watch?v=${id}`
      : null,

    viewLabel,
    reportedViews: views,
    relevance,
    candidate,
    reasons,

    textSample:
      card.text.slice(0, 300),

    linkSamples:
      card.links.slice(0, 5)
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

    const all = [];
    let completed = 0;

    console.log(
      "WEATHER TIME MACHINE — ENGINE 3 — TEST #24E"
    );

    console.log(
      "EVENT:",
      QUERY,
      "MINIMUM VIEWS:",
      MIN_VIEWS
    );

    for (const search of SEARCHES) {
      const endpoint =
        search.kind === "videos"
          ? "videos/search"
          : "search";

      const url =
        `https://www.bing.com/${endpoint}?q=` +
        encodeURIComponent(search.q);

      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 45000
        });

        await sleep(3500);

        const cards = await extract(
          page,
          search.kind
        );

        const status = response?.status();

        console.log(
          "SEARCH:",
          search.kind,
          search.q,
          "HTTP:",
          status,
          "CARDS:",
          cards.length
        );

        if (status !== 200) {
          continue;
        }

        completed++;

        for (const card of cards) {
          all.push(inspect(card, search));
        }

      } catch (error) {
        console.log(
          "SEARCH ERROR:",
          search.q,
          error.message
        );
      }
    }

    const relevant = all.filter(
      row => row.relevance.relevant
    );

    const identified = relevant.filter(
      row => row.id
    );

    const eligible = identified.filter(
      row =>
        row.reportedViews !== null &&
        row.reportedViews >= MIN_VIEWS
    );

    const unique = new Map();

    for (const row of eligible) {
      if (!unique.has(row.id)) {
        unique.set(row.id, {
          id: row.id,
          title: row.title,
          reportedViews: row.reportedViews,
          url: row.youtubeUrl,
          queries: [row.query]
        });

      } else {
        const previous = unique.get(row.id);

        previous.reportedViews = Math.max(
          previous.reportedViews,
          row.reportedViews
        );

        if (!previous.queries.includes(row.query)) {
          previous.queries.push(row.query);
        }
      }
    }

    const missingViews = identified.filter(
      row => row.reportedViews === null
    );

    const review = all.filter(
      row => row.relevance.review
    );

    console.log(
      "\n========== TEST #24E SUMMARY =========="
    );

    console.log(
      "SEARCHES COMPLETED:",
      completed,
      "OF",
      SEARCHES.length
    );

    console.log(
      "CARD OBSERVATIONS:",
      all.length
    );

    console.log(
      "EVENT-RELEVANT OBSERVATIONS:",
      relevant.length
    );

    console.log(
      "RELEVANT OBSERVATIONS WITH YOUTUBE IDS:",
      identified.length
    );

    console.log(
      "RELEVANT YOUTUBE IDS WITH MISSING VIEW COUNTS:",
      missingViews.length
    );

    console.log(
      "QUALIFYING OBSERVATIONS WITH 1000+ VIEWS:",
      eligible.length
    );

    console.log(
      "DISTINCT PROVISIONAL CANDIDATES:",
      unique.size
    );

    console.log(
      "TITLES REQUIRING REVIEW:",
      review.length
    );

    console.log(
      "\nDISTINCT PROVISIONAL CANDIDATES:",
      JSON.stringify(
        [...unique.values()],
        null,
        2
      )
    );

    console.log(
      "\nRELEVANT BUT VIEW COUNT UNKNOWN:",
      JSON.stringify(
        missingViews.slice(0, 30),
        null,
        2
      )
    );

    console.log(
      "\nTITLES REQUIRING REVIEW:",
      JSON.stringify(
        review.slice(0, 30),
        null,
        2
      )
    );

    console.log(
      "\nALL OBSERVATIONS WITH REASONS:",
      JSON.stringify(
        all,
        null,
        2
      )
    );

    console.log(
      "\nNO A-F GRADE GENERATED."
    );

    console.log(
      "YOUTUBE IDS AND VIEW COUNTS NOT INDEPENDENTLY VERIFIED."
    );

    console.log(
      "BLOGGER AND ENGINES 1/2 UNCHANGED."
    );

    if (!completed) {
      process.exitCode = 1;
    }

  } finally {
    await browser.close();
  }

})().catch(error => {
  console.error(
    "TEST #24E ERROR:",
    error
  );

  process.exitCode = 1;
});
