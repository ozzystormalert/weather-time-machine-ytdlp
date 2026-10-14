
"use strict";

const { chromium } = require("playwright");

const QUERY =
  process.env.WEATHER_QUERY ||
  "blizzard 1978 illinois news";

const MIN_VIEWS = 1000;

const SEARCH_URL =
  "https://www.bing.com/videos/search?q=" +
  encodeURIComponent(QUERY);

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function parseViews(value) {
  const match = String(value || "").match(
    /(\d[\d,.]*)\s*([KMB])?\s*views?\b/i
  );

  if (!match) return null;

  const amount = Number(match[1].replace(/,/g, ""));
  const scale = { K: 1e3, M: 1e6, B: 1e9 };

  if (!Number.isFinite(amount)) return null;

  return Math.round(
    amount * (scale[(match[2] || "").toUpperCase()] || 1)
  );
}

function decodeText(raw) {
  let value = String(raw || "");

  for (let i = 0; i < 5; i++) {
    const previous = value;

    value = value
      .replace(/&quot;|&#34;/gi, '"')
      .replace(/&amp;|&#38;/gi, "&")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\\u0026/gi, "&")
      .replace(/\\u003d/gi, "=")
      .replace(/\\u002f/gi, "/")
      .replace(/\\\//g, "/");

    try {
      value = decodeURIComponent(value);
    } catch {
      // Not URL encoded.
    }

    if (value === previous) break;
  }

  return value;
}

function youtubeIds(raw) {
  const value = decodeText(raw);
  const ids = new Set();

  const patterns = [
    /youtube\.com\/watch\?[^\s"'<>]*?[?&]v=([A-Za-z0-9_-]{11})/gi,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/gi,
    /youtu\.be\/([A-Za-z0-9_-]{11})/gi,
    /youtube\.com\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/gi,
    /["'](?:videoId|video_id|youtubeId)["']\s*:\s*["']([A-Za-z0-9_-]{11})["']/gi
  ];

  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      if (ID_PATTERN.test(match[1])) {
        ids.add(match[1]);
      }
    }
  }

  return [...ids];
}

function weatherTerms(query) {
  const normalized = query.toLowerCase();

  const groups = [
    ["blizzard", "snowstorm", "snow", "winter storm"],
    ["hurricane", "tropical storm", "cyclone"],
    ["tornado", "twister"],
    ["flood", "flooding"],
    ["wildfire", "forest fire"],
    ["earthquake", "seismic"],
    ["heatwave", "heat wave", "extreme heat"],
    ["thunderstorm", "severe storm"],
    ["ice storm", "freezing rain"]
  ];

  const selected = groups.find(group =>
    group.some(term => normalized.includes(term))
  );

  return selected || [];
}

function relevantTitle(title, query) {
  const text = String(title || "").toLowerCase();

  if (!text) return false;

  const terms = weatherTerms(query);

  if (!terms.length) return false;

  const weatherMatch = terms.some(term =>
    text.includes(term)
  );

  const queryWords = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(word =>
      word.length >= 4 &&
      !["news", "storm", "weather"].includes(word) &&
      !/^\d{4}$/.test(word)
    );

  const locationMatch = queryWords.some(word =>
    text.includes(word)
  );

  return weatherMatch && locationMatch;
}

async function extractCards(page) {
  return page.evaluate(() => {
    const viewPattern =
      /\b\d[\d,.]*\s*[KMB]?\s*views?\b/i;

    const selectors = [
      ".mc_vtvc",
      ".mc_vtvc_card",
      ".mc_vtvc_con",
      "[class*='mc_vtvc']"
    ];

    const elements = [
      ...new Set(
        selectors.flatMap(selector =>
          [...document.querySelectorAll(selector)]
        )
      )
    ];

    const cards = [];

    for (const element of elements) {
      const text = (element.innerText || "").trim();

      if (!viewPattern.test(text)) continue;

      const titleElement = element.querySelector(
        ".mc_vtvc_title, a[title], [class*='title']"
      );

      if (!titleElement) continue;

      const title = (
        titleElement.getAttribute("title") ||
        titleElement.innerText ||
        ""
      ).trim();

      if (!title) continue;

      const viewMatch = text.match(viewPattern);

      const links = [
        ...element.querySelectorAll("a[href]")
      ].map(a => a.href);

      const metadata = [];

      for (const node of [
        element,
        ...element.querySelectorAll("*")
      ]) {
        for (const attribute of node.attributes || []) {
          if (
            /mmeta|vrhdata|video|media|url|href|data-id/i.test(
              attribute.name
            )
          ) {
            metadata.push(attribute.value);
          }
        }
      }

      cards.push({
        title: title.slice(0, 250),
        label: viewMatch ? viewMatch[0] : "",
        links,
        metadata,
        html: element.outerHTML.slice(0, 30000)
      });
    }

    return {
      pageTitle: document.title,
      rawCards: cards.length,
      cards
    };
  });
}

function resolveVideo(card) {
  const ids = new Set();

  for (const value of [
    ...card.links,
    ...card.metadata,
    card.html
  ]) {
    for (const id of youtubeIds(value)) {
      ids.add(id);
    }
  }

  if (ids.size !== 1) {
    return {
      status: ids.size ? "ambiguous" : "unresolved",
      candidateIds: [...ids]
    };
  }

  const videoId = [...ids][0];

  return {
    status: "verified",
    videoId,
    url:
      "https://www.youtube.com/watch?v=" +
      videoId
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

    console.log(
      "WEATHER TIME MACHINE - ENGINE 3 / RELIABILITY TEST"
    );

    console.log("QUERY:", QUERY);
    console.log("MINIMUM VIEWS:", MIN_VIEWS);
    console.log("SEARCH URL:", SEARCH_URL);

    const response = await page.goto(
      SEARCH_URL,
      {
        waitUntil: "domcontentloaded",
        timeout: 45000
      }
    );

    await page.waitForTimeout(5000);

    console.log(
      "HTTP STATUS:",
      response?.status()
    );

    console.log(
      "PAGE TITLE:",
      await page.title()
    );

    if (!response || response.status() !== 200) {
      throw new Error(
        "Bing did not return HTTP 200."
      );
    }

    const extracted = await extractCards(page);

    const unique = new Map();
    const unrelated = [];
    const unresolved = [];
    const rejected = [];

    for (const card of extracted.cards) {
      const views = parseViews(card.label);

      if (views === null) {
        rejected.push({
          title: card.title,
          reason: "Missing view count"
        });
        continue;
      }

      if (!relevantTitle(card.title, QUERY)) {
        unrelated.push({
          title: card.title,
          views,
          label: card.label
        });
        continue;
      }

      const identity = resolveVideo(card);

      if (identity.status !== "verified") {
        unresolved.push({
          title: card.title,
          views,
          label: card.label,
          status: identity.status,
          candidateIds: identity.candidateIds,
          sampleLink: card.links[0] || ""
        });
        continue;
      }

      const video = {
        title: card.title,
        videoId: identity.videoId,
        url: identity.url,
        views,
        label: card.label
      };

      const previous = unique.get(video.videoId);

      if (!previous || views > previous.views) {
        unique.set(video.videoId, video);
      }
    }

    const videos = [...unique.values()];

    const qualifying = videos.filter(
      video => video.views >= MIN_VIEWS
    );

    const unresolvedQualifying = unresolved.filter(
      video => video.views >= MIN_VIEWS
    );

    console.log("\nVERIFICATION RESULTS");

    console.log(
      "RAW BING VIDEO CARDS:",
      extracted.rawCards
    );

    console.log(
      "WEATHER-RELATED UNIQUE YOUTUBE IDS:",
      videos.length
    );

    console.log(
      "WEATHER VIDEOS WITH 1000+ VIEWS:",
      qualifying.length
    );

    console.log(
      "UNRELATED VIDEOS REJECTED:",
      unrelated.length
    );

    console.log(
      "UNRESOLVED WEATHER VIDEOS:",
      unresolved.length
    );

    console.log(
      "UNRESOLVED WEATHER VIDEOS WITH 1000+ VIEWS:",
      unresolvedQualifying.length
    );

    console.log(
      "QUALIFYING WEATHER VIDEOS:",
      JSON.stringify(qualifying, null, 2)
    );

    console.log(
      "UNRELATED VIDEOS:",
      JSON.stringify(unrelated, null, 2)
    );

    console.log(
      "UNRESOLVED WEATHER VIDEOS:",
      JSON.stringify(unresolved, null, 2)
    );

    console.log(
      "REJECTED RECORDS:",
      JSON.stringify(rejected, null, 2)
    );

    console.log("\nFINAL STATUS");

    if (!extracted.rawCards) {
      console.log(
        "INCONCLUSIVE: No Bing video cards extracted."
      );

      console.log(
        "FINAL GRADING STATUS: BLOCKED"
      );

    } else if (unresolvedQualifying.length) {
      console.log(
        "PARTIAL: Some qualifying weather videos have unresolved IDs."
      );

      console.log(
        "FINAL GRADING STATUS: BLOCKED"
      );

    } else if (!videos.length) {
      console.log(
        "INCONCLUSIVE: No weather-related YouTube IDs verified."
      );

      console.log(
        "FINAL GRADING STATUS: BLOCKED"
      );

    } else {
      console.log(
        "DIAGNOSTIC PASSED: Weather-title filtering and card-level ID extraction completed."
      );

      console.log(
        "FINAL GRADING STATUS: PENDING RELIABILITY REVIEW"
      );
    }

    console.log(
      "NOTE: Title filtering is heuristic. Video identity and relevance are not independently verified."
    );

  } finally {
    await browser.close();
  }

})().catch(error => {
  console.error("ENGINE 3 ERROR:", error);
  process.exitCode = 1;
});
