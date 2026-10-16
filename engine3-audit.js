
'use strict';

const fs = require('node:fs');

const state = (process.env.EVENT_STATE || '').trim();
const year = (process.env.EVENT_YEAR || '').trim();
const event = (process.env.EVENT_NAME || '').trim();
const key = process.env.YOUTUBE_API_KEY;

const report = {
  engine: 3,
  technology: 'GitHub Actions YAML + JavaScript',
  category: 'YouTube News Coverage',
  event,
  state,
  year,
  generated_at: new Date().toISOString(),
  status: 'not_evaluated',
  score: null,
  grade: null,
  results: [],
  message: ''
};

const save = () => {
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(
    'reports/engine3-latest.json',
    JSON.stringify(report, null, 2) + '\n'
  );
};

function letter(s) {
  return s === 100 ? 'A+' :
    s >= 90 ? 'A' :
    s >= 80 ? 'B' :
    s >= 70 ? 'C' :
    s >= 60 ? 'D' : 'F';
}

function normalized(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function youtubeSearch(q) {
  const u = new URL(
    'https://www.googleapis.com/youtube/v3/search'
  );

  u.search = new URLSearchParams({
    part: 'snippet',
    q,
    type: 'video',
    maxResults: '25',
    key
  }).toString();

  const r = await fetch(u);
  const j = await r.json();

  if (!r.ok) {
    throw Error(
      j.error?.message || `YouTube HTTP ${r.status}`
    );
  }

  return j.items || [];
}

async function details(ids) {
  if (!ids.length) return [];

  const u = new URL(
    'https://www.googleapis.com/youtube/v3/videos'
  );

  u.search = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    id: ids.join(','),
    key
  }).toString();

  const r = await fetch(u);
  const j = await r.json();

  if (!r.ok) {
    throw Error(
      j.error?.message || `YouTube HTTP ${r.status}`
    );
  }

  return j.items || [];
}

function scoreVideo(v) {
  const t = normalized(v.snippet?.title);
  const d = normalized(v.snippet?.description);
  const name = normalized(event);
  const place = normalized(state);

  const words = name.split(' ')
    .filter(w => w.length > 3);

  const titleMatches = words
    .filter(w => t.includes(w)).length;

  const nameMatch = !!name &&
    (t.includes(name) || d.includes(name));

  const yearMatch = (t + ' ' + d).includes(year);

  const stateMatch = (t + ' ' + d).includes(place);

  const views = Number(
    v.statistics?.viewCount || 0
  );

  const eligible =
    nameMatch &&
    yearMatch &&
    stateMatch &&
    views >= 1000;

  let score = 0;

  if (eligible) {
    score =
      60 +
      Math.min(20, titleMatches * 5) +
      Math.min(
        10,
        Math.floor(
          Math.log10(Math.max(views, 1)) * 2
        )
      ) +
      (
        /(news|weather|storm|coverage|report|archive|footage)/
          .test(t) ? 10 : 0
      );

    score = Math.min(100, score);
  }

  return {
    title: v.snippet?.title || '',
    url: `https://www.youtube.com/watch?v=${v.id}`,
    channel: v.snippet?.channelTitle || '',
    published_at: v.snippet?.publishedAt || '',
    views,
    score,
    eligible,
    reasons: eligible
      ? [
          'Event name, year and state matched; minimum 1000 views'
        ]
      : [
          'Failed event/year/state match or minimum views'
        ]
  };
}

(async () => {
  try {
    if (
      !state ||
      !event ||
      !/^\d{4}$/.test(year)
    ) {
      throw Error(
        'Valid state, four-digit year and event required'
      );
    }

    if (!key) {
      throw Error(
        'YOUTUBE_API_KEY secret missing'
      );
    }

    const queries = [
      `${year} ${event} ${state} news footage`,
      `${year} ${event} ${state} historical news coverage`
    ];

    const found = new Map();

    for (const q of queries) {
      for (const item of await youtubeSearch(q)) {
        if (item.id?.videoId) {
          found.set(item.id.videoId, item);
        }
      }
    }

    const videos = await details(
      [...found.keys()].slice(0, 50)
    );

    const scored = videos.map(scoreVideo);

    report.results = scored
      .filter(x => x.eligible)
      .sort((a, b) => b.score - a.score);

    report.checked_count = scored.length;

    report.rejected_count =
      scored.length - report.results.length;

    if (report.results.length) {
      report.score = Math.round(
        report.results.reduce(
          (a, b) => a + b.score, 0
        ) / report.results.length
      );

      report.grade = letter(report.score);

      report.status = 'verified';

      report.message =
        `${report.results.length} qualifying clips; ` +
        'metadata-based relevance only, ' +
        'not video-content verification.';
    } else {
      report.status = 'no_acceptable_resources';
      report.score = 0;
      report.grade = 'F';

      report.message =
        'Search completed; no qualifying clips met ' +
        'all metadata and view-count rules.';
    }
  } catch (e) {
    report.status = 'not_evaluated';
    report.message = e.message;
    process.exitCode = 1;
  } finally {
    save();
    console.log(
      JSON.stringify(report, null, 2)
    );
  }
})();
