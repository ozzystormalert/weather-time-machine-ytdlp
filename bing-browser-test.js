
"use strict";

const { chromium } = require("playwright");

// WEATHER TIME MACHINE — ENGINE 3 — TEST #24C
// YOUTUBE-ONLY CANDIDATE RECOVERY
// Diagnostic only: no A-F grades, no Blogger changes.

const BASE_QUERY =
  process.env.WEATHER_QUERY ||
  "hurricane sandy 2012 new jersey news";

const MIN_VIEWS = 1000;
const ROOT = BASE_QUERY.replace(/\s+news\s*$/i, "").trim();

const SEARCHES = [...new Set([
  ROOT + " news site:youtube.com",
  ROOT + " footage site:youtube.com",
  ROOT + " youtube site:youtube.com",
  ROOT + " local news site:youtube.com"
])];

function parseViews(text) {
  const m = String(text || "").match(
    /(\d[\d,.]*)\s*([KMB])?\s*views?\b/i
  );

  if (!m) return null;

  const n = Number(m[1].replace(/,/g, ""));
  const factor = {
    K: 1000,
    M: 1000000,
    B: 1000000000
  }[(m[2] || "").toUpperCase()] || 1;

  return Number.isFinite(n)
    ? Math.round(n * factor)
    : null;
}

function decode(raw) {
  let text = String(raw || "");

  for (let i = 0; i < 4; i++) {
    const old = text;

    text = text
      .replace(/&amp;|&#38;/gi, "&")
      .replace(/&quot;|&#34;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\\u0026/gi, "&")
      .replace(/\\u003d/gi, "=")
      .replace(/\\u002f/gi, "/")
      .replace(/\\\//g, "/");

    try {
      text = decodeURIComponent(text);
    } catch (_) {}

    if (old === text) break;
  }

  return text;
}

function youtubeIds(raw) {
  const text = decode(raw);
  const ids = new Set();

  const patterns = [
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?[^\s"'<>]*?[?&]v=([\w-]{11})(?![\w-])/gi,
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?v=([\w-]{11})(?![\w-])/gi,
    /youtu\.be\/([\w-]{11})(?![\w-])/gi,
    /youtube(?:-nocookie)?\.com\/(?:shorts|embed|live)\/([\w-]{11})(?![\w-])/gi,
    /["'](?:videoId|video_id|youtubeId)["']\s*:\s*["']([\w-]{11})["']/gi
  ];

  for (const pattern of patterns) {
    for (const m of text.matchAll(pattern)) {
      ids.add(m[1]);
    }
  }

  return [...ids];
}

function relevance(title) {
  const t = String(title || "").toLowerCase();

  const event = /\b(sandy|superstorm)\b/.test(t);

  const place =
    /\b(new jersey|jersey shore|nj|atlantic city|seaside heights|hoboken|belmar|point pleasant|asbury park|long beach island|lbi)\b/.test(t);

  const weather =
    /\b(hurricane|storm|surge|flood|flooding|evacuation|landfall)\b/.test(t);

  return {
    event,
    place,
    weather,
    strict: event && (place || /\b2012\b/.test(t)),
    broad: event || (weather && place)
  };
}

async function extract(page) {
  return page.evaluate(() => {
    const nodes = [
      ...document.querySelectorAll(".mc_vtvc.b_canvas")
    ];

    const viewRegex =
      /\d[\d,.]*\s*[KMB]?\s*views?\b/i;

    return nodes.map((node, index) => {
      const titleElement = node.querySelector(
        ".mc_vtvc_title, a[title], [class*='title']"
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
      ].filter(el => {
        const ownText = (el.innerText || "").trim();

        return viewRegex.test(ownText) &&
          ![...el.children].some(child =>
            viewRegex.test((child.innerText || "").trim())
          );
      }).map(el =>
        (el.innerText || "").match(viewRegex)?.[0]
      ).filter(Boolean);

      const links = [
        ...node.querySelectorAll("a[href]")
      ].map(a => ({
        href: a.getAttribute("href") || "",
        text: (a.innerText || "").slice(0, 120)
      }));

      const metadata = [
        ...node.querySelectorAll("[mmeta], [data-mmeta]")
      ].map(el => ({
        mmeta: el.getAttribute("mmeta") || "",
        dataMmeta: el.getAttribute("data-mmeta") || ""
      }));

      const attributes = [];

      for (const element of [
        node,
        ...node.querySelectorAll(
          "[ourl], [vrhdata], [href], [mmeta]"
        )
      ]) {
        for (const attr of element.attributes || []) {
          if (/ourl|vrhdata|href|mmeta|url/i.test(attr.name)) {
            attributes.push({
              name: attr.name,
              value: attr.value.slice(0, 5000)
            });
          }
        }
      }

      return {
        index,
        title: title.slice(0, 250),
        viewLabel:
          labels[0] ||
          text.match(viewRegex)?.[0] ||
          "",
        textSample: text.slice(0, 350),
        links: links.slice(0, 20),
        metadata: metadata.slice(0, 10),
        attributes: attributes.slice(0, 50)
      };
    });
  });
}

function identify(card) {
  const directLinks = card.links.flatMap(link =>
    youtubeIds(link.href)
  );

  const metaValues = card.metadata.flatMap(item => [
    item.mmeta,
    item.dataMmeta
  ]);

  const metaIds = metaValues.flatMap(youtubeIds);

  const attributeIds = card.attributes.flatMap(item =>
    youtubeIds(item.value)
  );

  const allIds = [...new Set([
    ...directLinks,
    ...metaIds,
    ...attributeIds
  ])];

  const directUnique = [...new Set(directLinks)];
  const metaUnique = [...new Set(metaIds)];

  let id = null;
  let evidence = "NONE";

  if (directUnique.length === 1) {
    id = directUnique[0];
    evidence = "DIRECT_YOUTUBE_LINK";
  } else if (
    directUnique.length === 0 &&
    metaUnique.length === 1
  ) {
    id = metaUnique[0];
    evidence = "BING_METADATA";
  } else if (
    directUnique.length === 0 &&
    metaUnique.length === 0 &&
    allIds.length === 1
  ) {
    id = allIds[0];
    evidence = "CARD_ATTRIBUTE";
  }

  const ambiguous =
    directUnique.length > 1 ||
    (directUnique.length === 0 && metaUnique.length > 1);

  if (ambiguous) {
    id = null;
    evidence = "AMBIGUOUS";
  }

  return {
    id,
    evidence,
    possibleIds: allIds,
    ambiguous,
    youtubeUrl: id
      ? "https://www.youtube.com/watch?v=" + id
      : null
  };
}

function inspect(card, searchNumber) {
  const identity = identify(card);
  const views = parseViews(card.viewLabel);
  const match = relevance(card.title);
  const reasons = [];

  if (!card.title) reasons.push("MISSING_TITLE");

  if (views === null) {
    reasons.push("MISSING_VIEW_COUNT");
  } else if (views < MIN_VIEWS) {
    reasons.push("BELOW_1000_VIEWS");
  }

  if (!identity.id) {
    reasons.push(
      identity.ambiguous
        ? "AMBIGUOUS_YOUTUBE_IDS"
        : "NO_YOUTUBE_VIDEO_ID"
    );
  }

  if (!match.broad) {
    reasons.push("TITLE_NOT_WEATHER_MATCH");
  }

  if (!match.strict) {
    reasons.push("NOT_STRICT_EVENT_PLACE_MATCH");
  }

  // The grading decision remains disabled.
  // Broad relevance is recorded for diagnostic comparison.
  const candidate =
    identity.id !== null &&
    views !== null &&
    views >= MIN_VIEWS &&
    match.broad;

  return {
    search: searchNumber,
    index: card.index,
    title: card.title,
    viewLabel: card.viewLabel,
    reportedViews: views,
    ...identity,
    relevance: match,
    candidate,
    reasons,
    textSample: card.textSample,
    linkSamples: card.links.slice(0, 5)
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
    let successfulSearches = 0;

    console.log(
      "WEATHER TIME MACHINE — ENGINE 3 — TEST #24C"
    );
    console.log("YOUTUBE-ONLY CANDIDATE RECOVERY");
    console.log("BASE QUERY:", BASE_QUERY);
    console.log("MINIMUM VIEWS:", MIN_VIEWS);

    for (let i = 0; i < SEARCHES.length; i++) {
      const query = SEARCHES[i];
      const url =
        "https://www.bing.com/videos/search?q=" +
        encodeURIComponent(query);

      console.log(
        "\nSEARCH", i + 1, "OF", SEARCHES.length
      );
      console.log("QUERY:", query);

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

        console.log("BING CARDS:", cards.length);

        for (const card of cards) {
          all.push(inspect(card, i + 1));
        }
      } catch (error) {
        console.log(
          "SEARCH ERROR:",
          error.message
        );
      }
    }

    const withViews = all.filter(r =>
      r.reportedViews !== null
    );

    const qualifying = withViews.filter(r =>
      r.reportedViews >= MIN_VIEWS
    );

    const youtubeCandidates = qualifying.filter(r =>
      r.id !== null
    );

    const relevant = youtubeCandidates.filter(r =>
      r.relevance.broad
    );

    const unique = new Map();

    for (const row of relevant) {
      if (!unique.has(row.id)) {
        unique.set(row.id, {
          id: row.id,
          title: row.title,
          reportedViews: row.reportedViews,
          youtubeUrl: row.youtubeUrl,
          evidence: row.evidence,
          searches: [row.search]
        });
      } else {
        const existing = unique.get(row.id);

        if (!existing.searches.includes(row.search)) {
          existing.searches.push(row.search);
        }

        existing.reportedViews = Math.max(
          existing.reportedViews,
          row.reportedViews
        );
      }
    }

    const excluded = qualifying.filter(r =>
      !r.candidate
    );

    const unresolved = qualifying.filter(r =>
      r.relevance.broad && !r.id
    );

    console.log(
      "\n========== TEST #24C SUMMARY =========="
    );

    console.log(
      "SUCCESSFUL SEARCHES:",
      successfulSearches,
      "OF",
      SEARCHES.length
    );

    console.log(
      "TOTAL BING CARD OBSERVATIONS:",
      all.length
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
      "YOUTUBE-ID CANDIDATES WITH 1000+ VIEWS:",
      youtubeCandidates.length
    );

    console.log(
      "BROAD WEATHER YOUTUBE CANDIDATES:",
      relevant.length
    );

    console.log(
      "DISTINCT BROAD-MATCH YOUTUBE IDS:",
      unique.size
    );

    console.log(
      "DUPLICATE CANDIDATE OBSERVATIONS:",
      relevant.length - unique.size
    );

    console.log(
      "RELEVANT CARDS MISSING YOUTUBE ID:",
      unresolved.length
    );

    console.log(
      "EXCLUDED 1000+ CARD OBSERVATIONS:",
      excluded.length
    );

    console.log(
      "\nRECOVERED DISTINCT CANDIDATES:",
      JSON.stringify(
        [...unique.values()],
        null,
        2
      )
    );

    console.log(
      "\nEXCLUDED CARDS WITH REASONS:",
      JSON.stringify(excluded, null, 2)
    );

    console.log(
      "\nUNRESOLVED RELEVANT CARDS:",
      JSON.stringify(unresolved, null, 2)
    );

    console.log(
      "\nALL SEARCH OBSERVATIONS:",
      JSON.stringify(all, null, 2)
    );

    console.log("\nFINAL STATUS");

    console.log(
      "TEST #24C COMPLETED — DIAGNOSTIC ONLY."
    );

    console.log(
      "NO A-F GRADES GENERATED."
    );

    console.log(
      "BING VIEW COUNTS ARE NOT INDEPENDENTLY VERIFIED."
    );

    console.log(
      "BLOGGER AND ENGINES 1/2 UNCHANGED."
    );

    if (!successfulSearches) {
      process.exitCode = 1;
    }

  } finally {
    await browser.close();
  }

})().catch(error => {
  console.error(
    "ENGINE 3 TEST #24C ERROR:",
    error
  );
  process.exitCode = 1;
});
