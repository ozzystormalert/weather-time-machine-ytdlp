
'use strict';

/**
 * WEATHER TIME MACHINE
 * ENGINE 5 — VERSION 7.2
 * FINAL GRADING SAFEGUARD VERIFICATION
 *
 * Node.js 22
 * No external packages
 *
 * Independent test only.
 * Does not modify:
 * - Engine 5 production server v6.5
 * - Blogger
 * - Engines 1, 2, 3, or 4
 *
 * Does not authenticate maps.
 * Does not assign final A-F letter grades.
 */

const fs = require('node:fs');
const path = require('node:path');

const INPUT =
  process.env.VALIDATION_REPORT ||
  'engine5-v71-auth-validation-results.json';

const OUTPUT =
  'engine5-v72-final-grading-results.json';

const EVENT =
  process.env.EVENT || 'Superstorm Sandy';

const STATE =
  process.env.STATE || 'New Jersey';

const YEAR =
  String(process.env.YEAR || '2012');

const VALID_CATEGORIES = [
  'Historical Articles',
  'Event Images',
  'News Coverage',
  'Documentaries',
  'Weather Maps',
  'Photo Gallery',
  'Newspaper Headlines'
];

const tests = [];

function assert(name, actual, expected) {
  const pass =
    JSON.stringify(actual) === JSON.stringify(expected);

  tests.push({
    name,
    pass,
    actual,
    expected
  });

  if (!pass) {
    process.exitCode = 1;
  }
}

/**
 * CATEGORY GRADING RULES
 *
 * 100 = verified acceptable resource
 *  50 = verified limited resource
 *   0 = completed search confirms none
 * null = Not Evaluated
 */

function categoryResult({
  completedSearch = false,
  authenticated = false,
  acceptable = false,
  limited = false,
  confirmedNone = false
} = {}) {

  if (!completedSearch) {
    return {
      status: 'not_evaluated',
      points: null
    };
  }

  if (authenticated && acceptable) {
    return {
      status: limited
        ? 'verified_limited'
        : 'verified_acceptable',

      points: limited ? 50 : 100
    };
  }

  if (
    confirmedNone &&
    !acceptable &&
    !authenticated
  ) {
    return {
      status: 'confirmed_none',
      points: 0
    };
  }

  return {
    status: 'not_evaluated',
    points: null
  };
}

/**
 * SEVEN-CATEGORY AUDIT
 *
 * All seven categories must be evaluated
 * before a final numerical score is produced.
 *
 * Letter grading remains disabled until
 * the complete A-F rubric is verified.
 */

function auditSeven(items) {

  if (
    !Array.isArray(items) ||
    items.length !== 7
  ) {
    throw Error(
      'Seven categories required'
    );
  }

  const results =
    items.map(categoryResult);

  const complete =
    results.every(
      x => x.points !== null
    );

  const total = complete
    ? results.reduce(
        (sum, x) => sum + x.points,
        0
      )
    : null;

  const score = complete
    ? Math.round(
        total / 7 * 100
      ) / 100
    : null;

  return {
    complete,
    score,
    grade: null,
    finalGrade: false,
    results
  };
}

/**
 * TEST 1
 * Incomplete search must remain
 * Not Evaluated.
 */

assert(
  'Incomplete search is Not Evaluated',
  categoryResult({}),
  {
    status: 'not_evaluated',
    points: null
  }
);

/**
 * TEST 2
 * Downloaded images are not
 * automatically authenticated.
 */

assert(
  'Downloaded but unverified image is Not Evaluated',
  categoryResult({
    completedSearch: true
  }),
  {
    status: 'not_evaluated',
    points: null
  }
);

/**
 * TEST 3
 * Authenticated acceptable resource.
 */

assert(
  'Authenticated acceptable map earns full category points',
  categoryResult({
    completedSearch: true,
    authenticated: true,
    acceptable: true
  }),
  {
    status: 'verified_acceptable',
    points: 100
  }
);

/**
 * TEST 4
 * Authenticated limited resource.
 */

assert(
  'Authenticated limited map earns partial category points',
  categoryResult({
    completedSearch: true,
    authenticated: true,
    acceptable: true,
    limited: true
  }),
  {
    status: 'verified_limited',
    points: 50
  }
);

/**
 * TEST 5
 * Confirmed absence after completed search.
 */

assert(
  'Confirmed completed search with no acceptable resource earns zero',
  categoryResult({
    completedSearch: true,
    confirmedNone: true
  }),
  {
    status: 'confirmed_none',
    points: 0
  }
);

/**
 * TEST 6
 * Unverified images must not
 * automatically receive zero.
 */

assert(
  'Unverified map cannot be zero just because it is unverified',
  categoryResult({
    completedSearch: true,
    authenticated: false,
    acceptable: false
  }),
  {
    status: 'not_evaluated',
    points: null
  }
);

/**
 * TEST 7
 * Seven fully verified categories.
 */

assert(
  'Seven verified categories give 100 average',

  auditSeven(
    Array.from(
      { length: 7 },
      () => ({
        completedSearch: true,
        authenticated: true,
        acceptable: true
      })
    )
  ).score,

  100
);

/**
 * TEST 8
 * One incomplete category prevents
 * final numerical grading.
 */

assert(
  'Six verified and one pending cannot produce final score',

  auditSeven([
    ...Array.from(
      { length: 6 },
      () => ({
        completedSearch: true,
        authenticated: true,
        acceptable: true
      })
    ),
    {}
  ]).score,

  null
);

/**
 * TEST 9
 * Mixed category scoring.
 *
 * Five categories at 100
 * One category at 50
 * One category at 0
 *
 * 550 / 7 = 78.57
 */

assert(
  'Mixed verified categories average correctly',

  auditSeven([
    ...[100, 100, 100, 100, 100].map(
      () => ({
        completedSearch: true,
        authenticated: true,
        acceptable: true
      })
    ),

    {
      completedSearch: true,
      authenticated: true,
      acceptable: true,
      limited: true
    },

    {
      completedSearch: true,
      confirmedNone: true
    }
  ]).score,

  78.57
);

/**
 * FINAL REPORT
 */

const report = {
  engine: 5,
  version: '7.2',

  test:
    'Final Grading Safeguard Verification',

  startedAt:
    new Date().toISOString(),

  event: EVENT,
  state: STATE,
  year: YEAR,

  validationInput: INPUT,

  sourceStatus:
    'not_provided',

  sourceCandidates: [],

  tests,

  score: null,
  grade: null,
  finalGrade: false,

  authenticatedMaps: 0,

  sevenCategories:
    VALID_CATEGORIES
};

/**
 * READ ACTUAL ENGINE 5 v7.1 RESULTS
 *
 * The v7.1 report is optional for
 * synthetic testing, but required
 * to assess actual Sandy candidates.
 */

try {

  if (fs.existsSync(INPUT)) {

    const source = JSON.parse(
      fs.readFileSync(
        path.resolve(INPUT),
        'utf8'
      )
    );

    if (
      source.engine !== 5 ||
      String(source.version) !== '7.1' ||
      !Array.isArray(source.candidates)
    ) {
      throw Error(
        'Invalid v7.1 validation report'
      );
    }

    if (
      source.event !== EVENT ||
      source.state !== STATE ||
      String(source.year) !== YEAR
    ) {
      throw Error(
        'v7.1 event/state/year mismatch'
      );
    }

    report.sourceStatus = 'loaded';

    report.sourceCandidates =
      source.candidates.map(c => ({
        title: c.title,
        status: c.status,

        authenticatedInSource:
          c.authenticated === true,

        acceptedForGrading: false,

        points: null,
        grade: null,

        reason:
          'v7.1 does not independently corroborate evidence; no grading credit permitted'
      }));

    report.sourceStatus =
      source.error
        ? 'source_contains_error'
        : 'loaded_unverified';

    assert(
      'Actual v7.1 candidates receive no automatic points',

      report.sourceCandidates.every(
        c =>
          c.points === null &&
          c.acceptedForGrading === false
      ),

      true
    );

  } else {

    report.sourceStatus = 'missing';

    report.warning =
      'v7.1 report not found. Synthetic safeguards tested; real Sandy records not assessed.';

  }

} catch (e) {

  report.error =
    String(e.message);

  process.exitCode = 1;

}

/**
 * TEST SUMMARY
 */

report.summary = {

  passed:
    tests.filter(t => t.pass).length,

  failed:
    tests.filter(t => !t.pass).length,

  sourceCandidates:
    report.sourceCandidates.length,

  authenticatedMaps: 0,

  finalGradingEnabled: false

};

report.completedAt =
  new Date().toISOString();

/**
 * SAVE JSON REPORT
 */

fs.writeFileSync(
  OUTPUT,
  JSON.stringify(report, null, 2)
);

/**
 * CONSOLE OUTPUT
 */

console.log(
  'Engine 5 v7.2',
  JSON.stringify(report.summary)
);

console.log(
  'Source:',
  report.sourceStatus,
  '| Final grade: NOT EVALUATED'
);

console.log(
  'Report:',
  OUTPUT
);

if (report.error) {
  console.error(report.error);
}

if (report.summary.failed) {
  process.exitCode = 1;
}
