
"use strict";

const { chromium } = require("playwright");

// WEATHER TIME MACHINE
// ENGINE 3 — REBUILT TEST #17
// Independent Bing Video Diagnostic
// No Blogger changes. No A-F grades.

const QUERY =
  process.env.WEATHER_QUERY ||
  "hurricane sandy 2012 new jersey news";

const MIN_VIEWS = 1000;

const SEARCH_URL =
  "https://www.bing.com/videos/search?q=" +
  encodeURIComponent(QUERY);

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

// -------------------------------------
// VIEW COUNT
// -------------------------------------

function parseViews(value) {
  const match = String(value || "").match(
    /(\d[\d,.]*)\s*([KMB])?\s*views?\b/i
  );

  if (!match) return null;

  const amount = Number(
    match[1].replace(/,/g, "")
  );

  const scale = {
    K: 1000,
    M: 1000000,
    B: 1000000000
  };

  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(
    amount *
    (scale[(match[2] || "").toUpperCase()] || 1)
  );
}

// -------------------------------------
// YOUTUBE VIDEO ID
// -------------------------------------

function youtubeId(raw) {
  if (!raw) return null;

  let value = String(raw);

  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch {
      break;
    }
  }

  value = value.replace(/&amp;/g, "&");

  try {
    const url = new URL(value);

    const host = url.hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/^m\./, "");

    let id = null;

    if (
      host === "youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      if (url.pathname === "/watch") {
        id = url.searchParams.get("v");
      } else {
        const match = url.pathname.match(
          /^\/(?:shorts|embed|live)\/([^/?#]+)/
        );

        if (match) {
          id = match[1];
        }
      }
    } else if (host === "youtu.be") {
      id = url.pathname
        .split("/")
        .filter(Boolean)[0];
    }

    return ID_PATTERN.test(id || "")
      ? id
      : null;

  } catch {
    return null;
  }
}

// -------------------------------------
// BING METADATA
// -------------------------------------

function readMetadata(card) {
  const candidates = [];
  const warnings = [];

  function add(source, value) {
    const id = youtubeId(value);

    if (id) {
      candidates.push({
        source,
        videoId: id,
        url: value
      });
    }
  }

  for (const attribute of card.metadata || []) {
    const name = attribute.name.toLowerCase();

    if (name === "mmeta") {
      try {
        const data = JSON.parse(attribute.value);

        for (const key of [
          "murl",
          "purl",
          "ourl",
          "url"
        ]) {
          if (typeof data[key] === "string") {
            add("mmeta." + key, data[key]);
          }
        }

      } catch (error) {
        warnings.push(
          "Invalid mmeta JSON: " + error.message
        );
      }

    } else if (
      ["ourl", "murl", "purl"].includes(name)
    ) {
      add(name, attribute.value);
    }
  }

  for (const url of card.directUrls || []) {
    add("direct-link", url);
  }

  const ids = [
    ...new Set(
      candidates.map(item => item.videoId)
    )
  ];

  return {
    status:
      ids.length === 1
        ? "matched"
        : ids.length > 1
          ? "conflicting-ids"
          : "unresolved",

    videoId:
      ids.length === 1
        ? ids[0]
        : null,

    candidateIds: ids,
    sources: candidates.map(item => item.source),
    warnings
  };
}

// -------------------------------------
// WEATHER RELEVANCE
// Diagnostic heuristic only
// -------------------------------------

function relevance(title, query) {
  const text = String(title || "").toLowerCase();
  const search = query.toLowerCase();

  const groups = [
    ["hurricane", "tropical storm", "cyclone"],
    ["blizzard", "snowstorm", "snow storm"],
    ["tornado", "twister"],
    ["flood", "flooding"],
    ["wildfire", "forest fire"],
    ["earthquake"],
    ["heatwave", "heat wave"],
    ["thunderstorm", "severe storm"],
    ["ice storm", "freezing rain"]
  ];

  const group =
    groups.find(items =>
      items.some(term => search.includes(term))
    ) || [];

  const eventMatches = group.filter(term =>
    text.includes(term)
  );

  const excluded = new Set([
    "news",
    "video",
    "weather",
    "storm",
    "the",
    "and",
    "from"
  ]);

  const identifiers = (
    search.match(/[a-z]+|\d{4}/g) || []
  ).filter(word =>
    word.length >= 4 &&
    !excluded.has(word) &&
    !group.some(term => term.includes(word))
  );

  const matchedIdentifiers =
    identifiers.filter(word =>
      text.includes(word)
    );

  return {
    likelyRelevant:
      eventMatches.length > 0 &&
      matchedIdentifiers.length > 0,

    eventMatches,
    matchedIdentifiers
  };
}

// -------------------------------------
// EXTRACT INDIVIDUAL BING CARDS
// Corrected CSS selector:
// .mc_vtvc.b_canvas
// -------------------------------------

async function extractCards(page) {
  return page.evaluate(() => {
    const viewPattern =
      /\b\d[\d,.]*\s*[KMB]?\s*views?\b/i;

    const primarySelector =
      ".mc_vtvc.b_canvas";

    let nodes = [
      ...document.querySelectorAll(
        primarySelector
      )
    ];

    let selectorUsed = primarySelector;

    // Fallback if Bing changes its card classes.
    if (!nodes.length) {
      selectorUsed = ".mc_vtvc";

      nodes = [
        ...document.querySelectorAll(
          selectorUsed
        )
      ];
    }

    const cards = [];

    for (const node of nodes) {
      // Avoid processing a nested card twice.
      if (
        nodes.some(other =>
          other !== node &&
          other.contains(node)
        )
      ) {
        continue;
      }

      const text =
        (node.innerText || "").trim();

      const viewMatch =
        text.match(viewPattern);

      if (!viewMatch) continue;

      const titleNode = node.querySelector(
        ".mc_vtvc_title, " +
        "[class*='mc_vtvc_title'], " +
        "a[title]"
      );

      const title = (
        titleNode?.getAttribute("title") ||
        titleNode?.innerText ||
        node.getAttribute("aria-label") ||
        ""
      ).trim();

      const metadata = [];

      for (const element of [
        node,
        ...node.querySelectorAll("*")
      ]) {
        for (
          const attribute of element.attributes || []
        ) {
          const name =
            attribute.name.toLowerCase();

          if (
            [
              "mmeta",
              "ourl",
              "murl",
              "purl"
            ].includes(name)
          ) {
            metadata.push({
              name,
              value: attribute.value
            });
          }
        }
      }

      const directUrls = [
        ...node.querySelectorAll("a[href]")
      ]
        .map(link =>
          link.getAttribute("href")
        )
        .filter(value =>
          /^https?:\/\//i.test(value || "")
        );

      cards.push({
        index: cards.length,
        title: title.slice(0, 250),
        label: viewMatch[0],
        metadata,
        directUrls,
        className:
          String(node.className || ""),
        textSample:
          text.slice(0, 350)
      });
    }

    return {
      selectorUsed,
      candidateNodes: nodes.length,
      cards
    };
  });
}

// -------------------------------------
// MAIN DIAGNOSTIC
// -------------------------------------

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
      "WEATHER TIME MACHINE — ENGINE 3"
    );

    console.log(
      "REBUILT TEST #17 — BING METADATA DIAGNOSTIC"
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
    const unrelated = [];
    const duplicates = [];
    const records = [];

    for (const card of extracted.cards) {
      const views =
        parseViews(card.label);

      const identity =
        readMetadata(card);

      const related =
        relevance(card.title, QUERY);

      const record = {
        index: card.index,
        title: card.title,
        views,
        label: card.label,

        videoId:
          identity.videoId,

        idStatus:
          identity.status,

        candidateIds:
          identity.candidateIds,

        idSources:
          identity.sources,

        likelyRelevant:
          related.likelyRelevant,

        eventMatches:
          related.eventMatches,

        matchedIdentifiers:
          related.matchedIdentifiers,

        warnings:
          identity.warnings
      };

      records.push(record);

      if (!related.likelyRelevant) {
        unrelated.push(record);
        continue;
      }

      if (
        identity.status !== "matched" ||
        views === null
      ) {
        unresolved.push(record);
        continue;
      }

      const previous =
        unique.get(identity.videoId);

      if (previous) {
        duplicates.push({
          videoId: identity.videoId,
          previousIndex: previous.index,
          duplicateIndex: record.index
        });

        if (views > previous.views) {
          unique.set(
            identity.videoId,
            record
          );
        }

      } else {
        unique.set(
          identity.videoId,
          record
        );
      }
    }

    const videos = [
      ...unique.values()
    ];

    const qualifying =
      videos.filter(video =>
        video.views >= MIN_VIEWS
      );

    const unresolvedQualifying =
      unresolved.filter(video =>
        video.views !== null &&
        video.views >= MIN_VIEWS
      );

    // ---------------------------------
    // DIAGNOSTIC SUMMARY
    // ---------------------------------

    console.log(
      "\nDIAGNOSTIC SUMMARY"
    );

    console.log(
      "SELECTOR USED:",
      extracted.selectorUsed
    );

    console.log(
      "INDIVIDUAL BING CARD NODES:",
      extracted.candidateNodes
    );

    console.log(
      "CARDS WITH VIEW LABELS:",
      extracted.cards.length
    );

    console.log(
      "LIKELY RELEVANT UNIQUE YOUTUBE IDS:",
      videos.length
    );

    console.log(
      "LIKELY RELEVANT VIDEOS WITH 1000+ VIEWS:",
      qualifying.length
    );

    console.log(
      "UNRELATED / UNCERTAIN TITLES:",
      unrelated.length
    );

    console.log(
      "DUPLICATE YOUTUBE IDS:",
      duplicates.length
    );

    console.log(
      "UNRESOLVED LIKELY RELEVANT CARDS:",
      unresolved.length
    );

    console.log(
      "UNRESOLVED LIKELY RELEVANT 1000+ CARDS:",
      unresolvedQualifying.length
    );

    console.log(
      "\nQUALIFYING CANDIDATES:",
      JSON.stringify(
        qualifying,
        null,
        2
      )
    );

    console.log(
      "\nUNRESOLVED RECORDS:",
      JSON.stringify(
        unresolved,
        null,
        2
      )
    );

    console.log(
      "\nDUPLICATES:",
      JSON.stringify(
        duplicates,
        null,
        2
      )
    );

    console.log(
      "\nUNRELATED / UNCERTAIN:",
      JSON.stringify(
        unrelated.slice(0, 20),
        null,
        2
      )
    );

    console.log(
      "\nCARD RECORDS (FIRST 25):",
      JSON.stringify(
        records.slice(0, 25),
        null,
        2
      )
    );

    // ---------------------------------
    // FINAL STATUS
    // ---------------------------------

    console.log(
      "\nFINAL STATUS"
    );

    if (!extracted.cards.length) {
      console.log(
        "INCONCLUSIVE: No Bing video cards extracted."
      );
    } else if (
      unresolvedQualifying.length
    ) {
      console.log(
        "PARTIAL: Some qualifying videos have unresolved IDs."
      );
    } else if (!videos.length) {
      console.log(
        "INCONCLUSIVE: No likely relevant YouTube IDs extracted."
      );
    } else {
      console.log(
        "DIAGNOSTIC COMPLETED: Candidate video records extracted."
      );
    }

    console.log(
      "FINAL GRADING STATUS: BLOCKED — PENDING RELIABILITY VALIDATION"
    );

    console.log(
      "NO A-F GRADES GENERATED."
    );

    console.log(
      "NOTE: Green GitHub status confirms execution, not video accuracy."
    );

  } finally {
    await browser.close();
  }

})().catch(error => {
  console.error(
    "ENGINE 3 TEST ERROR:",
    error
  );

  process.exitCode = 1;
});
