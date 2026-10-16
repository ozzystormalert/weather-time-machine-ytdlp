
'use strict';
/** Engine 3 Test 35: precision-first historical weather discovery.
 * Discovery: Bing Video/Web via Playwright. Verification: YouTube Data API.
 * This test does not authenticate footage or assign a final grade.
 */
const fs = require('node:fs');
const { chromium } = require('playwright');
const STATE = (process.env.WEATHER_STATE || 'New Jersey').trim();
const YEAR = (process.env.WEATHER_YEAR || '2012').trim();
const EVENT = (process.env.WEATHER_EVENT || 'Hurricane Sandy').trim();
const KEY = (process.env.YOUTUBE_API_KEY || '').trim();
const MIN_VIEWS = 1000;
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const has = (s, p) => norm(s).includes(norm(p));
const tokens = s => norm(s).split(' ').filter(Boolean);
const eventTokens = tokens(EVENT);
const stateAliases = {
  'New Jersey': ['New Jersey', 'NJ', 'Jersey Shore', 'Mantoloking', 'Seaside Heights', 'Atlantic City', 'Hoboken', 'Point Pleasant', 'Belmar', 'Long Beach Island'],
  'New York': ['New York', 'NYC', 'Long Island', 'Staten Island', 'Queens', 'Brooklyn', 'Manhattan'],
};
const locations = stateAliases[STATE] || [STATE];
const strongEvent = s => has(s, EVENT) || (eventTokens.length > 1 && eventTokens.every(w => tokens(s).includes(w)));
const stateMatch = s => locations.some(x => has(s, x));
const dateMatch = s => has(s, YEAR);
const queryList = [
  { kind: 'videos', q: `"${EVENT}" "${YEAR}" "${STATE}" original footage` },
  { kind: 'videos', q: `"${EVENT}" "${YEAR}" "${STATE}" news coverage` },
  { kind: 'videos', q: `"${EVENT}" "${YEAR}" "${STATE}" storm video` },
  { kind: 'web', q: `"${EVENT}" "${YEAR}" "${STATE}" site:youtube.com/watch` },
  { kind: 'web', q: `"${EVENT}" "${YEAR}" "${STATE}" archival footage` },
  { kind: 'web', q: `"${EVENT}" "${YEAR}" "${STATE}" news footage video` }
];
function decodeBing(raw) {
  try {
    const u = new URL(raw, 'https://www.bing.com');
    if (!/bing\.com$/i.test(u.hostname)) return u.href;
    const target = u.searchParams.get('u') || '';
    if (target.startsWith('a1')) {
      const encoded = target.slice(2).replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      if (/^https?:\/\//i.test(decoded)) return decoded;
    }
    for (const k of ['url', 'r', 'target']) {
      const v = u.searchParams.get(k);
      if (v && /^https?:\/\//i.test(v)) return v;
    }
    return u.href;
  } catch { return null; }
}
function ytId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0];
    if (/youtube\.com$/.test(u.hostname)) {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}
const unique = arr => [...new Set(arr)];
const wrongEventNames = [
  'Hurricane Katrina', 'Hurricane Irene', 'Hurricane Maria',
  'Hurricane Florence', 'Hurricane Isaias', 'Hurricane Harvey',
  'Hurricane Ida', 'Hurricane Ian', 'Hurricane Andrew',
  'Hurricane Michael', 'Hurricane Dorian'
];
function conflicting(text) {
  return wrongEventNames.filter(x => norm(x) !== norm(EVENT) && has(text, x));
}
function evidence(title, description, publishedAt) {
  const t = String(title || '');
  const d = String(description || '');
  const all = `${t} ${d}`;
  const eventInTitle = strongEvent(t);
  const eventInDescription = strongEvent(d);
  const locationInTitle = stateMatch(t);
  const locationInDescription = stateMatch(d);
  const yearInTitle = dateMatch(t);
  const yearInDescription = dateMatch(d);
  const conflicts = conflicting(`${t} ${d}`);
  const negative = /\b(what if|fictional|simulation|gameplay|ai generated|made with ai|imaginary)\b/i.test(t);
  let status = 'REJECT_WRONG_EVENT';
  if (negative) status = 'REJECT_SIMULATION_OR_FICTION';
  else if (conflicts.length && !eventInTitle) status = 'REJECT_CONFLICTING_EVENT';
  else if (!eventInTitle) status = eventInDescription ? 'REVIEW_EVENT_DESCRIPTION_ONLY' : 'REJECT_WRONG_EVENT';
  else if (!(locationInTitle || locationInDescription)) status = 'REVIEW_LOCATION_UNCONFIRMED';
  else if (!(yearInTitle || yearInDescription)) status = 'REVIEW_YEAR_UNCONFIRMED';
  else status = 'STRONG_METADATA_MATCH';
  return {
    status, eventInTitle, eventInDescription,
    locationInTitle, locationInDescription,
    yearInTitle, yearInDescription,
    conflictingEvents: conflicts,
    publishedAt: publishedAt || null
  };
}
async function collect(page, item) {
  const url = `https://www.bing.com/${item.kind === 'videos' ? 'videos/search' : 'search'}?q=${encodeURIComponent(item.q)}&setlang=en-US`;
  const info = { kind: item.kind, query: item.q, url, httpStatus: null, actualUrl: null, cards: 0, linked: 0, status: null, topTitles: [] };
  const cards = [];
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    info.httpStatus = response ? response.status() : null;
    await page.waitForTimeout(1800);
    info.actualUrl = page.url();
    const found = await page.evaluate(kind => {
      const output = [];
      const selectors = kind === 'videos'
        ? ['.mc_vtvc', '.dg_u', '.vrhdata', '.mc_vtvc_meta', 'a[href*="youtube.com/watch"]', 'a[href*="youtu.be/"]']
        : ['li.b_algo', '.b_algo', 'a[href*="youtube.com/watch"]', 'a[href*="youtu.be/"]'];
      const seen = new Set();
      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          const a = el.matches('a[href]') ? el : el.querySelector('a[href]');
          if (!a) continue;
          const href = a.href || a.getAttribute('href');
          if (!href || seen.has(href)) continue;
          seen.add(href);
          const title = (el.querySelector('h2,h3,.mc_vtvc_title,.mc_vtvc_title_text')?.textContent || a.title || a.textContent || '').trim();
          const desc = (el.querySelector('.b_caption,.mc_vtvc_meta,.mc_vtvc_description,p')?.textContent || '').trim();
          const mmeta = el.getAttribute('mmeta') || el.querySelector('[mmeta]')?.getAttribute('mmeta') || null;
          output.push({ href, title: title.slice(0, 400), description: desc.slice(0, 1000), mmeta });
        }
      }
      return output;
    }, item.kind);
    for (const f of found) {
      let href = decodeBing(f.href);
      let title = f.title;
      let description = f.description;
      if (f.mmeta) {
        try {
          const meta = JSON.parse(f.mmeta);
          const candidates = [meta.murl, meta.purl, meta.url, meta.mediaUrl, meta.sourceUrl, meta.hostPageUrl];
          const preferred = candidates.find(x => typeof x === 'string' && /youtube\.com|youtu\.be/i.test(x));
          if (preferred) href = decodeBing(preferred);
          title = meta.t || meta.title || title;
          description = meta.desc || meta.description || description;
        } catch {}
      }
      if (!href || !/^https?:\/\//i.test(href)) continue;
      cards.push({ url: href, title, description, source: item.kind, query: item.q });
    }
    info.cards = found.length;
    info.linked = cards.length;
    info.topTitles = cards.slice(0, 6).map(x => x.title);
    info.status = cards.length ? 'RESULTS_COLLECTED' : 'NO_CARDS';
  } catch (err) {
    info.status = 'SEARCH_ERROR';
    info.error = String(err.message || err);
  }
  return { info, cards };
}
async function verifyYouTube(ids) {
  if (!KEY) return { status: 'MISSING_YOUTUBE_API_KEY', items: [], errors: ['GitHub secret YOUTUBE_API_KEY is missing'] };
  const items = [], errors = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const endpoint = new URL('https://www.googleapis.com/youtube/v3/videos');
    endpoint.searchParams.set('part', 'snippet,statistics,status');
    endpoint.searchParams.set('id', batch.join(','));
    endpoint.searchParams.set('key', KEY);
    try {
      const r = await fetch(endpoint, { signal: AbortSignal.timeout(25000) });
      const j = await r.json();
      if (!r.ok) {
        errors.push({ httpStatus: r.status, message: j.error?.message || 'YouTube API request failed' });
        continue;
      }
      items.push(...(j.items || []));
    } catch (err) { errors.push(String(err.message || err)); }
  }
  return { status: errors.length ? 'API_PARTIAL_OR_FAILED' : 'API_RESPONDED', items, errors };
}
async function main() {
  const report = {
    engine: 3, test: 35, generatedAt: new Date().toISOString(),
    state: STATE, year: YEAR, event: EVENT, minimumViews: MIN_VIEWS,
    grade: 'Not Evaluated', score: null, status: 'RUNNING',
    notes: [
      'YouTube API confirms metadata and view counts, not footage authenticity.',
      'A strong metadata match is a candidate, not a final verified historical video.',
      'Title must identify the requested event; description-only matches are held for review.',
      'No changes to Blogger, Engine 1, Engine 2, or earlier Engine 3 tests.'
    ],
    searches: [], summary: {}, verifiedCandidates: [], needsReview: [], rejected: []
  };
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ locale: 'en-US', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' });
    const all = [];
    for (const query of queryList) {
      const { info, cards } = await collect(page, query);
      report.searches.push(info);
      all.push(...cards);
      console.log(`[BING] ${info.kind} ${info.status} cards=${info.cards} linked=${info.linked} ${info.query}`);
    }
    const byUrl = new Map();
    for (const card of all) {
      const id = ytId(card.url);
      const key = id ? `yt:${id}` : card.url;
      if (!byUrl.has(key)) byUrl.set(key, { ...card, videoId: id });
    }
    const uniqueCards = [...byUrl.values()];
    const ids = unique(uniqueCards.map(x => x.videoId).filter(Boolean));
    const api = await verifyYouTube(ids);
    const videoMap = new Map(api.items.map(v => [v.id, v]));
    report.youtubeApi = { status: api.status, errors: api.errors, keyConfigured: Boolean(KEY) };
    for (const card of uniqueCards) {
      const video = card.videoId ? videoMap.get(card.videoId) : null;
      const sn = video?.snippet || {};
      const ev = evidence(video ? sn.title : card.title, video ? sn.description : card.description, sn.publishedAt);
      const views = video && Number.isFinite(Number(video.statistics?.viewCount)) ? Number(video.statistics.viewCount) : null;
      const result = {
        url: card.videoId ? `https://www.youtube.com/watch?v=${card.videoId}` : card.url,
        source: card.source, title: video ? sn.title : card.title,
        searchTitle: card.title, videoId: card.videoId,
        relevance: ev, verifiedViews: views,
        publishedAt: sn.publishedAt || null,
        channelTitle: sn.channelTitle || null,
        metadataVerified: Boolean(video),
        verificationStatus: null, qualified: false
      };
      if (!video && card.videoId) {
        result.verificationStatus = 'YOUTUBE_METADATA_UNAVAILABLE';
        report.needsReview.push(result);
      } else if (!card.videoId) {
        result.verificationStatus = 'NON_YOUTUBE_LINK_NOT_VIEW_VERIFIED';
        report.rejected.push(result);
      } else if (ev.status === 'STRONG_METADATA_MATCH' && views !== null && views >= MIN_VIEWS) {
        result.verificationStatus = 'STRONG_METADATA_CANDIDATE_1000_VIEWS';
        result.qualified = true;
        report.verifiedCandidates.push(result);
      } else if (ev.status.startsWith('REVIEW_')) {
        result.verificationStatus = 'RELEVANCE_REQUIRES_REVIEW';
        report.needsReview.push(result);
      } else if (ev.status === 'STRONG_METADATA_MATCH') {
        result.verificationStatus = views === null ? 'VIEWS_UNAVAILABLE' : 'BELOW_1000_VERIFIED_VIEWS';
        report.needsReview.push(result);
      } else {
        result.verificationStatus = 'REJECTED_IRRELEVANT';
        report.rejected.push(result);
      }
    }
    report.summary = {
      searchesRequested: queryList.length,
      searchesWithCards: report.searches.filter(s => s.cards > 0).length,
      observations: report.searches.reduce((n, s) => n + s.cards, 0),
      linkedObservations: all.length,
      uniqueLinks: uniqueCards.length,
      youtubeIds: ids.length,
      youtubeMetadataVerified: api.items.length,
      strongMetadataCandidates1000Views: report.verifiedCandidates.length,
      needsReview: report.needsReview.length,
      rejected: report.rejected.length
    };
    report.status = api.status !== 'API_RESPONDED' ? 'NOT_EVALUATED_API_ISSUE'
      : report.verifiedCandidates.length ? 'STRONG_METADATA_CANDIDATES_FOUND'
      : 'NO_STRONG_METADATA_CANDIDATES';
  } catch (err) {
    report.status = 'TEST_ERROR';
    report.error = String(err.stack || err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    fs.mkdirSync('reports', { recursive: true });
    fs.writeFileSync('reports/engine3-bing-test35.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ test: report.test, status: report.status, summary: report.summary, youtubeApi: report.youtubeApi }, null, 2));
    console.log('Report: reports/engine3-bing-test35.json');
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
