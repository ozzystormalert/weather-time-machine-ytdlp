
const { chromium } = require("playwright");

async function main() {
  const query = "blizzard of 1978 illinois";
  const url = "https://www.dogpile.com/search?q=" +
    encodeURIComponent(query) + "&qc=video";

  console.log("ENGINE 3 - DOGPILE BROWSER TEST");
  console.log("Search:", url);

  const browser = await chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 }
    });

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    await page.waitForTimeout(5000);

    const result = await page.evaluate(() => {
      const text = document.body.innerText;
      const matches = [...text.matchAll(
        /\b(\d[\d,.]*\s*[KMB]?)\s+views?\b/gi
      )];

      return {
        title: document.title,
        viewCounts: matches.map(m => m[1]),
        pageLength: text.length,
        sample: text.slice(0, 1000)
      };
    });

    console.log("PAGE TITLE:", result.title);
    console.log("PAGE LENGTH:", result.pageLength);
    console.log("VIEW COUNTS:", result.viewCounts);
    console.log("SAMPLE:", result.sample);

    const qualifying = result.viewCounts.filter(value => {
      const clean = value.replace(/,/g, "").trim();
      const number = parseFloat(clean);
      const suffix = clean.slice(-1).toUpperCase();
      const multiplier =
        suffix === "K" ? 1000 :
        suffix === "M" ? 1000000 :
        suffix === "B" ? 1000000000 : 1;

      return number * multiplier >= 1000;
    });

    console.log("VIDEOS WITH 1,000+ VIEWS:",
      qualifying.length);

    if (result.viewCounts.length === 0) {
      console.log("TEST INCONCLUSIVE: No view counts found.");
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error("TEST ERROR:", error.message);
  process.exitCode = 1;
});
