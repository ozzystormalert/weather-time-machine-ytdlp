
/*
 GREEN LINE 1 — NATIONAL LANDMARKS TIME MACHINE
 TEST #5 — HISTORICAL RELEVANCE SCREENING

 COMPLETE REPLACEMENT SERVER

 Engine 3A: Short Historical Videos
 Engine 4A: Educational Documentaries (20+ minutes)

 Node.js 22+
 No npm packages required.

 Required Render environment variable:
 YOUTUBE_API_KEY

 Render start command:
 node green-line-video-server.js

 IMPORTANT:
 Search results are not independently authenticated
 historical resources. Incomplete searches cannot
 receive a verified zero grade.
*/

const http = require('node:http');

const PORT = Number(process.env.PORT || 3000);
const KEY = process.env.YOUTUBE_API_KEY || '';

const MAX_PER_IP = 24;
const requestHistory = new Map();

const VERSION = 'test5-identity-and-context-v1';

// Approved aliases for known historical landmarks.
// More aliases can be added after verification.
const ALIAS_LIBRARY = {
  'conference house': [
    'billopp house',
    'billop house',
    'billop manor',
    'billopp manor',
    'staten island peace conference',
    '1776 peace conference'
  ]
};

const HISTORICAL_TERMS =
  /\b(history|historical|historic|heritage|revolution|revolutionary|colonial|century|1776|museum|archives?|historian|preservation|restoration|founding|architecture|architectural|landmark|built|established|battle|war|peace conference|reenactment|re-enactment)\b/i;

const DOCUMENTARY_TERMS =
  /\b(documentary|documentaries|educational|historical|history|historian|lecture|museum|archives?|heritage|guided tour|walking tour|historic tour|preservation|revolutionary war|architecture|re-enactment|reenactment)\b/i;

// -------------------------------------------
// NORMALIZE TEXT
// -------------------------------------------

function normalized(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Require full word/phrase boundaries.
function containsPhrase(text, phrase) {
  const t = ' ' + normalized(text) + ' ';
  const p = normalized(phrase);

  return Boolean(p) && t.includes(' ' + p + ' ');
}

function abbreviate(s, n = 1000) {
  return String(s || '').slice(0, n);
}

// -------------------------------------------
// BLOGGER CORS
// -------------------------------------------

function allowedOrigin(origin) {
  if (!origin) return '*';

  try {
    const url = new URL(origin);

    if (
      url.protocol === 'https:' &&
      url.hostname === '1-newupdates.blogspot.com'
    ) {
      return origin;
    }

    return '';
  } catch {
    return '';
  }
}

function send(res, code, data, origin = '') {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':
      allowedOrigin(origin) || 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Cache-Control': 'no-store'
  });

  res.end(code === 204 ? '' : JSON.stringify(data));
}

// -------------------------------------------
// YOUTUBE DURATION PARSER
// -------------------------------------------

function durationSeconds(iso) {
  const match =
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
      .exec(iso || '');

  if (!match) return null;

  return (
    Number(match[1] || 0) * 86400 +
    Number(match[2] || 0) * 3600 +
    Number(match[3] || 0) * 60 +
    Number(match[4] || 0)
  );
}

// -------------------------------------------
// TEST #5 — HISTORICAL RELEVANCE
// -------------------------------------------

function historicalRelevance(video, site, state) {
  const title = String(video.title || '');
  const description = String(video.description || '');
  const text = title + ' ' + description;

  const canon = normalized(site);
  const aliases = ALIAS_LIBRARY[canon] || [];

  const acceptedNames = [site, ...aliases];

  // Require an actual landmark name or
  // approved historical alias.
  const matchedIdentity =
    acceptedNames.find(alias =>
      containsPhrase(text, alias)
    ) || '';

  const titleIdentity = acceptedNames.some(alias =>
    containsPhrase(title, alias)
  );

  const stateMentioned =
    containsPhrase(text, state);

  // Specific context for Conference House.
  const localContext =
    /\b(staten island|tottenville|billopp?|richmond county|new york)\b/i
      .test(text);

  const periodContext =
    /\b(1776|american revolution|revolutionary war|howe|benjamin franklin|john adams|edward rutledge|colonial|peace conference)\b/i
      .test(text);

  const historicalContext =
    HISTORICAL_TERMS.test(text);

  const identity = Boolean(matchedIdentity);

  // Broad historical event aliases require
  // matching geographic context.
  const aliasNeedsGeography =
    canon === 'conference house' &&
    /^(1776 peace conference|staten island peace conference)$/i
      .test(matchedIdentity);

  const geography =
    !aliasNeedsGeography || localContext;

  // Final relevance decision:
  // identity + required geographic context
  // + historical subject matter.
  const match =
    identity &&
    geography &&
    historicalContext;

  const reasons = [];

  if (!identity) {
    reasons.push(
      'No full site name or approved historical alias'
    );
  }

  if (!geography) {
    reasons.push(
      'Historical alias lacks matching location context'
    );
  }

  if (!historicalContext) {
    reasons.push(
      'Historical subject context not established'
    );
  }

  return {
    match,
    identityMatched: identity,
    matchedIdentity,
    titleIdentity,
    stateMentioned,
    historicalContext,
    localContext,
    periodContext,
    reasons
  };
}

// -------------------------------------------
// YOUTUBE DATA API V3
// -------------------------------------------

async function youtube(endpoint, params) {
  const url = new URL(
    'https://www.googleapis.com/youtube/v3/' +
    endpoint
  );

  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, String(val));
  }

  // API key remains on the Render server.
  url.searchParams.set('key', KEY);

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    20000
  );

  try {
    const resp = await fetch(url, {
      signal: controller.signal
    });

    const json = await resp.json();

    if (!resp.ok) {
      const err = new Error(
        json?.error?.message ||
        'YouTube API request failed'
      );

      err.status = resp.status;
      throw err;
    }

    return json;
  } finally {
    clearTimeout(timeout);
  }
}

// -------------------------------------------
// ENGINES 3A AND 4A
// -------------------------------------------

async function audit({site, state, engine}) {
  site = String(site || '').trim();
  state = String(state || '').trim();

  engine = String(engine) === '4' ? 4 : 3;

  if (
    site.length < 3 ||
    site.length > 180 ||
    state.length < 2 ||
    state.length > 80
  ) {
    const e = new Error(
      'Historical site name and state are required'
    );

    e.status = 400;
    throw e;
  }

  if (!KEY) {
    const e = new Error(
      'YOUTUBE_API_KEY not configured'
    );

    e.status = 503;
    throw e;
  }

  // Independent searches for each engine.
  const term = engine === 4
    ? ' history documentary'
    : ' history historic';

  const search = await youtube('search', {
    part: 'snippet',
    q: site + ' ' + state + term,
    type: 'video',
    maxResults: 25,
    safeSearch: 'moderate'
  });

  const ids = [
    ...new Set(
      (search.items || [])
        .map(x => x.id?.videoId)
        .filter(Boolean)
    )
  ];

  const details = ids.length
    ? await youtube('videos', {
        part: 'snippet,contentDetails,status',
        id: ids.join(',')
      })
    : {items: []};

  const videos = (details.items || []).map(v => {
    const title =
      v.snippet?.title || '';

    const description =
      v.snippet?.description || '';

    const duration =
      durationSeconds(
        v.contentDetails?.duration
      );

    const relevance = historicalRelevance(
      {title, description},
      site,
      state
    );

    // Engine 3A accepts the provisional
    // short-video runtime range.
    //
    // Engine 4A requires 20+ minutes
    // and documentary/educational metadata.
    const educational =
      engine === 3 ||
      DOCUMENTARY_TERMS.test(
        title + ' ' + description
      );

    const checks = {
      identity: Boolean(
        v.id &&
        v.snippet?.channelTitle &&
        v.snippet?.publishedAt
      ),

      public:
        v.status?.privacyStatus === 'public',

      duration:
        duration !== null &&
        (
          engine === 4
            ? duration >= 1200
            : duration > 0 && duration < 1200
        ),

      relevance: relevance.match,

      educational
    };

    const rejectionReasons =
      Object.entries(checks)
        .filter(([,ok]) => !ok)
        .map(([k]) => ({
          identity:
            'Missing video identity/channel/publication metadata',

          public:
            'Video not public',

          duration:
            engine === 4
              ? 'Not at least 20 minutes'
              : 'Not shorter than 20 minutes',

          relevance:
            relevance.reasons.join('; ') ||
            'Site identity/relevance failed',

          educational:
            'No educational or documentary metadata'
        }[k]));

    return {
      id: v.id,

      url:
        'https://www.youtube.com/watch?v=' +
        v.id,

      title,

      description: abbreviate(description),

      channel:
        v.snippet?.channelTitle || '',

      published:
        v.snippet?.publishedAt || '',

      privacy:
        v.status?.privacyStatus || '',

      durationISO:
        v.contentDetails?.duration || '',

      durationSeconds: duration,

      relevance,

      checks,

      qualified:
        rejectionReasons.length === 0,

      rejectionReasons
    };
  });

  return {
    ok: true,
    engine,
    site,
    state,

    // Search is sampled, not exhaustive.
    complete: false,

    reason:
      'Limited 25-result discovery; no zero score or exhaustive claim permitted.',

    videos,

    qualifiedCount:
      videos.filter(x => x.qualified).length,

    checkedCount: videos.length,

    verifiedScope:
      'YouTube metadata eligibility and site-identity screening, not historical authenticity',

    ruleVersion: VERSION
  };
}

// -------------------------------------------
// LOCAL TEST #5 RELEVANCE CASES
// -------------------------------------------

function fixtures() {
  const cases = [
    [
      'Conference House tour with Revolutionary War story',
      'Conference House, Staten Island, 1776 peace conference',
      true
    ],
    [
      'FDR Life and Presidential Legacy',
      'The 1945 Yalta conference changed history',
      false
    ],
    [
      'AN DAS DEUTSCHE VOLK',
      'Hague conference of 1907 and German history',
      false
    ],
    [
      'Visit Staten Island park',
      'Walking trails and wildlife only',
      false
    ],
    [
      'Billopp House historical tour',
      'Staten Island American Revolution museum',
      true
    ],
    [
      '1776 Peace Conference documentary',
      'Staten Island history of the Billopp House',
      true
    ],
    [
      'A Tour of Conference House',
      'Open House TV shows the historical site',
      true
    ],
    [
      'Annual conference of history teachers',
      'Discussion of school history',
      false
    ]
  ];

  return cases.map(
    ([title, description, expected]) => ({
      title,
      expected,

      actual: historicalRelevance(
        {title, description},
        'Conference House',
        'New York'
      ).match
    })
  );
}

// -------------------------------------------
// SERVER STARTUP
// -------------------------------------------

if (require.main === module) {
  // Run local tests using:
  // node green-line-video-server.js --self-test

  if (process.argv.includes('--self-test')) {
    const checks = fixtures();

    checks.forEach(t => {
      console.log(
        `${t.actual === t.expected ? 'PASS' : 'FAIL'} | ${t.title}`
      );
    });

    if (
      checks.some(t => t.actual !== t.expected)
    ) {
      process.exitCode = 1;
    }

  } else {

    http.createServer(async (req, res) => {
      const origin =
        req.headers.origin || '';

      if (req.method === 'OPTIONS') {
        return send(res, 204, {}, origin);
      }

      let url;

      try {
        url = new URL(
          req.url,
          'http://localhost'
        );
      } catch {
        return send(
          res,
          400,
          {
            ok: false,
            error: 'Invalid URL'
          },
          origin
        );
      }

      // -----------------------------------
      // HEALTH ENDPOINT
      // -----------------------------------

      if (url.pathname === '/health') {
        return send(
          res,
          200,
          {
            ok: true,
            service:
              'green-line-landmark-video',
            hasKey: Boolean(KEY),
            relevanceVersion: VERSION
          },
          origin
        );
      }

      // -----------------------------------
      // AUDIT ENDPOINT
      // -----------------------------------

      if (
        url.pathname !== '/audit-video' ||
        req.method !== 'GET'
      ) {
        return send(
          res,
          404,
          {
            ok: false,
            error: 'Not found'
          },
          origin
        );
      }

      if (
        origin &&
        !allowedOrigin(origin)
      ) {
        return send(
          res,
          403,
          {
            ok: false,
            error: 'Origin not allowed'
          },
          origin
        );
      }

      // Simple rate limiter.
      const ip =
        req.socket.remoteAddress ||
        'unknown';

      const now = Date.now();

      const times =
        (requestHistory.get(ip) || [])
          .filter(t => now - t < 60000);

      if (
        times.length >= MAX_PER_IP
      ) {
        return send(
          res,
          429,
          {
            ok: false,
            error: 'Rate limit exceeded'
          },
          origin
        );
      }

      times.push(now);

      requestHistory.set(ip, times);

      try {
        const result = await audit({
          site:
            url.searchParams.get('site'),

          state:
            url.searchParams.get('state'),

          engine:
            url.searchParams.get('engine')
        });

        return send(
          res,
          200,
          result,
          origin
        );

      } catch (e) {

        const status =
          e.status >= 400 &&
          e.status < 600
            ? e.status
            : 502;

        return send(
          res,
          status,
          {
            ok: false,
            error: String(
              e.message || e
            )
          },
          origin
        );
      }

    }).listen(
      PORT,
      () => console.log(
        'Green Line video service listening on ' +
        PORT
      )
    );
  }
}

module.exports = {
  historicalRelevance,
  durationSeconds,
  fixtures
};
