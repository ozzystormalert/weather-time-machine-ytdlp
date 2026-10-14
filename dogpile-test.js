
const url = "https://www.dogpile.com/search?q=blizzard+of+1978+illinois&qc=video";

async function testDogpile() {
  console.log("ENGINE 3 — DOGPILE HTML DIAGNOSTIC");
  console.log("Search:", url);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html"
      },
      signal: AbortSignal.timeout(15000)
    });

    const html = await response.text();

    console.log("HTTP STATUS:", response.status);
    console.log("HTML LENGTH:", html.length);

    const checks = [
      "views",
      "youtube",
      "video",
      "blizzard",
      "28.1K",
      "17.0K",
      "load more",
      "captcha"
    ];

    for (const term of checks) {
      const position = html.toLowerCase().indexOf(term.toLowerCase());

      console.log(
        "CHECK:",
        term,
        "FOUND:",
        position >= 0
      );

      if (position >= 0) {
        const sample = html
          .slice(Math.max(0, position - 100), position + 200)
          .replace(/\s+/g, " ");

        console.log("SAMPLE:", sample);
      }
    }

    console.log("DIAGNOSTIC COMPLETE");

    if (!response.ok) {
      process.exitCode = 1;
    }

  } catch (error) {
    console.error("TEST FAILED:", error.message);
    process.exitCode = 1;
  }
}

testDogpile();
