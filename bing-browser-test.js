
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

// Convert Bing view labels into numeric view counts.
function parseViews(value) {
  const match = String(value || "").match(
    /(\d[\d,.]*)\s*([KMB])?\s*views?\b/i
  );

  if (!match) return null;

  const amount = Number(
    match[1].replace(/,/g, "")
  );

  const scale = {
    K: 1e3,
    M: 1e6,
    B: 1e9
  };

  return Number.isFinite(amount)
    ? Math.round(
        amount *
        (scale[(match[2] || "").toUpperCase()] || 1)
      )
    : null;
}

// Decode encoded URLs and metadata.
function decodeText(raw) {
  let value = String(raw || "");

  for (let i = 0; i < 5; i++) {
    const old = value;

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
      // Value is not URL encoded.
    }

    if (value === old) break;
  }

  return value;
}

// Extract valid-looking YouTube video IDs.
function youtubeIds(raw) {
  const value = decodeText(raw);
  const ids = new Set();

  const patterns = [
    /(?:youtube\.com\/watch\?[^\s"'<>]*?[?&]v=|youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/gi,

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

// Read Bing video cards and their metadata.
async function extractCards(page) {
  return page.evaluate(() => {
    const viewPattern =
      /\b\d[\d,.]*\s*[KMB]?\s*views?\b/i;

    const labels = [
      ...document.querySelectorAll("*")
    ].filter(element => {
      const text =
        (element.innerText || "").trim();

      return (
        text.length <= 100 &&
        viewPattern.test(text) &&
        ![...element.children].some(child =>
          viewPattern.test(
            (child.innerText || "").trim()
          )
        )
      );
    });

    const cards = labels.map(label => {
      let node = label;
      let card = null;

      for (
        let depth = 0;
        depth < 12 && node;
        depth++, node = node.parentElement
      ) {
        const text =
          (node.innerText || "").trim();

        if (text.length > 15000) break;

        const hasTitle = !!node.querySelector(
          ".mc_vtvc_title, [class*='title'], a[title]"
        );

        const hasMetadata =
          /mmeta|vrhdata|mediaUrl|contentUrl|youtube\.com|youtu\.be|riverview/i.test(
            node.outerHTML || ""
          );

        if (hasTitle && hasMetadata) {
          card = node;
          break;
        }
      }

      if (!card) {
        node = label.parentElement;

        for (
          let depth = 0;
          depth < 8 && node;
          depth++, node = node.parentElement
        ) {
          if (
            node.querySelector("a[href]") &&
            (node.innerText || "").length < 12000
          ) {
            card = node;
            break;
          }
        }
      }

      const titleNode = card?.querySelector(
        ".mc_vtvc_title, [class*='title']"
      );

      const metadata = [];

      if (card) {
        for (
          const element of [
            card,
            ...card.querySelectorAll("*")
          ]
        ) {
          for (
            const attribute of element.attributes || []
          ) {
            if (
              /mmeta|vrhdata|video|media|url|href|data-id/i.test(
                attribute.name
              )
            ) {
              metadata.push({
                name: attribute.name,
                value: attribute.value
              });
            }
          }
        }
      }

      const links = card
        ? [...card.querySelectorAll("a[href]")].map(
            a => a.href
          )
        : [];

      return {
        label: (label.innerText || "").trim(),

        title: (
          titleNode?.getAttribute("title") ||
          titleNode?.innerText ||
          ""
        ).trim().slice(0, 250),

        metadata,
        links,

        html: (
          card?.outerHTML || ""
        ).slice(0, 40000)
      };
    });

    return {
      labelCount: labels.length,
      cards
    };
  });
}

// Resolve one unique YouTube ID per Bing result.
function resolveVideo(card) {
  const candidates = [
    ...card.metadata.map(item => item.value),
    ...card.links,
    card.html
  ];

  const ids = new Set();

  for (const value of candidates) {
    for (const id of youtubeIds(value)) {
      ids.add(id);
    }
  }

  if (ids.size !== 1) {
    return {
      status: ids.size
        ? "ambiguous"
        : "unresolved",

      candidates: [...ids]
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

// Main Engine 3 test.
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
      "WEATHER TIME MACHINE - ENGINE 3 / BING ID VALIDATION"
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

    if (
      !response ||
      response.status() !== 200
    ) {
      throw new Error(
        "Bing did not return HTTP 200."
      );
    }

    const extracted =
      await extractCards(page);

    const unique = new Map();
    const unresolved = [];

    for (const card of extracted.cards) {
      const views = parseViews(card.label);

      if (views === null) continue;

      const identity = resolveVideo(card);

      if (identity.status !== "verified") {
        unresolved.push({
          title: card.title,
          label: card.label,
          views,
          status: identity.status,

          candidateIds:
            identity.candidates,

          sampleLink:
            card.links[0] || ""
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

      const previous =
        unique.get(video.videoId);

      if (
        !previous ||
        views > previous.views
      ) {
        unique.set(
          video.videoId,
          video
        );
      }
    }

    const videos = [...unique.values()];

    const qualifying = videos.filter(
      video => video.views >= MIN_VIEWS
    );

    const unresolvedQualifying =
      unresolved.filter(
        item => item.views >= MIN_VIEWS
      );

    console.log("\nVERIFICATION RESULTS");

    console.log(
      "VIEW LABELS FOUND:",
      extracted.labelCount
    );

    console.log(
      "VIDEO CANDIDATES:",
      extracted.cards.length
    );

    console.log(
      "UNIQUE VERIFIED YOUTUBE IDS:",
      videos.length
    );

    console.log(
      "VERIFIED VIDEOS WITH 1000+ VIEWS:",
      qualifying.length
    );

    console.log(
      "UNRESOLVED VIDEO LABELS:",
      unresolved.length
    );

    console.log(
      "UNRESOLVED LABELS WITH 1000+ VIEWS:",
      unresolvedQualifying.length
    );

    console.log(
      "QUALIFYING VERIFIED VIDEOS:",
      JSON.stringify(
        qualifying,
        null,
        2
      )
    );

    console.log(
      "UNRESOLVED VIDEOS:",
      JSON.stringify(
        unresolved,
        null,
        2
      )
    );

    console.log("\nFINAL STATUS");

    if (
      !extracted.labelCount ||
      !videos.length
    ) {
      console.log(
        "INCONCLUSIVE: No verified Bing video data available."
      );

      console.log(
        "FINAL GRADING STATUS: BLOCKED"
      );

      process.exitCode = 1;

    } else if (
      unresolvedQualifying.length
    ) {
      console.log(
        "PARTIAL: Verified video counts are available, but some video IDs remain unresolved."
      );

      console.log(
        "UNRESOLVED QUALIFYING VIDEOS:",
        unresolvedQualifying.length
      );

      console.log(
        "FINAL GRADING STATUS: BLOCKED - incomplete verification."
      );

      console.log(
        "Engine 3 will preserve verified counts and report unresolved videos separately."
      );

      // The diagnostic run completes successfully.
      // This does NOT approve final grading.
      process.exitCode = 0;

    } else {
      console.log(
        "TEST PASSED: All qualifying labels matched one YouTube ID within their card."
      );

      console.log(
        "FINAL GRADING STATUS: PENDING ADDITIONAL RELIABILITY TESTS"
      );

      console.log(
        "This verifies card-level extraction, not YouTube ownership or search relevance."
      );
    }

  } finally {
    await browser.close();
  }

})().catch(error => {
  console.error(
    "ENGINE 3 ERROR:",
    error
  );

  process.exitCode = 1;
});
