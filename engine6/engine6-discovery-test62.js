
'use strict';

// WEATHER TIME MACHINE
// ENGINE 6 — TEST 6.2 FREE
// Historical Weather Photo Gallery Verification
//
// Node.js 22 — No external packages
// No Brave API
// No Google scraping
// No paid search service
// No API key
//
// Google is used only for manual research.
// Submitted gallery URLs are independently inspected.
//
// IMPORTANT:
// Website evidence identifies potential galleries.
// It does not authenticate individual photographs.
// Scores remain Not Evaluated until sufficient
// evidence is independently verified.

const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;
const net = require('node:net');

const {
  queryFor,
  googleLink
} = require('./engine6-photo-gallery');

// -------------------------------------------
// URL SAFETY
// -------------------------------------------

function publicUrl(value) {
  try {
    const u = new URL(value);

    if (!['http:', 'https:'].includes(u.protocol)) {
      return false;
    }

    if (u.username || u.password) {
      return false;
    }

    if (u.port && !['80', '443'].includes(u.port)) {
      return false;
    }

    const host = u.hostname
      .toLowerCase()
      .replace(/\.$/, '');

    if (!host.includes('.')) return false;

    if (net.isIP(host)) return false;

    if (
      /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(host)
    ) {
      return false;
    }

    if (/^(0x[0-9a-f]+|0[0-7]+|\d+)$/i.test(host)) {
      return false;
    }

    return true;

  } catch {
    return false;
  }
}

// -------------------------------------------
// TEXT PROCESSING
// -------------------------------------------

function clean(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|quot|lt|gt|#39);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2);
}

function matches(text, phrase) {
  const expected = tokens(phrase);
  const actual = new Set(tokens(text));

  return expected.length > 0 &&
    expected.every(word => actual.has(word));
}

// -------------------------------------------
// RESEARCH RESULT ASSESSMENT
// -------------------------------------------

function assess(result, event, state) {
  const url = String(
    typeof result === 'string'
      ? result
      : result?.url || ''
  );

  if (!publicUrl(url)) return null;

  const title = clean(result?.title);
  const description = clean(result?.description);

  const text = `${title} ${description}`;

  const eventMatch = matches(text, event);
  const stateMatch = matches(text, state);

  const galleryHint =
    /\b(photo|photos|photograph|photographs|gallery|galleries|images|pictures)\b/i
      .test(text);

  return {
    url,
    title,
    description,
    eventMatch,
    stateMatch,
    galleryHint,
    candidate:
      eventMatch &&
      stateMatch &&
      galleryHint,
    verified: false,
    score: null,
    grade: null,
    status: 'Not Evaluated',
    reason:
      'Research listing alone cannot verify historical photographs'
  };
}

// -------------------------------------------
// NETWORK ADDRESS SAFETY
// -------------------------------------------

function safeAddress(address) {
  const family = net.isIP(address);

  if (family === 4) {
    const a = address.split('.').map(Number);

    if (
      a[0] === 0 ||
      a[0] === 10 ||
      a[0] === 127 ||
      a[0] >= 224 ||
      (a[0] === 169 && a[1] === 254) ||
      (a[0] === 172 &&
        a[1] >= 16 &&
        a[1] <= 31) ||
      (a[0] === 192 && a[1] === 168) ||
      (a[0] === 100 &&
        a[1] >= 64 &&
        a[1] <= 127) ||
      (a[0] === 192 && a[1] === 0) ||
      (a[0] === 198 &&
        [18, 19, 51].includes(a[1])) ||
      (a[0] === 203 &&
        a[1] === 0 &&
        a[2] === 113)
    ) {
      return false;
    }

    return true;
  }

  if (family === 6) {
    const ip = address.toLowerCase();

    if (
      ip === '::' ||
      ip === '::1' ||
      ip.startsWith('fc') ||
      ip.startsWith('fd') ||
      /^fe[89ab]/.test(ip) ||
      ip.startsWith('ff') ||
      ip.startsWith('2001:db8:')
    ) {
      return false;
    }

    if (ip.startsWith('::ffff:')) {
      return safeAddress(ip.slice(7));
    }

    return true;
  }

  return false;
}

async function validateHost(url) {
  if (!publicUrl(url)) {
    throw new Error('Unsafe URL');
  }

  const parsed = new URL(url);

  const records = await dns.lookup(
    parsed.hostname,
    { all: true, verbatim: true }
  );

  if (
    !records.length ||
    !records.every(record =>
      safeAddress(record.address)
    )
  ) {
    throw new Error(
      'Host resolves to restricted address'
    );
  }
}

// -------------------------------------------
// FETCH PUBLIC HTML PAGE
// -------------------------------------------

async function readPage(url, fetcher = fetch) {
  let current = url;

  for (let attempt = 0; attempt < 5; attempt++) {
    await validateHost(current);

    const response = await fetcher(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
      headers: {
        Accept: 'text/html'
      }
    });

    if (
      [301, 302, 303, 307, 308]
        .includes(response.status)
    ) {
      const location =
        response.headers?.get('location');

      if (!location) {
        throw new Error(
          'Redirect without location'
        );
      }

      current = new URL(
        location,
        current
      ).toString();

      continue;
    }

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const contentType =
      response.headers?.get('content-type') || '';

    if (
      !/text\/html|application\/xhtml\+xml/i
        .test(contentType)
    ) {
      throw new Error(
        'Website did not return HTML'
      );
    }

    const contentLength = Number(
      response.headers?.get('content-length') || 0
    );

    if (contentLength > 2000000) {
      throw new Error('Page too large');
    }

    if (!response.body?.getReader) {
      const html = await response.text();

      if (Buffer.byteLength(html, 'utf8') > 2000000) {
        throw new Error('Page too large');
      }

      return {
        url: current,
        html
      };
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;

    try {
      while (true) {
        const { done, value } =
          await reader.read();

        if (done) break;

        total += value.byteLength;

        if (total > 2000000) {
          throw new Error('Page too large');
        }

        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }

    return {
      url: current,
      html: Buffer.concat(chunks)
        .toString('utf8')
    };
  }

  throw new Error('Too many redirects');
}

// -------------------------------------------
// PHOTO GALLERY EVIDENCE
// -------------------------------------------

function inspect(html, event, state) {
  const stripped = String(html)
    .replace(
      /<script\b[^>]*>[\s\S]*?<\/script>/gi,
      ' '
    )
    .replace(
      /<style\b[^>]*>[\s\S]*?<\/style>/gi,
      ' '
    );

  const visibleText = clean(stripped);

  const eventMatch =
    matches(visibleText, event);

  const stateMatch =
    matches(visibleText, state);

  const galleryHint =
    /\b(photo|photos|photograph|photographs|gallery|galleries|images|pictures)\b/i
      .test(visibleText);

  const imageCount =
    (stripped.match(/<img\b/gi) || []).length;

  const candidate =
    eventMatch &&
    stateMatch &&
    galleryHint &&
    imageCount > 0;

  return {
    eventMatch,
    stateMatch,
    galleryHint,
    imageCount,
    candidate
  };
}

// -------------------------------------------
// FREE GALLERY DISCOVERY
// -------------------------------------------

async function discover({
  event,
  state,
  year = '',
  urls = [],
  fetcher = fetch
}) {
  const base = {
    engine: 6,
    version: '6.2-free',
    event,
    state,
    year: String(year),

    searchTerm: queryFor(event, state),
    googleSearchUrl: googleLink(event, state),

    provider:
      'Manual Google research + free website inspection',

    score: null,
    grade: null,
    status: 'Not Evaluated',

    searchCompleted: false,
    candidates: [],
    resultsExamined: 0
  };

  if (
    !Array.isArray(urls) ||
    urls.length === 0
  ) {
    return {
      ...base,
      error:
        'No gallery URLs supplied. Add URLs to engine6-gallery-urls.json'
    };
  }

  const unique = [
    ...new Set(
      urls
        .map(item =>
          typeof item === 'string'
            ? item
            : item?.url
        )
        .filter(Boolean)
    )
  ].slice(0, 30);

  const candidates = [];

  for (const url of unique) {
    const item = {
      url,
      verified: false,
      score: null,
      grade: null,
      status: 'Not Evaluated'
    };

    if (!publicUrl(url)) {
      candidates.push({
        ...item,
        candidate: false,
        error:
          'URL rejected by safety check'
      });

      continue;
    }

    try {
      const page = await readPage(
        url,
        fetcher
      );

      const evidence = inspect(
        page.html,
        event,
        state
      );

      candidates.push({
        ...item,
        finalUrl: page.url,
        ...evidence,
        reason: evidence.candidate
          ? 'Potential gallery found; photographs require independent verification'
          : 'Insufficient event, state, gallery or image evidence'
      });

    } catch (error) {
      candidates.push({
        ...item,
        candidate: false,
        error: error.message
      });
    }
  }

  return {
    ...base,

    resultsExamined:
      candidates.length,

    candidates,

    potentialGalleries:
      candidates.filter(
        item => item.candidate
      ).length,

    pagesInspected:
      candidates.filter(
        item => 'imageCount' in item
      ).length,

    note:
      'Manual gallery research is not exhaustive. No automatic numerical grade is awarded.'
  };
}

// -------------------------------------------
// GITHUB ACTIONS EXECUTION
// -------------------------------------------

if (require.main === module) {
  const inputFile =
    process.env.INPUT ||
    path.join(
      __dirname,
      'engine6-gallery-urls.json'
    );

  let data;

  try {
    data = JSON.parse(
      fs.readFileSync(
        inputFile,
        'utf8'
      )
    );
  } catch (error) {
    console.error(
      `Cannot read ${inputFile}: ${error.message}`
    );

    process.exit(1);
  }

  discover({
    event:
      process.env.EVENT ||
      data.event ||
      'Tropical Storm Irene',

    state:
      process.env.STATE ||
      data.state ||
      'Vermont',

    year:
      process.env.YEAR ||
      data.year ||
      '2011',

    urls:
      data.urls || []

  }).then(result => {
    const output =
      process.env.OUTPUT ||
      'engine6-test62-results.json';

    fs.writeFileSync(
      output,
      JSON.stringify(result, null, 2)
    );

    console.log(
      JSON.stringify({
        engine: 6,
        test: '6.2 FREE',
        status: result.status,
        pagesInspected:
          result.pagesInspected || 0,
        potentialGalleries:
          result.potentialGalleries || 0,
        output
      }, null, 2)
    );

    if (
      result.error ||
      result.pagesInspected === 0
    ) {
      process.exitCode = 1;
    }

  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

// -------------------------------------------
// EXPORT FUNCTIONS
// -------------------------------------------

module.exports = {
  publicUrl,
  clean,
  assess,
  inspect,
  discover,
  safeAddress
};
