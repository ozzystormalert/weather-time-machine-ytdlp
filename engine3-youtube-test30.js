
'use strict';

/*
 * WEATHER TIME MACHINE
 * ENGINE 3 — TEST 30
 * Expanded 50-State YouTube Historical News Coverage
 *
 * Uses official YouTube Data API v3.
 * Uses existing engine3-test29-events.json.
 *
 * Does not modify Test 29, Blogger, or other engines.
 *
 * Scores are provisional METADATA relevance scores.
 * They are NOT verification of video content.
 */

const fs = require('node:fs');
const path = require('node:path');

const events = require('./engine3-test29-events.json');

const API_KEY = process.env.YOUTUBE_API_KEY || '';
const OUTPUT = 'reports/engine3-test30-50states.json';

const MIN_VIEWS = 1000;
const MAX_RESULTS = 25;
const MAX_SEARCHES = 100;

let searchRequests = 0;
let detailRequests = 0;

// Provisional research targets for missing states.
// These do not overwrite the original dataset.

const provisionalEvents = {
  'Maine': ['1998', 'North American Ice Storm'],
  'New Hampshire': ['1998', 'North American Ice Storm'],
  'New Jersey': ['2012', 'Hurricane Sandy'],
  'New York': ['2012', 'Hurricane Sandy'],
  'Florida': ['1992', 'Hurricane Andrew'],
  'Louisiana': ['2005', 'Hurricane Katrina'],
  'Indiana': ['1974', 'Super Outbreak']
};

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function containsPhrase(text, phrase) {
  const source = ' ' + normalize(text) + ' ';
  const target = ' ' + normalize(phrase) + ' ';

  return source.includes(target);
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'from', 'with',
  'north', 'american', 'united', 'states',
  'great', 'of', 'in', 'a', 'an'
]);

function eventWords(event) {
  return normalize(event)
    .split(' ')
    .filter(word =>
      word.length > 2 && !STOPWORDS.has(word)
    );
}

function matchesEvent(text, event) {
  const words = eventWords(event);

  if (!words.length) return false;

  const matches = words.filter(word =>
    containsPhrase(text, word)
  );

  return matches.length >= Math.max(
    1,
    Math.ceil(words.length * 0.75)
  );
}

function grade(score) {
  if (score >= 97) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function errorMessage(error) {
  const message = String(error.message || error);

  if (/quotaExceeded|dailyLimitExceeded/i.test(message)) {
    return 'YouTube API daily quota exceeded';
  }

  if (/rateLimitExceeded/i.test(message)) {
    return 'YouTube API rate limit exceeded';
  }

  return message.slice(0, 400);
}

async function youtubeAPI(endpoint, parameters) {
  const url = new URL(
    'https://www.googleapis.com/youtube/v3/' + endpoint
  );

  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, String(value));
  }

  url.searchParams.set('key', API_KEY);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(25000)
  });

  const data = await response.json();

  if (!response.ok) {
    const reason =
      data.error?.errors?.[0]?.reason || '';

    const message =
      data.error?.message || 'Unknown API error';

    throw new Error(
      'HTTP ' + response.status +
      ' ' + reason + ': ' + message
    );
  }

  return data;
}

async function searchYouTube(query) {
  if (searchRequests >= MAX_SEARCHES) {
    throw new Error('Search request budget exhausted');
  }

  searchRequests++;

  return youtubeAPI('search', {
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: MAX_RESULTS,
    order: 'relevance',
    regionCode: 'US'
  });
}

async function videoDetails(ids) {
  const results = [];

  for (let i = 0; i < ids.length; i += 50) {
    detailRequests++;

    const response = await youtubeAPI('videos', {
      part: 'snippet,statistics,status',
      id: ids.slice(i, i + 50).join(',')
    });

    results.push(...(response.items || []));
  }

  return results;
}

function searchQueries(row) {
  return [
    `${row.year} ${row.event} ${row.state} news footage`,
    `${row.event} ${row.year} ${row.state} television news archive`
  ];
}

function evaluateVideo(video, row) {
  const snippet = video.snippet || {};

  const title = snippet.title || '';
  const description = snippet.description || '';
  const channel = snippet.channelTitle || '';

  const combinedText = title + ' ' + description;

  const views = Number(
    video.statistics?.viewCount || 0
  );

  const checks = {
    event_match: matchesEvent(
      combinedText,
      row.event
    ),

    year_match: containsPhrase(
      combinedText,
      row.year
    ),

    state_match: containsPhrase(
      combinedText,
      row.state
    ),

    minimum_views: views >= MIN_VIEWS,

    news_context:
      /\b(news|broadcast|report|coverage|footage|archive|abc|nbc|cbs|cnn|fox|reuters|ap news)\b/i
        .test(
          title + ' ' +
          description + ' ' +
          channel
        ),

    public_video:
      video.status?.privacyStatus === 'public'
  };

  const rejectedReasons = [];

  for (const [check, passed] of Object.entries(checks)) {
    if (!passed) {
      rejectedReasons.push('Failed ' + check);
    }
  }

  const accepted = Object.values(checks)
    .every(Boolean);

  let score = null;

  if (accepted) {
    score = 60;

    if (containsPhrase(title, row.event)) {
      score += 15;
    }

    if (containsPhrase(title, row.state)) {
      score += 10;
    }

    if (views >= 10000) {
      score += 10;
    } else {
      score += 5;
    }

    if (views >= 100000) {
      score += 5;
    }

    score = Math.min(100, score);
  }

  return {
    title,
    channel,
    url:
      'https://www.youtube.com/watch?v=' +
      video.id,
    published_at: snippet.publishedAt || null,
    views,
    metadata_match: accepted,
    candidate_score: score,
    content_verified: false,
    checks,
    rejection_reasons: rejectedReasons
  };
}

async function evaluateState(original) {
  const row = {
    state: original.state,
    year: original.year,
    event: original.event,
    research_lead: Boolean(original.research_lead)
  };

  let eventStatus = 'dataset_event';

  if (!row.event || !row.year) {
    const provisional = provisionalEvents[row.state];

    if (provisional) {
      row.year = provisional[0];
      row.event = provisional[1];

      eventStatus = 'provisional_event';
    } else {
      eventStatus = 'missing_event';
    }

  } else if (row.research_lead) {
    eventStatus = 'research_lead';
  }

  const result = {
    state: row.state,
    year: row.year,
    event: row.event,
    research_lead: row.research_lead,
    event_status: eventStatus,
    status: 'not_evaluated',
    score: null,
    grade: null,
    searches_completed: 0,
    search_queries: [],
    checked_count: 0,
    candidate_count: 0,
    results: [],
    message: ''
  };

  if (!row.event || !row.year) {
    result.message =
      'No event selected for this state.';

    return result;
  }

  const queries = searchQueries(row);
  const ids = new Set();

  try {
    // First search for every state.

    const first = await searchYouTube(
      queries[0]
    );

    result.searches_completed++;
    result.search_queries.push(queries[0]);

    for (const item of first.items || []) {
      if (item.id?.videoId) {
        ids.add(item.id.videoId);
      }
    }

    // Second search for unflagged dataset events.

    if (
      eventStatus === 'dataset_event' &&
      searchRequests < MAX_SEARCHES
    ) {
      const second = await searchYouTube(
        queries[1]
      );

      result.searches_completed++;
      result.search_queries.push(queries[1]);

      for (const item of second.items || []) {
        if (item.id?.videoId) {
          ids.add(item.id.videoId);
        }
      }
    }

    const details = ids.size
      ? await videoDetails([...ids])
      : [];

    const assessed = details
      .map(video => evaluateVideo(video, row))
      .sort((a, b) =>
        Number(b.metadata_match) -
        Number(a.metadata_match) ||
        (b.candidate_score || 0) -
        (a.candidate_score || 0)
      );

    result.results = assessed;
    result.checked_count = assessed.length;

    const candidates = assessed.filter(
      video => video.metadata_match
    );

    result.candidate_count = candidates.length;

    // Research leads and provisional events
    // never receive a numerical grade.

    if (eventStatus !== 'dataset_event') {
      result.status = candidates.length
        ? 'research_candidates_found'
        : 'not_evaluated';

      result.message =
        'Research lead or provisional event. ' +
        'Candidate metadata is recorded, but ' +
        'no grade is awarded until the event ' +
        'and state impact are verified.';

      return result;
    }

    // Completed searches without acceptable matches.

    if (!candidates.length) {
      result.status = 'no_acceptable_resources';
      result.score = 0;
      result.grade = 'F';

      result.message =
        'Configured searches completed, but ' +
        'no videos passed all metadata checks. ' +
        'This does not prove that historical ' +
        'footage is unavailable.';

      return result;
    }

    // Calculate provisional metadata score.

    const average = candidates.reduce(
      (total, video) =>
        total + video.candidate_score,
      0
    ) / candidates.length;

    result.score = Math.round(average);
    result.grade = grade(result.score);

    result.status = 'metadata_matches_found';

    result.message =
      'Provisional metadata relevance grade. ' +
      'Video content and historical accuracy ' +
      'have not been independently verified.';

    return result;

  } catch (error) {
    result.status = 'not_evaluated';
    result.score = null;
    result.grade = null;

    result.message =
      'Search incomplete: ' +
      errorMessage(error);

    return result;
  }
}

async function main() {
  if (!API_KEY) {
    throw new Error(
      'Missing YOUTUBE_API_KEY GitHub secret.'
    );
  }

  if (!Array.isArray(events) || events.length !== 50) {
    throw new Error(
      'Expected exactly 50 state records.'
    );
  }

  const stateNames = events.map(
    item => item.state
  );

  if (new Set(stateNames).size !== 50) {
    throw new Error(
      'Duplicate state names detected.'
    );
  }

  const states = [];

  console.log(
    'ENGINE 3 — TEST 30 STARTED'
  );

  console.log(
    'Expanded 50-State YouTube Coverage'
  );

  for (let i = 0; i < events.length; i++) {
    const result = await evaluateState(
      events[i]
    );

    states.push(result);

    console.log(
      `${i + 1}/50 ${result.state}: ` +
      `${result.status}` +
      ` | candidates=${result.candidate_count}` +
      (
        result.score === null
          ? ''
          : ` | ${result.score}/100`
      )
    );
  }

  const summary = {
    total_states: states.length,

    metadata_matches_found:
      states.filter(item =>
        item.status === 'metadata_matches_found'
      ).length,

    research_candidates_found:
      states.filter(item =>
        item.status === 'research_candidates_found'
      ).length,

    no_acceptable_resources:
      states.filter(item =>
        item.status === 'no_acceptable_resources'
      ).length,

    not_evaluated:
      states.filter(item =>
        item.status === 'not_evaluated'
      ).length,

    search_requests: searchRequests,

    video_detail_requests: detailRequests,

    total_candidates:
      states.reduce(
        (total, item) =>
          total + item.candidate_count,
        0
      )
  };

  const report = {
    engine: 3,
    test: 30,

    name:
      'Expanded 50-State YouTube Historical News Coverage',

    source: 'YouTube Data API v3',

    generated_at:
      new Date().toISOString(),

    minimum_views: MIN_VIEWS,

    content_verification:
      'not_performed',

    overall_seven_category_grade: null,

    methodology:
      'Multiple metadata searches for eligible ' +
      'events. Research leads and provisional ' +
      'events are not graded. Video content ' +
      'requires independent verification.',

    summary,
    states
  };

  fs.mkdirSync(
    path.dirname(OUTPUT),
    { recursive: true }
  );

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(report, null, 2) + '\n',
    'utf8'
  );

  console.log(
    '\nTEST 30 SUMMARY'
  );

  console.log(
    JSON.stringify(summary, null, 2)
  );

  console.log(
    'Saved ' + OUTPUT
  );
}

main().catch(error => {
  console.error(
    'Test 30 fatal error:',
    error
  );

  process.exitCode = 1;
});
