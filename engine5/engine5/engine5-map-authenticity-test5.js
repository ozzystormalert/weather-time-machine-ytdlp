
'use strict';

/**
 * WEATHER TIME MACHINE — ENGINE 5
 * TEST 5: HISTORICAL MAP AUTHENTICITY
 * AND SOURCE VERIFICATION
 *
 * Node.js 22
 * No external packages
 * No API key required
 *
 * IMPORTANT:
 * This test verifies evidence integrity,
 * source-page metadata and negative controls.
 *
 * It does NOT perform visual image recognition
 * or automatically certify historical authenticity.
 *
 * It does NOT assign A–F grades.
 */

const fs = require('node:fs');
const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const net = require('node:net');
const { URL } = require('node:url');

const OUT = 'engine5-test5-results.json';

// ------------------------------------------
// COMMAND-LINE INPUTS
// ------------------------------------------

const opts = {};

for (let i = 2; i < process.argv.length; i++) {
  if (
    process.argv[i].startsWith('--') &&
    i + 1 < process.argv.length
  ) {
    opts[process.argv[i++].slice(2)] =
      process.argv[i];
  }
}

const event = (
  opts.event || 'Superstorm Sandy'
).trim();

const state = (
  opts.state || 'New Jersey'
).trim();

const year = (
  opts.year || '2012'
).trim();

const imageURL = (
  opts.image ||
  'https://response.restoration.noaa.gov/download/file/fid/1976'
).trim();

const sourceURL = (
  opts.source ||
  'https://response.restoration.noaa.gov/atlantic-erma-and-sandy-response'
).trim();

const referenceURL = (
  opts.reference ||
  'https://www.nhc.noaa.gov/data/tcr/AL182012_Sandy.pdf'
).trim();

// ------------------------------------------
// RESULTS
// ------------------------------------------

const result = {
  test:
    'Engine 5 — Test 5: Historical Map Authenticity and Source Verification',

  event,
  state,
  year,

  inputs: {
    imageURL,
    sourceURL,
    referenceURL
  },

  status: 'not_evaluated',

  score: null,
  grade: null,
  finalGrade: false,

  checks: {},
  negativeControls: {},
  errors: [],

  limitations: [
    'Image pixels are not visually classified.',
    'Source-page terms do not prove an image belongs to that page.',
    'A trusted domain alone does not authenticate a map.',
    'A reference report verifies historical context, not the candidate image.'
  ]
};

// ------------------------------------------
// RECORD CHECK
// ------------------------------------------

function mark(key, status, reason) {
  result.checks[key] = {
    status,
    reason
  };
}

// ------------------------------------------
// NETWORK SAFETY
// ------------------------------------------

function privateIP(ip) {
  if (net.isIP(ip) === 4) {
    const a = ip.split('.').map(Number);

    return (
      a[0] === 0 ||
      a[0] === 10 ||
      a[0] === 127 ||
      a[0] >= 224 ||
      (a[0] === 169 && a[1] === 254) ||
      (a[0] === 172 && a[1] >= 16 && a[1] <= 31) ||
      (a[0] === 192 && a[1] === 168) ||
      (a[0] === 100 && a[1] >= 64 && a[1] <= 127) ||
      (
        a[0] === 198 &&
        (a[1] === 18 || a[1] === 19)
      )
    );
  }

  if (net.isIP(ip) === 6) {
    const s = ip.toLowerCase();

    return (
      s === '::' ||
      s === '::1' ||
      s.startsWith('fc') ||
      s.startsWith('fd') ||
      s.startsWith('fe8') ||
      s.startsWith('fe9') ||
      s.startsWith('fea') ||
      s.startsWith('feb') ||
      s.startsWith('::ffff:')
    );
  }

  return true;
}

async function safeURL(raw) {
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
    throw Error(
      'Public HTTPS hostname required'
    );
  }

  const addresses = await dns.lookup(
    u.hostname,
    { all: true }
  );

  if (
    !addresses.length ||
    addresses.some(x => privateIP(x.address))
  ) {
    throw Error('Unsafe resolved address');
  }

  return u;
}

// ------------------------------------------
// DOWNLOAD RESOURCE
// ------------------------------------------

async function get(raw, max) {
  let current = raw;

  for (let j = 0; j < 5; j++) {
    const u = await safeURL(current);

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      15000
    );

    try {
      const response = await fetch(u, {
        redirect: 'manual',
        signal: controller.signal,

        headers: {
          'User-Agent':
            'WeatherTimeMachine-Test5/1.0',
          Accept: '*/*'
        }
      });

      if (
        [301, 302, 303, 307, 308]
          .includes(response.status)
      ) {
        const location =
          response.headers.get('location');

        if (!location) {
          throw Error(
            'Redirect without location'
          );
        }

        current = new URL(
          location,
          u
        ).href;

        await response.body?.cancel();

        continue;
      }

      if (!response.ok) {
        throw Error(
          `HTTP ${response.status}`
        );
      }

      const chunks = [];
      let bytes = 0;

      for await (
        const chunk of response.body
      ) {
        bytes += chunk.length;

        if (bytes > max) {
          throw Error(
            'Response too large'
          );
        }

        chunks.push(chunk);
      }

      return {
        url: current,
        bytes,

        contentType:
          response.headers.get(
            'content-type'
          ) || '',

        body: Buffer.concat(chunks)
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw Error('Too many redirects');
}

// ------------------------------------------
// IDENTIFY FILE FORMAT
// ------------------------------------------

function kind(buffer) {
  if (
    buffer.length > 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([
        137, 80, 78, 71,
        13, 10, 26, 10
      ])
    )
  ) {
    return 'PNG';
  }

  if (
    buffer.length > 3 &&
    buffer[0] === 255 &&
    buffer[1] === 216 &&
    buffer[2] === 255
  ) {
    return 'JPEG';
  }

  if (
    buffer.subarray(0, 6)
      .toString('ascii')
      .startsWith('GIF8')
  ) {
    return 'GIF';
  }

  if (
    buffer.subarray(0, 4)
      .toString() === 'RIFF' &&
    buffer.subarray(8, 12)
      .toString() === 'WEBP'
  ) {
    return 'WEBP';
  }

  if (
    buffer.subarray(0, 4)
      .toString() === '%PDF'
  ) {
    return 'PDF';
  }

  return 'UNKNOWN';
}

// ------------------------------------------
// EXTRACT PAGE TEXT
// ------------------------------------------

function textOnly(buffer) {
  return buffer
    .toString('utf8')

    .replace(
      /<script\b[^>]*>[\s\S]*?<\/script>/gi,
      ' '
    )

    .replace(
      /<style\b[^>]*>[\s\S]*?<\/style>/gi,
      ' '
    )

    .replace(
      /<[^>]+>/g,
      ' '
    )

    .replace(
      /&[a-z]+;/gi,
      ' '
    )

    .replace(
      /\s+/g,
      ' '
    )

    .toLowerCase();
}

// ------------------------------------------
// EVENT WORDS
// ------------------------------------------

function words(s) {
  return s
    .toLowerCase()

    .split(/[^a-z0-9]+/)

    .filter(
      x =>
        x.length >= 4 &&
        ![
          'storm',
          'superstorm',
          'hurricane',
          'tropical'
        ].includes(x)
    );
}

// ------------------------------------------
// CONTEXT VERIFICATION
// ------------------------------------------

function matchContext(
  text,
  eventName,
  stateName,
  eventYear
) {
  const eventWords = words(eventName);

  return {
    event:
      eventWords.length > 0 &&
      eventWords.every(
        word => text.includes(word)
      ),

    state:
      text.includes(
        stateName.toLowerCase()
      ),

    year:
      text.includes(eventYear),

    map:
      /\b(map|radar|satellite|rainfall|storm surge|track|wind field|weather chart|meteorological)\b/i
        .test(text)
  };
}

// ------------------------------------------
// NEGATIVE CONTROL TESTS
// ------------------------------------------

function negativeControl(
  label,
  context
) {
  const matches = matchContext(
    context,
    event,
    state,
    year
  );

  const pass = !(
    matches.event &&
    matches.state &&
    matches.year &&
    matches.map
  );

  result.negativeControls[label] = {
    status: pass ? 'pass' : 'fail',

    context,

    reason: pass
      ? 'Insufficient metadata is not automatically accepted'
      : 'Weak metadata-only classifier would be fooled'
  };
}

// ------------------------------------------
// MAIN TEST
// ------------------------------------------

async function main() {
  if (
    !event ||
    !state ||
    !/^\d{4}$/.test(year)
  ) {
    throw Error(
      'Invalid event/state/year'
    );
  }

  // CONTROL 1:
  // Unrelated hurricane map.

  negativeControl(
    'unrelated_weather_map',
    'Hurricane Katrina Louisiana 2005 weather map'
  );

  // CONTROL 2:
  // Ordinary storm damage photograph.

  negativeControl(
    'ordinary_photograph',
    `${event} ${state} ${year} storm damage photograph`
  );

  // CONTROL 3:
  // Incorrect historical year.

  negativeControl(
    'misdated_map',
    `${event} ${state} 1999 weather map`
  );

  let image = null;
  let page = null;
  let reference = null;

  // ----------------------------------------
  // DOWNLOAD ORIGINAL IMAGE
  // ----------------------------------------

  try {
    image = await get(
      imageURL,
      12 * 1024 * 1024
    );

    const format = kind(image.body);

    result.image = {
      url: image.url,
      bytes: image.bytes,
      format,

      sha256:
        crypto.createHash('sha256')
          .update(image.body)
          .digest('hex')
    };

    mark(
      'image_download',
      'pass',
      'Original file downloaded'
    );

    mark(
      'image_file',
      format === 'UNKNOWN'
        ? 'fail'
        : 'pass',
      `Signature: ${format}`
    );
  } catch (error) {
    mark(
      'image_download',
      'fail',
      error.message
    );

    result.errors.push(
      'Image: ' + error.message
    );
  }

  // ----------------------------------------
  // VERIFY SOURCE PAGE
  // ----------------------------------------

  try {
    page = await get(
      sourceURL,
      2 * 1024 * 1024
    );

    const text = textOnly(
      page.body
    );

    const context = matchContext(
      text,
      event,
      state,
      year
    );

    result.source = {
      url: page.url,
      bytes: page.bytes,
      context
    };

    mark(
      'source_download',
      'pass',
      'Source page downloaded'
    );

    for (
      const key of Object.keys(context)
    ) {
      mark(
        'source_' + key,

        context[key]
          ? 'pass'
          : 'not_verified',

        context[key]
          ? 'Keyword evidence present on source page'
          : 'Not established by page text'
      );
    }

    const filePart = image
      ? new URL(image.url)
          .pathname.split('/').pop()
      : '';

    const explicit =
      filePart &&
      filePart.length >= 8 &&
      text.includes(
        filePart.toLowerCase()
      );

    mark(
      'image_source_link',

      explicit
        ? 'supporting_evidence'
        : 'not_verified',

      explicit
        ? 'Image filename appears in page text; provenance still requires confirmation'
        : 'No explicit image-to-page linkage established'
    );
  } catch (error) {
    mark(
      'source_download',
      'fail',
      error.message
    );

    result.errors.push(
      'Source: ' + error.message
    );
  }

  // ----------------------------------------
  // INDEPENDENT HISTORICAL REFERENCE
  // ----------------------------------------

  try {
    reference = await get(
      referenceURL,
      5 * 1024 * 1024
    );

    const format = kind(
      reference.body
    );

    result.reference = {
      url: reference.url,
      bytes: reference.bytes,
      format
    };

    mark(
      'reference_download',
      'pass',
      `Independent historical reference downloaded (${format})`
    );
  } catch (error) {
    mark(
      'reference_download',
      'not_verified',
      error.message
    );

    result.errors.push(
      'Reference: ' + error.message
    );
  }

  // ----------------------------------------
  // HONEST VERIFICATION LIMITATIONS
  // ----------------------------------------

  mark(
    'visual_weather_map',
    'not_verified',
    'No image-content classifier or human visual review performed'
  );

  mark(
    'historical_image_authenticity',
    'not_verified',
    'Image/date/location must be verified against original figure caption or archive record'
  );

  mark(
    'source_credibility',
    'not_verified',
    'Source identity and document provenance require independent corroboration'
  );

  result.status =
    result.errors.length
      ? 'incomplete'
      : 'not_evaluated';
}

// ------------------------------------------
// EXECUTE AND SAVE REPORT
// ------------------------------------------

main()
  .catch(error => {
    result.errors.push(
      'Unexpected: ' + error.message
    );

    result.status = 'incomplete';
  })

  .finally(() => {
    fs.writeFileSync(
      OUT,
      JSON.stringify(
        result,
        null,
        2
      ) + '\n'
    );

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );

    console.log(
      'Report saved:',
      OUT
    );

    if (
      result.errors.length ||
      Object.values(
        result.negativeControls
      ).some(
        x => x.status === 'fail'
      )
    ) {
      process.exitCode = 1;
    }
  });
