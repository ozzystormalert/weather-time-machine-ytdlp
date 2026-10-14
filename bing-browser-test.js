
"use strict";

const { chromium } = require("playwright");

// WEATHER TIME MACHINE — ENGINE 3 — TEST #24B
// Candidate recovery only. No A-F grades generated.

const BASE_QUERY =
  process.env.WEATHER_QUERY ||
  "hurricane sandy 2012 new jersey news";

const MIN_VIEWS = 1000;
const ROOT = BASE_QUERY.replace(/\s+news\s*$/i, "").trim();

const SEARCHES = [...new Set([
  BASE_QUERY,
  ROOT + " footage",
  ROOT + " youtube",
  ROOT + " local news"
])];

function parseViews(text) {
  const m = String(text || "").match(
    /(\d[\d,.]*)\s*([KMB])?\s*views?\b/i
  );
  if (!m) return null;

  const number = Number(m[1].replace(/,/g, ""));
  const multiplier = {
    K: 1000,
    M: 1000000,
    B: 1000000000
  }[(m[2] || "").toUpperCase()] || 1;

  return Number.isFinite(number)
    ? Math.round(number * multiplier)
    : null;
}

function decode(raw) {
  let text = String(raw || "");

  for (let i = 0; i < 4; i++) {
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

function youtubeIds(raw) {
  const text = decode(raw);
  const ids = new Set();

  const patterns = [
    /youtube\.com\/watch\?v=([\w-]{11})/gi,
    /youtube\.com\/watch\?[^\s"'<>]*?[?&]v=([\w-]{11})/gi,
    /youtu\.be\/([\w-]{11})/gi,
    /youtube(?:-nocookie)?\.com\/(?:embed|shorts|live)\/([\w-]{11})/gi,
    /["'](?:videoId|video_id|youtubeId)["']\s*:\s*["']([\w-]{11})["']/gi
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      ids.add(match[1]);
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
    /\b(hurricane|storm|surge|flooding|flood|evacuation|landfall|weather)\b/.test(t);

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
    const cards = [
      ...document.querySelectorAll(".mc_vtvc.b_canvas")
    ];

    const viewRegex =
      /\d[\d,.]*\s*[KMB]?\s*views?\b/i;

    return cards.map((card, index) => {
      const titleElements = [
        ...card.querySelectorAll(
          ".mc_vtvc_title, a[title], [class*='title']"
        )
      ];

      const titles = [...new Set(
        titleElements.map(el =>
          (
            el.getAttribute("title") ||
            el.innerText ||
            el.textContent ||
            ""
          ).trim()
        ).filter(Boolean)
      )];

      const text = (card.innerText || "").trim();

      const labels = [
        ...card.querySelectorAll("*")
      ].filter(el => {
        const value = (el.innerText || "").trim();

        return viewRegex.test(value) &&
          ![...el.children].some(child =>
            viewRegex.test(
              (child.innerText || "").trim()
            )
          );
      }).map(el =>
        (el.innerText || "").match(viewRegex)?.[0]
      ).filter(Boolean);

      const attributes = [];

      for (const element of [
        card,
        ...card.querySelectorAll(
          "[mmeta], [vrhdata], [ourl], [href], [data-mmeta]"
        )
      ]) {
        for (const attr of element.attributes || []) {
          if (
            /mmeta|vrhdata|ourl|href|video|media|url|data-id/i
              .test(attr.name)
          ) {
            attributes.push({
              name: attr.name,
              value: attr.value.slice(0, 5000)
            });
          }
        }
      }

      return {
        index,
        title: (
          titles[0] ||
          card.getAttribute("aria-label") ||
          ""
        ).slice(0, 250),
        alternateTitles: titles.slice(1, 4),
        viewLabel:
          labels[0] ||
          text.match(viewRegex)?.[0] ||
          "",
        textSample: text.slice(0, 400),
        attributes: attributes.slice(0, 60),
        links: [
          ...card.querySelectorAll("a[href]")
        ].map(a => a.href).slice(0, 12),
        htmlSample: card.outerHTML.slice(0, 18000)
      };
    });
  });
}

function identify(card) {
  const sources = [
    ...card.attributes.map(a => ({
      source: a.name,
      value: a.value
    })),
    ...card.links.map(url => ({
      source: "link",
      value: url
    })),
    {
      source: "html",
      value: card.htmlSample
    }
  ];

  const evidence = sources.map(item => ({
    source: item.source,
    ids: youtubeIds(item.value)
  })).filter(item => item.ids.length > 0);

  const ids = [...new Set(
    evidence.flatMap(item => item.ids)
  )];

  const primarySources = sources.filter(item =>
    /^(mmeta|data-mmeta|ourl|href|vrhdata)$/i
      .test(item.source)
  );

  const primaryIds = [...new Set(
    primarySources.flatMap(item =>
      youtubeIds(item.value)
    )
  )];

  let id = null;

  if (primaryIds.length === 1) {
    id = primaryIds[0];
  } else if (
    primaryIds.length === 0 &&
    ids.length === 1
  ) {
    id = ids[0];
  }

  return {
    id,
    possibleIds: ids,
    idStatus: id
      ? ids.length > 1
        ? "PRIMARY_ID_OTHER_IDS_PRESENT"
        : "SINGLE_ID"
      : ids.length > 1
        ? "AMBIGUOUS_IDS"
        : "MISSING_YOUTUBE_ID",
    evidenceSources: evidence
      .map(item => item.source)
      .slice(0, 12)
  };
}

function diagnose(card, search) {
  const identity = identify(card);
  const views = parseViews(card.viewLabel);
  const match = relevance(card.title);

  const reasons = [];

  if (!card.title) {
    reasons.push("MISSING_TITLE");
  }

  if (views === null) {
    reasons.push("MISSING_VIEW_COUNT");
  } else if (views < MIN_VIEWS) {
    reasons.push("BELOW_1000_VIEWS");
  }

  if (!match.broad) {
    reasons.push("TITLE_NOT_BROAD_WEATHER_MATCH");
  }

  if (!match.strict) {
    reasons.push("TITLE_NOT_STRICT_EVENT_PLACE_MATCH");
  }

  if (!identity.id) {
    reasons.push(identity.idStatus);
  }

  if (
    identity.idStatus ===
    "PRIMARY_ID_OTHER_IDS_PRESENT"
  ) {
    reasons.push("MULTIPLE_IDS_REQUIRE_REVIEW");
  }

  const candidate =
    views !== null &&
    views >= MIN_VIEWS &&
    match.broad &&
    Boolean(identity.id);

  return {
    search,
    index: card.index,
    title: card.title,
    alternateTitles: card.alternateTitles,
    viewLabel: card.viewLabel,
    views,
    ...identity,
    relevance: match,
    candidate,
    reasons: reasons.length
      ? reasons
      : ["CANDIDATE_NOT_INDEPENDENTLY_VERIFIED"],
    youtubeUrl: identity.id
      ? "https://www.youtube.com/watch?v=" +
        identity.id
      : null,
    textSample: card.textSample
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
      "WEATHER TIME MACHINE — ENGINE 3 — TEST #24B"
    );
    console.log("CANDIDATE RECOVERY DIAGNOSTIC");
    console.log("QUERY:", BASE_QUERY);
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
          "BING CARDS EXTRACTED:",
          cards.length
        );

        for (const card of cards) {
          all.push(diagnose(card, i + 1));
        }
      } catch (error) {
        console.log(
          "SEARCH ERROR:",
          error.message
        );
      }
    }

    const withViews = all.filter(row =>
      row.views !== null
    );

    const qualifying = withViews.filter(row =>
      row.views >= MIN_VIEWS
    );

    const broad = qualifying.filter(row =>
      row.relevance.broad
    );

    const candidates = broad.filter(row =>
      row.id
    );

    const unique = new Map();

    for (const row of candidates) {
      if (!unique.has(row.id)) {
        unique.set(row.id, row);
      }
    }

    const duplicates = candidates.filter(row =>
      unique.get(row.id) !== row
    );

    const excluded = qualifying.filter(row =>
      !row.candidate
    );

    console.log(
      "\n========== TEST #24B SUMMARY =========="
    );

    console.log(
      "SUCCESSFUL SEARCHES:",
      successfulSearches,
      "OF",
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
      "BROAD WEATHER MATCHES:",
      broad.length
    );

    console.log(
      "RECOVERED DISTINCT YOUTUBE IDS:",
      unique.size
    );

    console.log(
      "DUPLICATE CANDIDATE OBSERVATIONS:",
      duplicates.length
    );

    console.log(
      "BROAD MATCHES MISSING ID:",
      broad.filter(row => !row.id).length
    );

    console.log(
      "EXCLUDED 1000+ OBSERVATIONS:",
      excluded.length
    );

    console.log(
      "\nRECOVERED CANDIDATES:",
      JSON.stringify(
        [...unique.values()],
        null,
        2
      )
    );

    console.log(
      "\nEXCLUDED 1000+ CARDS AND REASONS:",
      JSON.stringify(
        excluded,
        null,
        2
      )
    );

    console.log(
      "\nDUPLICATE RECORDS:",
      JSON.stringify(
        duplicates,
        null,
        2
      )
    );

    console.log(
      "\nALL CARD DIAGNOSTICS:",
      JSON.stringify(
        all,
        null,
        2
      )
    );

    console.log("\nFINAL STATUS");
    console.log(
      "TEST #24B COMPLETED — DIAGNOSTIC ONLY."
    );
    console.log(
      "NO A-F GRADES GENERATED."
    );
    console.log(
      "VIDEO IDS AND VIEW COUNTS NOT INDEPENDENTLY VERIFIED."
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
    "ENGINE 3 TEST #24B ERROR:",
    error
  );
  process.exitCode = 1;
});
