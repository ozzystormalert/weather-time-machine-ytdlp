
"use strict";

// WEATHER TIME MACHINE — ENGINE 3 — TEST #16
// Diagnostic only. Does not change Blogger, other engines, or grades.
const { chromium } = require("playwright");

const QUERY = process.env.WEATHER_QUERY || "joplin tornado 2011 missouri news";
const MIN_VIEWS = 1000;
const SEARCH_URL = "https://www.bing.com/videos/search?q=" + encodeURIComponent(QUERY);
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function parseViews(value) {
  const match = String(value || "").match(/(\d[\d,.]*)\s*([KMB])?\s*views?\b/i);
  if (!match) return null;
  const number = Number(match[1].replace(/,/g, ""));
  const scale = { K: 1000, M: 1000000, B: 1000000000 };
  return Number.isFinite(number)
    ? Math.round(number * (scale[(match[2] || "").toUpperCase()] || 1))
    : null;
}

function decodeText(raw) {
  let value = String(raw || "");
  for (let i = 0; i < 4; i++) {
    const previous = value;
    value = value
      .replace(/&quot;|&#34;/gi, '"')
      .replace(/&amp;|&#38;/gi, "&")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\\u0026/gi, "&")
      .replace(/\\u003d/gi, "=")
      .replace(/\\u002f/gi, "/")
      .replace(/\\\//g, "/");
    try { value = decodeURIComponent(value); } catch { /* Not encoded. */ }
    if (value === previous) break;
  }
  return value;
}

function youtubeIds(raw) {
  const value = decodeText(raw);
  const ids = new Set();
  const patterns = [
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?[^\s"'<>]*?\bv=([A-Za-z0-9_-]{11})/gi,
    /youtu\.be\/([A-Za-z0-9_-]{11})/gi,
    /(?:youtube\.com|youtube-nocookie\.com)\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/gi,
    /["'](?:videoId|video_id|youtubeId)["']\s*:\s*["']([A-Za-z0-9_-]{11})["']/gi
  ];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      if (ID_PATTERN.test(match[1])) ids.add(match[1]);
    }
  }
  return [...ids];
}

function clip(value, length = 250) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, length);
}

async function extractDiagnostics(page) {
  return page.evaluate(() => {
    const viewPattern = /\b\d[\d,.]*\s*[KMB]?\s*views?\b/i;
    const selectors = [
      ".mc_vtvc", ".mc_vtvc_card", ".mc_vtvc_con", "[class*='mc_vtvc']"
    ];
    const candidateNodes = [...new Set(selectors.flatMap(
      selector => [...document.querySelectorAll(selector)]
    ))];
    const nodeIndex = new Map(candidateNodes.map((node, index) => [node, index]));
    const cards = [];
    for (const node of candidateNodes) {
      const text = (node.innerText || "").trim();
      const match = text.match(viewPattern);
      if (!match) continue;
      const titleNode = node.querySelector(".mc_vtvc_title, a[title], [class*='title']");
      const title = titleNode
        ? (titleNode.getAttribute("title") || titleNode.innerText || "").trim()
        : "";
      const attrs = [];
      const attrNames = /mmeta|vrhdata|video|media|url|href|data-id|title/i;
      for (const child of [node, ...node.querySelectorAll("*")]) {
        for (const attr of child.attributes || []) {
          if (attrNames.test(attr.name)) {
            attrs.push({ name: attr.name, value: attr.value.slice(0, 1000) });
          }
        }
      }
      const links = [...node.querySelectorAll("a[href]")].map(a => ({
        href: a.href, title: a.getAttribute("title") || "", text: (a.innerText || "").trim().slice(0, 150)
      }));
      const parentCandidate = candidateNodes.find(other => other !== node && other.contains(node));
      const childCandidates = candidateNodes.filter(other => other !== node && node.contains(other));
      cards.push({
        domIndex: nodeIndex.get(node),
        tag: node.tagName.toLowerCase(),
        className: String(node.className || "").slice(0, 250),
        title: title.slice(0, 250),
        label: match[0],
        textPreview: text.slice(0, 500),
        textLength: text.length,
        linkCount: links.length,
        links: links.slice(0, 12),
        attributes: attrs.slice(0, 30),
        parentCandidateIndex: parentCandidate ? nodeIndex.get(parentCandidate) : null,
        childCandidateCount: childCandidates.length,
        htmlSnippet: node.outerHTML.slice(0, 1800)
      });
    }
    const leafLabels = [...document.querySelectorAll("*")].filter(el => {
      const text = (el.innerText || "").trim();
      return text.length <= 100 && viewPattern.test(text) &&
        ![...el.children].some(child => viewPattern.test((child.innerText || "").trim()));
    }).map(el => ({
      label: (el.innerText || "").trim().slice(0, 100),
      parentClass: String(el.parentElement?.className || "").slice(0, 150),
      ancestorClasses: (() => {
        const result = [];
        let current = el;
        for (let i = 0; i < 5 && current; i++, current = current.parentElement) {
          result.push(String(current.className || "").slice(0, 100));
        }
        return result;
      })()
    }));
    return {
      title: document.title,
      candidateNodeCount: candidateNodes.length,
      leafLabelCount: leafLabels.length,
      leafLabels: leafLabels.slice(0, 30),
      cards
    };
  });
}

function analyze(data) {
  const records = data.cards.map(card => {
    const sources = [
      ...card.links.map(link => link.href),
      ...card.attributes.map(attribute => attribute.value),
      card.htmlSnippet
    ];
    const ids = [...new Set(sources.flatMap(youtubeIds))];
    return {
      domIndex: card.domIndex,
      title: clip(card.title),
      label: card.label,
      views: parseViews(card.label),
      youtubeIdCandidates: ids,
      idStatus: ids.length === 1 ? "ONE_CANDIDATE_NOT_VERIFIED" :
        ids.length > 1 ? "AMBIGUOUS" : "NO_ID",
      parentCandidateIndex: card.parentCandidateIndex,
      childCandidateCount: card.childCandidateCount,
      className: card.className,
      linkCount: card.linkCount,
      links: card.links.slice(0, 3),
      textPreview: clip(card.textPreview, 220)
    };
  });
  const byTitle = new Map();
  for (const record of records) {
    const key = record.title.toLowerCase();
    if (!key) continue;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(record.domIndex);
  }
  const duplicateTitles = [...byTitle.entries()]
    .filter(([, indices]) => indices.length > 1)
    .map(([title, indices]) => ({ title, domIndices: indices }));
  return { records, duplicateTitles };
}

(async () => {
  console.log("WEATHER TIME MACHINE — ENGINE 3 — TEST #16 / RAW CARD DIAGNOSTIC");
  console.log("QUERY:", QUERY);
  console.log("MINIMUM VIEWS:", MIN_VIEWS);
  console.log("SEARCH URL:", SEARCH_URL);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 }, locale: "en-US"
    });
    const response = await page.goto(SEARCH_URL, {
      waitUntil: "domcontentloaded", timeout: 45000
    });
    await page.waitForTimeout(5000);
    console.log("HTTP STATUS:", response?.status());
    console.log("PAGE TITLE:", await page.title());
    if (!response || response.status() !== 200) {
      throw new Error("Bing did not return HTTP 200.");
    }
    const data = await extractDiagnostics(page);
    const { records, duplicateTitles } = analyze(data);
    const nested = records.filter(record =>
      record.parentCandidateIndex !== null || record.childCandidateCount > 0
    );
    const candidateIds = new Set(records.flatMap(record => record.youtubeIdCandidates));
    console.log("\nDIAGNOSTIC SUMMARY");
    console.log("BING CANDIDATE DOM NODES:", data.candidateNodeCount);
    console.log("NODES WITH VIEW LABELS:", records.length);
    console.log("LEAF VIEW LABELS:", data.leafLabelCount);
    console.log("NESTED/OVERLAPPING CANDIDATES:", nested.length);
    console.log("DUPLICATE TITLES:", duplicateTitles.length);
    console.log("DISTINCT YOUTUBE ID CANDIDATES (NOT VERIFIED):", candidateIds.size);
    console.log("NODES WITH 1000+ VIEW LABELS:",
      records.filter(record => record.views !== null && record.views >= MIN_VIEWS).length);
    console.log("\nCARD RECORDS (FIRST 25):", JSON.stringify(records.slice(0, 25), null, 2));
    console.log("\nDUPLICATE TITLE GROUPS:", JSON.stringify(duplicateTitles.slice(0, 20), null, 2));
    console.log("\nLEAF VIEW LABEL SAMPLES:", JSON.stringify(data.leafLabels, null, 2));
    console.log("\nRAW CARD SAMPLES (FIRST 3):", JSON.stringify(data.cards.slice(0, 3), null, 2));
    console.log("\nFINAL STATUS");
    console.log("DIAGNOSTIC COMPLETED — NO A-F GRADES GENERATED.");
    console.log("FINAL GRADING STATUS: BLOCKED — inspect cards, relevance, and IDs.");
    if (!records.length) {
      console.log("WARNING: No candidate video cards with view labels were extracted.");
    }
    console.log("NOTE: HTTP 200 and green GitHub status do not verify video accuracy.");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error("ENGINE 3 TEST #16 ERROR:", error);
  process.exitCode = 1;
});
