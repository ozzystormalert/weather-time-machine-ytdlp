
'use strict';

/**
 * Weather Time Machine — Engine 5
 * TEST 4: Original Map Evidence Verification
 *
 * Independent Node.js 22 test.
 * No external packages. No Bing API key.
 * Does not modify the live Engine 5 server.
 */

const fs = require('node:fs');
const dns = require('node:dns').promises;
const net = require('node:net');
const { URL } = require('node:url');

const REPORT = 'engine5-test4-results.json';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15000;

const args = {};

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];

  if (arg.startsWith('--') && i + 1 < process.argv.length) {
    args[arg.slice(2)] = process.argv[++i];
  }
}

const event = String(args.event || '').trim();
const state = String(args.state || '').trim();
const year = String(args.year || '').trim();
const imageUrl = String(args.image || '').trim();
const sourceUrl = String(args.source || '').trim();

function check(status, detail) {
  return { status, detail };
}

function normalize(s) {
  return String(s || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|lt|gt);/gi, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isPrivateIP(ip) {
  if (net.isIP(ip) === 4) {
    const n = ip.split('.').map(Number);

    return (
      n[0] === 0 ||
      n[0] === 10 ||
      n[0] === 127 ||
      n[0] >= 224 ||
      (n[0] === 169 && n[1] === 254) ||
      (n[0] === 172 && n[1] >= 16 && n[1] <= 31) ||
      (n[0] === 192 && n[1] === 168) ||
      (n[0] === 100 && n[1] >= 64 && n[1] <= 127) ||
      (n[0] === 192 && n[1] === 0) ||
      (n[0] === 198 && (n[1] === 18 || n[1] === 19))
    );
  }

  if (net.isIP(ip) === 6) {
    const v = ip.toLowerCase();

    return (
      v === '::1' ||
      v === '::' ||
      v.startsWith('fc') ||
      v.startsWith('fd') ||
      v.startsWith('fe8') ||
      v.startsWith('fe9') ||
      v.startsWith('fea') ||
      v.startsWith('feb') ||
      v.startsWith('::ffff:')
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
    u.port
  ) {
    throw new Error(
      'Only standard HTTPS URLs without credentials or custom ports are allowed'
    );
  }

  const host = u.hostname.toLowerCase();

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    throw new Error('Local addresses are not allowed');
  }

  if (net.isIP(host)) {
    throw new Error('IP-address URLs are not allowed');
  }

  const addresses = await dns.lookup(host, { all: true });

  if (
    !addresses.length ||
    addresses.some(a => isPrivateIP(a.address))
  ) {
    throw new Error(
      'URL hostname resolves to a private or invalid IP address'
    );
  }

  return u.toString();
}

async function retrieve(raw, limit) {
  let current = raw;

  for (let redirects = 0; redirects <= 4; redirects++) {
    current = await validateURL(current);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      TIMEOUT_MS
    );

    try {
      const response = await fetch(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent':
            'WeatherTimeMachineEvidenceTest4/1.0 (research verification)',
          'Accept': '*/*'
        }
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');

        if (!location) {
          throw new Error('Redirect has no Location header');
        }

        current = new URL(location, current).toString();
        await response.body?.cancel();
        continue;
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} from ${current}`
        );
      }

      const declared = Number(
        response.headers.get('content-length') || 0
      );

      if (declared > limit) {
        throw new Error(
          `Response exceeds ${limit} byte limit`
        );
      }

      const chunks = [];
      let size = 0;

      for await (const chunk of response.body) {
        size += chunk.length;

        if (size > limit) {
          throw new Error(
            `Response exceeds ${limit} byte limit`
          );
        }

        chunks.push(chunk);
      }

      return {
        data: Buffer.concat(chunks),
        contentType:
          response.headers.get('content-type') || '',
        url: current,
        bytes: size
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('Too many redirects');
}

function imageFormat(data) {
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
  ) {
    return 'PNG';
  }

  if (
    data.length >= 3 &&
    data[0] === 255 &&
    data[1] === 216 &&
    data[2] === 255
  ) {
    return 'JPEG';
  }

  if (
    data.length >= 6 &&
    ['GIF87a', 'GIF89a'].includes(
      data.subarray(0, 6).toString('ascii')
    )
  ) {
    return 'GIF';
  }

  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'WEBP';
  }

  return null;
}

function keywordMatch(text, phrase) {
  const terms = phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(x => x.length >= 3);

  if (!terms.length) {
    return false;
  }

  return terms.some(t => text.includes(t));
}

const result = {
  test: 'Engine 5 — Original Map Evidence Verification Test 4',
  engine: 5,
  event,
  state,
  year,
  imageUrl,
  sourceUrl,
  checkedAt: new Date().toISOString(),

  status: 'not_evaluated',
  score: null,
  grade: null,
  finalGrade: false,

  checks: {
    inputValidity: check(
      'not_verified',
      'Not checked yet'
    ),
    imageDownload: check(
      'not_verified',
      'Not checked yet'
    ),
    imageFileSignature: check(
      'not_verified',
      'Not checked yet'
    ),
    sourcePageDownload: check(
      'not_verified',
      'Not checked yet'
    ),
    eventMention: check(
      'not_verified',
      'Not checked yet'
    ),
    stateMention: check(
      'not_verified',
      'Not checked yet'
    ),
    yearMention: check(
      'not_verified',
      'Not checked yet'
    ),
    mapTerminology: check(
      'not_verified',
      'Not checked yet'
    ),
    imageIsWeatherMap: check(
      'not_verified',
      'Requires inspection of actual image contents'
    ),
    imageBelongsToSource: check(
      'not_verified',
      'Requires image/source provenance comparison'
    ),
    historicalAuthenticity: check(
      'not_verified',
      'Requires historical and source verification'
    ),
    sourceCredibility: check(
      'not_verified',
      'A domain alone cannot establish credibility'
    )
  },

  errors: [],

  notes: [
    'This test does not scrape Bing Images.',
    'Page keyword matches are preliminary clues, not visual or historical verification.'
  ]
};

async function main() {
  if (
    !event ||
    !state ||
    !/^\d{4}$/.test(year) ||
    !imageUrl ||
    !sourceUrl
  ) {
    result.checks.inputValidity = check(
      'fail',
      'Required: --event, --state, --year YYYY, --image HTTPS_URL, --source HTTPS_URL'
    );

    result.errors.push('Missing or invalid required input');
    return;
  }

  try {
    await validateURL(imageUrl);
    await validateURL(sourceUrl);

    result.checks.inputValidity = check(
      'pass',
      'Required fields and public HTTPS URLs are valid'
    );
  } catch (err) {
    result.checks.inputValidity = check(
      'fail',
      err.message
    );

    result.errors.push(`Input: ${err.message}`);
    return;
  }

  try {
    const image = await retrieve(
      imageUrl,
      MAX_IMAGE_BYTES
    );

    result.checks.imageDownload = check(
      'pass',
      `Downloaded ${image.bytes} bytes from ${image.url}; content-type: ${image.contentType}`
    );

    const format = imageFormat(image.data);

    result.checks.imageFileSignature = format
      ? check('pass', `Detected ${format} file signature`)
      : check(
          'fail',
          'Unrecognized raster image file signature (PNG/JPEG/GIF/WEBP supported)'
        );

    result.image = {
      finalUrl: image.url,
      bytes: image.bytes,
      format,
      contentType: image.contentType
    };
  } catch (err) {
    result.checks.imageDownload = check(
      'fail',
      err.message
    );

    result.errors.push(`Image: ${err.message}`);
  }

  try {
    const page = await retrieve(
      sourceUrl,
      MAX_PAGE_BYTES
    );

    result.checks.sourcePageDownload = check(
      'pass',
      `Downloaded ${page.bytes} bytes from ${page.url}`
    );

    if (!/html|text\/plain/i.test(page.contentType)) {
      result.notes.push(
        `Source content type ${page.contentType} may not be HTML`
      );
    }

    const text = normalize(
      page.data.toString('utf8')
    );

    result.checks.eventMention = check(
      keywordMatch(text, event)
        ? 'pass'
        : 'not_verified',
      'At least one event-name term found on source page (not proof of event-specific map)'
    );

    result.checks.stateMention = check(
      text.includes(state.toLowerCase())
        ? 'pass'
        : 'not_verified',
      'Exact state name searched on source page'
    );

    result.checks.yearMention = check(
      text.includes(year)
        ? 'pass'
        : 'not_verified',
      'Year searched on source page'
    );

    const mapTerms = [
      'map',
      'radar',
      'satellite',
      'precipitation',
      'rainfall',
      'storm track',
      'wind speed',
      'storm surge',
      'meteorological',
      'weather chart'
    ];

    result.checks.mapTerminology = check(
      mapTerms.some(term => text.includes(term))
        ? 'pass'
        : 'not_verified',
      'Weather-map terminology searched on source page'
    );

    result.source = {
      finalUrl: page.url,
      bytes: page.bytes,
      contentType: page.contentType
    };
  } catch (err) {
    result.checks.sourcePageDownload = check(
      'fail',
      err.message
    );

    result.errors.push(`Source: ${err.message}`);
  }
}

main()
  .catch(err => {
    result.errors.push(
      `Unexpected: ${err.message}`
    );
  })
  .finally(() => {
    result.status = result.errors.length
      ? 'incomplete'
      : 'not_evaluated';

    fs.writeFileSync(
      REPORT,
      JSON.stringify(result, null, 2) + '\n',
      'utf8'
    );

    console.log(
      JSON.stringify(result, null, 2)
    );

    console.log(
      `\nReport saved: ${REPORT}`
    );

    if (result.errors.length) {
      process.exitCode = 1;
    }
  });
