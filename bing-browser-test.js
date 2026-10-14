
const { chromium } = require("playwright");

const query = "blizzard 1978 illinois news";
const url = "https://www.bing.com/videos/search?q=" +
  encodeURIComponent(query);

function parseViews(text) {
  const match = String(text).match(
    /([\d,.]+)\s*([KMB])?\s*views?\b/i
  );
  if (!match) return null;

  const number = Number(match[1].replace(/,/g, ""));
  const multipliers = {
    K: 1000,
    M: 1000000,
    B: 1000000000
  };

  return Math.round(
    number * (multipliers[(match[2] || "").toUpperCase()] || 1)
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      locale: "en-US"
    });

    console.log("ENGINE 3 - BING VIDEO EXTRACTION");
    console.log("QUERY:", query);

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    await page.waitForTimeout(5000);

    console.log("HTTP STATUS:", response?.status());
    console.log("PAGE TITLE:", await page.title());

    const data = await page.evaluate(() => {
      const pattern = /[\d,.]+\s*[KMB]?\s*views?\b/i;

      const matches = [...document.querySelectorAll("*")]
        .filter(el => {
          const text = (el.innerText || "").trim();
          if (!pattern.test(text)) return false;

          return ![...el.children].some(child =>
            pattern.test((child.innerText || "").trim())
          );
        });

      const results = matches.map(el => {
        let node = el;
        let anchor = null;

        for (let depth = 0; depth < 7 && node; depth++) {
          if (node.matches?.("a[href]")) {
            anchor = node;
            break;
          }

          const links = [...node.querySelectorAll("a[href]")];

          if (links.length > 0) {
            anchor = links.find(a =>
              /youtube|youtu\.be|bing\.com\/videos/i.test(a.href)
            ) || links[0];
            break;
          }

          node = node.parentElement;
        }

        return {
          label: (el.innerText || "").trim(),
          title: (
            anchor?.innerText ||
            anchor?.getAttribute("title") ||
            ""
          ).trim().slice(0, 180),
          url: anchor?.href || "",
          html: el.outerHTML.slice(0, 500)
        };
      });

      return {
        totalLabels: matches.length,
        results
      };
    });

    console.log("VIEW LABELS FOUND:", data.totalLabels);

    const unique = new Map();

    for (const result of data.results) {
      const views = parseViews(result.label);
      if (views === null) continue;

      if (!result.url) {
        console.log("UNLINKED LABEL:", result.label);
        continue;
      }

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
    const qualified = videos.filter(v => v.views >= 1000);

    console.log("LINKED UNIQUE RESULTS:", videos.length);
    console.log("VIDEOS WITH 1000+ VIEWS:", qualified.length);
    console.log(
      "QUALIFYING VIDEOS:",
      JSON.stringify(qualified, null, 2)
    );

    console.log(
      "ALL VIEW LABELS:",
      JSON.stringify(data.results.map(r => ({
        label: r.label,
        url: r.url
      })), null, 2)
    );

    if (data.totalLabels === 0) {
      console.log("INCONCLUSIVE: No view labels found.");
      process.exitCode = 1;
    } else {
      console.log("DIAGNOSTIC EXTRACTION COMPLETED.");
    }

  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
