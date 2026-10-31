
/*
 GREEN LINE 1
 NATIONAL LANDMARKS TIME MACHINE

 TEST #6 — INDEPENDENT EVIDENCE-BASED GRADING

 Engine 3A: Short Historical Videos
 Engine 4A: Educational Documentaries (20+ minutes)

 Node.js 22 or newer
 No external packages required

 Render environment variable:
 YOUTUBE_API_KEY

 Render start command:
 node green-line-video-server.js

 IMPORTANT:
 Metadata verification is NOT independent
 historical authentication.

 Do not issue unsupported numeric grades.

 Engine 3A and 4A remain independent.
*/

'use strict';

const http = require('node:http');

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.YOUTUBE_API_KEY || '';

const VERSION = 'test6-independent-evidence-v1';
const RELEVANCE_VERSION = 'test5-identity-and-context-v1';

const MAX_RESULTS = 25;
const MAX_REQUESTS_PER_MINUTE = 24;

const requestHistory = new Map();

// --------------------------------------------
// VERIFIED HISTORICAL ALIASES
// --------------------------------------------

const ALIAS_LIBRARY = {
  'conference house': [
    'billopp house',
    'billop house',
    'billopp manor',
    'billop manor',
    'staten island peace conference',
    '1776 peace conference'
  ]
};

const HISTORY_PATTERN =
  /\b(history|historical|historic|heritage|revolution|revolutionary|colonial|century|1776|museum|archives?|historian|preservation|restoration|founding|architecture|architectural|landmark|built|established|battle|war|peace conference|reenactment|re-enactment)\b/i;

const DOCUMENTARY_PATTERN =
  /\b(documentary|documentaries|educational|historical|history|historian|lecture|museum|archives?|heritage|guided tour|historic tour|preservation|revolutionary war|architecture|re-enactment|reenactment)\b/i;

const SITE_CONTEXT = {
  'conference house': {
    location:
      /\b(staten island|tottenville|billopp?|richmond county|new york)\b/i,

    historic:
      /\b(1776|american revolution|revolutionary war|howe|benjamin franklin|john adams|edward rutledge|colonial|peace conference)\b/i
  }
};

// --------------------------------------------
// TEXT UTILITIES
// --------------------------------------------

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function containsPhrase(text, phrase) {
  const full = ' ' + normalize(text) + ' ';
  const match = normalize(phrase);

  return Boolean(match) &&
    full.includes(' ' + match + ' ');
}

function truncate(value, max = 1400) {
  return String(value || '').slice(0, max);
}

// --------------------------------------------
// YOUTUBE VIDEO DURATION
// --------------------------------------------

function parseDuration(iso) {
  const match =
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
      .exec(String(iso || ''));

  if (!match) return null;

  return (
    Number(match[1] || 0) * 86400 +
    Number(match[2] || 0) * 3600 +
    Number(match[3] || 0) * 60 +
    Number(match[4] || 0)
  );
}

// --------------------------------------------
// TEST #5 HISTORICAL RELEVANCE SCREENING
// --------------------------------------------

function historicalRelevance(video, site, state) {
  const title = String(video.title || '');
  const description = String(video.description || '');
  const fullText = title + ' ' + description;

  const siteKey = normalize(site);
  const aliases = ALIAS_LIBRARY[siteKey] || [];
  const names = [site, ...aliases];

  const identityName =
    names.find(name => containsPhrase(fullText, name)) || '';

  const titleIdentity =
    names.some(name => containsPhrase(title, name));

  const context = SITE_CONTEXT[siteKey];

  const stateMentioned =
    containsPhrase(fullText, state);

  const locationContext = context
    ? context.location.test(fullText)
    : stateMentioned;

  const periodContext = context
    ? context.historic.test(fullText)
    : HISTORY_PATTERN.test(fullText);

  const historicalContext =
    HISTORY_PATTERN.test(fullText);

  const identityMatched = Boolean(identityName);

  const broadAlias =
    siteKey === 'conference house' &&
    /^(1776 peace conference|staten island peace conference)$/i
      .test(identityName);

  const geographicalValid =
    !broadAlias || locationContext;

  const match =
    identityMatched &&
    geographicalValid &&
    historicalContext;

  const reasons = [];

  if (!identityMatched) {
    reasons.push(
      'No full site name or approved historical alias'
    );
  }

  if (!geographicalValid) {
    reasons.push(
      'Historical alias missing location context'
    );
  }

  if (!historicalContext) {
    reasons.push(
      'Historical context not established in metadata'
    );
  }

  return {
    match,
    identityMatched,
    matchedIdentity: identityName,
    titleIdentity,
    stateMentioned,
    locationContext,
    periodContext,
    historicalContext,
    reasons
  };
}

// --------------------------------------------
// TEST #6 EVIDENCE CLASSIFICATION
// --------------------------------------------

function classifyEvidence(relevance, checks) {
  if (!Object.values(checks).every(Boolean)) {
    return {
      status: 'Rejected',
      statusCode: 'rejected',
      historicalAuthentication: false,
      needsReview: false
    };
  }

  if (!relevance.titleIdentity) {
    return {
      status: 'Historical Review Required',
      statusCode: 'review_required',
      historicalAuthentication: false,
      needsReview: true,
      reviewReason:
        'Landmark identity does not appear in the video title. Confirm that the landmark is a substantial subject.'
    };
  }

  if (!relevance.periodContext) {
    return {
      status: 'Historical Review Required',
      statusCode: 'review_required',
      historicalAuthentication: false,
      needsReview: true,
      reviewReason:
        'Specific historical-period relevance requires examination.'
    };
  }

  return {
    status: 'Metadata Verified',
    statusCode: 'metadata_verified',
    historicalAuthentication: false,
    needsReview: true,
    reviewReason:
      'YouTube metadata passed. Historical content and accuracy have not been independently authenticated.'
  };
}

// --------------------------------------------
// INDEPENDENT ENGINE AUDIT SUMMARY
// --------------------------------------------

function buildAuditSummary(engine, videos, complete) {
  const qualified = videos.filter(v => v.qualified);

  const metadataVerified = qualified.filter(
    v => v.evidence.statusCode === 'metadata_verified'
  );

  const reviewRequired = qualified.filter(
    v => v.evidence.statusCode === 'review_required'
  );

  const rejected = videos.filter(v => !v.qualified);

  return {
    engine,

    category: engine === 3
      ? 'Short Historical Videos'
      : 'Educational Documentaries (20+ minutes)',

    evaluatedCandidates: videos.length,
    metadataQualifiedCount: qualified.length,
    metadataVerifiedCount: metadataVerified.length,
    historicalReviewRequiredCount: reviewRequired.length,
    rejectedCount: rejected.length,

    completedSearch: Boolean(complete),

    historicalEvidenceVerifiedCount: 0,
    historicalEvidenceReviewComplete: false,

    grade: null,
    gradeLetter: null,
    gradePoints: null,
    maxGradePoints: 100,

    gradingStatus: 'Not Evaluated',

    gradingReason:
      'Metadata-only screening does not constitute independently authenticated historical evidence.',

    insufficientSearchWarning: !complete
      ? 'Limited search. No zero-resource determination is permitted.'
      : null,

    eligibleForAutomaticHistoricalGrade: false,
    independentFromOtherEngine: true
  };
}

// --------------------------------------------
// CORS — BLOGGER
// --------------------------------------------

function corsOrigin(origin) {
  if (!origin) return '*';

  try {
    const parsed = new URL(origin);

    if (
      parsed.protocol === 'https:' &&
      parsed.hostname === '1-newupdates.blogspot.com'
    ) {
      return origin;
    }

    return 'null';
  } catch {
    return 'null';
  }
}

function respond(res, status, payload, origin = '') {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': corsOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  });

  res.end(status === 204 ? '' : JSON.stringify(payload));
}

// --------------------------------------------
// YOUTUBE DATA API V3
// --------------------------------------------

async function youtubeAPI(endpoint, params) {
  const url = new URL(
    'https://www.googleapis.com/youtube/v3/' +
    endpoint
  );

  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, String(value));
  }

  url.searchParams.set('key', API_KEY);

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    20000
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(
        data?.error?.message ||
        'YouTube API returned an error'
      );

      error.status = response.status;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

// --------------------------------------------
// ENGINE 3A / ENGINE 4A VIDEO AUDIT
// --------------------------------------------

async function auditVideo(site, state, engine) {
  site = String(site || '').trim();
  state = String(state || '').trim();

  if (
    site.length < 3 ||
    site.length > 180 ||
    state.length < 2 ||
    state.length > 80
  ) {
    const error = new Error(
      'Historical site name and state are required.'
    );

    error.status = 400;
    throw error;
  }

  if (engine !== '3' && engine !== '4') {
    const error = new Error(
      'Engine must be 3 or 4.'
    );

    error.status = 400;
    throw error;
  }

  if (!API_KEY) {
    const error = new Error(
      'YOUTUBE_API_KEY is not configured.'
    );

    error.status = 503;
    throw error;
  }

  const engineNumber = Number(engine);

  const searchTerm = engineNumber === 3
    ? ' history historic'
    : ' history documentary';

  const search = await youtubeAPI('search', {
    part: 'snippet',
    q: `${site} ${state}${searchTerm}`,
    type: 'video',
    maxResults: MAX_RESULTS,
    safeSearch: 'moderate'
  });

  const ids = [
    ...new Set(
      (search.items || [])
        .map(item => item.id?.videoId)
        .filter(Boolean)
    )
  ];

  const details = ids.length
    ? await youtubeAPI('videos', {
        part: 'snippet,contentDetails,status',
        id: ids.join(',')
      })
    : { items: [] };

  const videos = (details.items || []).map(item => {
    const title = item.snippet?.title || '';
    const description = item.snippet?.description || '';

    const duration = parseDuration(
      item.contentDetails?.duration
    );

    const relevance = historicalRelevance(
      { title, description },
      site,
      state
    );

    const educational = engineNumber === 3
      ? true
      : DOCUMENTARY_PATTERN.test(
          title + ' ' + description
        );

    const checks = {
      identity: Boolean(
        item.id &&
        item.snippet?.channelTitle &&
        item.snippet?.publishedAt
      ),

      public:
        item.status?.privacyStatus === 'public',

      duration:
        duration !== null &&
        (engineNumber === 3
          ? duration > 0 && duration < 1200
          : duration >= 1200),

      relevance: relevance.match,

      educational
    };

    const rejectionReasons = [];

    if (!checks.identity) {
      rejectionReasons.push(
        'Video identity or publication metadata missing'
      );
    }

    if (!checks.public) {
      rejectionReasons.push('Video is not public');
    }

    if (!checks.duration) {
      rejectionReasons.push(
        engineNumber === 3
          ? 'Duration is not under 20 minutes'
          : 'Duration is not at least 20 minutes'
      );
    }

    if (!checks.relevance) {
      rejectionReasons.push(
        ...relevance.reasons
      );
    }

    if (!checks.educational) {
      rejectionReasons.push(
        'Educational documentary metadata not established'
      );
    }

    const qualified =
      rejectionReasons.length === 0;

    const evidence = classifyEvidence(
      relevance,
      checks
    );

    return {
      id: item.id,

      url:
        'https://www.youtube.com/watch?v=' +
        item.id,

      title,

      description: truncate(description),

      channel: item.snippet?.channelTitle || '',
      published: item.snippet?.publishedAt || '',
      privacy: item.status?.privacyStatus || '',

      durationISO:
        item.contentDetails?.duration || '',

      durationSeconds: duration,

      relevance,
      checks,
      qualified,
      rejectionReasons,
      evidence,

      historicalGrade: null
    };
  });

  // Search is deliberately NOT declared complete
  // after inspecting at most 25 candidates.
  const complete = false;

  const auditSummary = buildAuditSummary(
    engineNumber,
    videos,
    complete
  );

  return {
    ok: true,
    engine: engineNumber,
    site,
    state,

    complete,

    reason:
      'Only a limited sample of YouTube search candidates was evaluated.',

    ruleVersion: VERSION,
    relevanceVersion: RELEVANCE_VERSION,

    checkedCount: videos.length,
    qualifiedCount: videos.filter(v => v.qualified).length,

    verifiedScope:
      'YouTube metadata and preliminary historical-site screening only',

    audit: auditSummary,

    videos
  };
}

// --------------------------------------------
// LOCAL TEST #6 — REGRESSION CHECKS
// --------------------------------------------

function selfTest() {
  const tests = [];

  function check(name, actual, expected) {
    const passed = actual === expected;

    tests.push({
      name,
      passed
    });

    console.log(
      (passed ? 'PASS' : 'FAIL') + ' | ' + name
    );
  }

  const site = 'Conference House';
  const state = 'New York';

  const good = historicalRelevance({
    title: 'Conference House and the Revolutionary War',
    description:
      'Staten Island history of the 1776 peace conference'
  }, site, state);

  check('Conference House identity', good.match, true);

  const fdr = historicalRelevance({
    title: 'FDR Life and Presidential Legacy',
    description: 'Yalta conference history'
  }, site, state);

  check('Unrelated FDR rejected', fdr.match, false);

  const germany = historicalRelevance({
    title: 'German History Documentary',
    description: 'Hague conference 1907'
  }, site, state);

  check('Unrelated German documentary rejected',
    germany.match, false);

  const alias = historicalRelevance({
    title: 'Billopp House historical tour',
    description:
      'Staten Island American Revolution museum'
  }, site, state);

  check('Billopp House alias', alias.match, true);

  check('4m27s duration', parseDuration('PT4M27S'), 267);
  check('39m12s duration', parseDuration('PT39M12S'), 2352);

  const empty3 = buildAuditSummary(3, [], false);
  const empty4 = buildAuditSummary(4, [], false);

  check('3A grade null', empty3.grade, null);
  check('4A grade null', empty4.grade, null);

  check('3A Not Evaluated',
    empty3.gradingStatus, 'Not Evaluated');

  check('4A Not Evaluated',
    empty4.gradingStatus, 'Not Evaluated');

  check('Separate independent engines',
    empty3.engine !== empty4.engine, true);

  const passed = tests.filter(t => t.passed).length;

  console.log(
    `Test #6: ${passed}/${tests.length} checks passed`
  );

  return passed === tests.length;
}

// --------------------------------------------
// RATE LIMITING
// --------------------------------------------

function allowRequest(ip) {
  const now = Date.now();

  const previous =
    (requestHistory.get(ip) || [])
      .filter(time => now - time < 60000);

  if (previous.length >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }

  previous.push(now);
  requestHistory.set(ip, previous);

  if (requestHistory.size > 1000) {
    for (const [address, timestamps] of requestHistory) {
      if (!timestamps.some(t => now - t < 60000)) {
        requestHistory.delete(address);
      }
    }
  }

  return true;
}

// --------------------------------------------
// HTTP SERVER
// --------------------------------------------

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    if (!selfTest()) {
      process.exitCode = 1;
    }
  } else {
    const server = http.createServer(async (req, res) => {
      const origin = req.headers.origin || '';

      if (req.method === 'OPTIONS') {
        return respond(res, 204, {}, origin);
      }

      let url;

      try {
        url = new URL(req.url, 'http://localhost');
      } catch {
        return respond(res, 400, {
          ok: false,
          error: 'Invalid request URL'
        }, origin);
      }

      // Health-check endpoint.
      if (url.pathname === '/health') {
        return respond(res, 200, {
          ok: true,
          service: 'green-line-landmark-video',
          hasKey: Boolean(API_KEY),

          relevanceVersion: RELEVANCE_VERSION,
          auditVersion: VERSION,

          independentEngines: [3, 4],
          automaticHistoricalGrades: false
        }, origin);
      }

      // Video audit endpoint.
      if (
        url.pathname !== '/audit-video' ||
        req.method !== 'GET'
      ) {
        return respond(res, 404, {
          ok: false,
          error: 'Endpoint not found'
        }, origin);
      }

      if (origin && corsOrigin(origin) === 'null') {
        return respond(res, 403, {
          ok: false,
          error: 'Origin not allowed'
        }, origin);
      }

      const ip =
        req.socket.remoteAddress || 'unknown';

      if (!allowRequest(ip)) {
        return respond(res, 429, {
          ok: false,
          error: 'Too many requests'
        }, origin);
      }

      try {
        const result = await auditVideo(
          url.searchParams.get('site'),
          url.searchParams.get('state'),
          url.searchParams.get('engine')
        );

        return respond(res, 200, result, origin);

      } catch (error) {
        const status =
          Number.isInteger(error.status) &&
          error.status >= 400 &&
          error.status <= 599
            ? error.status
            : 502;

        return respond(res, status, {
          ok: false,
          error: String(
            error.message || 'Audit failed'
          ),
          auditStatus: 'Not Evaluated',
          grade: null
        }, origin);
      }
    });

    server.listen(PORT, () => {
      console.log(
        'Green Line Test #6 video server listening on ' +
        PORT
      );
    });
  }
}

module.exports = {
  historicalRelevance,
  parseDuration,
  classifyEvidence,
  buildAuditSummary,
  auditVideo,
  selfTest
};
