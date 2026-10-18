
'use strict';

// Weather Time Machine — Engine 6 v6.1
// Historical Weather Photo Gallery Audit
// Node.js 22 — No external packages

const fs = require('node:fs');
const { URL } = require('node:url');

const GRADES = Object.freeze({
  VERIFIED: 100,
  LIMITED: 50,
  NONE: 0
});

function text(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function queryFor(event, state) {
  if (!text(event) || !text(state)) {
    throw new Error('Event and state are required');
  }

  return `photo gallery ${text(event)} ${text(state)}`;
}

function googleLink(event, state) {
  return 'https://www.google.com/search?q=' +
    encodeURIComponent(queryFor(event, state));
}

function validHttpUrl(value) {
  try {
    const url = new URL(value);

    return (
      (url.protocol === 'https:' ||
       url.protocol === 'http:') &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

function grade(evidence) {
  if (!evidence || evidence.searchCompleted !== true) {
    return {
      status: 'Not Evaluated',
      score: null,
      grade: null,
      reason: 'Search not completed'
    };
  }

  if (
    evidence.galleryVerified === true &&
    evidence.eventVerified === true &&
    evidence.stateVerified === true &&
    evidence.photosVerified === true &&
    validHttpUrl(evidence.evidenceUrl)
  ) {
    if (evidence.collectionSize === 'limited') {
      return {
        status: 'Verified limited photo collection',
        score: GRADES.LIMITED,
        grade: '50/100',
        reason: 'Relevant limited photo collection verified'
      };
    }

    if (evidence.collectionSize === 'gallery') {
      return {
        status: 'Verified relevant photo gallery',
        score: GRADES.VERIFIED,
        grade: 'A+',
        reason: 'Relevant photo gallery verified'
      };
    }
  }

  if (
    evidence.confirmedNoGallery === true &&
    evidence.galleryVerified !== true &&
    evidence.searchCompleted === true &&
    evidence.searchCoverageDocumented === true &&
    Array.isArray(evidence.checkedUrls) &&
    evidence.checkedUrls.length > 0 &&
    evidence.checkedUrls.every(validHttpUrl)
  ) {
    return {
      status: 'Confirmed no relevant gallery',
      score: GRADES.NONE,
      grade: '0/100',
      reason: 'Completed documented search confirmed no relevant gallery'
    };
  }

  return {
    status: 'Not Evaluated',
    score: null,
    grade: null,
    reason: 'Evidence insufficient or not independently verified'
  };
}

function audit(input) {
  const event = text(input?.event);
  const state = text(input?.state);
  const year = text(String(input?.year ?? ''));

  const searchTerm = queryFor(event, state);
  const evaluation = grade(input?.evidence);

  return {
    engine: 6,
    version: '6.1',
    event,
    state,
    year,
    searchTerm,
    googleSearchUrl: googleLink(event, state),
    ...evaluation,
    evidenceUrl: validHttpUrl(input?.evidence?.evidenceUrl)
      ? input.evidence.evidenceUrl
      : null,
    automatedDiscovery: false,
    note: 'Google Web Search is a research link, not verification evidence. Gallery evidence must be independently verified.'
  };
}

// Allow direct execution to generate a JSON report.
if (require.main === module) {
  try {
    const inputPath = process.argv[2];

    const input = inputPath
      ? JSON.parse(fs.readFileSync(inputPath, 'utf8'))
      : {
          event: process.env.EVENT || 'Tropical Storm Irene',
          state: process.env.STATE || 'Vermont',
          year: process.env.YEAR || '2011'
        };

    console.log(JSON.stringify(audit(input), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

// Required exports for engine6-test61.js
module.exports = {
  queryFor,
  googleLink,
  validHttpUrl,
  grade,
  audit
};
