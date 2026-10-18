
'use strict';

/*
 * WEATHER TIME MACHINE
 * ENGINE 6 — UNIVERSAL TEST 6.4 FREE
 *
 * FILE 3: AUTOMATED TEST SUITE
 *
 * Run from repository root:
 *
 * node engine6/engine6-universal-test64.js
 *
 * No API keys.
 * No paid services.
 * No network access required.
 *
 * Uses synthetic reviewed-gallery records.
 * Passing tests validate grading logic,
 * not the existence of real photo galleries.
 */

const assert = require('node:assert/strict');

const {
  cleanText,
  cleanYear,
  eventKey,
  validSelection,
  validateDataset,
  findEvent,
  googleQuery,
  googleLink,
  notEvaluated,
  gradeUniversalGallery
} = require('./engine6-universal-grading-test64');

// -------------------------------------
// TEST FRAMEWORK
// -------------------------------------

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS — ' + name);
  } catch (error) {
    failed++;
    console.error('FAIL — ' + name);
    console.error(error.stack || error.message);
  }
}

// -------------------------------------
// TEST DATA
// -------------------------------------

const selection = {
  event: 'Great Blizzard of 1978',
  state: 'Indiana',
  year: '1978'
};

function gallery(number, overrides = {}) {
  return {
    url:
      'https://example.org/weather/gallery-' +
      number,

    verified: true,
    eventMatch: true,
    stateMatch: true,
    yearMatch: true,
    hasEventPhotos: true,

    ...overrides
  };
}

function dataset(
  galleries = [],
  researchCompleted = true
) {
  return {
    engine: 6,
    version: '6.4-free',
    category: 'Historical Photo Gallery',
    events: [
      {
        ...selection,
        researchCompleted,
        galleries
      }
    ]
  };
}

function scoreResult(
  count,
  researchCompleted = true
) {
  const galleries = Array.from(
    { length: count },
    (_, index) => gallery(index + 1)
  );

  return gradeUniversalGallery(
    dataset(galleries, researchCompleted),
    selection
  );
}

// -------------------------------------
// SECTION A — NORMALIZATION
// -------------------------------------

test('01 — normalizes event text', () => {
  assert.equal(
    cleanText('  GREAT Blizzard of 1978! '),
    'great blizzard of 1978'
  );
});

test('02 — normalizes state text', () => {
  assert.equal(
    cleanText('  INDIANA  '),
    'indiana'
  );
});

test('03 — accepts four-digit years', () => {
  assert.equal(cleanYear(1978), '1978');
});

test('04 — rejects invalid years', () => {
  assert.equal(cleanYear('78'), '');
});

test('05 — creates consistent event keys', () => {
  assert.equal(
    eventKey(
      'Great Blizzard of 1978',
      'Indiana',
      1978
    ),
    eventKey(
      'great blizzard of 1978',
      'INDIANA',
      '1978'
    )
  );
});

test('06 — validates complete selections', () => {
  assert.equal(
    validSelection(
      selection.event,
      selection.state,
      selection.year
    ),
    true
  );
});

test('07 — rejects missing state', () => {
  assert.equal(
    validSelection(
      selection.event,
      '',
      selection.year
    ),
    false
  );
});

// -------------------------------------
// SECTION B — DATASET VALIDATION
// -------------------------------------

test('08 — accepts universal dataset', () => {
  assert.equal(
    validateDataset(dataset()).engine,
    6
  );
});

test('09 — rejects wrong engine number', () => {
  const data = dataset();
  data.engine = 5;

  assert.throws(
    () => validateDataset(data)
  );
});

test('10 — rejects wrong version', () => {
  const data = dataset();
  data.version = '6.3-free';

  assert.throws(
    () => validateDataset(data)
  );
});

test('11 — rejects non-array events', () => {
  const data = dataset();
  data.events = {};

  assert.throws(
    () => validateDataset(data)
  );
});

// -------------------------------------
// SECTION C — UNIVERSAL EVENT MATCHING
// -------------------------------------

test('12 — finds matching event', () => {
  const record = findEvent(
    dataset(),
    selection
  );

  assert.equal(
    record.event,
    selection.event
  );
});

test('13 — matches case-insensitive event', () => {
  const record = findEvent(
    dataset(),
    {
      event: 'GREAT BLIZZARD OF 1978',
      state: 'indiana',
      year: 1978
    }
  );

  assert.ok(record);
});

test('14 — rejects different state', () => {
  const record = findEvent(
    dataset(),
    {
      ...selection,
      state: 'Ohio'
    }
  );

  assert.equal(record, null);
});

test('15 — rejects different year', () => {
  const record = findEvent(
    dataset(),
    {
      ...selection,
      year: '1979'
    }
  );

  assert.equal(record, null);
});

test('16 — detects duplicate event records', () => {
  const data = dataset();

  data.events.push({
    ...selection,
    researchCompleted: true,
    galleries: []
  });

  assert.throws(
    () => findEvent(data, selection),
    /Duplicate universal event records/
  );
});

test('17 — missing event is Not Evaluated', () => {
  const result = gradeUniversalGallery(
    {
      engine: 6,
      version: '6.4-free',
      events: []
    },
    selection
  );

  assert.equal(result.score, null);
  assert.equal(result.grade, 'Not Evaluated');
});

// -------------------------------------
// SECTION D — GRADING RULES
// -------------------------------------

test('18 — zero galleries gives 0', () => {
  const result = scoreResult(0);

  assert.equal(result.score, 0);
});

test('19 — one gallery is Not Evaluated', () => {
  const result = scoreResult(1);

  assert.equal(result.score, null);
});

test('20 — two galleries gives 50', () => {
  const result = scoreResult(2);

  assert.equal(result.score, 50);
});

test('21 — three galleries gives 50', () => {
  const result = scoreResult(3);

  assert.equal(result.score, 50);
});

test('22 — four galleries gives 50', () => {
  const result = scoreResult(4);

  assert.equal(result.score, 50);
});

test('23 — five galleries gives 100', () => {
  const result = scoreResult(5);

  assert.equal(result.score, 100);
});

test('24 — ten galleries gives 100', () => {
  const result = scoreResult(10);

  assert.equal(result.score, 100);
});

test('25 — incomplete research is Not Evaluated', () => {
  const result = scoreResult(5, false);

  assert.equal(result.score, null);
});

// -------------------------------------
// SECTION E — EVIDENCE FILTERING
// -------------------------------------

test('26 — ignores unverified galleries', () => {
  const result = gradeUniversalGallery(
    dataset([
      gallery(1),
      gallery(2, { verified: false })
    ]),
    selection
  );

  assert.equal(
    result.verifiedGalleryCount,
    1
  );
});

test('27 — ignores wrong event evidence', () => {
  const result = gradeUniversalGallery(
    dataset([
      gallery(1, { eventMatch: false })
    ]),
    selection
  );

  assert.equal(
    result.verifiedGalleryCount,
    0
  );
});

test('28 — ignores wrong state evidence', () => {
  const result = gradeUniversalGallery(
    dataset([
      gallery(1, { stateMatch: false })
    ]),
    selection
  );

  assert.equal(
    result.verifiedGalleryCount,
    0
  );
});

test('29 — ignores wrong year evidence', () => {
  const result = gradeUniversalGallery(
    dataset([
      gallery(1, { yearMatch: false })
    ]),
    selection
  );

  assert.equal(
    result.verifiedGalleryCount,
    0
  );
});

test('30 — ignores records without event photos', () => {
  const result = gradeUniversalGallery(
    dataset([
      gallery(1, { hasEventPhotos: false })
    ]),
    selection
  );

  assert.equal(
    result.verifiedGalleryCount,
    0
  );
});

test('31 — prevents duplicate gallery URLs', () => {
  const result = gradeUniversalGallery(
    dataset([
      gallery(1),
      gallery(1),
      gallery(2)
    ]),
    selection
  );

  assert.equal(
    result.verifiedGalleryCount,
    2
  );
});

// -------------------------------------
// SECTION F — RESEARCH LINKS
// -------------------------------------

test('32 — creates event-specific query', () => {
  const query = googleQuery(
    selection.event,
    selection.state,
    selection.year
  );

  assert.ok(query.includes('Indiana'));
  assert.ok(query.includes('1978'));
});

test('33 — generates Google research URL', () => {
  const url = googleLink(
    selection.event,
    selection.state,
    selection.year
  );

  assert.ok(
    url.startsWith(
      'https://www.google.com/search?q='
    )
  );
});

test('34 — URL contains encoded search query', () => {
  const url = googleLink(
    selection.event,
    selection.state,
    selection.year
  );

  assert.ok(
    decodeURIComponent(url).includes(
      'Great Blizzard of 1978'
    )
  );
});

// -------------------------------------
// SECTION G — SAFETY AND ISOLATION
// -------------------------------------

test('35 — empty dataset stays Not Evaluated', () => {
  const result = gradeUniversalGallery(
    {
      engine: 6,
      version: '6.4-free',
      events: []
    },
    selection
  );

  assert.equal(result.score, null);
});

test('36 — does not use Google search totals', () => {
  const data = dataset([], false);

  data.googleResultCount = 500000;

  const result = gradeUniversalGallery(
    data,
    selection
  );

  assert.equal(result.score, null);
});

test('37 — invalid selection is Not Evaluated', () => {
  const result = gradeUniversalGallery(
    dataset(),
    {
      event: '',
      state: 'Indiana',
      year: '1978'
    }
  );

  assert.equal(result.score, null);
});

test('38 — different events stay isolated', () => {
  const data = dataset([
    gallery(1),
    gallery(2),
    gallery(3),
    gallery(4),
    gallery(5)
  ]);

  data.events.push({
    event: 'Hurricane Katrina',
    state: 'Louisiana',
    year: '2005',
    researchCompleted: true,
    galleries: []
  });

  const result = gradeUniversalGallery(
    data,
    {
      event: 'Hurricane Katrina',
      state: 'Louisiana',
      year: '2005'
    }
  );

  assert.equal(result.score, 0);
  assert.equal(
    result.verifiedGalleryCount,
    0
  );
});

test('39 — no evaluated grade for one gallery', () => {
  const result = scoreResult(1);

  assert.equal(result.score, null);
  assert.equal(
    result.grade,
    'Not Evaluated'
  );
});

test('40 — Not Evaluated helper has null score', () => {
  const result = notEvaluated(
    selection,
    'Research unavailable'
  );

  assert.equal(result.score, null);
  assert.equal(
    result.status,
    'Research unavailable'
  );
});

// -------------------------------------
// FINAL REPORT
// -------------------------------------

console.log('');
console.log('===================================');
console.log(' WEATHER TIME MACHINE — ENGINE 6');
console.log(' UNIVERSAL TEST 6.4 FREE');
console.log('===================================');
console.log('TOTAL TESTS: ' + (passed + failed));
console.log('PASSED: ' + passed);
console.log('FAILED: ' + failed);
console.log('===================================');

if (failed > 0) {
  console.error(
    'ENGINE 6 TEST 6.4 — FAILED'
  );

  process.exitCode = 1;
} else {
  console.log(
    'ENGINE 6 TEST 6.4 — ALL 40 TESTS PASSED'
  );
}
