
"use strict";

const { chromium } = require("playwright");

// WEATHER TIME MACHINE — ENGINE 3 — TEST #21
// Bing metadata, title, view-count and YouTube ID diagnostic.
// No changes to Blogger, Engines 1/2, or A-F grading.

const BASE_QUERY =
  process.env.WEATHER_QUERY ||
  "hurricane sandy 2012 new jersey news";

const MIN_VIEWS = 1000;

const ROOT_QUERY = BASE_QUERY.replace(/\s+news\s*$/i, "").trim();

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
  if (!Number.isFinite(number)) return null;

  const multiplier = {
    K: 1000,
    M: 1000000,
    B: 1000000000
  }[(match[2] || "").toUpperCase()] || 1;

  return Math.round(number * multiplier);
}

function decode(value) {
  let text = String(value || "");

  for (let i = 0; i < 5; i++) {
    const previous = text;

    text = text
      .replace(/&quot;|&#34;/gi, '"')
      .replace(/&amp;|&#38;/gi, "&")
      .replace(/&#39;|&apos;/gi, "'")
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

function idsFrom(value) {
  const text = decode(value);
  const found = new Set();

  const patterns = [
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?[^\s"'<>]*?[?&]v=([A-Za-z0-9_-]{11})/gi,
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?v=([A-Za-z0-9_-]{11})/gi,
    /youtu\.be\/([A-Za-z0-9_-]{11})/gi,
    /youtube(?:-nocookie)?\.com\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/gi,
    /["'](?:videoId|video_id|youtubeId)["']\s*:\s*["']([A-Za-z0-9_-]{11})["']/gi
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      found.add(match[1]);
    }
  }

  return [...found];
}

function parseMetadata(value) {
  const text = decode(value);

  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function metadataTitles(metadata) {
  if (!metadata || typeof metadata !== "object") return [];

  const keys = [
    "title",
    "name",
    "videoTitle",
    "mediaTitle",
    "displayTitle"
  ];

  const titles = [];

  function visit(object, depth) {
    if (!object || typeof object !== "object" || depth > 3) return;

    for (const [key, value] of Object.entries(object)) {
      if (
        keys.some(k => k.toLowerCase() === key.toLowerCase()) &&
        typeof value === "string"
      ) {
        const title = cleanTitle(value);
        if (title) titles.push(title);
      }

      if (value && typeof value === "object") {
        visit(value, depth + 1);
      }
    }
  }

  visit(metadata, 0);

  return [...new Set(titles)];
}

function identify(card) {
  const metadata = parseMetadata(card.meta);

  const directUrls = metadata && typeof metadata === "object"
    ? [
        metadata.murl,
        metadata.purl,
        metadata.mediaUrl,
        metadata.contentUrl,
        metadata.ourl
      ].filter(value => typeof value === "string")
    : [];

  const directIds = [
    ...new Set(directUrls.flatMap(idsFrom))
  ];

  const metaIds = idsFrom(card.meta);

  const attributeIds = [
    ...new Set(
      card.attributes.flatMap(item => idsFrom(item.value))
    )
  ];

  const allIds = [
    ...new Set([
      ...directIds,
      ...metaIds,
      ...attributeIds
    ])
  ];

  let id = null;
  let evidence = "missing";

  if (
    directIds.length === 1 &&
    allIds.every(candidate => candidate === directIds[0])
  ) {
    id = directIds[0];
    evidence = "consistent-metadata-url";
  } else if (directIds.length === 0 && allIds.length === 1) {
    id = allIds[0];
    evidence = "single-card-candidate";
  } else if (allIds.length > 1) {
    evidence = "ambiguous";
  }

  return {
    id,
    evidence,
    candidateIds: allIds,
    metadataTitles: metadataTitles(metadata),
    metadataAvailable: Boolean(metadata)
  };
}

function relevance(title) {
  const text = cleanTitle(title).toLowerCase();

  const event =
    /\b(sandy|superstorm)\b/.test(text);

  const place =
    /\b(new jersey|jersey shore|nj|atlantic city|seaside heights|hoboken|belmar|point pleasant|asbury park|long beach island|lbi)\b/.test(text);

  const weather =
    /\b(hurricane|storm surge|coastal flooding|flooding|evacuation|landfall)\b/.test(text);

  const strict =
    event && (place || /\b2012\b/.test(text));

  const broad =
    event || (weather && place);

  return {
    event,
    place,
    weather,
    strict,
    broad,
    category: strict
      ? "strict"
      : broad
        ? "broad"
        : "uncertain"
  };
}

async function extract(page) {
  return page.evaluate(() => {
    const nodes = [
      ...document.querySelectorAll(".mc_vtvc.b_canvas")
    ];

    const viewRegex =
      /\b\d[\d,.]*\s*[KMB]?\s*views?\b/i;

    return nodes.map((node, index) => {
      const text = (node.innerText || "").trim();

      const titleSelectors = [
        ".mc_vtvc_title",
        "[class*='title']",
        "a[title]",
        "a[aria-label]",
        "h3",
        "h2"
      ];

      const titleCandidates = [];

      for (const selector of titleSelectors) {
        for (const element of node.querySelectorAll(selector)) {
          const values = [
            element.getAttribute("title"),
            element.getAttribute("aria-label"),
            element.innerText,
            element.textContent
          ];

          for (const value of values) {
            const candidate = String(value || "")
              .replace(/\s+/g, " ")
              .trim();

            if (
              candidate.length >= 8 &&
              !viewRegex.test(candidate)
            ) {
              titleCandidates.push(candidate.slice(0, 300));
            }
          }
        }
      }

      const labels = [
        ...node.querySelectorAll("*")
      ]
        .filter(element => {
          const value = (element.innerText || "").trim();

          return (
            viewRegex.test(value) &&
            ![...element.children].some(child =>
              viewRegex.test((child.innerText || "").trim())
            )
          );
        })
        .map(element =>
          (element.innerText || "").match(viewRegex)?.[0]
        )
        .filter(Boolean);

      const attributes = [];

      const elements = [
        node,
        ...node.querySelectorAll(
          "[mmeta], [vrhdata], [ourl], [href], [data-mmeta]"
        )
      ];

      for (const element of elements) {
        for (const attr of element.attributes || []) {
          if (
            /mmeta|vrhdata|ourl|href|video|media|url|data-id/i.test(
              attr.name
            )
          ) {
            attributes.push({
              name: attr.name,
              value: attr.value
            });
          }
        }
      }

      const metadataElement =
        node.querySelector("[mmeta]");

      return {
        index,
        visibleTitle:
          [...new Set(titleCandidates)][0] || "",
        titleCandidates:
          [...new Set(titleCandidates)].slice(0, 8),
        label:
          labels[0] ||
          text.match(viewRegex)?.[0] ||
          "",
        labelCount: labels.length,
        meta:
          metadataElement?.getAttribute("mmeta") || "",
        attributes: attributes.slice(0, 50),
        textSample: text.slice(0, 350)
      };
    });
  });
}

function chooseTitle(card, identity) {
  const candidates = [
    ...identity.metadataTitles,
    card.visibleTitle,
    ...card.titleCandidates
  ]
    .map(cleanTitle)
    .filter(Boolean);

  const unique = [...new Set(candidates)];

  const ranked = unique
    .map(title => ({
      title,
      relevance: relevance(title)
    }))
    .sort((a, b) => {
      const score = item =>
        (item.relevance.strict ? 4 : 0) +
        (item.relevance.broad ? 2 : 0);

      return score(b) - score(a);
    });

  return {
    title: ranked[0]?.title || "",
    titleCandidates: unique,
    titleSource:
      ranked.length &&
      identity.metadataTitles.includes(ranked[0].title)
        ? "bing-metadata"
        : "visible-card"
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

    console.log(
      "WEATHER TIME MACHINE — ENGINE 3 — TEST #21"
    );
    console.log(
      "BING METADATA + TITLE + VIEW COUNT DIAGNOSTIC"
    );
    console.log("BASE QUERY:", BASE_QUERY);
    console.log("MINIMUM VIEWS:", MIN_VIEWS);

    for (let index = 0; index < SEARCHES.length; index++) {
      const query = SEARCHES[index];

      const url =
        "https://www.bing.com/videos/search?q=" +
        encodeURIComponent(query);

      console.log(
        "\nSEARCH",
        index + 1,
        "OF",
        SEARCHES.length,
        ":",
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

        const cards = await extract(page);

        console.log(
          "CARDS EXTRACTED:",
          cards.length
        );

        for (const card of cards) {
          const identity = identify(card);
          const selected = chooseTitle(card, identity);

          all.push({
            search: index + 1,
            query,
            index: card.index,
            title: selected.title,
            titleSource: selected.titleSource,
            titleCandidates: selected.titleCandidates,
            views: parseViews(card.label),
            viewLabel: card.label,
            labelCount: card.labelCount,
            id: identity.id,
            idEvidence: identity.evidence,
            candidateIds: identity.candidateIds,
            metadataAvailable:
              identity.metadataAvailable,
            relevance: relevance(selected.title),
            youtubeUrl: identity.id
              ? "https://www.youtube.com/watch?v=" +
                identity.id
              : null,
            textSample: card.textSample
          });
        }
      } catch (error) {
        console.log(
          "SEARCH ERROR:",
          error.message
        );
      }
    }

    const withViews = all.filter(
      row => row.views !== null
    );

    const qualifying = withViews.filter(
      row => row.views >= MIN_VIEWS
    );

    const strict = qualifying.filter(
      row => row.relevance.strict
    );

    const broad = qualifying.filter(
      row => row.relevance.broad
    );

    const unique = new Map();

    for (const row of broad) {
      if (!row.id) continue;

      if (!unique.has(row.id)) {
        unique.set(row.id, {
          id: row.id,
          title: row.title,
          views: row.views,
          searches: new Set(),
          evidence: new Set(),
          titleSources: new Set()
        });
      }

      const item = unique.get(row.id);

      item.searches.add(row.search);
      item.evidence.add(row.idEvidence);
      item.titleSources.add(row.titleSource);
      item.views = Math.max(
        item.views,
        row.views
      );
    }

    const uniqueCandidates = [
      ...unique.values()
    ].map(item => ({
      ...item,
      searches: [...item.searches],
      evidence: [...item.evidence],
      titleSources: [...item.titleSources],
      youtubeUrl:
        "https://www.youtube.com/watch?v=" +
        item.id
    }));

    const unresolved = broad.filter(
      row => !row.id
    );

    const uncertain = qualifying.filter(
      row => !row.relevance.broad
    );

    console.log("\nDIAGNOSTIC SUMMARY");
    console.log(
      "SEARCH QUERIES ATTEMPTED:",
      SEARCHES.length
    );
    console.log(
      "TOTAL CARD OBSERVATIONS:",
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
      "CARDS WITH PARSED METADATA:",
      all.filter(row => row.metadataAvailable).length
    );
    console.log(
      "TITLES FROM BING METADATA:",
      all.filter(
        row => row.titleSource === "bing-metadata"
      ).length
    );
    console.log(
      "STRICT WEATHER MATCHES WITH 1000+ VIEWS:",
      strict.length
    );
    console.log(
      "BROAD WEATHER MATCHES WITH 1000+ VIEWS:",
      broad.length
    );
    console.log(
      "DISTINCT YOUTUBE ID CANDIDATES:",
      uniqueCandidates.length
    );
    console.log(
      "CANDIDATES SEEN IN MULTIPLE SEARCHES:",
      uniqueCandidates.filter(
        row => row.searches.length > 1
      ).length
    );
    console.log(
      "UNRESOLVED RELEVANT 1000+ CARDS:",
      unresolved.length
    );
    console.log(
      "UNCERTAIN OR UNRELATED 1000+ CARDS:",
      uncertain.length
    );

    console.log(
      "\nUNIQUE YOUTUBE CANDIDATES:",
      JSON.stringify(uniqueCandidates, null, 2)
    );

    console.log(
      "\nUNRESOLVED QUALIFYING CARDS:",
      JSON.stringify(unresolved, null, 2)
    );

    console.log(
      "\nUNCERTAIN / UNRELATED CARDS:",
      JSON.stringify(uncertain, null, 2)
    );

    console.log(
      "\nALL 1000+ VIEW RECORDS:",
      JSON.stringify(qualifying, null, 2)
    );

    console.log("\nFINAL STATUS");
    console.log(
      "TEST #21 DIAGNOSTIC COMPLETED."
    );
    console.log(
      "NO A-F GRADES GENERATED."
    );
    console.log(
      "GRADING STATUS: BLOCKED — YouTube identity, view counts and event relevance require further verification."
    );
    console.log(
      "Green GitHub status confirms execution only."
    );

    if (!all.length) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(
    "ENGINE 3 TEST #21 ERROR:",
    error
  );
  process.exitCode = 1;
});
