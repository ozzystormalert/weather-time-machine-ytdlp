
"use strict";

const { chromium } = require("playwright");

// WEATHER TIME MACHINE — ENGINE 3 — TEST #20
// Multi-search diagnostic only. No Blogger or grading changes.
const BASE_QUERY = process.env.WEATHER_QUERY || "hurricane sandy 2012 new jersey news";
const MIN_VIEWS = 1000;
const SEARCHES = [...new Set([
  BASE_QUERY,
  BASE_QUERY.replace(/\s+news\s*$/i, "") + " footage",
  BASE_QUERY.replace(/\s+news\s*$/i, "") + " youtube",
  BASE_QUERY.replace(/\s+news\s*$/i, "") + " local news"
])];

function parseViews(text) {
  const match = String(text || "").match(/\b(\d[\d,.]*)\s*([KMB])?\s*views?\b/i);
  if (!match) return null;
  const number = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(number)) return null;
  return Math.round(number * ({ K: 1000, M: 1000000, B: 1000000000 }[(match[2] || "").toUpperCase()] || 1));
}

function decode(raw) {
  let value = String(raw || "");
  for (let i = 0; i < 5; i++) {
    const previous = value;
    value = value.replace(/&quot;|&#34;/gi, '"').replace(/&amp;|&#38;/gi, "&")
      .replace(/&#39;|&apos;/gi, "'").replace(/\\u0026/gi, "&")
      .replace(/\\u003d/gi, "=").replace(/\\u002f/gi, "/")
      .replace(/\\\//g, "/");
    try { value = decodeURIComponent(value); } catch (_) {}
    if (value === previous) break;
  }
  return value;
}

function idsFrom(raw) {
  const source = decode(raw);
  const found = new Set();
  const patterns = [
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?[^\s"'<>]*?\bv=([A-Za-z0-9_-]{11})/gi,
    /youtu\.be\/([A-Za-z0-9_-]{11})/gi,
    /youtube(?:-nocookie)?\.com\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/gi,
    /["'](?:videoId|video_id|youtubeId)["']\s*:\s*["']([A-Za-z0-9_-]{11})["']/gi
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}

function identify(card) {
  let metadata = null;
  try { metadata = JSON.parse(decode(card.meta)); } catch (_) {}
  const directUrls = metadata && typeof metadata === "object"
    ? [metadata.murl, metadata.purl, metadata.mediaUrl, metadata.contentUrl, metadata.ourl]
      .filter(value => typeof value === "string") : [];
  const direct = [...new Set(directUrls.flatMap(idsFrom))];
  const metaIds = idsFrom(card.meta);
  const attributeIds = [...new Set(card.attributes.flatMap(a => idsFrom(a.value)))];
  const all = [...new Set([...direct, ...metaIds, ...attributeIds])];
  if (direct.length === 1 && all.every(id => id === direct[0]))
    return { id: direct[0], evidence: "consistent-metadata-url", candidates: all };
  if (direct.length === 0 && all.length === 1)
    return { id: all[0], evidence: "single-card-candidate", candidates: all };
  return { id: null, evidence: all.length > 1 ? "ambiguous" : "missing", candidates: all };
}

function relevance(title) {
  const text = String(title || "").toLowerCase();
  const event = /\b(sandy|superstorm)\b/.test(text);
  const place = /\b(new jersey|jersey shore|nj|atlantic city|seaside heights|hoboken|belmar|point pleasant|asbury park|long beach island|lbi)\b/.test(text);
  const weather = /\b(hurricane|storm surge|flooding|evacuation|landfall)\b/.test(text);
  return { strict: event && (place || /\b2012\b/.test(text)), broad: event || (weather && place) };
}

async function extract(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll(".mc_vtvc.b_canvas")];
    const viewRegex = /\b\d[\d,.]*\s*[KMB]?\s*views?\b/i;
    return nodes.map((node, index) => {
      const titleElement = node.querySelector(".mc_vtvc_title, [class*='title'], a[title]");
      const title = (titleElement?.getAttribute("title") || titleElement?.innerText || node.getAttribute("aria-label") || "").trim();
      const text = (node.innerText || "").trim();
      const labels = [...node.querySelectorAll("*")].filter(element =>
        viewRegex.test((element.innerText || "").trim()) &&
        ![...element.children].some(child => viewRegex.test((child.innerText || "").trim()))
      ).map(element => (element.innerText || "").match(viewRegex)?.[0]).filter(Boolean);
      const attributes = [];
      for (const element of [node, ...node.querySelectorAll("[mmeta], [vrhdata], [ourl], [href], [data-mmeta]")]) {
        for (const attr of element.attributes || []) {
          if (/mmeta|vrhdata|ourl|href|video|media|url|data-id/i.test(attr.name))
            attributes.push({ name: attr.name, value: attr.value });
        }
      }
      return {
        index, title: title.slice(0, 250), label: labels[0] || text.match(viewRegex)?.[0] || "",
        meta: node.querySelector("[mmeta]")?.getAttribute("mmeta") || "",
        attributes: attributes.slice(0, 50)
      };
    });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
    const all = [];
    console.log("WEATHER TIME MACHINE — ENGINE 3 — TEST #20 — MULTI-SEARCH DIAGNOSTIC");
    console.log("BASE QUERY:", BASE_QUERY);
    console.log("MINIMUM VIEWS:", MIN_VIEWS);
    for (let index = 0; index < SEARCHES.length; index++) {
      const query = SEARCHES[index];
      const url = "https://www.bing.com/videos/search?q=" + encodeURIComponent(query);
      console.log("\nSEARCH", index + 1, "OF", SEARCHES.length, ":", query);
      try {
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(4500);
        console.log("HTTP STATUS:", response?.status());
        if (!response || response.status() !== 200) continue;
        const cards = await extract(page);
        console.log("CARDS:", cards.length);
        for (const card of cards) {
          const identity = identify(card);
          all.push({ search: index + 1, query, title: card.title, label: card.label,
            views: parseViews(card.label), ...identity, relevance: relevance(card.title) });
        }
      } catch (error) {
        console.log("SEARCH ERROR:", error.message);
      }
    }

    const withViews = all.filter(row => row.views !== null);
    const thousand = withViews.filter(row => row.views >= MIN_VIEWS);
    const relevant = thousand.filter(row => row.relevance.broad);
    const byId = new Map();
    for (const row of relevant) {
      if (!row.id) continue;
      if (!byId.has(row.id)) byId.set(row.id, { id: row.id, title: row.title,
        views: row.views, searches: new Set(), evidence: new Set() });
      const item = byId.get(row.id);
      item.searches.add(row.search);
      item.evidence.add(row.evidence);
      item.views = Math.max(item.views, row.views);
    }
    const unique = [...byId.values()].map(item => ({ ...item,
      searches: [...item.searches], evidence: [...item.evidence],
      youtubeUrl: "https://www.youtube.com/watch?v=" + item.id }));
    const unresolved = relevant.filter(row => !row.id);

    console.log("\nDIAGNOSTIC SUMMARY");
    console.log("SEARCH QUERIES ATTEMPTED:", SEARCHES.length);
    console.log("TOTAL CARD OBSERVATIONS:", all.length);
    console.log("CARDS WITH VIEW COUNTS:", withViews.length);
    console.log("CARDS WITH 1000+ VIEWS:", thousand.length);
    console.log("BROAD WEATHER MATCHES WITH 1000+ VIEWS:", relevant.length);
    console.log("DISTINCT YOUTUBE ID CANDIDATES:", unique.length);
    console.log("CANDIDATES SEEN IN MULTIPLE SEARCHES:", unique.filter(x => x.searches.length > 1).length);
    console.log("UNRESOLVED RELEVANT 1000+ CARDS:", unresolved.length);
    console.log("UNCERTAIN OR UNRELATED 1000+ CARDS:", thousand.length - relevant.length);
    console.log("\nUNIQUE YOUTUBE CANDIDATES:", JSON.stringify(unique, null, 2));
    console.log("\nUNRESOLVED QUALIFYING CARDS:", JSON.stringify(unresolved, null, 2));
    console.log("\nUNCERTAIN / UNRELATED CARDS:", JSON.stringify(thousand.filter(x => !x.relevance.broad), null, 2));
    console.log("\nFINAL STATUS");
    console.log("TEST #20 DIAGNOSTIC COMPLETED — NO A-F GRADES GENERATED.");
    console.log("GRADING STATUS: BLOCKED — Bing view labels and YouTube identities are not independently verified.");
    console.log("NOTE: Green GitHub status means the diagnostic ran, not that grading is approved.");
    if (!all.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error("ENGINE 3 TEST #20 ERROR:", error);
  process.exitCode = 1;
});
