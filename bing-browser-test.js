

const { chromium } = require("playwright");

const query = "blizzard 1978 illinois news";
const url =
  "https://www.bing.com/videos/search?q=" +
  encodeURIComponent(query);

function parseViews(value) {
  const match = value.match(
    /([\d,.]+)\s*([KMB])?\s*views?/i
  );

  if (!match) return null;

  const number = Number(match[1].replace(/,/g, ""));
  const multiplier = {
    K: 1000,
    M: 1000000,
    B: 1000000000
  };

  return Math.round(
    number * (multiplier[match[2]?.toUpperCase()] || 1)
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

    console.log("ENGINE 3 - BING BROWSER TEST");
    console.log("SEARCH:", url);

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    await page.waitForTimeout(6000);

    console.log("HTTP STATUS:", response?.status());
    console.log("PAGE TITLE:", await page.title());
    console.log("FINAL URL:", page.url());

    const body = await page.locator("body").innerText();

    console.log("PAGE LENGTH:", body.length);
    console.log("SAMPLE:", body.slice(0, 3000));

    const viewMatches = [
      ...body.matchAll(
        /[\d,.]+\s*[KMB]?\s*views?/gi
      )
    ].map(match => match[0]);

    console.log("VIEW COUNT LABELS:", viewMatches);

    const parsed = viewMatches
      .map(parseViews)
      .filter(value => value !== null);

    console.log(
      "VIEW COUNTS 1000+:",
      parsed.filter(value => value >= 1000).length
    );

    console.log(
      "NOTE: Counts are preliminary text matches, not yet deduplicated videos."
    );

    if (viewMatches.length === 0) {
      console.log(
        "TEST INCONCLUSIVE: No video view counts detected."
      );
      process.exitCode = 1;
    } else {
      console.log(
        "TEST PASSED: Bing returned view-count labels."
      );
    }
  } catch (error) {
    console.error("TEST ERROR:", error.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
