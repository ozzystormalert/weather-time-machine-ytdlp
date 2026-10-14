
"use strict";

const { chromium } = require("playwright");

// WEATHER TIME MACHINE — ENGINE 3 — TEST #19
// Diagnostic only. No changes to Blogger, Engines 1/2, or A-F grades.
const QUERY = process.env.WEATHER_QUERY || "hurricane sandy 2012 new jersey news";
const MIN_VIEWS = 1000;
const SEARCH_URL = "https://www.bing.com/videos/search?q=" + encodeURIComponent(QUERY);

function parseViews(text) {
  const m = String(text || "").match(/(\d[\d,.]*)\s*([KMB])?\s*views?\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * ({ K: 1e3, M: 1e6, B: 1e9 }[(m[2] || "").toUpperCase()] || 1)) : null;
}

function decode(raw) {
  let s = String(raw || "");
  for (let i = 0; i < 5; i++) {
    const old = s;
    s = s.replace(/&quot;|&#34;/gi, '"').replace(/&amp;|&#38;/gi, "&")
      .replace(/&#39;|&apos;/gi, "'").replace(/\\u0026/gi, "&")
      .replace(/\\u003d/gi, "=").replace(/\\u002f/gi, "/")
      .replace(/\\\//g, "/");
    try { s = decodeURIComponent(s); } catch (_) {}
    if (s === old) break;
  }
  return s;
}

function idsFrom(raw) {
  const text = decode(raw);
  const ids = new Set();
  const patterns = [
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?[^\s"'<>]*?[?&]v=([A-Za-z0-9_-]{11})/gi,
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?v=([A-Za-z0-9_-]{11})/gi,
    /youtu\.be\/([A-Za-z0-9_-]{11})/gi,
    /youtube\.com\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/gi,
    /["'](?:videoId|video_id|youtubeId)["']\s*:\s*["']([A-Za-z0-9_-]{11})["']/gi
  ];
  for (const pattern of patterns) {
    for (const m of text.matchAll(pattern)) ids.add(m[1]);
  }
  return [...ids];
}

function relevance(title) {
  const t = String(title || "").toLowerCase();
  const event = /\b(sandy|superstorm)\b/.test(t);
  const place = /\b(new jersey|jersey shore|nj|atlantic city|seaside heights|hoboken|belmar|point pleasant|asbury park|long beach island|lbi)\b/.test(t);
  const weather = /\b(hurricane|superstorm|storm surge|coastal flooding|flooding|evacuation|landfall)\b/.test(t);
  const strict = event && (place || /\b2012\b/.test(t));
  const broad = event || (weather && place);
  return { strict, broad, event, place, weather, category: strict ? "strict" : broad ? "broad-only" : "uncertain" };
}

async function extract(page) {
  return page.evaluate(() => {
    const viewRegex = /\b\d[\d,.]*\s*[KMB]?\s*views?\b/i;
    const nodes = [...document.querySelectorAll(".mc_vtvc.b_canvas")];
    const records = nodes.map((node, index) => {
      const text = (node.innerText || "").trim();
      const titleNode = node.querySelector(".mc_vtvc_title, [class*='title'], a[title]");
      const title = (titleNode?.getAttribute("title") || titleNode?.innerText || node.getAttribute("aria-label") || "").trim();
      const meta = node.querySelector("[mmeta]")?.getAttribute("mmeta") || "";
      const attributes = [];
      for (const element of [node, ...node.querySelectorAll("[mmeta], [vrhdata], [ourl], [href], [data-mmeta]")]) {
        for (const a of element.attributes || []) {
          if (/mmeta|vrhdata|ourl|href|video|media|url|data-id/i.test(a.name)) {
            attributes.push({ name: a.name, value: a.value });
          }
        }
      }
      const labels = [...node.querySelectorAll("*")]
        .filter(el => viewRegex.test((el.innerText || "").trim()) && ![...el.children].some(c => viewRegex.test((c.innerText || "").trim())))
        .map(el => (el.innerText || "").trim().match(viewRegex)?.[0]).filter(Boolean);
      return {
        index, title: title.slice(0, 250), label: labels[0] || text.match(viewRegex)?.[0] || "",
        labelCount: labels.length, primaryMeta: meta, attributes: attributes.slice(0, 50),
        htmlSample: node.outerHTML.slice(0, 25000)
      };
    });
    return { selector: ".mc_vtvc.b_canvas", count: nodes.length, records };
  });
}

function identify(card) {
  let metaObject = null;
  try { metaObject = JSON.parse(decode(card.primaryMeta)); } catch (_) {}
  const metadataUrl = metaObject && typeof metaObject === "object"
    ? [metaObject.murl, metaObject.purl, metaObject.mediaUrl, metaObject.contentUrl].filter(x => typeof x === "string")
    : [];
  const direct = [...new Set(metadataUrl.flatMap(idsFrom))];
  const metaIds = idsFrom(card.primaryMeta);
  const other = [...new Set(card.attributes.flatMap(a => idsFrom(a.value)).concat(idsFrom(card.htmlSample)))];
  const candidates = [...new Set([...direct, ...metaIds, ...other])];
  let id = null;
  let evidence = "none";
  if (direct.length === 1) { id = direct[0]; evidence = "metadata-url"; }
  else if (direct.length === 0 && metaIds.length === 1) { id = metaIds[0]; evidence = "metadata-text"; }
  else if (direct.length === 0 && metaIds.length === 0 && other.length === 1) { id = other[0]; evidence = "card-attribute"; }
  return { id, evidence, candidates, ambiguous: !id && candidates.length > 1 };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
    console.log("WEATHER TIME MACHINE — ENGINE 3 / TEST #19 — ID + RELEVANCE AUDIT");
    console.log("QUERY:", QUERY);
    console.log("MINIMUM VIEWS:", MIN_VIEWS);
    console.log("SEARCH URL:", SEARCH_URL);
    const response = await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(5000);
    console.log("HTTP STATUS:", response?.status());
    console.log("PAGE TITLE:", await page.title());
    if (!response || response.status() !== 200) throw new Error("Bing did not return HTTP 200");

    const data = await extract(page);
    const rows = data.records.map(card => {
      const identity = identify(card);
      return { index: card.index, title: card.title, views: parseViews(card.label), label: card.label,
        ...identity, relevance: relevance(card.title), youtubeUrl: identity.id ? "https://www.youtube.com/watch?v=" + identity.id : null };
    });
    const withViews = rows.filter(r => r.views !== null);
    const qualifying = withViews.filter(r => r.views >= MIN_VIEWS);
    const broad = qualifying.filter(r => r.relevance.broad);
    const strict = broad.filter(r => r.relevance.strict);
    const unique = new Map();
    for (const row of broad) if (row.id && !unique.has(row.id)) unique.set(row.id, row);
    const duplicates = broad.filter(row => row.id && unique.get(row.id) !== row);
    const unresolved = broad.filter(row => !row.id);
    const uncertain = qualifying.filter(row => !row.relevance.broad);

    console.log("\nDIAGNOSTIC SUMMARY");
    console.log("SELECTOR USED:", data.selector);
    console.log("INDIVIDUAL BING CARD NODES:", data.count);
    console.log("CARDS WITH VIEW LABELS:", withViews.length);
    console.log("CARDS WITH 1000+ VIEWS:", qualifying.length);
    console.log("STRICT MATCHES WITH 1000+ VIEWS:", strict.length);
    console.log("BROAD MATCHES WITH 1000+ VIEWS:", broad.length);
    console.log("DISTINCT BROAD-MATCH YOUTUBE ID CANDIDATES:", unique.size);
    console.log("DUPLICATE BROAD-MATCH IDS:", duplicates.length);
    console.log("UNRESOLVED BROAD MATCHES WITH 1000+ VIEWS:", unresolved.length);
    console.log("UNCERTAIN OR UNRELATED CARDS WITH 1000+ VIEWS:", uncertain.length);
    console.log("\nUNIQUE CANDIDATES:", JSON.stringify([...unique.values()], null, 2));
    console.log("\nDUPLICATE RECORDS:", JSON.stringify(duplicates, null, 2));
    console.log("\nUNRESOLVED RECORDS:", JSON.stringify(unresolved, null, 2));
    console.log("\nUNCERTAIN / UNRELATED RECORDS:", JSON.stringify(uncertain, null, 2));
    console.log("\nCARDS WITHOUT VIEW COUNTS:", JSON.stringify(rows.filter(r => r.views === null), null, 2));
    console.log("\nFINAL STATUS");
    console.log("TEST #19 DIAGNOSTIC COMPLETED — NO A-F GRADES GENERATED.");
    console.log("FINAL GRADING STATUS: BLOCKED — YouTube availability, video identity, and event relevance not independently confirmed.");
    console.log("NOTE: Green GitHub status confirms only that this diagnostic ran.");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error("ENGINE 3 TEST #19 ERROR:", error);
  process.exitCode = 1;
});
