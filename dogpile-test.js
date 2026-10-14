
const url = "https://www.dogpile.com/search?q=blizzard+of+1978+illinois&qc=video";

async function testDogpile() {
  console.log("ENGINE 3 — DOGPILE VIDEO TEST");
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

    const views = [
      ...html.matchAll(/([\d,.]+)\s*([KMB])?\s*views/gi)
    ];

    console.log("VIEW COUNT MATCHES:", views.length);
    console.log(
      "SAMPLE VIEW COUNTS:",
      views.slice(0, 15).map(x => x[0])
    );

    if (!response.ok) {
      console.log("RESULT: HTTP ACCESS FAILED");
      process.exitCode = 1;
    } else if (views.length === 0) {
      console.log("RESULT: NO VIEW COUNTS FOUND");
      console.log("Page may require JavaScript rendering.");
      process.exitCode = 1;
    } else {
      console.log("RESULT: VIEW COUNTS DETECTED");
    }
  } catch (error) {
    console.error("TEST FAILED:", error.message);
    process.exitCode = 1;
  }
}

testDogpile();
