
"use strict";

const { chromium } = require("playwright");

// WEATHER TIME MACHINE — ENGINE 3 — TEST #17
// Independent diagnostic only. Does not calculate or publish grades.
const QUERY = process.env.WEATHER_QUERY || "hurricane sandy 2012 new jersey news";
const MIN_VIEWS = 1000;
const SEARCH_URL = "https://www.bing.com/videos/search?q=" + encodeURIComponent(QUERY);
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function parseViews(value) {
  const match = String(value || "").match(/\b(\d[\d,.]*)\s*([KMB])?\s+views?\b/i);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ""));
  const factor = { K: 1e3, M: 1e6, B: 1e9 }[(match[2] || "").toUpperCase()] || 1;
  return Number.isFinite(n) ? Math.round(n * factor) : null;
}

function youtubeId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(String(url));
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    let id = null;
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (parsed.pathname === "/watch") id = parsed.searchParams.get("v");
      else {
        const m = parsed.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/);
        if (m) id = m[1];
      }
    } else if (host === "youtu.be") {
      id = parsed.pathname.split("/").filter(Boolean)[0];
    }
    return ID_PATTERN.test(id || "") ? id : null;
  } catch {
    return null;
  }
}

function readMetadata(card) {
  const candidates = [];
  const warnings = [];
  const push = (source, value) => {
    const id = youtubeId(value);
    if (id) candidates.push({ source, id, url: value });
  };

  for (const item of card.metadata || []) {
    if (item.name === "mmeta") {
      try {
        const data = JSON.parse(item.value);
        for (const key of ["murl", "purl", "ourl", "url"]) {
          if (typeof data[key] === "string") push("mmeta." + key, data[key]);
        }
      } catch (error) {
        warnings.push("Invalid mmeta JSON: " + error.message);
      }
    } else if (["ourl", "murl", "purl"].includes(item.name)) {
      push(item.name, item.value);
    }
  }

  // A card's own direct URL is a fallback, not a broad HTML search.
  for (const url of card.directUrls || []) push("direct-url", url);

  const ids = [...new Set(candidates.map(c => c.id))];
  return {
    status: ids.length === 1 ? "matched" : ids.length > 1 ? "conflicting-ids" : "no-youtube-id",
    videoId: ids.length === 1 ? ids[0] : null,
    candidates,
    warnings
  };
}

// A cautious diagnostic relevance check, not a proof of event identity.
function relevance(title, query) {
  const text = String(title || "").toLowerCase();
  const q = query.toLowerCase();
  const groups = [
    ["hurricane", "tropical storm", "cyclone"],
    ["blizzard", "snowstorm", "snow storm", "winter storm"],
    ["tornado", "twister"],
    ["flood", "flooding"],
    ["wildfire", "forest fire"],
    ["earthquake"],
    ["heatwave", "heat wave"],
    ["thunderstorm", "severe storm"],
    ["ice storm", "freezing rain"]
  ];
  const group = groups.find(g => g.some(term => q.includes(term))) || [];
  const eventTerms = group.filter(term => text.includes(term));
  const words = q.match(/[a-z]+|\d{4}/g) || [];
  const stop = new Set(["news", "video", "weather", "storm", "the", "and", "from"]);
  const identifiers = words.filter(w => w.length >= 4 && !stop.has(w) && !group.some(g => g.includes(w)));
  const matched = identifiers.filter(w => text.includes(w));
  const likely = eventTerms.length > 0 && matched.length > 0;
  return { likely, eventTerms, matchedIdentifiers: matched, identifiers, note: "Heuristic only; not independently verified" };
}

async function extractCards(page) {
  return page.evaluate(() => {
    const viewRe = /\b\d[\d,.]*\s*[KMB]?\s+views?\b/i;
    // Bing's mc_vtvc_b_canvas element is the individual result seen in Test #16.
    const nodes = [...document.querySelectorAll(".mc_vtvc_b_canvas")];
    const cards = [];
    const seenNodes = new Set();

    for (const node of nodes) {
      if (seenNodes.has(node)) continue;
      seenNodes.add(node);
      const text = (node.innerText || "").trim();
      const match = text.match(viewRe);
      if (!match) continue;

      const titleNode = node.querySelector(".mc_vtvc_title, [class*='mc_vtvc_title'], a[title]");
      const title = (titleNode?.getAttribute("title") || titleNode?.innerText || "").trim();
      const metadata = [];
      for (const element of [node, ...node.querySelectorAll("*")]) {
        for (const attribute of element.attributes || []) {
          const name = attribute.name.toLowerCase();
          if (["mmeta", "ourl", "murl", "purl"].includes(name)) {
            metadata.push({ name, value: attribute.value });
          }
        }
      }
      const directUrls = [...node.querySelectorAll("a[href]")]
        .map(a => a.getAttribute("href"))
        .filter(href => /^https?:\/\//i.test(href || ""));

      cards.push({
        index: cards.length,
        title: title.slice(0, 250),
        label: match[0],
        metadata,
        directUrls,
        className: String(node.className || ""),
        textSample: text.slice(0, 350)
      });
    }
    return { candidateNodes: nodes.length, cards };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
    console.log("WEATHER TIME MACHINE — ENGINE 3 / TEST #17 — METADATA DIAGNOSTIC");
    console.log("QUERY:", QUERY);
    console.log("MINIMUM VIEWS:", MIN_VIEWS);
    console.log("SEARCH URL:", SEARCH_URL);
    const response = await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(5000);
    console.log("HTTP STATUS:", response?.status());
    console.log("PAGE TITLE:", await page.title());
    if (!response || response.status() !== 200) throw new Error("Bing did not return HTTP 200");

    const extracted = await extractCards(page);
    const unique = new Map();
    const unresolved = [];
    const unrelated = [];
    const duplicates = [];
    const allRecords = [];

    for (const card of extracted.cards) {
      const views = parseViews(card.label);
      const identity = readMetadata(card);
      const match = relevance(card.title, QUERY);
      const record = {
        index: card.index, title: card.title, views, label: card.label,
        videoId: identity.videoId, idStatus: identity.status,
        idSources: identity.candidates.map(c => c.source),
        idCandidates: [...new Set(identity.candidates.map(c => c.id))],
        likelyRelevant: match.likely, matchedTerms: [...match.eventTerms, ...match.matchedIdentifiers],
        warnings: identity.warnings
      };
      allRecords.push(record);
      if (!match.likely) {
        unrelated.push(record);
        continue;
      }
      if (identity.status !== "matched" || views === null) {
        unresolved.push(record);
        continue;
      }
      const prior = unique.get(identity.videoId);
      if (prior) {
        duplicates.push({ videoId: identity.videoId, previousIndex: prior.index, duplicateIndex: card.index });
        if (views > prior.views) unique.set(identity.videoId, record);
      } else {
        unique.set(identity.videoId, record);
      }
    }

    const videos = [...unique.values()];
    const qualifying = videos.filter(v => v.views >= MIN_VIEWS);
    const unresolvedQualifying = unresolved.filter(v => v.views !== null && v.views >= MIN_VIEWS);
    console.log("\nDIAGNOSTIC SUMMARY");
    console.log("INDIVIDUAL BING CARD NODES:", extracted.candidateNodes);
    console.log("CARDS WITH VIEW LABELS:", extracted.cards.length);
    console.log("LIKELY RELEVANT UNIQUE YOUTUBE IDS:", videos.length);
    console.log("LIKELY RELEVANT VIDEOS WITH 1000+ VIEWS:", qualifying.length);
    console.log("UNRELATED / UNCERTAIN TITLES:", unrelated.length);
    console.log("DUPLICATE YOUTUBE IDS:", duplicates.length);
    console.log("UNRESOLVED LIKELY RELEVANT CARDS:", unresolved.length);
    console.log("UNRESOLVED LIKELY RELEVANT 1000+ CARDS:", unresolvedQualifying.length);
    console.log("\nQUALIFYING CANDIDATES:", JSON.stringify(qualifying, null, 2));
    console.log("\nUNRESOLVED RECORDS:", JSON.stringify(unresolved, null, 2));
    console.log("\nDUPLICATES:", JSON.stringify(duplicates, null, 2));
    console.log("\nUNRELATED / UNCERTAIN (FIRST 20):", JSON.stringify(unrelated.slice(0, 20), null, 2));
    console.log("\nCARD RECORDS (FIRST 25):", JSON.stringify(allRecords.slice(0, 25), null, 2));
    console.log("\nFINAL STATUS");
    console.log("TEST #17 DIAGNOSTIC COMPLETED — NO A-F GRADES GENERATED.");
    console.log("FINAL GRADING STATUS: BLOCKED — title relevance, video ownership, and counts require independent verification.");
    console.log("NOTE: A green GitHub job indicates diagnostic execution only, not grading approval.");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error("TEST #17 ERROR:", error);
  process.exitCode = 1;
});
