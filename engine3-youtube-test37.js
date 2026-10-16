
'use strict';
/** Weather Time Machine Engine 3 — Test 37.
 * Four corrections only: location evidence, event year, footage type, event aliases.
 * Discovery and official view-count verification remain the Test 36 approach.
 * Metadata classification is NOT footage authentication.
 */
const fs = require('node:fs');
const STATE = (process.env.WEATHER_STATE || 'New Jersey').trim();
const YEAR = (process.env.WEATHER_YEAR || '2012').trim();
const EVENT = (process.env.WEATHER_EVENT || 'Hurricane Sandy').trim();
const KEY = (process.env.YOUTUBE_API_KEY || '').trim();
const MIN_VIEWS = 1000;
const OUTPUT = 'reports/engine3-youtube-test37.json';
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
  engine: 3, test: 37, generatedAt: new Date().toISOString(),
  state: STATE, year: YEAR, event: EVENT, minimumViews: MIN_VIEWS,
  grade: 'Not Evaluated', score: null, status: 'RUNNING',
  method: 'Official YouTube Data API search.list + videos.list; Test 37 four-correction metadata audit',
  safeguards: [
    'Views verified with videos.list statistics.viewCount, minimum 1000.',
    'A state mention in description alone never proves the footage location.',
    'Upload date is evidence of upload timing, not proof of footage recording date.',
    'Contemporaneous uploads are distinguished from later archival or retrospective material.',
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
  const publishedAt = sn.publishedAt || null;
  const titlePlaces = matchPlace(title);
  const descriptionPlaces = matchPlace(description);
  const titleEvents = eventHits(title);
  const descriptionEvents = eventHits(description);
  const conflictTitle = wrongStorm(title);
  const yearTitle = phrase(title, YEAR);
  const yearDescription = phrase(description, YEAR);
  const uploadYear = publishedAt ? Number(publishedAt.slice(0, 4)) : null;
  const contemporaryUpload = uploadYear === Number(YEAR);
  const laterUpload = uploadYear !== null && uploadYear > Number(YEAR);
  const simulation = /\b(simulation|simulated|gameplay|video game|cgi|ai generated|fictional|reenactment|re enactment)\b/i.test(title);
  const retrospective = /\b(years later|anniversary|looking back|remembering|retrospective|explained|history of|documentary|then and now|two years later|recovery|since sandy)\b/i.test(title);
  const news = /\b(news|coverage|report|abc|cbs|nbc|cnn|ap archive|associated press|eyewitness news)\b/i.test(`${title} ${sn.channelTitle || ''}`);
  const footage = /\b(footage|raw video|storm chaser|storm surge|flooding|aftermath|damage|aerial|on scene|hits|approaches|destroyed)\b/i.test(title);
  let footageType = 'UNDETERMINED';
  if (simulation) footageType = 'SIMULATION_OR_REENACTMENT';
  else if (retrospective) footageType = 'RETROSPECTIVE_OR_RECOVERY';
  else if (laterUpload && footage) footageType = 'LATER_UPLOADED_POSSIBLE_ARCHIVE';
  else if (news && contemporaryUpload) footageType = 'CONTEMPORANEOUS_NEWS';
  else if (footage && contemporaryUpload) footageType = 'CONTEMPORANEOUS_FOOTAGE_CLAIM';
  else if (news) footageType = 'NEWS_OR_ARCHIVE_UNDETERMINED';
  else if (footage) footageType = 'FOOTAGE_CLAIM_UNDETERMINED';
  const viewsRaw = video.statistics?.viewCount;
  const views = viewsRaw !== undefined && /^\d+$/.test(String(viewsRaw)) ? Number(viewsRaw) : null;
  const publicVideo = video.status?.privacyStatus === 'public';
  const meets1000Views = views !== null && views >= MIN_VIEWS;
  const reasons = [];
  if (!titleEvents.length && !descriptionEvents.length) reasons.push('EVENT_NOT_EVIDENCED');
  if (conflictTitle.length && !titleEvents.length) reasons.push('OTHER_STORM_IN_TITLE');
  if (simulation) reasons.push('SIMULATION_OR_REENACTMENT');
  if (!titlePlaces.length && descriptionPlaces.length) reasons.push('LOCATION_DESCRIPTION_ONLY');
  if (!titlePlaces.length && !descriptionPlaces.length) reasons.push('LOCATION_NOT_EVIDENCED');
  if (!yearTitle && !yearDescription && !contemporaryUpload) reasons.push('EVENT_YEAR_NOT_EVIDENCED');
  if (laterUpload) reasons.push('LATER_UPLOAD_REQUIRES_ARCHIVAL_EVIDENCE');
  if (retrospective) reasons.push('RETROSPECTIVE_NOT_AUTOMATICALLY_ORIGINAL_FOOTAGE');
  if (!meets1000Views) reasons.push('BELOW_MINIMUM_OR_UNKNOWN_VIEWS');
  if (!publicVideo) reasons.push('NOT_PUBLIC');
  // Strong candidates require title-level NJ evidence, a Sandy event signal,
  // contemporary upload OR explicit event-year evidence, and no retrospective/simulation.
  // Even then: this is ONLY a metadata candidate; location in the video is unverified.
  const strong = titleEvents.length > 0 && titlePlaces.length > 0 &&
    (contemporaryUpload || yearTitle || yearDescription) &&
    !simulation && !retrospective && !conflictTitle.length &&
    meets1000Views && publicVideo;
  let classification = strong ? 'STRONG_METADATA_CANDIDATE_PENDING_FOOTAGE_REVIEW' : 'REVIEW_REQUIRED';
  if (simulation || (!titleEvents.length && !descriptionEvents.length) ||
      (conflictTitle.length && !titleEvents.length) || !meets1000Views || !publicVideo) {
    classification = 'REJECTED_BY_METADATA_RULE';
  }
  return {
    videoId: video.id, url: `https://www.youtube.com/watch?v=${video.id}`,
    title, channel: sn.channelTitle || null, publishedAt,
    verifiedViews: views, meets1000Views, privacyStatus: video.status?.privacyStatus || null,
    classification, footageType, qualifiedMetadataCandidate: strong,
    evidence: {
      eventAliasesInTitle: titleEvents, eventAliasesInDescription: descriptionEvents,
      otherStormsInTitle: conflictTitle,
      locationInTitle: titlePlaces, locationInDescription: descriptionPlaces,
      locationDepictedInVideo: 'NOT_VERIFIED',
      yearInTitle: yearTitle, yearInDescription: yearDescription,
      uploadYear, contemporaryUpload, laterUpload,
      footageRecordedInRequestedYear: 'NOT_VERIFIED'
    },
    reviewReasons: reasons,
    historicalFootageAuthenticated: false
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
  report.summary = {
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
