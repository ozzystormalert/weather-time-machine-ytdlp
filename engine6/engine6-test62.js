
'use strict';

// WEATHER TIME MACHINE
// ENGINE 6 — TEST 6.2 FREE
// JavaScript File 2
//
// Historical Weather Photo Gallery Verification
//
// Node.js 22
// No Brave API
// No API keys
// No paid services
// No external packages
//
// Tests the free gallery verification engine.
// No numerical score is awarded from unverified
// gallery discovery evidence.

const assert = require('node:assert/strict');

const {
  publicUrl,
  clean,
  assess,
  inspect,
  discover,
  safeAddress
} = require('./engine6-discovery-test62');

const {
  queryFor,
  googleLink
} = require('./engine6-photo-gallery');

const tests = [];

function test(name, fn) {
  tests.push([name, fn]);
}

const EVENT = 'Tropical Storm Irene';
const STATE = 'Vermont';

// -------------------------------------------
// TEST 1 — GOOGLE SEARCH FORMULA
// -------------------------------------------

test('Exact Google search formula', () => {
  assert.equal(
    queryFor(EVENT, STATE),
    'photo gallery Tropical Storm Irene Vermont'
  );
});

// -------------------------------------------
// TEST 2 — GOOGLE RESEARCH LINK
// -------------------------------------------

test('Google research URL is valid', () => {
  const url = new URL(
    googleLink(EVENT, STATE)
  );

  assert.equal(
    url.hostname,
    'www.google.com'
  );

  assert.equal(
    url.searchParams.get('q'),
    queryFor(EVENT, STATE)
  );
});

// -------------------------------------------
// TEST 3 — PUBLIC HTTPS URL
// -------------------------------------------

test('Public HTTPS URL allowed', () => {
  assert.equal(
    publicUrl('https://example.org/gallery'),
    true
  );
});

// -------------------------------------------
// TEST 4 — PUBLIC HTTP URL
// -------------------------------------------

test('Public HTTP URL allowed', () => {
  assert.equal(
    publicUrl('http://example.org/gallery'),
    true
  );
});

// -------------------------------------------
// TEST 5 — LOCALHOST BLOCKED
// -------------------------------------------

test('Localhost URL blocked', () => {
  assert.equal(
    publicUrl('http://localhost/private'),
    false
  );
});

// -------------------------------------------
// TEST 6 — PRIVATE IP BLOCKED
// -------------------------------------------

test('Private IP URL blocked', () => {
  assert.equal(
    publicUrl('http://192.168.1.1'),
    false
  );
});

// -------------------------------------------
// TEST 7 — CREDENTIAL URL BLOCKED
// -------------------------------------------

test('Credential URL blocked', () => {
  assert.equal(
    publicUrl(
      'https://user:pass@example.org'
    ),
    false
  );
});

// -------------------------------------------
// TEST 8 — UNSAFE NETWORK ADDRESSES
// -------------------------------------------

test('Restricted IP addresses blocked', () => {
  assert.equal(
    safeAddress('127.0.0.1'),
    false
  );

  assert.equal(
    safeAddress('192.168.1.10'),
    false
  );

  assert.equal(
    safeAddress('10.0.0.1'),
    false
  );

  assert.equal(
    safeAddress('172.16.0.1'),
    false
  );

  assert.equal(
    safeAddress('169.254.1.1'),
    false
  );
});

// -------------------------------------------
// TEST 9 — TEXT CLEANING
// -------------------------------------------

test('HTML text cleaning', () => {
  assert.equal(
    clean('<b>Storm</b>   Photos'),
    'Storm Photos'
  );
});

// -------------------------------------------
// TEST 10 — STRONG RESEARCH RESULT
// -------------------------------------------

test('Strong listing is candidate only', () => {
  const result = assess(
    {
      url: 'https://example.org/photos',
      title:
        'Tropical Storm Irene Vermont photo gallery',
      description:
        'Historic photographs'
    },
    EVENT,
    STATE
  );

  assert.equal(result.candidate, true);
  assert.equal(result.verified, false);
  assert.equal(result.score, null);
  assert.equal(
    result.status,
    'Not Evaluated'
  );
});

// -------------------------------------------
// TEST 11 — WRONG WEATHER EVENT
// -------------------------------------------

test('Wrong event is not a candidate', () => {
  const result = assess(
    {
      url: 'https://example.org/gallery',
      title:
        'Hurricane Sandy Vermont photo gallery'
    },
    EVENT,
    STATE
  );

  assert.equal(
    result.candidate,
    false
  );
});

// -------------------------------------------
// TEST 12 — WRONG STATE
// -------------------------------------------

test('Wrong state is not a candidate', () => {
  const result = assess(
    {
      url: 'https://example.org/gallery',
      title:
        'Tropical Storm Irene New Jersey photo gallery'
    },
    EVENT,
    STATE
  );

  assert.equal(
    result.candidate,
    false
  );
});

// -------------------------------------------
// TEST 13 — NO GALLERY EVIDENCE
// -------------------------------------------

test('No gallery clue is not candidate', () => {
  const result = assess(
    {
      url: 'https://example.org/report',
      title:
        'Tropical Storm Irene Vermont storm report'
    },
    EVENT,
    STATE
  );

  assert.equal(
    result.candidate,
    false
  );
});

// -------------------------------------------
// TEST 14 — HTML GALLERY CANDIDATE
// -------------------------------------------

test('Relevant HTML gallery detected', () => {
  const html = `
    <html>
      <head>
        <title>
          Tropical Storm Irene Vermont
        </title>
      </head>
      <body>
        <h1>
          Tropical Storm Irene Vermont
          Photo Gallery
        </h1>
        <img src="irene-photo-1.jpg">
        <img src="irene-photo-2.jpg">
      </body>
    </html>
  `;

  const result = inspect(
    html,
    EVENT,
    STATE
  );

  assert.equal(
    result.eventMatch,
    true
  );

  assert.equal(
    result.stateMatch,
    true
  );

  assert.equal(
    result.galleryHint,
    true
  );

  assert.equal(
    result.imageCount,
    2
  );

  assert.equal(
    result.candidate,
    true
  );
});

// -------------------------------------------
// TEST 15 — HTML WITHOUT IMAGES
// -------------------------------------------

test('Gallery without images not confirmed', () => {
  const html = `
    <html>
      <body>
        <h1>
          Tropical Storm Irene Vermont
          Photo Gallery
        </h1>
        <p>
          Historical weather information
        </p>
      </body>
    </html>
  `;

  const result = inspect(
    html,
    EVENT,
    STATE
  );

  assert.equal(
    result.imageCount,
    0
  );

  assert.equal(
    result.candidate,
    false
  );
});

// -------------------------------------------
// TEST 16 — NO SUBMITTED URLS
// -------------------------------------------

test('Missing URLs remain Not Evaluated', async () => {
  const result = await discover({
    event: EVENT,
    state: STATE,
    year: '2011',
    urls: []
  });

  assert.equal(
    result.searchCompleted,
    false
  );

  assert.equal(
    result.score,
    null
  );

  assert.equal(
    result.grade,
    null
  );

  assert.equal(
    result.status,
    'Not Evaluated'
  );

  assert.ok(result.error);
});

// -------------------------------------------
// TEST 17 — UNSAFE URL REJECTED
// -------------------------------------------

test('Unsafe supplied URL rejected', async () => {
  const result = await discover({
    event: EVENT,
    state: STATE,
    urls: [
      'http://127.0.0.1/private'
    ]
  });

  assert.equal(
    result.candidates.length,
    1
  );

  assert.equal(
    result.candidates[0].candidate,
    false
  );

  assert.equal(
    result.score,
    null
  );
});

// -------------------------------------------
// TEST 18 — NO AUTOMATIC GRADING
// -------------------------------------------

test('Discovery never awards unverified points', async () => {
  const result = await discover({
    event: EVENT,
    state: STATE,
    year: '2011',
    urls: [
      'http://localhost/gallery'
    ]
  });

  assert.equal(
    result.score,
    null
  );

  assert.equal(
    result.grade,
    null
  );

  assert.equal(
    result.status,
    'Not Evaluated'
  );

  assert.equal(
    result.searchCompleted,
    false
  );
});

// -------------------------------------------
// EXECUTE ALL TESTS
// -------------------------------------------

(async () => {
  let passed = 0;

  console.log('');
  console.log('================================');
  console.log(' WEATHER TIME MACHINE');
  console.log(' ENGINE 6 — TEST 6.2 FREE');
  console.log('================================');
  console.log('');

  for (const [name, fn] of tests) {
    try {
      await fn();

      console.log(
        'PASS:',
        name
      );

      passed++;

    } catch (error) {
      console.error(
        'FAIL:',
        name,
        error.message
      );
    }
  }

  console.log('');
  console.log('================================');

  console.log(
    `Engine 6 Test 6.2 FREE: ${passed}/${tests.length} passed`
  );

  console.log('================================');
  console.log('');

  if (passed !== tests.length) {
    process.exitCode = 1;
  }
})();
