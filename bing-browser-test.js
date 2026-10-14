
"use strict";

const { chromium } = require("playwright");

// WEATHER TIME MACHINE — ENGINE 3 — TEST #22
// Bing card structure and YouTube identity diagnostic.
// Does NOT modify Blogger, Engines 1/2, or A–F grading.

const BASE_QUERY =
  process.env.WEATHER_QUERY ||
  "hurricane sandy 2012 new jersey news";

const MIN_VIEWS = 1000;

const ROOT_QUERY = BASE_QUERY
  .replace(/\s+news\s*$/i, "")
  .trim();

const SEARCHES = [
  BASE_QUERY,
  ROOT_QUERY + " footage",
  ROOT_QUERY + " youtube",
  ROOT_QUERY + " local news"
];

function parseViews(value) {
  const match = String(value || "").match(
    /\b(\d[\d,.]*)\s*([KMB])?\s*views?\b/i
  );

  if (!match) return null;

  const amount = Number(match[1].replace(/,/g, ""));

  const scale = {
    K: 1000,
    M: 1000000,
    B: 1000000000
  }[(match[2] || "").toUpperCase()] || 1;

  return Number.isFinite(amount)
    ? Math.round(amount * scale)
    : null;
}

function decode(value) {
  let text = String(value || "");

  for (let i = 0; i < 5; i++) {
    const previous = text;

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

    if (text === previous) break;
  }

  return text;
}

function youtubeIds(value) {
  const text = decode(value);
  const ids = new Set();

  const patterns = [
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?[^\s"'<>]*?[?&]v=([A-Za-z0-9_-]{11})/gi,
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?v=([A-Za-z0-9_-]{11})/gi,
    /youtu\.be\/([A-Za-z0-9_-]{11})/gi,
    /youtube(?:-nocookie)?\.com\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/gi,
    /["'](?:videoId|video_id|youtubeId)["']\s*:\s*["']([A-Za-z0-9_-]{11})["']/gi
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      ids.add(match[1]);
    }
  }

  return [...ids];
}

function relevant(title) {
  const text = String(title || "").toLowerCase();

  const event = /\b(sandy|superstorm)\b/.test(text);

  const place =
    /\b(new jersey|jersey shore|nj|atlantic city|seaside heights|hoboken|belmar|point pleasant|asbury park|long beach island|lbi)\b/.test(text);

  const weather =
    /\b(hurricane|storm surge|flooding|evacuation|landfall)\b/.test(text);

  return {
    strict: event && (place || /\b2012\b/.test(text)),
    broad: event || (weather && place)
  };
}

async function extractCards(page) {
  return page.evaluate(() => {
    const nodes = [
      ...document.querySelectorAll(".mc_vtvc.b_canvas")
    ];

    const viewPattern =
      /\b\d[\d,.]*\s*[KMB]?\s*views?\b/i;

    return nodes.map((node, index) => {
      const titleElements = [
        ...node.querySelectorAll(
          ".mc_vtvc_title, [class*='title'], a[title], h3, h2"
        )
      ];

      const titles = [];

      for (const element of titleElements) {
        for (const value of [
          element.getAttribute("title"),
          element.getAttribute("aria-label"),
          element.innerText
        ]) {
          const text = String(value || "")
            .replace(/\s+/g, " ")
            .trim();

          if (
            text.length >= 8 &&
            !viewPattern.test(text)
          ) {
            titles.push(text.slice(0, 250));
          }
        }
      }

      const text = (node.innerText || "").trim();

      const viewLabels = [
        ...node.querySelectorAll("*")
      ]
        .filter(element => {
          const value = (element.innerText || "").trim();

          return (
            viewPattern.test(value) &&
            ![...element.children].some(child =>
              viewPattern.test(
                (child.innerText || "").trim()
              )
            )
          );
        })
        .map(element =>
          element.innerText.match(viewPattern)?.[0]
        )
        .filter(Boolean);

      const links = [
        ...node.querySelectorAll("a[href]")
      ].map(element => ({
        href: element.getAttribute("href") || "",
        title: element.getAttribute("title") || "",
        text: (element.innerText || "")
          .trim()
          .slice(0, 150)
      }));

      const attributes = [];

      for (const element of [
        node,
        ...node.querySelectorAll(
          "[mmeta], [vrhdata], [ourl], [data-mmeta]"
        )
      ]) {
        for (const attribute of element.attributes) {
          if (
            /mmeta|vrhdata|ourl|video|media|url|data-id/i
              .test(attribute.name)
          ) {
            attributes.push({
              name: attribute.name,
              value: attribute.value.slice(0, 1500)
            });
          }
        }
      }

      return {
        index,
        title: [...new Set(titles)][0] || "",
        titleCandidates: [...new Set(titles)].slice(0, 5),
        viewLabel:
          viewLabels[0] ||
          text.match(viewPattern)?.[0] ||
          "",
        viewLabels: [...new Set(viewLabels)],
        links: links.slice(0, 15),
        attributes: attributes.slice(0, 25),
        textSample: text.slice(0, 300),
        htmlSample: node.outerHTML.slice(0, 12000)
      };
    });
  });
}

function analyze(card, searchNumber) {
  const sources = [
    ...card.links.map(link => ({
      source: "link",
      value: link.href
    })),
    ...card.attributes.map(attribute => ({
      source: "attribute:" + attribute.name,
      value: attribute.value
    })),
    {
      source: "card-html",
      value: card.htmlSample
    }
  ];

  const evidence = [];

  for (const source of sources) {
    for (const id of youtubeIds(source.value)) {
      evidence.push({
        id,
        source: source.source
      });
    }
  }

  const ids = [
    ...new Set(evidence.map(item => item.id))
  ];

  const linkIds = [
    ...new Set(
      card.links.flatMap(link =>
        youtubeIds(link.href)
      )
    )
  ];

  let id = null;
  let identityStatus = "missing";

  if (linkIds.length === 1 && ids.length === 1) {
    id = linkIds[0];
    identityStatus = "single-direct-link";
  } else if (ids.length === 1) {
    id = ids[0];
    identityStatus = "single-card-candidate";
  } else if (ids.length > 1) {
    identityStatus = "ambiguous";
  }

  const views = parseViews(card.viewLabel);

  return {
    search: searchNumber,
    index: card.index,
    title: card.title,
    views,
    viewLabel: card.viewLabel,
    relevant: relevant(card.title),
    id,
    identityStatus,
    candidateIds: ids,
    evidence,
    titleCandidates: card.titleCandidates,
    links: card.links,
    attributes: card.attributes,
    textSample: card.textSample,
    youtubeUrl: id
      ? "https://www.youtube.com/watch?v=" + id
      : null
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
      "WEATHER TIME MACHINE — ENGINE 3 — TEST #22"
    );
    console.log(
      "BING CARD STRUCTURE + YOUTUBE ID DIAGNOSTIC"
    );
    console.log("BASE QUERY:", BASE_QUERY);
    console.log("MINIMUM VIEWS:", MIN_VIEWS);

    for (
      let index = 0;
      index < SEARCHES.length;
      index++
    ) {
      const query = SEARCHES[index];

      const url =
        "https://www.bing.com/videos/search?q=" +
        encodeURIComponent(query);

      console.log(
        "\nSEARCH",
        index + 1,
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

        const cards = await extractCards(page);

        console.log(
          "BING CARDS:",
          cards.length
        );

        for (const card of cards) {
          all.push(analyze(card, index + 1));
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

    const broad = qualifying.filter(
      row => row.relevant.broad
    );

    const strict = broad.filter(
      row => row.relevant.strict
    );

    const resolved = broad.filter(
      row => row.id !== null
    );

    const unique = new Map();

    for (const row of resolved) {
      if (!unique.has(row.id)) {
        unique.set(row.id, row);
      }
    }

    const unresolved = broad.filter(
      row => row.id === null
    );

    const uncertain = qualifying.filter(
      row => !row.relevant.broad
    );

    console.log("\nDIAGNOSTIC SUMMARY");
    console.log(
      "SEARCH QUERIES ATTEMPTED:",
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
      "STRICT RELEVANT 1000+ CARDS:",
      strict.length
    );
    console.log(
      "BROAD RELEVANT 1000+ CARDS:",
      broad.length
    );
    console.log(
      "DISTINCT YOUTUBE ID CANDIDATES:",
      unique.size
    );
    console.log(
      "UNRESOLVED RELEVANT CARDS:",
      unresolved.length
    );
    console.log(
      "UNCERTAIN OR UNRELATED CARDS:",
      uncertain.length
    );

    console.log(
      "\nRESOLVED CANDIDATES:",
      JSON.stringify(
        [...unique.values()],
        null,
        2
      )
    );

    console.log(
      "\nUNRESOLVED RELEVANT CARDS:",
      JSON.stringify(unresolved, null, 2)
    );

    console.log(
      "\nUNCERTAIN / UNRELATED CARDS:",
      JSON.stringify(uncertain, null, 2)
    );

    console.log(
      "\nALL QUALIFYING CARD EVIDENCE:",
      JSON.stringify(qualifying, null, 2)
    );

    console.log("\nFINAL STATUS");
    console.log(
      "TEST #22 DIAGNOSTIC COMPLETED."
    );
    console.log(
      "A–F GRADING: NOT ENABLED."
    );
    console.log(
      "YOUTUBE IDENTITIES AND VIEW COUNTS: CANDIDATES ONLY."
    );
    console.log(
      "Green GitHub status confirms execution, not grading readiness."
    );

    if (!all.length) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(
    "ENGINE 3 TEST #22 ERROR:",
    error
  );

  process.exitCode = 1;
});
