
'use strict';

/*
 * WEATHER TIME MACHINE
 * ENGINE 6 — TEST 6.4 FREE
 *
 * UNIVERSAL HISTORICAL PHOTO GALLERY GRADING
 *
 * Supports all 50 states and all historical events.
 *
 * No paid API.
 * No API keys.
 * No Google scraping.
 *
 * Research evidence must be reviewed independently.
 *
 * Run:
 * node engine6/engine6-universal-grading-test64.js
 *
 * Optional environment variables:
 * STATE=Indiana
 * EVENT=Great Blizzard of 1978
 * YEAR=1978
 * INPUT=engine6/engine6-universal-gallery-test64.json
 * OUTPUT=engine6-test64-results.json
 */

const fs = require('node:fs');

const path = require('node:path');

const {
  verifiedGalleryUrls,
  gradeGalleryCount
} = require('./engine6-gallery-grading-test63');

// -------------------------------------
// NORMALIZATION
// -------------------------------------

function cleanText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanYear(value) {
  const year = String(value ?? '').trim();

  return /^\d{4}$/.test(year) ? year : '';
}

function eventKey(event, state, year) {
  return [
    cleanText(event),
    cleanText(state),
    cleanYear(year)
  ].join('|');
}

function validSelection(event, state, year) {
  return Boolean(
    cleanText(event) &&
    cleanText(state) &&
    cleanYear(year)
  );
}

// -------------------------------------
// UNIVERSAL DATASET VALIDATION
// -------------------------------------

function validateDataset(dataset) {
  if (!dataset || typeof dataset !== 'object') {
    throw new TypeError(
      'Universal gallery dataset must be an object.'
    );
  }

  if (dataset.engine !== 6) {
    throw new Error(
      'Dataset must identify Engine 6.'
    );
  }

  if (dataset.version !== '6.4-free') {
    throw new Error(
      'Dataset version must be 6.4-free.'
    );
  }

  if (!Array.isArray(dataset.events)) {
    throw new TypeError(
      'Dataset events must be an array.'
    );
  }

  return dataset;
}

// -------------------------------------
// FIND MATCHING EVENT RECORD
// -------------------------------------

function findEvent(dataset, selection) {
  validateDataset(dataset);

  const {
    event,
    state,
    year
  } = selection || {};

  if (!validSelection(event, state, year)) {
    return null;
  }

  const wanted = eventKey(event, state, year);

  const matches = dataset.events.filter(record => {
    if (!record || typeof record !== 'object') {
      return false;
    }

    return eventKey(
      record.event,
      record.state,
      record.year
    ) === wanted;
  });

  // Duplicate event records could lead to
  // conflicting grades. Do not guess.
  if (matches.length > 1) {
    throw new Error(
      'Duplicate universal event records: ' +
      wanted
    );
  }

  return matches[0] || null;
}

// -------------------------------------
// RESEARCH LINKS
// -------------------------------------

function googleQuery(event, state, year) {
  return [
    'photo gallery',
    String(event ?? '').trim(),
    String(state ?? '').trim(),
    String(year ?? '').trim()
  ].filter(Boolean).join(' ');
}

function googleLink(event, state, year) {
  return (
    'https://www.google.com/search?q=' +
    encodeURIComponent(
      googleQuery(event, state, year)
    )
  );
}

// -------------------------------------
// UNIVERSAL GRADING
// -------------------------------------

function notEvaluated(selection, reason) {
  const {
    event = '',
    state = '',
    year = ''
  } = selection || {};

  return {
    engine: 6,
    version: '6.4-free',
    category: 'Historical Photo Gallery',
    event: String(event),
    state: String(state),
    year: String(year),
    verifiedGalleryCount: 0,
    verifiedGalleryUrls: [],
    researchCompleted: false,
    score: null,
    grade: 'Not Evaluated',
    status: reason,
    googleSearchUrl: googleLink(
      event,
      state,
      year
    )
  };
}

function gradeUniversalGallery(dataset, selection) {
  validateDataset(dataset);

  if (
    !selection ||
    !validSelection(
      selection.event,
      selection.state,
      selection.year
    )
  ) {
    return notEvaluated(
      selection,
      'Select a valid event, state, and year.'
    );
  }

  const record = findEvent(dataset, selection);

  if (!record) {
    return notEvaluated(
      selection,
      'No reviewed gallery dataset for this event.'
    );
  }

  const galleries = verifiedGalleryUrls(
    record.galleries
  );

  const completed =
    record.researchCompleted === true;

  const grading = gradeGalleryCount(
    galleries.length,
    completed
  );

  return {
    engine: 6,
    version: '6.4-free',
    category: 'Historical Photo Gallery',
    event: String(selection.event),
    state: String(selection.state),
    year: String(selection.year),
    verifiedGalleryCount: galleries.length,
    verifiedGalleryUrls: galleries,
    researchCompleted: completed,
    score: grading.score,
    grade: grading.grade,
    status: grading.status,
    googleSearchUrl: googleLink(
      selection.event,
      selection.state,
      selection.year
    ),
    note:
      'Only distinct independently verified ' +
      'event-specific galleries count. ' +
      'Google search result totals are not grades.'
  };
}

// -------------------------------------
// COMMAND-LINE EXECUTION
// -------------------------------------

function runCli() {
  const inputPath =
    process.env.INPUT ||
    path.join(
      __dirname,
      'engine6-universal-gallery-test64.json'
    );

  const outputPath =
    process.env.OUTPUT ||
    'engine6-test64-results.json';

  const selection = {
    event:
      process.env.EVENT ||
      'Great Blizzard of 1978',

    state:
      process.env.STATE ||
      'Indiana',

    year:
      process.env.YEAR ||
      '1978'
  };

  const dataset = JSON.parse(
    fs.readFileSync(inputPath, 'utf8')
  );

  const result = gradeUniversalGallery(
    dataset,
    selection
  );

  fs.writeFileSync(
    outputPath,
    JSON.stringify(result, null, 2) + '\n'
  );

  console.log('');
  console.log(
    'ENGINE 6 — UNIVERSAL GALLERY AUDIT'
  );
  console.log(
    'Event: ' + result.event
  );
  console.log(
    'State: ' + result.state
  );
  console.log(
    'Year: ' + result.year
  );
  console.log(
    'Verified Galleries: ' +
    result.verifiedGalleryCount
  );
  console.log(
    'Score: ' +
    (
      result.score === null
        ? 'Not Evaluated'
        : result.score + '/100'
    )
  );
  console.log(
    'Grade: ' + result.grade
  );
  console.log(
    'Status: ' + result.status
  );
  console.log('');

  console.log(
    JSON.stringify(result, null, 2)
  );
}

module.exports = {
  cleanText,
  cleanYear,
  eventKey,
  validSelection,
  validateDataset,
  findEvent,
  googleQuery,
  googleLink,
  notEvaluated,
  gradeUniversalGallery,
  runCli
};

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    console.error(
      'Engine 6 Test 6.4 failed:',
      error.message
    );

    process.exitCode = 1;
  }
}
