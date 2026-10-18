
'use strict';

const assert = require('node:assert/strict');

const {
  audit,
  grade,
  googleLink
} = require('./engine6-photo-gallery');

const good = {
  searchCompleted: true,
  galleryVerified: true,
  eventVerified: true,
  stateVerified: true,
  photosVerified: true,
  evidenceUrl: 'https://example.org/irene-vermont-gallery',
  collectionSize: 'gallery'
};

const tests = [
  [
    'Google Web Search formula',
    () => assert.equal(
      audit({
        event: 'Tropical Storm Irene',
        state: 'Vermont'
      }).searchTerm,
      'photo gallery Tropical Storm Irene Vermont'
    )
  ],
  [
    'Google link does not use image search',
    () => assert.ok(
      !googleLink(
        'Tropical Storm Irene',
        'Vermont'
      ).includes('tbm=isch')
    )
  ],
  [
    'Verified gallery scores 100',
    () => assert.equal(
      grade(good).score,
      100
    )
  ],
  [
    'Verified limited collection scores 50',
    () => assert.equal(
      grade({
        ...good,
        collectionSize: 'limited'
      }).score,
      50
    )
  ],
  [
    'Incomplete search is Not Evaluated',
    () => assert.equal(
      grade({
        ...good,
        searchCompleted: false
      }).score,
      null
    )
  ],
  [
    'Missing evidence URL is Not Evaluated',
    () => assert.equal(
      grade({
        ...good,
        evidenceUrl: ''
      }).score,
      null
    )
  ],
  [
    'Unverified event is Not Evaluated',
    () => assert.equal(
      grade({
        ...good,
        eventVerified: false
      }).score,
      null
    )
  ],
  [
    'Unverified state is Not Evaluated',
    () => assert.equal(
      grade({
        ...good,
        stateVerified: false
      }).score,
      null
    )
  ],
  [
    'Unverified photos are Not Evaluated',
    () => assert.equal(
      grade({
        ...good,
        photosVerified: false
      }).score,
      null
    )
  ],
  [
    'Documented no gallery scores 0',
    () => assert.equal(
      grade({
        searchCompleted: true,
        confirmedNoGallery: true,
        searchCoverageDocumented: true,
        checkedUrls: [
          'https://example.org/search'
        ]
      }).score,
      0
    )
  ],
  [
    'Undocumented no gallery is Not Evaluated',
    () => assert.equal(
      grade({
        searchCompleted: true,
        confirmedNoGallery: true
      }).score,
      null
    )
  ],
  [
    'Google search listing alone does not score',
    () => assert.equal(
      grade({
        searchCompleted: true,
        checkedUrls: [
          'https://www.google.com/search?q=photos'
        ]
      }).score,
      null
    )
  ]
];

let passed = 0;

for (const [name, fn] of tests) {
  try {
    fn();
    console.log('PASS:', name);
    passed++;
  } catch (err) {
    console.error('FAIL:', name, err.message);
    process.exitCode = 1;
  }
}

console.log(
  `Engine 6 Test 6.1: ${passed}/${tests.length} passed`
);
