
const { chromium } = require("playwright");

const query = "blizzard 1978 illinois news";
const url =
  "https://www.bing.com/videos/search?q=" +
  encodeURIComponent(query);

function parseViews(text) {
  const match = String(text).match(
    /([\d,.]+)\s*([KMB])?\s*views?\b/i
  );
  if (!match) return null;

  const value = Number(match[1].replace(/,/g, ""));
  const multiplier = {
    K: 1000,
    M: 1000000,
    B: 1000000000
  };

  return Math.round(
    value * (multiplier[(match[2] || "").toUpperCase()] || 1)
  );
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

    console.log("ENGINE 3 - BING VIDEO COUNT TEST");
    console.log("QUERY:", query);

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    await page.waitForTimeout(4000);

    console.log("HTTP STATUS:", response?.status());
    console.log("PAGE TITLE:", await page.title());

    const results = await page.evaluate(() => {
      const selectors = [
        ".mc_vtvc",
        ".mc_vtvc_con",
        ".vrhdata",
        ".videoItem",
        ".video-item",
        "[data-videoid]"
      ];

      const nodes = [
        ...new Set(
          selectors.flatMap(selector =>
            [...document.querySelectorAll(selector)]
          )
        )
      ];

      return nodes.map(node => {
        const text = (node.innerText || "").trim();
        const anchors = [...node.querySelectorAll("a[href]")];

        const link = anchors.find(a =>
          /youtube\.com|youtu\.be|bing\.com\/videos/i.test(
            a.href
          )
        ) || anchors[0];

        return {
          title: (link?.innerText || text.split("\n")[0] || "")
            .trim()
            .slice(0, 180),
          url: link?.href || "",
          text: text.slice(0, 1200)
        };
      }).filter(item => item.url && /\bviews?\b/i.test(item.text));
    });

    const unique = new Map();

    for (const result of results) {
      const views = parseViews(result.text);
      if (views === null) continue;

      const key = result.url.split("#")[0];

      if (!unique.has(key)) {
        unique.set(key, {
          title: result.title,
          url: result.url,
          views
        });
      }
    }

    const videos = [...unique.values()];
    const qualified = videos.filter(video => video.views >= 1000);

    console.log("RESULT CONTAINERS FOUND:", results.length);
    console.log("UNIQUE VIDEOS WITH VIEW COUNTS:", videos.length);
    console.log("VIDEOS WITH 1000+ VIEWS:", qualified.length);

    console.log(
      "QUALIFYING VIDEOS:",
      JSON.stringify(qualified, null, 2)
    );

    if (videos.length === 0) {
      console.log(
        "INCONCLUSIVE: No video-linked view counts were extracted."
      );
      process.exitCode = 1;
    } else {
      console.log(
        "EXTRACTION TEST COMPLETED. Review links and counts."
      );
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
