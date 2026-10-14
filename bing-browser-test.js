
"use strict";

const { chromium } = require("playwright");

// WEATHER TIME MACHINE — ENGINE 3 — TEST #18
// Diagnostic only. Does not change Blogger, Engines 1/2, or grades.
const QUERY = process.env.WEATHER_QUERY || "hurricane sandy 2012 new jersey news";
const MIN_VIEWS = 1000;
const SEARCH_URL = "https://www.bing.com/videos/search?q=" + encodeURIComponent(QUERY);

function parseViews(text) {
  const match = String(text || "").match(/(\d[\d,.]*)\s*([KMB])?\s*views?\b/i);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * ({ K: 1e3, M: 1e6, B: 1e9 }[(match[2] || "").toUpperCase()] || 1)) : null;
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
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?[^\s"'<>]*?\bv=([A-Za-z0-9_-]{11})/gi,
    /youtu\.be\/([A-Za-z0-9_-]{11})/gi,
    /youtube\.com\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/gi,
    /["'](?:videoId|video_id|youtubeId)["']\s*:\s*["']([A-Za-z0-9_-]{11})["']/gi
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) ids.add(match[1]);
  }
  return [...ids];
}

function relevance(title, query) {
  const t = String(title || "").toLowerCase();
  const q = query.toLowerCase();
  const storm = /\b(hurricane|sandy|superstorm|storm surge|coastal flooding|flooding|evacuation|landfall)\b/.test(t);
  const location = /\b(new jersey|jersey shore|nj|atlantic city|seaside heights|hoboken|belmar|point pleasant|asbury park|long beach island|lbi)\b/.test(t);
  const event = /\b(sandy|superstorm)\b/.test(t);
  const strict = event && (location || /\b2012\b/.test(t));
  const broad = event || (storm && location);
  const queryTerms = q.split(/\W+/).filter(x => x.length >= 5 && !["hurricane", "jersey", "news"].includes(x));
  return { strict, broad, storm, location, event, queryMatches: queryTerms.filter(x => t.includes(x)) };
}

async function extract(page) {
  return page.evaluate(() => {
    const viewRegex = /\b\d[\d,.]*\s*[KMB]?\s*views?\b/i;
    const nodes = [...document.querySelectorAll(".mc_vtvc.b_canvas")];
    const records = nodes.map((node, index) => {
      const text = (node.innerText || "").trim();
      const titleNode = node.querySelector(".mc_vtvc_title, [class*='title'], a[title]");
      const metaNode = node.querySelector("[mmeta]") || node;
      const title = (titleNode?.getAttribute("title") || titleNode?.innerText || node.getAttribute("aria-label") || "").trim();
      const allAttributes = [];
      for (const element of [node, ...node.querySelectorAll("[mmeta], [vrhdata], [ourl], [href], [data-mmeta]")]) {
        for (const a of element.attributes || []) {
          if (/mmeta|vrhdata|ourl|href|video|media|url|data-id/i.test(a.name)) allAttributes.push({ name: a.name, value: a.value });
        }
      }
      const labels = [...node.querySelectorAll("*")]
        .filter(el => viewRegex.test((el.innerText || "").trim()) && ![...el.children].some(c => viewRegex.test((c.innerText || "").trim())))
        .map(el => (el.innerText || "").trim().match(viewRegex)?.[0]).filter(Boolean);
      const label = labels[0] || text.match(viewRegex)?.[0] || "";
      return {
        index, title: title.slice(0, 250), label,
        labelCount: labels.length, textSample: text.slice(0, 300),
        attributes: allAttributes.slice(0, 35),
        htmlSample: node.outerHTML.slice(0, 20000),
        primaryMeta: metaNode.getAttribute("mmeta") || ""
      };
    });
    return { selector: ".mc_vtvc.b_canvas", count: nodes.length, records };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
    console.log("WEATHER TIME MACHINE — ENGINE 3 / TEST #18 — RELEVANCE + ID DIAGNOSTIC");
    console.log("QUERY:", QUERY);
    console.log("MINIMUM VIEWS:", MIN_VIEWS);
    console.log("SEARCH URL:", SEARCH_URL);
    const response = await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(5000);
    console.log("HTTP STATUS:", response?.status());
    console.log("PAGE TITLE:", await page.title());
    if (!response || response.status() !== 200) throw new Error("Bing did not return HTTP 200");

    const data = await extract(page);
    const results = data.records.map(card => {
      const primaryIds = idsFrom(card.primaryMeta);
      const attributeIds = [...new Set(card.attributes.flatMap(a => idsFrom(a.value)))];
      const htmlIds = idsFrom(card.htmlSample);
      const candidates = [...new Set([...primaryIds, ...attributeIds, ...htmlIds])];
      const id = primaryIds.length === 1 ? primaryIds[0] : (candidates.length === 1 ? candidates[0] : null);
      const views = parseViews(card.label);
      return {
        index: card.index, title: card.title, label: card.label, views,
        id, idStatus: id ? "candidate" : (candidates.length > 1 ? "ambiguous" : "missing"),
        candidateIds: candidates, relevance: relevance(card.title, QUERY),
        labelCount: card.labelCount, textSample: card.textSample
      };
    });
    const withViews = results.filter(r => r.views !== null);
    const broad = withViews.filter(r => r.relevance.broad);
    const strict = withViews.filter(r => r.relevance.strict);
    const broadQualifying = broad.filter(r => r.views >= MIN_VIEWS);
    const uniqueBroad = new Map();
    for (const r of broadQualifying) if (r.id && !uniqueBroad.has(r.id)) uniqueBroad.set(r.id, r);
    const duplicates = broadQualifying.filter(r => r.id && uniqueBroad.get(r.id) !== r);
    const unresolved = broadQualifying.filter(r => !r.id);

    console.log("\nDIAGNOSTIC SUMMARY");
    console.log("SELECTOR USED:", data.selector);
    console.log("INDIVIDUAL BING CARD NODES:", data.count);
    console.log("CARDS WITH VIEW LABELS:", withViews.length);
    console.log("STRICT EVENT/LOCATION MATCHES:", strict.length);
    console.log("BROAD EVENT/LOCATION MATCHES:", broad.length);
    console.log("BROAD MATCHES WITH 1000+ VIEWS:", broadQualifying.length);
    console.log("DISTINCT BROAD-MATCH YOUTUBE ID CANDIDATES:", uniqueBroad.size);
    console.log("DUPLICATE BROAD-MATCH IDS:", duplicates.length);
    console.log("UNRESOLVED BROAD MATCHES WITH 1000+ VIEWS:", unresolved.length);
    console.log("UNRELATED OR UNCERTAIN CARDS WITH VIEWS:", withViews.length - broad.length);
    console.log("\nBROAD-MATCH CANDIDATES:", JSON.stringify(broadQualifying, null, 2));
    console.log("\nUNRELATED / UNCERTAIN TITLES:", JSON.stringify(withViews.filter(r => !r.relevance.broad), null, 2));
    console.log("\nCARDS WITHOUT VIEW LABELS:", JSON.stringify(results.filter(r => r.views === null), null, 2));
    console.log("\nDUPLICATES:", JSON.stringify(duplicates, null, 2));
    console.log("\nUNRESOLVED QUALIFYING CARDS:", JSON.stringify(unresolved, null, 2));
    console.log("\nFINAL STATUS");
    console.log("TEST #18 DIAGNOSTIC COMPLETED — NO A–F GRADES GENERATED.");
    console.log("FINAL GRADING STATUS: BLOCKED — IDs and relevance are candidates, not independently verified.");
    console.log("NOTE: This diagnostic intentionally exits successfully if the browser test completes; green GitHub status does not mean grading is approved.");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error("ENGINE 3 TEST #18 ERROR:", error);
  process.exitCode = 1;
});
