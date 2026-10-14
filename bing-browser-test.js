
"use strict";

const { chromium } = require("playwright");

const QUERY = process.env.WEATHER_QUERY ||
  "blizzard 1978 illinois news";

const MIN_VIEWS = 1000;

const SEARCH_URL =
  "https://www.bing.com/videos/search?q=" +
  encodeURIComponent(QUERY);

function parseViews(value) {
  const match = String(value || "").match(
    /(\d[\d,.]*)\s*([KMB])?\s*views?\b/i
  );

  if (!match) return null;

  const number = Number(match[1].replace(/,/g, ""));

  if (!Number.isFinite(number)) return null;

  const multiplier = {
    K: 1000,
    M: 1000000,
    B: 1000000000
  };

  return Math.round(
    number *
    (multiplier[(match[2] || "").toUpperCase()] || 1)
  );
}

function normalizeUrl(raw) {
  if (!raw) return "";

  try {
    const url = new URL(raw);

    url.hash = "";

    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v");

      if (id) {
        return "https://www.youtube.com/watch?v=" + id;
      }
    }

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0];

      if (id) {
        return "https://www.youtube.com/watch?v=" + id;
      }
    }

    return url.toString();
  } catch {
    return "";
  }
}

function videoIdentity(video) {
  if (video.videoId) {
    return "video:" + video.videoId;
  }

  return "url:" + normalizeUrl(video.url);
}

async function extractVideos(page) {
  return page.evaluate(() => {
    const VIEW_PATTERN =
      /\b\d[\d,.]*\s*[KMB]?\s*views?\b/i;

    const VIDEO_LINK_PATTERN =
      /youtube\.com|youtu\.be|bing\.com\/videos/i;

    const cards = [];
    const seen = new Set();

    const labels = [...document.querySelectorAll("*")]
      .filter(element => {
        const text = (element.innerText || "").trim();

        if (!VIEW_PATTERN.test(text)) return false;
        if (text.length > 100) return false;

        return ![...element.children].some(child => {
          const childText = (child.innerText || "").trim();

          return VIEW_PATTERN.test(childText);
        });
      });

    function getLink(node) {
      if (!node) return null;

      if (node.matches?.("a[href]")) return node;

      const links = [...node.querySelectorAll("a[href]")];

      return links.find(link =>
        VIDEO_LINK_PATTERN.test(link.href)
      ) || links[0] || null;
    }

    function getMetadata(node) {
      const candidates = [
        node,
        node?.parentElement,
        node?.parentElement?.parentElement
      ].filter(Boolean);

      for (const candidate of candidates) {
        const elements = [
          candidate,
          ...candidate.querySelectorAll("*")
        ];

        for (const element of elements) {
          const attributes = [
            "mmeta",
            "data-mmeta",
            "data-videoid",
            "data-id",
            "data-url",
            "data-href",
            "href"
          ];

          for (const name of attributes) {
            const value = element.getAttribute?.(name);

            if (!value) continue;

            if (
              name === "data-videoid" ||
              name === "data-id"
            ) {
              return {
                videoId: value,
                metadata: value
              };
            }

            if (
              VIDEO_LINK_PATTERN.test(value) ||
              value.includes("mediaUrl") ||
              value.includes("contentUrl")
            ) {
              return {
                videoId: "",
                metadata: value.slice(0, 3000)
              };
            }
          }
        }
      }

      return {
        videoId: "",
        metadata: ""
      };
    }

    for (const label of labels) {
      const viewText = (label.innerText || "").trim();

      let current = label;
      let selected = null;
      let selectedLink = null;

      for (let depth = 0; depth < 10 && current; depth++) {
        const text = (current.innerText || "").trim();

        if (text.length > 12000) break;

        const link = getLink(current);

        if (link) {
          selected = current;
          selectedLink = link;
          break;
        }

        current = current.parentElement;
      }

      const metadata = getMetadata(selected || label);

      const cardText = (
        selected?.innerText ||
        label.parentElement?.innerText ||
        viewText
      ).trim();

      const title = (
        selectedLink?.getAttribute("title") ||
        selectedLink?.innerText ||
        cardText.split("\n").find(line =>
          line.trim() &&
          !VIEW_PATTERN.test(line)
        ) ||
        ""
      ).trim().slice(0, 200);

      let linkUrl = selectedLink?.href || "";

      if (!linkUrl && metadata.metadata) {
        const match = metadata.metadata.match(
          /https?:\/\/[^\s"'<>\\]+/i
        );

        if (match) {
          linkUrl = match[0]
            .replace(/\\u0026/g, "&")
            .replace(/&amp;/g, "&");
        }
      }

      const record = {
        label: viewText,
        title,
        url: linkUrl,
        videoId: metadata.videoId,
        metadata: metadata.metadata.slice(0, 500),
        cardText: cardText.slice(0, 600),
        html: (
          selected?.outerHTML ||
          label.parentElement?.outerHTML ||
          label.outerHTML
        ).slice(0, 2500)
      };

      const key =
        record.videoId ||
        record.url ||
        record.label + "|" + cards.length;

      if (!seen.has(key)) {
        seen.add(key);
        cards.push(record);
      }
    }

    return {
      labelCount: labels.length,
      cards
    };
  });
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

    console.log("====================================");
    console.log("WEATHER TIME MACHINE - ENGINE 3");
    console.log("BING VIDEO AUDIT");
    console.log("====================================");

    console.log("SEARCH QUERY:", QUERY);
    console.log("MINIMUM VIEWS:", MIN_VIEWS);
    console.log("SEARCH URL:", SEARCH_URL);

    const response = await page.goto(SEARCH_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    await page.waitForTimeout(5000);

    console.log("HTTP STATUS:", response?.status());
    console.log("PAGE TITLE:", await page.title());

    const extracted = await extractVideos(page);

    console.log(
      "VIEW LABELS FOUND:",
      extracted.labelCount
    );

    console.log(
      "CANDIDATE VIDEO RECORDS:",
      extracted.cards.length
    );

    const unique = new Map();
    const unlinked = [];

    for (const record of extracted.cards) {
      const views = parseViews(record.label);

      if (views === null) continue;

      const url = normalizeUrl(record.url);

      if (!url && !record.videoId) {
        unlinked.push({
          label: record.label,
          title: record.title,
          cardText: record.cardText
        });

        continue;
      }

      const video = {
        title: record.title,
        url,
        videoId: record.videoId,
        views,
        label: record.label
      };

      const key = videoIdentity(video);

      if (!unique.has(key)) {
        unique.set(key, video);
      } else {
        const existing = unique.get(key);

        if (views > existing.views) {
          unique.set(key, video);
        }
      }
    }

    const videos = [...unique.values()];

    const qualifying = videos.filter(
      video => video.views >= MIN_VIEWS
    );

    console.log("====================================");
    console.log("EXTRACTION RESULTS");
    console.log("====================================");

    console.log(
      "UNIQUE LINKED VIDEOS:",
      videos.length
    );

    console.log(
      "VIDEOS WITH 1000+ VIEWS:",
      qualifying.length
    );

    console.log(
      "UNLINKED VIEW LABELS:",
      unlinked.length
    );

    console.log(
      "QUALIFYING VIDEOS:",
      JSON.stringify(qualifying, null, 2)
    );

    console.log(
      "UNLINKED LABELS:",
      JSON.stringify(unlinked.slice(0, 20), null, 2)
    );

    console.log("====================================");
    console.log("HTML DIAGNOSTICS");
    console.log("====================================");

    for (let i = 0; i < Math.min(3, extracted.cards.length); i++) {
      const record = extracted.cards[i];

      console.log("CARD NUMBER:", i + 1);
      console.log("VIEW LABEL:", record.label);
      console.log("TITLE:", record.title);
      console.log("URL:", record.url);
      console.log("METADATA:", record.metadata);
      console.log("HTML:", record.html);
    }

    console.log("====================================");
    console.log("FINAL STATUS");
    console.log("====================================");

    if (extracted.labelCount === 0) {
      console.log(
        "INCONCLUSIVE: Bing returned no view-count labels."
      );
      process.exitCode = 1;
    } else if (videos.length === 0) {
      console.log(
        "PARTIAL SUCCESS: View counts found, but video identities could not be verified."
      );
      console.log(
        "Review HTML DIAGNOSTICS to locate Bing's video metadata."
      );
      process.exitCode = 1;
    } else if (unlinked.length > 0) {
      console.log(
        "PARTIAL SUCCESS: Some view labels remain unlinked."
      );
      console.log(
        "Counts are preliminary; do not assign final grades."
      );
    } else {
      console.log(
        "EXTRACTION COMPLETED: All detected view labels are linked."
      );
      console.log(
        "Review qualifying video URLs before enabling grading."
      );
    }

  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error("ENGINE 3 ERROR:", error);
  process.exitCode = 1;
});
