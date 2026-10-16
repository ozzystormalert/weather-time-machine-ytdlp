
'use strict';

/**
 * WEATHER TIME MACHINE — ENGINE 3
 * TEST #36 — OFFICIAL YOUTUBE HISTORICAL DISCOVERY
 *
 * Requirements:
 * - Official YouTube Search API for discovery
 * - Official YouTube Videos API for actual view counts
 * - Minimum 1,000 verified views
 * - Correct weather event, state, and year
 * - No automatic claims of footage authenticity
 * - Final grade remains "Not Evaluated"
 * - No changes to Blogger, Engines 1/2, or earlier tests
 */

const fs = require('node:fs');

const STATE = (process.env.WEATHER_STATE || 'New Jersey').trim();
const YEAR = (process.env.WEATHER_YEAR || '2012').trim();
const EVENT = (process.env.WEATHER_EVENT || 'Hurricane Sandy').trim();
const KEY = (process.env.YOUTUBE_API_KEY || '').trim();

const MIN_VIEWS = 1000;
const MAX_PER_QUERY = 25;
const OUTPUT = 'reports/engine3-youtube-test36.json';

const norm = s =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const words = s => norm(s).split(' ').filter(Boolean);

const containsPhrase = (text, phrase) =>
  ` ${norm(text)} `.includes(` ${norm(phrase)} `);

const ALIASES = {
  'new jersey': [
    'new jersey',
    'nj',
    'jersey shore',
    'mantoloking',
    'seaside heights',
    'atlantic city',
    'hoboken',
    'point pleasant',
    'belmar',
    'long beach island',
    'asbury park',
    'toms river',
    'ocean county',
    'monmouth county'
  ],
  'new york': [
    'new york',
    'nyc',
    'long island',
    'staten island',
    'queens',
    'brooklyn',
    'manhattan'
  ]
};

const places = ALIASES[norm(STATE)] || [STATE];
const eventWords = words(EVENT);

const coreEvent = s =>
  containsPhrase(s, EVENT) ||
  eventWords.every(w => words(s).includes(w));

const location = s =>
  places.some(p => containsPhrase(s, p));

const yearMention = s =>
  containsPhrase(s, YEAR);

const conflictNames = [
  'Katrina',
  'Irene',
  'Maria',
  'Florence',
  'Isaias',
  'Harvey',
  'Ida',
  'Ian',
  'Andrew',
  'Michael',
  'Dorian',
  'Polo',
  'Simon'
];

const conflicts = text =>
  conflictNames.filter(
    x =>
      !eventWords.includes(norm(x)) &&
      containsPhrase(text, x)
  );

const queries = [
  `${EVENT} ${YEAR} ${STATE} footage`,
  `${EVENT} ${YEAR} ${STATE} news coverage`,
  `${EVENT} ${YEAR} Jersey Shore storm surge`,
  `${EVENT} ${YEAR} Mantoloking Seaside Heights`,
  `${EVENT} ${YEAR} New Jersey archival video`,
  `${EVENT} ${YEAR} ${STATE} eyewitness video`
];

const report = {
  engine: 3,
  test: 36,
  generatedAt: new Date().toISOString(),
  state: STATE,
  year: YEAR,
  event: EVENT,
  minimumViews: MIN_VIEWS,
  grade: 'Not Evaluated',
  score: null,
  status: 'RUNNING',
  method:
    'YouTube Data API search.list then videos.list; no Bing dependency',
  notes: [
    'Official YouTube search returns candidates, not authenticated historical footage.',
    'Official YouTube videos.list supplies view counts and metadata.',
    'Upload date need not equal historical event year: archival footage can be uploaded later.',
    'The year and location must be evidenced by title or description for strong metadata classification.',
    'Manual footage/source review is required before any final historical accuracy grade.'
  ],
  searches: [],
  candidates: [],
  needsReview: [],
  rejected: [],
  errors: [],
  summary: {}
};

async function youtube(endpoint, params) {
  const url = new URL(
    `https://www.googleapis.com/youtube/v3/${endpoint}`
  );

  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  url.searchParams.set('key', KEY);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000)
  });

  const body = await response.json();

  if (!response.ok) {
    const err = new Error(
      `YouTube ${endpoint} HTTP ${response.status}: ${
        body.error?.message || 'Unknown API error'
      }`
    );
    err.httpStatus = response.status;
    throw err;
  }

  return body;
}

function assess(video) {
  const sn = video.snippet || {};
  const title = sn.title || '';
  const description = sn.description || '';
  const full = `${title} ${description}`;

  const eventTitle = coreEvent(title);
  const eventDescription = coreEvent(description);

  const locationTitle = location(title);
  const locationDescription = location(description);

  const yearTitle = yearMention(title);
  const yearDescription = yearMention(description);

  const otherEvents = conflicts(title);

  const simulated =
    /\b(simulation|fictional|gameplay|ai.generated|what if|computer generated)\b/i
      .test(title);

  let relevance = 'REJECT_EVENT_MISMATCH';

  if (simulated) {
    relevance = 'REJECT_SIMULATION';
  } else if (otherEvents.length && !eventTitle) {
    relevance = 'REJECT_CONFLICTING_EVENT';
  } else if (!eventTitle && !eventDescription) {
    relevance = 'REJECT_EVENT_MISMATCH';
  } else if (!eventTitle) {
    relevance = 'REVIEW_EVENT_DESCRIPTION_ONLY';
  } else if (!(locationTitle || locationDescription)) {
    relevance = 'REVIEW_LOCATION_MISSING';
  } else if (!(yearTitle || yearDescription)) {
    relevance = 'REVIEW_YEAR_MISSING';
  } else {
    relevance = 'STRONG_METADATA_MATCH';
  }

  const rawViews = video.statistics?.viewCount;

  const views =
    rawViews !== undefined &&
    /^\d+$/.test(String(rawViews))
      ? Number(rawViews)
      : null;

  const publicVideo =
    video.status?.privacyStatus === 'public';

  const minimumReached =
    views !== null && views >= MIN_VIEWS;

  return {
    videoId: video.id,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    title,
    channel: sn.channelTitle || null,
    publishedAt: sn.publishedAt || null,
    verifiedViews: views,
    meets1000Views: minimumReached,
    privacyStatus: video.status?.privacyStatus || null,
    relevance,
    evidence: {
      eventTitle,
      eventDescription,
      locationTitle,
      locationDescription,
      yearTitle,
      yearDescription,
      conflictingEvents: otherEvents
    },
    qualifiedMetadataCandidate:
      relevance === 'STRONG_METADATA_MATCH' &&
      minimumReached &&
      publicVideo,
    historicalFootageAuthenticated: false
  };
}

async function main() {
  if (!KEY) {
    report.status =
      'NOT_EVALUATED_MISSING_YOUTUBE_API_KEY';

    report.errors.push(
      'YOUTUBE_API_KEY secret is missing'
    );

    return;
  }

  const ids = new Set();

  for (const query of queries) {
    const search = {
      query,
      status: 'RUNNING',
      returned: 0,
      newUniqueIds: 0
    };

    try {
      const data = await youtube('search', {
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: MAX_PER_QUERY,
        order: 'relevance',
        relevanceLanguage: 'en',
        safeSearch: 'none'
      });

      const found = (data.items || [])
        .map(x => x.id?.videoId)
        .filter(Boolean);

      search.returned = found.length;

      for (const id of found) {
        if (!ids.has(id)) {
          ids.add(id);
          search.newUniqueIds++;
        }
      }

      search.status = 'API_RESPONDED';
    } catch (error) {
      search.status = 'API_ERROR';
      search.error = String(error.message || error);

      report.errors.push({
        stage: 'search',
        query,
        message: search.error
      });
    }

    report.searches.push(search);

    console.log(
      `[SEARCH] ${search.status} ` +
      `returned=${search.returned} ` +
      `new=${search.newUniqueIds} ${query}`
    );
  }

  const videos = [];
  const idList = [...ids];

  for (let i = 0; i < idList.length; i += 50) {
    const batch = idList.slice(i, i + 50);

    try {
      const data = await youtube('videos', {
        part: 'snippet,statistics,status',
        id: batch.join(',')
      });

      videos.push(...(data.items || []));
    } catch (error) {
      report.errors.push({
        stage: 'videos',
        batch: i / 50 + 1,
        message: String(error.message || error)
      });
    }
  }

  for (const video of videos) {
    const entry = assess(video);

    if (entry.qualifiedMetadataCandidate) {
      report.candidates.push(entry);
    } else if (
      entry.relevance.startsWith('REVIEW_') ||
      entry.relevance === 'STRONG_METADATA_MATCH'
    ) {
      report.needsReview.push(entry);
    } else {
      report.rejected.push(entry);
    }
  }

  report.summary = {
    searchesRequested: queries.length,

    searchesSucceeded:
      report.searches.filter(
        x => x.status === 'API_RESPONDED'
      ).length,

    searchResultsReturned:
      report.searches.reduce(
        (n, x) => n + x.returned,
        0
      ),

    uniqueYouTubeIds: ids.size,

    youtubeVideosVerified: videos.length,

    strongMetadataCandidates1000Views:
      report.candidates.length,

    needsReview: report.needsReview.length,

    rejected: report.rejected.length,

    historicalFootageAuthenticated: 0,

    apiErrors: report.errors.length
  };

  report.status = report.errors.length
    ? 'NOT_EVALUATED_API_ERRORS'
    : report.candidates.length
      ? 'METADATA_CANDIDATES_FOUND_AWAITING_FOOTAGE_REVIEW'
      : 'NO_STRONG_METADATA_CANDIDATES';
}

(async () => {
  try {
    await main();
  } catch (error) {
    report.status = 'TEST_ERROR';
    report.errors.push(
      String(error.stack || error)
    );
    process.exitCode = 1;
  } finally {
    fs.mkdirSync('reports', {
      recursive: true
    });

    fs.writeFileSync(
      OUTPUT,
      JSON.stringify(report, null, 2)
    );

    console.log(
      JSON.stringify(
        {
          test: report.test,
          status: report.status,
          summary: report.summary,
          errors: report.errors
        },
        null,
        2
      )
    );

    console.log(`Report: ${OUTPUT}`);
  }
})();
