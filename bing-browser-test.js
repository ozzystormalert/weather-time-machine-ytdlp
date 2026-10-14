
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

  const number = Number(match[1].replace(/,/g, ""));
  const scale = {
    K: 1000,
    M: 1000000,
    B: 1000000000
  };

  return Number.isFinite(number)
    ? Math.round(
        number *
        (scale[(match[2] || "").toUpperCase()] || 1)
      )
    : null;
}

function decodeText(value) {
  let text = String(value || "");

  for (let i = 0; i < 4; i++) {
    const previous = text;

    text = text
      .replace(/&quot;|&#34;/gi, '"')
      .replace(/&amp;|&#38;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\\u0026/gi, "&")
      .replace(/\\u003d/gi, "=")
      .replace(/\\u002f/gi, "/")
      .replace(/\\\//g, "/")
      .replace(/%3A/gi, ":")
      .replace(/%2F/gi, "/")
      .replace(/%3F/gi, "?")
      .replace(/%3D/gi, "=")
      .replace(/%26/gi, "&");

    if (text === previous) break;
  }

  return text;
}

function extractYouTubeId(raw) {
  if (!raw) return "";

  const text = decodeText(raw);

  const patterns = [
    /(?:youtube\.com\/watch\?[^"'\s<>]*?\bv=)([A-Za-z0-9_-]{11})/i,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/i,
    /(?:youtube\.com\/(?:embed|shorts|live)\/)([A-Za-z0-9_-]{11})/i,
    /(?:youtube\.com%2Fwatch%3Fv%3D)([A-Za-z0-9_-]{11})/i,
    /["'](?:videoId|video_id|youtubeId)["']\s*:\s*["']([A-Za-z0-9_-]{11})["']/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && ID_PATTERN.test(match[1])) {
      return match[1];
    }
  }

  try {
    const url = new URL(text);

    if (
      url.hostname === "youtube.com" ||
      url.hostname.endsWith(".youtube.com")
    ) {
      const id = url.searchParams.get("v");
      if (id && ID_PATTERN.test(id)) return id;
    }

    if (
      url.hostname === "youtu.be" ||
      url.hostname === "www.youtu.be"
    ) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      if (id && ID_PATTERN.test(id)) return id;
    }
  } catch {
    // Metadata may not be a standalone URL.
  }

  return "";
}

function youtubeUrl(id) {
  return "https://www.youtube.com/watch?v=" + id;
}

async function extractCards(page) {
  return page.evaluate(() => {
    const VIEW_PATTERN =
      /\b\d[\d,.]*\s*[KMB]?\s*views?\b/i;

    const labels = [...document.querySelectorAll("*")]
      .filter(element => {
        const text = (element.innerText || "").trim();

        if (!VIEW_PATTERN.test(text)) return false;
        if (text.length > 100) return false;

        return ![...element.children].some(child =>
          VIEW_PATTERN.test((child.innerText || "").trim())
        );
      });

    const cards = [];

    for (const label of labels) {
      let node = label;
      let card = null;

      for (let depth = 0; depth < 12 && node; depth++) {
        const text = (node.innerText || "").trim();

        if (text.length > 15000) break;

        const html = node.outerHTML || "";

        const hasMetadata =
          /mmeta|vrhdata|mediaUrl|contentUrl|youtube\.com|youtu\.be|riverview/i
            .test(html);

        const hasTitle =
          !!node.querySelector(
            ".mc_vtvc_title, [class*='title'], a[title]"
          );

        if (hasMetadata && hasTitle) {
          card = node;
          break;
        }

        node = node.parentElement;
      }

      if (!card) {
        node = label.parentElement;

        for (let depth = 0; depth < 8 && node; depth++) {
          if (
            node.querySelector("a[href]") &&
            (node.innerText || "").length < 12000
          ) {
            card = node;
            break;
          }
          node = node.parentElement;
        }
      }

      const links = card
        ? [...card.querySelectorAll("a[href]")]
        : [];

      const titleElement = card?.querySelector(
        ".mc_vtvc_title, [class*='title']"
      );

      const title =
        titleElement?.getAttribute("title") ||
        titleElement?.innerText ||
        links[0]?.getAttribute("title") ||
        links[0]?.innerText ||
        "";

      const metadata = [];

      if (card) {
        const elements = [
          card,
          ...card.querySelectorAll("*")
        ];

        for (const element of elements) {
          for (const attribute of element.attributes || []) {
            const name = attribute.name.toLowerCase();

            if (
              /mmeta|vrhdata|video|media|url|href|data-id/.test(name)
            ) {
              metadata.push(attribute.value);
            }
          }
        }
      }

      cards.push({
        label: (label.innerText || "").trim(),
        title: title.trim().slice(0, 250),
        links: links.map(link => link.href).slice(0, 20),
        metadata: metadata.slice(0, 100),
        html: (card?.outerHTML || "").slice(0, 30000)
      });
    }

    return {
      labelCount: labels.length,
      cards
    };
  });
}

function resolveVideo(card) {
  const candidates = [
    ...card.metadata,
    ...card.links
  ];

  // Prefer a YouTube ID explicitly present in the
  // video's own metadata or link.
  for (const candidate of candidates) {
    const id = extractYouTubeId(candidate);

    if (id) {
      return {
        videoId: id,
        url: youtubeUrl(id),
        source: "metadata-or-link"
      };
    }
  }

  // A card may contain a YouTube URL only in its HTML.
  const id = extractYouTubeId(card.html);

  if (id) {
    return {
      videoId: id,
      url: youtubeUrl(id),
      source: "card-html"
    };
  }

  return null;
}

(async () => {
  const browser = await chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      locale: "en-US"
    });

    console.log("==================================");
    console.log("WEATHER TIME MACHINE - ENGINE 3");
    console.log("BING VERIFIED VIDEO ID TEST");
    console.log("==================================");
    console.log("QUERY:", QUERY);
    console.log("MINIMUM VIEWS:", MIN_VIEWS);
    console.log("SEARCH URL:", SEARCH_URL);

    const response = await page.goto(SEARCH_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    await page.waitForTimeout(5000);

    console.log("HTTP STATUS:", response?.status());
    console.log("PAGE TITLE:", await page.title());

    if (!response || response.status() !== 200) {
      throw new Error("Bing search did not return HTTP 200.");
    }

    const extracted = await extractCards(page);

    const unique = new Map();
    const unresolved = [];

    for (const card of extracted.cards) {
      const views = parseViews(card.label);

      if (views === null) continue;

      const identity = resolveVideo(card);

      if (!identity) {
        unresolved.push({
          title: card.title,
          label: card.label,
          views,
          sampleLink: card.links[0] || ""
        });
        continue;
      }

      const video = {
        title: card.title,
        videoId: identity.videoId,
        url: identity.url,
        views,
        label: card.label,
        source: identity.source
      };

      const previous = unique.get(video.videoId);

      if (!previous || video.views > previous.views) {
        unique.set(video.videoId, video);
      }
    }

    const videos = [...unique.values()];
    const qualifying = videos.filter(
      video => video.views >= MIN_VIEWS
    );

    const unresolvedQualifying = unresolved.filter(
      item => item.views >= MIN_VIEWS
    );

    console.log("==================================");
    console.log("VERIFICATION RESULTS");
    console.log("==================================");

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
      JSON.stringify(qualifying, null, 2)
    );

    console.log(
      "UNRESOLVED VIDEOS:",
      JSON.stringify(unresolved.slice(0, 20), null, 2)
    );

    console.log("==================================");
    console.log("FINAL STATUS");
    console.log("==================================");

    if (extracted.labelCount === 0) {
      console.log(
        "INCONCLUSIVE: No Bing view labels found."
      );
      process.exitCode = 1;
    } else if (videos.length === 0) {
      console.log(
        "INCONCLUSIVE: No YouTube IDs verified."
      );
      process.exitCode = 1;
    } else if (unresolvedQualifying.length > 0) {
      console.log(
        "PARTIAL: Some qualifying labels lack verified IDs."
      );
      console.log(
        "Do not enable final grading yet."
      );
      process.exitCode = 1;
    } else {
      console.log(
        "TEST PASSED: All qualifying labels have verified YouTube IDs."
      );
      console.log(
        "Review URLs and counts before enabling grading."
      );
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error("ENGINE 3 ERROR:", error);
  process.exitCode = 1;
});
