
'use strict';
/** Weather Time Machine Engine 3 — Test 38.
 * Tighten categories: storm conditions, preparation, aftermath, later archives, retrospectives, rejects.
 * Discovery and official view-count verification remain the Test 36 approach.
 * Metadata classification is NOT footage authentication.
 */
const fs = require('node:fs');
const STATE = (process.env.WEATHER_STATE || 'New Jersey').trim();
const YEAR = (process.env.WEATHER_YEAR || '2012').trim();
const EVENT = (process.env.WEATHER_EVENT || 'Hurricane Sandy').trim();
const KEY = (process.env.YOUTUBE_API_KEY || '').trim();
const MIN_VIEWS = 1000;
const OUTPUT = 'reports/engine3-youtube-test38.json';
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const phrase = (s, p) => ` ${norm(s)} `.includes(` ${norm(p)} `);
const statePlaces = {
  'new jersey': ['new jersey', 'nj', 'n j', 'jersey shore', 'seaside heights', 'seaside park', 'mantoloking', 'hoboken', 'atlantic city', 'sea bright', 'union beach', 'beach haven', 'long beach island', 'point pleasant', 'belmar', 'asbury park', 'toms river', 'parlin', 'ocean county', 'monmouth county'],
  'new york': ['new york', 'nyc', 'long island', 'staten island', 'queens', 'brooklyn', 'manhattan']
};
const places = statePlaces[norm(STATE)] || [STATE];
const matchPlace = s => places.filter(p => phrase(s, p));
const isSandy = /\bsandy\b/i.test(EVENT);
const eventAliases = isSandy ? ['hurricane sandy', 'superstorm sandy', 'sandy'] : [EVENT];
const eventHits = s => eventAliases.filter(p => phrase(s, p));
const otherStorms = ['katrina', 'irene', 'maria', 'florence', 'isaias', 'harvey', 'ida', 'ian', 'andrew', 'michael', 'dorian'];
const wrongStorm = s => otherStorms.filter(p => phrase(s, p) && !phrase(EVENT, p));
const queries = [
  `${EVENT} ${YEAR} ${STATE} footage`,
  `${EVENT} ${YEAR} ${STATE} news coverage`,
  `${EVENT} ${YEAR} Jersey Shore storm surge`,
  `${EVENT} ${YEAR} Mantoloking Seaside Heights`,
  `${EVENT} ${YEAR} New Jersey archival video`,
  `${EVENT} ${YEAR} ${STATE} eyewitness video`
];
const report = {
  engine: 3, test: 38, generatedAt: new Date().toISOString(),
  state: STATE, year: YEAR, event: EVENT, minimumViews: MIN_VIEWS,
  grade: 'Not Evaluated', score: null, status: 'RUNNING',
  method: 'Official YouTube Data API search.list + videos.list; Test 38 four-correction metadata audit',
  safeguards: [
    'Views verified with videos.list statistics.viewCount, minimum 1000.',
    'A state mention in description alone never proves the footage location.',
    'Upload date is evidence of upload timing, not proof of footage recording date.',
    'Later uploads are excluded from strong original-footage candidates.',
    'No footage has been viewed or authenticated; final grade remains Not Evaluated.'
  ],
  searches: [], candidates: [], needsReview: [], rejected: [], errors: [], summary: {}
};
async function youtube(endpoint, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('key', KEY);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`YouTube ${endpoint} HTTP ${response.status}: ${data.error?.message || 'Unknown error'}`);
  return data;
}
function classify(video) {
  const sn = video.snippet || {};
  const title = sn.title || '';
  const description = sn.description || '';
  const channel = sn.channelTitle || '';
  const publishedAt = sn.publishedAt || null;
  const uploadYear = publishedAt ? Number(publishedAt.slice(0, 4)) : null;
  const text = `${title} ${description}`;
  const titlePlaces = matchPlace(title);
  const descriptionPlaces = matchPlace(description);
  const titleEvents = eventHits(title);
  const descriptionEvents = eventHits(description);
  const conflicts = wrongStorm(title);
  const yearEvidence = phrase(title, YEAR) || phrase(description, YEAR);
  const contemporary = uploadYear === Number(YEAR);
  const later = uploadYear !== null && uploadYear > Number(YEAR);
  const before = uploadYear !== null && uploadYear < Number(YEAR);
  const simulated = /\b(simulation|simulated|gameplay|video game|cgi|ai generated|fictional|reenactment|re enactment)\b/i.test(title);
  const retrospective = /\b(anniversary|years later|looking back|remembering|retrospective|explained|history of|documentary|then and now|since sandy)\b/i.test(title);
  const preparation = /\b(preparations?|preparing|before the storm|evacuat(?:e|ion|ing)|forecast|warning|approaches|approaching|bracing|getting ready|track(?:ing)?)\b/i.test(title);
  const aftermath = /\b(aftermath|damage|damaged|destruction|destroyed|recovery|cleanup|clean up|devastation|ruins|washed away|wipes out)\b/i.test(title);
  const stormFootage = /\b(footage|raw video|storm chaser|storm surge|flooding|flooded|landfall|on scene|storm hits|hurricane hits|wind|waves|underwater|inundated)\b/i.test(title);
  const news = /\b(news|coverage|report|abc|cbs|nbc|cnn|associated press|ap archive|eyewitness news)\b/i.test(`${title} ${channel}`);
  const rawViews = video.statistics?.viewCount;
  const views = rawViews !== undefined && /^\d+$/.test(String(rawViews)) ? Number(rawViews) : null;
  const meets1000Views = views !== null && views >= MIN_VIEWS;
  const publicVideo = video.status?.privacyStatus === 'public';
  const reasons = [];
  if (!titleEvents.length && !descriptionEvents.length) reasons.push('EVENT_NOT_EVIDENCED');
  if (conflicts.length && !titleEvents.length) reasons.push('OTHER_STORM_IN_TITLE');
  if (simulated) reasons.push('SIMULATION_OR_REENACTMENT');
  if (!titlePlaces.length && descriptionPlaces.length) reasons.push('LOCATION_ONLY_IN_DESCRIPTION');
  if (!titlePlaces.length && !descriptionPlaces.length) reasons.push('LOCATION_NOT_EVIDENCED');
  if (!yearEvidence && !contemporary) reasons.push('EVENT_YEAR_NOT_EVIDENCED');
  if (later) reasons.push('LATER_UPLOAD_REQUIRES_ARCHIVAL_EVIDENCE');
  if (before) reasons.push('UPLOADED_BEFORE_EVENT_YEAR');
  if (!meets1000Views) reasons.push('BELOW_1000_OR_UNKNOWN_VIEWS');
  if (!publicVideo) reasons.push('NOT_PUBLIC');
  // Classification priority is intentional: later uploads cannot be called
  // contemporaneous footage, even when their titles say "raw footage".
  let category = 'UNDETERMINED';
  if (simulated) category = 'SIMULATION_OR_REENACTMENT';
  else if (later) category = retrospective ? 'LATER_RETROSPECTIVE_OR_DOCUMENTARY' : 'LATER_UPLOADED_POSSIBLE_ARCHIVE';
  else if (retrospective) category = 'RETROSPECTIVE_OR_DOCUMENTARY';
  else if (preparation) category = 'PRE_STORM_PREPARATION';
  else if (aftermath) category = 'STORM_AFTERMATH_OR_DAMAGE';
  else if (stormFootage) category = 'STORM_CONDITIONS_ORIGINAL_FOOTAGE_CLAIM';
  else if (news) category = 'CONTEMPORANEOUS_NEWS_UNDETERMINED';
  // Search metadata cannot verify actual filming location or footage date.
  const eventSupported = titleEvents.length > 0;
  const locationSupported = titlePlaces.length > 0;
  const yearSupported = contemporary || yearEvidence;
  const eligibleCategory = ['PRE_STORM_PREPARATION','STORM_AFTERMATH_OR_DAMAGE',
    'STORM_CONDITIONS_ORIGINAL_FOOTAGE_CLAIM','CONTEMPORANEOUS_NEWS_UNDETERMINED'].includes(category);
  const strong = eventSupported && locationSupported && contemporary &&
    yearSupported && eligibleCategory && !simulated && !retrospective &&
    !conflicts.length && meets1000Views && publicVideo;
  let classification = strong ? 'STRONG_METADATA_CANDIDATE_PENDING_FOOTAGE_REVIEW' : 'REVIEW_REQUIRED';
  if (simulated || (!titleEvents.length && !descriptionEvents.length) ||
      (conflicts.length && !titleEvents.length) || !meets1000Views ||
      !publicVideo || before) classification = 'REJECTED_BY_METADATA_RULE';
  return {
    videoId: video.id, url: `https://www.youtube.com/watch?v=${video.id}`,
    title, channel, publishedAt, verifiedViews: views, meets1000Views,
    privacyStatus: video.status?.privacyStatus || null,
    classification, category, qualifiedMetadataCandidate: strong,
    evidence: {
      eventAliasesInTitle: titleEvents, eventAliasesInDescription: descriptionEvents,
      otherStormsInTitle: conflicts, locationInTitle: titlePlaces,
      locationInDescription: descriptionPlaces, locationDepictedInVideo: 'NOT_VERIFIED',
      yearInMetadata: yearEvidence, uploadYear, contemporaryUpload: contemporary,
      laterUpload: later, footageRecordedInRequestedYear: 'NOT_VERIFIED',
      footageTypeAuthenticated: false
    },
    reviewReasons: reasons, historicalFootageAuthenticated: false
  };
}
async function main() {
  if (!KEY) {
    report.status = 'NOT_EVALUATED_MISSING_YOUTUBE_API_KEY';
    report.errors.push('YOUTUBE_API_KEY GitHub secret is missing');
    return;
  }
  const ids = new Set();
  for (const query of queries) {
    const result = { query, status: 'RUNNING', returned: 0, newUniqueIds: 0 };
    try {
      const data = await youtube('search', {
        part: 'snippet', q: query, type: 'video', maxResults: 25,
        order: 'relevance', relevanceLanguage: 'en', safeSearch: 'none'
      });
      const found = (data.items || []).map(x => x.id?.videoId).filter(Boolean);
      result.returned = found.length;
      for (const id of found) if (!ids.has(id)) { ids.add(id); result.newUniqueIds++; }
      result.status = 'API_RESPONDED';
    } catch (err) {
      result.status = 'API_ERROR';
      result.error = String(err.message || err);
      report.errors.push({ stage: 'search', query, message: result.error });
    }
    report.searches.push(result);
    console.log(`[SEARCH] ${result.status} returned=${result.returned} new=${result.newUniqueIds} ${query}`);
  }
  const videos = [];
  const idList = [...ids];
  for (let i = 0; i < idList.length; i += 50) {
    try {
      const data = await youtube('videos', {
        part: 'snippet,statistics,status', id: idList.slice(i, i + 50).join(',')
      });
      videos.push(...(data.items || []));
    } catch (err) {
      report.errors.push({ stage: 'videos', batch: Math.floor(i / 50) + 1, message: String(err.message || err) });
    }
  }
  for (const video of videos) {
    const item = classify(video);
    if (item.qualifiedMetadataCandidate) report.candidates.push(item);
    else if (item.classification === 'REVIEW_REQUIRED') report.needsReview.push(item);
    else report.rejected.push(item);
  }
  const allClassified = [...report.candidates, ...report.needsReview, ...report.rejected];
  const categoryCounts = {};
  for (const item of allClassified) categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
  report.summary = {
    categoryCounts,
    strongCandidatesByCategory: report.candidates.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {}),
    searchesRequested: queries.length,
    searchesSucceeded: report.searches.filter(x => x.status === 'API_RESPONDED').length,
    searchResultsReturned: report.searches.reduce((n, x) => n + x.returned, 0),
    uniqueYouTubeIds: ids.size, youtubeVideosVerified: videos.length,
    strongMetadataCandidates1000Views: report.candidates.length,
    needsReview: report.needsReview.length, rejected: report.rejected.length,
    historicalFootageAuthenticated: 0, apiErrors: report.errors.length
  };
  report.status = report.errors.length ? 'NOT_EVALUATED_API_ERRORS'
    : report.candidates.length ? 'METADATA_CANDIDATES_FOUND_AWAITING_FOOTAGE_REVIEW'
    : 'NO_STRONG_METADATA_CANDIDATES';
}
(async () => {
  try { await main(); }
  catch (err) { report.status = 'TEST_ERROR'; report.errors.push(String(err.stack || err)); process.exitCode = 1; }
  finally {
    fs.mkdirSync('reports', { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ test: report.test, status: report.status, summary: report.summary, errors: report.errors }, null, 2));
    console.log(`Report: ${OUTPUT}`);
  }
})();
