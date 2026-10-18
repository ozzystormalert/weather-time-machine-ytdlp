
'use strict';

/*
 WEATHER TIME MACHINE — ENGINE 5
 TEST 6 — A–F GRADING ACCURACY
 AND VERIFICATION SAFEGUARDS

 Node.js 22
 No external packages
 No API keys

 Independent grading-policy test.

 IMPORTANT:
 This test uses simulated evidence fixtures.
 It does not search the internet.
 It does not visually inspect real maps.
 It does not modify the live Engine 5 server.
 It does not modify Blogger or Engines 1–4.
*/

const fs = require('node:fs');
const assert = require('node:assert/strict');

const OUTPUT = 'engine5-test6-results.json';

const RULES = Object.freeze({
  full: 100,
  partial: 50,
  none: 0
});

const tests = [];

// ==========================================
// ENGINE 5 GRADING FUNCTION
// ==========================================

function gradeEvidence(e) {

  // Search incomplete or unavailable.

  if (!e || e.searchCompleted !== true) {
    return {
      status: 'not_evaluated',
      score: null,
      grade: null,
      finalGrade: false,
      reason: 'Search incomplete or unavailable'
    };
  }

  // Historical authenticity requirements.

  if (
    e.visualVerified !== true ||
    e.provenanceVerified !== true ||
    e.eventVerified !== true ||
    e.geographyVerified !== true ||
    e.dateVerified !== true
  ) {
    return {
      status: 'not_evaluated',
      score: null,
      grade: null,
      finalGrade: false,
      reason: 'Authenticity evidence incomplete'
    };
  }

  // Verified acceptable historical maps.

  if (e.acceptableCount > 0) {

    const score =
      e.quality === 'full'
        ? RULES.full
        : e.quality === 'partial'
          ? RULES.partial
          : null;

    if (score === null) {
      return {
        status: 'not_evaluated',
        score: null,
        grade: null,
        finalGrade: false,
        reason: 'Quality not verified'
      };
    }

    return {
      status: 'evaluated',
      score,
      grade: score === 100 ? 'A+' : null,
      finalGrade: true,
      reason: 'Verified acceptable evidence'
    };
  }

  // Zero only after completed search
  // and confirmed absence of acceptable maps.

  if (
    e.acceptableCount === 0 &&
    e.noAcceptableConfirmed === true
  ) {
    return {
      status: 'evaluated',
      score: 0,
      grade: 'F',
      finalGrade: true,
      reason:
        'Completed search verified no acceptable maps'
    };
  }

  // Never invent zero for missing evidence.

  return {
    status: 'not_evaluated',
    score: null,
    grade: null,
    finalGrade: false,
    reason: 'No completed negative determination'
  };
}

// ==========================================
// CREATE TEST EVIDENCE
// ==========================================

function fixture(overrides = {}) {

  return {
    searchCompleted: true,

    visualVerified: true,
    provenanceVerified: true,
    eventVerified: true,
    geographyVerified: true,
    dateVerified: true,

    acceptableCount: 1,
    quality: 'full',

    noAcceptableConfirmed: false,

    ...overrides
  };
}

// ==========================================
// RUN INDIVIDUAL TEST
// ==========================================

function run(name, evidence, expected) {

  const actual = gradeEvidence(evidence);

  try {

    for (
      const [key, value]
      of Object.entries(expected)
    ) {
      assert.deepEqual(
        actual[key],
        value,
        `${name}: ${key}`
      );
    }

    tests.push({
      name,
      result: 'pass',
      actual
    });

    console.log(`PASS: ${name}`);

  } catch (error) {

    tests.push({
      name,
      result: 'fail',
      error: error.message,
      actual
    });

    console.error(`FAIL: ${name}`);
    console.error(error.message);
  }
}

// ==========================================
// TEST 1 — VERIFIED FULL EVIDENCE
// ==========================================

run(
  'Verified full evidence',
  fixture(),
  {
    status: 'evaluated',
    score: 100,
    grade: 'A+',
    finalGrade: true
  }
);

// ==========================================
// TEST 2 — VERIFIED LIMITED EVIDENCE
// ==========================================

run(
  'Verified limited evidence',
  fixture({
    quality: 'partial'
  }),
  {
    status: 'evaluated',
    score: 50,
    finalGrade: true
  }
);

// ==========================================
// TEST 3 — CONFIRMED ABSENCE
// ==========================================

run(
  'Completed search with confirmed absence',
  fixture({
    acceptableCount: 0,
    noAcceptableConfirmed: true
  }),
  {
    status: 'evaluated',
    score: 0,
    grade: 'F'
  }
);

// ==========================================
// TEST 4 — SEARCH UNAVAILABLE
// ==========================================

run(
  'Search unavailable',
  fixture({
    searchCompleted: false
  }),
  {
    status: 'not_evaluated',
    score: null,
    grade: null
  }
);

// ==========================================
// TEST 5 — NOAA URL WITHOUT
// VISUAL INSPECTION
// ==========================================

run(
  'NOAA URL without visual inspection',
  fixture({
    visualVerified: false
  }),
  {
    status: 'not_evaluated',
    score: null
  }
);

// ==========================================
// TEST 6 — UNVERIFIED PROVENANCE
// ==========================================

run(
  'Unlinked image provenance',
  fixture({
    provenanceVerified: false
  }),
  {
    status: 'not_evaluated',
    score: null
  }
);

// ==========================================
// TEST 7 — WRONG HISTORICAL EVENT
// ==========================================

run(
  'Wrong storm',
  fixture({
    eventVerified: false
  }),
  {
    status: 'not_evaluated',
    score: null
  }
);

// ==========================================
// TEST 8 — WRONG STATE
// ==========================================

run(
  'Wrong state',
  fixture({
    geographyVerified: false
  }),
  {
    status: 'not_evaluated',
    score: null
  }
);

// ==========================================
// TEST 9 — WRONG YEAR
// ==========================================

run(
  'Wrong year',
  fixture({
    dateVerified: false
  }),
  {
    status: 'not_evaluated',
    score: null
  }
);

// ==========================================
// TEST 10 — NO ACCEPTABLE MAP,
// ABSENCE NOT CONFIRMED
// ==========================================

run(
  'No map but absence not confirmed',
  fixture({
    acceptableCount: 0,
    noAcceptableConfirmed: false
  }),
  {
    status: 'not_evaluated',
    score: null
  }
);

// ==========================================
// TEST 11 — UNKNOWN QUALITY
// ==========================================

run(
  'Unknown quality',
  fixture({
    quality: 'unknown'
  }),
  {
    status: 'not_evaluated',
    score: null
  }
);

// ==========================================
// TEST 12 — MISSING EVIDENCE
// ==========================================

run(
  'Missing evidence',
  null,
  {
    status: 'not_evaluated',
    score: null
  }
);

// ==========================================
// GENERATE FINAL TEST REPORT
// ==========================================

const report = {

  test:
    'Engine 5 — Test 6 A–F Grading Safeguards',

  mode:
    'synthetic-policy-fixtures-only',

  warning:
    'These fixtures do not authenticate real maps or verify real search completeness.',

  rules: {
    full: 100,
    partial: 50,

    zero:
      'Only completed searches with confirmed absence',

    notEvaluated:
      'Null, never zero'
  },

  tests,

  passed:
    tests.filter(
      test => test.result === 'pass'
    ).length,

  failed:
    tests.filter(
      test => test.result === 'fail'
    ).length,

  readyForBlogger: false
};

// ==========================================
// SAVE JSON REPORT
// ==========================================

fs.writeFileSync(
  OUTPUT,
  JSON.stringify(
    report,
    null,
    2
  ) + '\n'
);

// ==========================================
// DISPLAY FINAL RESULTS
// ==========================================

console.log(
  '\n======================================'
);

console.log(
  'WEATHER TIME MACHINE — ENGINE 5'
);

console.log(
  'TEST 6 — GRADING SAFEGUARDS'
);

console.log(
  '======================================'
);

console.log(
  JSON.stringify(
    {
      passed: report.passed,
      failed: report.failed,
      output: OUTPUT
    },
    null,
    2
  )
);

if (report.failed > 0) {
  process.exitCode = 1;
}
