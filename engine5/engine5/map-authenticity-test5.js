
'use strict';

/*
 WEATHER TIME MACHINE — ENGINE 5
 TEST 5: HISTORICAL MAP AUTHENTICITY
 CORRECTED EVIDENCE VERIFICATION

 Node.js 22
 No external packages
 No API keys
 Does not modify the live Engine 5 service.

 This test:
 1. Downloads and fingerprints the candidate image.
 2. Downloads the claimed source webpage.
 3. Checks for an explicit source-to-image link.
 4. Downloads an independent historical reference.
 5. Saves evidence for visual inspection.
 6. Tests metadata negative controls.
 7. Refuses to invent historical authenticity.

 A successful execution is not an authenticity grade.
*/

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const net = require('node:net');

const REPORT = 'engine5-test5-results.json';
const EVIDENCE_DIR = 'engine5-test5-evidence';

const MB = 1024 * 1024;

const LIMITS = {
  image: 15 * MB,
  webpage: 5 * MB,
  reference: 25 * MB
};

const args = {};

for (let i = 2; i < process.argv.length; i++) {
  const value = process.argv[i];

  if (value.startsWith('--') && i + 1 < process.argv.length) {
    args[value.slice(2)] = process.argv[++i];
  }
}

const event = String(
  args.event || 'Superstorm Sandy'
).trim();

const state = String(
  args.state || 'New Jersey'
).trim();

const year = String(
  args.year || '2012'
).trim();

const imageURL = String(
  args.image ||
  'https://response.restoration.noaa.gov/download/file/fid/1976'
).trim();

const sourceURL = String(
  args.source ||
  'https://response.restoration.noaa.gov/atlantic-erma-and-sandy-response'
).trim();

const referenceURL = String(
  args.reference ||
  'https://www.nhc.noaa.gov/data/tcr/AL182012_Sandy.pdf'
).trim();

const report = {
  test: 'Engine 5 — Historical Map Authenticity Test 5',
  version: '5.2-corrected',
  timestamp: new Date().toISOString(),

  event,
  state,
  year,

  inputs: {
    imageURL,
    sourceURL,
    referenceURL
  },

  execution: 'pending',
  status: 'not_evaluated',

  score: null,
  grade: null,
  finalGrade: false,

  checks: {},
  negativeControls: {},
  evidenceFiles: [],
  errors: [],
  warnings: [],

  manualReview: {
    imageIsWeatherMap: 'not_verified',
    correctHistoricalEvent: 'not_verified',
    correctGeography: 'not_verified',
    correctDate: 'not_verified',
    originalSourceProvenance: 'not_verified',
    reviewer: null,
    reviewDate: null
  },

  limitations: [
    'File signatures do not establish image subject matter.',
    'Page keyword matches do not establish image provenance.',
    'A government domain alone does not prove image authenticity.',
    'The reference PDF confirms historical context, not automatically the candidate image.',
    'No automated image recognition or documented human visual review is performed.',
    'Negative controls test metadata logic, not actual image classification.',
    'No A–F grade is assigned by Test 5.'
  ]
};

function check(name, status, reason, details = null) {
  report.checks[name] = {
    status,
    reason
  };

  if (details !== null) {
    report.checks[name].details = details;
  }
}

function sha256(buffer) {
  return crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex');
}

function detectFormat(buffer) {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
  ) {
    return 'PNG';
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 255 &&
    buffer[1] === 216 &&
    buffer[2] === 255
  ) {
    return 'JPEG';
  }

  if (
    buffer.length >= 6 &&
    ['GIF87a', 'GIF89a'].includes(
      buffer.subarray(0, 6).toString('ascii')
    )
  ) {
    return 'GIF';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'WEBP';
  }

  if (
    buffer.length >= 4 &&
    buffer.subarray(0, 4).toString('ascii') === '%PDF'
  ) {
    return 'PDF';
  }

  return 'UNKNOWN';
}

function extension(format) {
  return {
    PNG: 'png',
    JPEG: 'jpg',
    GIF: 'gif',
    WEBP: 'webp',
    PDF: 'pdf'
  }[format] || 'bin';
}

function isPrivateIP(ip) {
  const version = net.isIP(ip);

  if (version === 4) {
    const p = ip.split('.').map(Number);

    return (
      p[0] === 0 ||
      p[0] === 10 ||
      p[0] === 127 ||
      p[0] >= 224 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      (p[0] === 198 && [18, 19].includes(p[1]))
    );
  }

  if (version === 6) {
    const normalized = ip.toLowerCase();

    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice(7);
      return net.isIP(mapped) === 4
        ? isPrivateIP(mapped)
        : true;
    }

    const first = normalized.split(':')[0];
    const prefix = parseInt(first || '0', 16);

    return (
      normalized === '::' ||
      normalized === '::1' ||
      (prefix >= 0xfc00 && prefix <= 0xfdff) ||
      (prefix >= 0xfe80 && prefix <= 0xfebf)
    );
  }

  return true;
}

async function validateURL(raw) {
  const u = new URL(raw);

  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.port ||
    net.isIP(u.hostname) ||
    u.hostname === 'localhost' ||
    u.hostname.endsWith('.local')
  ) {
    throw new Error('Public HTTPS hostname required');
  }

  const addresses = await dns.lookup(
    u.hostname,
    { all: true }
  );

  if (
    addresses.length === 0 ||
    addresses.some(a => isPrivateIP(a.address))
  ) {
    throw new Error('Unsafe DNS resolution');
  }

  return u;
}

async function download(rawURL, maxBytes) {
  let current = rawURL;

  for (let redirects = 0; redirects < 5; redirects++) {
    const url = await validateURL(current);
    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      30000
    );

    try {
      const response = await fetch(url.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'WeatherTimeMachine-Engine5-Test5/2.0',
          Accept: '*/*'
        }
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');

        if (!location) {
          throw new Error('Redirect without Location header');
        }

        current = new URL(location, url).href;
        await response.body?.cancel();
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const declaredLength = Number(
        response.headers.get('content-length') || 0
      );

      if (declaredLength > maxBytes) {
        await response.body?.cancel();

        throw new Error(
          `Declared response size ${declaredLength} exceeds ${maxBytes}`
        );
      }

      const chunks = [];
      let total = 0;

      for await (const chunk of response.body) {
        total += chunk.length;

        if (total > maxBytes) {
          await response.body?.cancel();
          throw new Error(
            `Response too large: limit ${maxBytes} bytes`
          );
        }

        chunks.push(chunk);
      }

      return {
        url: url.href,
        bytes: total,
        contentType: response.headers.get('content-type') || '',
        buffer: Buffer.concat(chunks)
      };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('Too many redirects');
}

function saveEvidence(filename, buffer) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  const fullPath = path.join(EVIDENCE_DIR, filename);

  fs.writeFileSync(fullPath, buffer);
  report.evidenceFiles.push(fullPath);

  return fullPath;
}

function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function plainText(html) {
  return normalize(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z0-9#]+;/gi, ' ')
  );
}

function eventKeywords(value) {
  const generic = new Set([
    'storm',
    'superstorm',
    'hurricane',
    'tropical',
    'weather',
    'event'
  ]);

  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter(word => word.length >= 4 && !generic.has(word));
}

function contextMatches(text) {
  const eventWords = eventKeywords(event);

  return {
    event:
      eventWords.length > 0 &&
      eventWords.every(word => text.includes(word)),

    state:
      text.includes(normalize(state)),

    year:
      text.includes(year),

    mapTerminology:
      /\b(map|maps|radar|satellite|rainfall|storm surge|weather chart|meteorological|wind field|storm track)\b/i
        .test(text)
  };
}

function runNegativeControls() {
  const cases = {
    unrelated_weather_map:
      'Hurricane Katrina Louisiana 2005 weather map',

    ordinary_photograph:
      `${event} ${state} ${year} storm damage photograph`,

    incorrect_year:
      `${event} ${state} 1999 weather map`
  };

  for (const [name, description] of Object.entries(cases)) {
    const matches = contextMatches(normalize(description));

    const falselyAccepted =
      matches.event &&
      matches.state &&
      matches.year &&
      matches.mapTerminology;

    report.negativeControls[name] = {
      status: falselyAccepted ? 'fail' : 'pass',
      description,
      matches,
      reason: falselyAccepted
        ? 'Metadata rule falsely accepted this control'
        : 'Metadata rule did not accept this control',
      limitation:
        'Synthetic text-only negative control; no image pixels examined'
    };
  }
}

function extractLinks(html, baseURL) {
  const links = [];
  const regex = /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    try {
      links.push(
        new URL(
          match[1].replace(/&amp;/g, '&'),
          baseURL
        ).href
      );
    } catch {
      // Ignore malformed links.
    }
  }

  return links;
}

function provenanceCheck(html, pageURL, candidateURL) {
  const links = extractLinks(html, pageURL);

  const candidate = new URL(candidateURL);
  const pathname = candidate.pathname;

  const explicitLinks = links.filter(link => {
    try {
      const u = new URL(link);

      return (
        u.origin === candidate.origin &&
        u.pathname === pathname &&
        u.search === candidate.search
      );
    } catch {
      return false;
    }
  });

  const result = {
    candidateURL,
    explicitLinkCount: explicitLinks.length,
    explicitLinks: explicitLinks.slice(0, 10),
    evidenceLevel: explicitLinks.length
      ? 'direct_html_link'
      : 'not_established'
  };

  check(
    'image_source_link',
    explicitLinks.length
      ? 'supporting_evidence'
      : 'not_verified',
    explicitLinks.length
      ? 'The source HTML explicitly references the candidate image URL'
      : 'No exact image URL reference found in source HTML',
    result
  );

  check(
    'image_source_provenance',
    'not_verified',
    'An HTML link alone does not establish authorship, date, original caption or historical authenticity'
  );

  return result;
}

async function testImage() {
  try {
    const response = await download(
      imageURL,
      LIMITS.image
    );

    const format = detectFormat(response.buffer);

    report.image = {
      url: response.url,
      bytes: response.bytes,
      contentType: response.contentType,
      format,
      sha256: sha256(response.buffer)
    };

    check(
      'image_download',
      'pass',
      'Candidate image downloaded successfully'
    );

    const allowed = ['JPEG', 'PNG', 'GIF', 'WEBP'];

    if (!allowed.includes(format)) {
      check(
        'image_format',
        'fail',
        `Unsupported candidate image signature: ${format}`
      );

      report.errors.push('Invalid candidate image format');
      return;
    }

    check(
      'image_format',
      'pass',
      `Recognized image format: ${format}`
    );

    const filename = `candidate-map.${extension(format)}`;

    const saved = saveEvidence(
      filename,
      response.buffer
    );

    report.image.savedFile = saved;

    check(
      'visual_evidence_saved',
      'pass',
      `Original image saved for independent visual review: ${saved}`
    );

    check(
      'actual_visual_inspection',
      'not_verified',
      'Image saved, but no visual classifier or human reviewer has inspected it'
    );
  } catch (error) {
    check(
      'image_download',
      'fail',
      error.message
    );

    report.errors.push(`Image: ${error.message}`);
  }
}

async function testSource() {
  try {
    const response = await download(
      sourceURL,
      LIMITS.webpage
    );

    const html = response.buffer.toString('utf8');

    saveEvidence(
      'source-page.html',
      response.buffer
    );

    const matches = contextMatches(
      plainText(html)
    );

    report.source = {
      url: response.url,
      bytes: response.bytes,
      contentType: response.contentType,
      context: matches
    };

    check(
      'source_download',
      'pass',
      'Source webpage downloaded'
    );

    for (const [name, matched] of Object.entries(matches)) {
      check(
        `source_${name}`,
        matched ? 'supporting_evidence' : 'not_verified',
        matched
          ? 'Matching terminology appears on the source webpage'
          : 'Matching terminology not established'
      );
    }

    report.provenance = provenanceCheck(
      html,
      response.url,
      report.image?.url || imageURL
    );

    check(
      'source_credibility',
      'not_verified',
      'Domain and page retrieval alone do not establish original authorship or archival provenance'
    );
  } catch (error) {
    check(
      'source_download',
      'fail',
      error.message
    );

    report.errors.push(`Source: ${error.message}`);
  }
}

async function testReference() {
  try {
    const response = await download(
      referenceURL,
      LIMITS.reference
    );

    const format = detectFormat(response.buffer);

    report.reference = {
      url: response.url,
      bytes: response.bytes,
      format,
      sha256: sha256(response.buffer)
    };

    if (format !== 'PDF') {
      check(
        'reference_download',
        'fail',
        `Expected PDF, received ${format}`
      );

      report.errors.push('Historical reference is not a PDF');
      return;
    }

    const saved = saveEvidence(
      'historical-reference.pdf',
      response.buffer
    );

    report.reference.savedFile = saved;

    check(
      'reference_download',
      'pass',
      `Historical reference downloaded (${response.bytes} bytes)`
    );

    check(
      'reference_historical_content',
      'not_verified',
      'PDF downloaded, but its text, figures and historical statements have not been examined'
    );

    check(
      'reference_image_match',
      'not_verified',
      'No candidate-image-to-reference-figure comparison performed'
    );
  } catch (error) {
    check(
      'reference_download',
      'not_verified',
      error.message
    );

    report.errors.push(`Reference: ${error.message}`);
  }
}

function finalize() {
  check(
    'historical_event_authenticity',
    'not_verified',
    'Event/date/geographic authenticity requires inspection of original figure and supporting archive records'
  );

  check(
    'map_visual_authenticity',
    'not_verified',
    'No image-content verification has been completed'
  );

  check(
    'final_authenticity',
    'not_verified',
    'Candidate has not satisfied all historical authenticity requirements'
  );

  const controlFailures = Object.values(
    report.negativeControls
  ).filter(item => item.status === 'fail');

  if (controlFailures.length) {
    report.errors.push(
      `${controlFailures.length} negative controls failed`
    );
  }

  report.execution = report.errors.length
    ? 'incomplete'
    : 'completed';

  report.status = 'not_evaluated';

  report.score = null;
  report.grade = null;
  report.finalGrade = false;

  report.summary = {
    executionCompleted: report.errors.length === 0,
    automatedChecksPassed: Object.values(
      report.checks
    ).filter(x => x.status === 'pass').length,
    negativeControlsPassed: Object.values(
      report.negativeControls
    ).filter(x => x.status === 'pass').length,
    negativeControlsTotal: Object.keys(
      report.negativeControls
    ).length,
    historicalAuthenticityVerified: false,
    finalGradeAvailable: false,
    pendingHumanOrImageAnalysis: true
  };
}

async function main() {
  if (
    !event ||
    !state ||
    !/^\d{4}$/.test(year)
  ) {
    throw new Error('Invalid event, state or year');
  }

  runNegativeControls();

  await testImage();
  await testSource();
  await testReference();
}

(async () => {
  try {
    await main();
  } catch (error) {
    report.errors.push(
      `Unexpected: ${error.message}`
    );
  } finally {
    finalize();

    fs.writeFileSync(
      REPORT,
      JSON.stringify(report, null, 2) + '\n'
    );

    console.log(
      JSON.stringify(report, null, 2)
    );

    console.log(`Report saved: ${REPORT}`);

    if (report.errors.length > 0) {
      process.exitCode = 1;
    }
  }
})();
