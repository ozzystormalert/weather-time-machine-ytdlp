
'use strict';

/*
 * WEATHER TIME MACHINE
 * ENGINE 6 — TEST 6.3 FREE
 *
 * Automatic Historical Photo Gallery Grading Tests
 *
 * No API keys.
 * No paid services.
 * No Google scraping.
 *
 * Run:
 * node engine6/engine6-test63.js
 */

const assert = require('node:assert/strict');

const {
  normalizeUrl,
  verifiedGalleryUrls,
  gradeGalleryCount,
  gradeGalleryResearch
} = require('./engine6-gallery-grading-test63');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS: ' + name);
  } catch (error) {
    failed++;
    console.error('FAIL: ' + name);
    console.error('  ' + error.message);
  }
}

function gallery(url, overrides = {}) {
  return {
    url,
    verified: true,
    eventMatch: true,
    stateMatch: true,
    yearMatch: true,
    hasEventPhotos: true,
    ...overrides
  };
}

function urls(count) {
  return Array.from(
    { length: count },
    (_, i) =>
      gallery(
        'https://example.org/gallery-' + (i + 1)
      )
  );
}

function research(galleries, completed = true) {
  return gradeGalleryResearch({
    event: 'Tropical Storm Irene',
    state: 'Vermont',
    year: '2011',
    galleries,
    researchCompleted: completed
  });
}

console.log('');
console.log('====================================');
console.log('WEATHER TIME MACHINE');
console.log('ENGINE 6 — TEST 6.3 FREE');
console.log('====================================');
console.log('');

// TEST 1
test('Five verified galleries receive 100', () => {
  const result = research(urls(5));
  assert.equal(result.score, 100);
  assert.equal(result.grade, 'A+');
});

// TEST 2
test('Six verified galleries receive 100', () => {
  const result = research(urls(6));
  assert.equal(result.score, 100);
});

// TEST 3
test('Four verified galleries receive 50', () => {
  const result = research(urls(4));
  assert.equal(result.score, 50);
  assert.equal(result.grade, 'Partial');
});

// TEST 4
test('Three verified galleries receive 50', () => {
  const result = research(urls(3));
  assert.equal(result.score, 50);
});

// TEST 5
test('Two verified galleries receive 50', () => {
  const result = research(urls(2));
  assert.equal(result.score, 50);
});

// TEST 6
test('One gallery remains Not Evaluated', () => {
  const result = research(urls(1));
  assert.equal(result.score, null);
  assert.equal(result.grade, 'Not Evaluated');
});

// TEST 7
test('Zero galleries after completed research receive 0', () => {
  const result = research([]);
  assert.equal(result.score, 0);
  assert.equal(result.grade, 'None found');
});

// TEST 8
test('Incomplete research is Not Evaluated', () => {
  const result = research(urls(5), false);
  assert.equal(result.score, null);
  assert.equal(result.grade, 'Not Evaluated');
});

// TEST 9
test('Duplicate gallery URLs count only once', () => {
  const result = research([
    gallery('https://example.org/irene'),
    gallery('https://example.org/irene')
  ]);

  assert.equal(result.verifiedGalleryCount, 1);
});

// TEST 10
test('URL fragments do not create duplicates', () => {
  const result = research([
    gallery('https://example.org/irene#photo1'),
    gallery('https://example.org/irene#photo2')
  ]);

  assert.equal(result.verifiedGalleryCount, 1);
});

// TEST 11
test('Unverified gallery is excluded', () => {
  const result = research([
    gallery(
      'https://example.org/irene',
      { verified: false }
    )
  ]);

  assert.equal(result.verifiedGalleryCount, 0);
});

// TEST 12
test('Wrong weather event is excluded', () => {
  const result = research([
    gallery(
      'https://example.org/irene',
      { eventMatch: false }
    )
  ]);

  assert.equal(result.verifiedGalleryCount, 0);
});

// TEST 13
test('Wrong state is excluded', () => {
  const result = research([
    gallery(
      'https://example.org/irene',
      { stateMatch: false }
    )
  ]);

  assert.equal(result.verifiedGalleryCount, 0);
});

// TEST 14
test('Wrong year is excluded', () => {
  const result = research([
    gallery(
      'https://example.org/irene',
      { yearMatch: false }
    )
  ]);

  assert.equal(result.verifiedGalleryCount, 0);
});

// TEST 15
test('Page without event photographs is excluded', () => {
  const result = research([
    gallery(
      'https://example.org/irene',
      { hasEventPhotos: false }
    )
  ]);

  assert.equal(result.verifiedGalleryCount, 0);
});

// TEST 16
test('Non-HTTP URL is rejected', () => {
  assert.equal(
    normalizeUrl('javascript:alert(1)'),
    null
  );
});

// TEST 17
test('URL with credentials is rejected', () => {
  assert.equal(
    normalizeUrl('https://user:pass@example.org/gallery'),
    null
  );
});

// TEST 18
test('URL normalization removes fragments', () => {
  assert.equal(
    normalizeUrl('https://example.org/gallery#image1'),
    'https://example.org/gallery'
  );
});

// TEST 19
test('Missing gallery list produces no verified URLs', () => {
  assert.deepEqual(
    verifiedGalleryUrls(undefined),
    []
  );
});

// TEST 20
test('Negative gallery count is rejected', () => {
  assert.throws(
    () => gradeGalleryCount(-1, true),
    TypeError
  );
});

// TEST 21
test('Fractional gallery count is rejected', () => {
  assert.throws(
    () => gradeGalleryCount(2.5, true),
    TypeError
  );
});

// TEST 22
test('Research result preserves event details', () => {
  const result = research(urls(2));

  assert.equal(result.event, 'Tropical Storm Irene');
  assert.equal(result.state, 'Vermont');
  assert.equal(result.year, '2011');
  assert.equal(result.version, '6.3-free');
});

// TEST 23
test('Five unverified galleries never receive points', () => {
  const candidates = urls(5).map(item => ({
    ...item,
    verified: false
  }));

  const result = research(candidates, false);

  assert.equal(result.verifiedGalleryCount, 0);
  assert.equal(result.score, null);
});

// TEST 24
test('One duplicate among five gives four galleries', () => {
  const items = urls(5);

  items[4] = gallery(
    'https://example.org/gallery-1'
  );

  const result = research(items);

  assert.equal(result.verifiedGalleryCount, 4);
  assert.equal(result.score, 50);
});

// TEST 25
test('Empty input dataset remains Not Evaluated', () => {
  const result = gradeGalleryResearch({
    event: 'Tropical Storm Irene',
    state: 'Vermont',
    year: '2011',
    researchCompleted: false,
    galleries: []
  });

  assert.equal(result.verifiedGalleryCount, 0);
  assert.equal(result.score, null);
  assert.equal(result.grade, 'Not Evaluated');
});

console.log('');
console.log('====================================');
console.log(
  'Engine 6 Test 6.3 FREE: ' +
  passed + '/25 passed'
);
console.log('====================================');

if (failed > 0) {
  console.error(
    failed + ' test(s) failed.'
  );
  process.exitCode = 1;
}
