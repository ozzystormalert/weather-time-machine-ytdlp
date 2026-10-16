
'use strict';
// Engine 3 Test 39: evidence audit, NOT automatic visual authentication.
const fs = require('node:fs');
const path = require('node:path');
const API_KEY = process.env.YOUTUBE_API_KEY;
const STATE = process.env.WEATHER_STATE || 'New Jersey';
const YEAR = Number(process.env.WEATHER_YEAR || 2012);
const EVENT = process.env.WEATHER_EVENT || 'Hurricane Sandy';
const MIN_VIEWS = 1000;
const OUT = 'reports/engine3-youtube-test39.json';
// The 20 strong metadata candidates from Test 38, in its reported order.
const IDS = [
  'imPLZeKCpxg','_rf-4fgUOUE','Qtqhz-twPNA','HvA8F_vBvCw',
  'ady9mc7fdTU','nJp3I5P0dBs','_wLS2OBRHo8','FudBfDWRZc4',
  'jXM2J6Z20ds','LBTYcCM-4N8','HBcbdt-pPz4','b1G4uuM1GNo',
  'g6-HmaXgA-I','PPl04srE6k0','ejNGUvpq5E4','jVd9ys1garA',
  'qR1bct_5Tbc','dW-e0be1cJo','wrVUFQIMBHw','iQORtHIRJ98'
];
const locationWords = [
  'new jersey','n.j.','nj','jersey shore','seaside heights','seaside park',
  'mantoloking','union beach','atlantic city','beach haven','bricktown',
  'brick township','point pleasant','asbury park','hoboken','sea bright',
  'long beach island','ocean county','monmouth county','cape may'
];
const normalize = s => String(s || '').toLowerCase().replace(/[’']/g, "'");
const hits = (s, terms) => terms.filter(t => {
  const re = new RegExp('(^|[^a-z])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)', 'i');
  return re.test(normalize(s));
});
const stormHits = s => hits(s, ['hurricane sandy','superstorm sandy','sandy']);
const otherStorm = s => hits(s, ['hurricane irene','hurricane isaias','hurricane ida','hurricane katrina','hurricane harvey','hurricane ian']);
const sourceCategory = name => {
  const n = normalize(name);
  if (/abc news|cbs news|pbs newshour|associated press|voice of america|nj.com/.test(n)) return 'ESTABLISHED_NEWS_ORGANIZATION_CLAIM';
  return 'OTHER_PUBLISHER_OR_EYEWITNESS_CLAIM';
};
async function youtubeVideos(ids) {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part','snippet,statistics,status,contentDetails');
  url.searchParams.set('id', ids.join(','));
  url.searchParams.set('key', API_KEY);
  const response = await fetch(url, {signal: AbortSignal.timeout(30000)});
  const json = await response.json();
  if (!response.ok || json.error) throw new Error('YouTube Data API error: ' + JSON.stringify(json.error || response.status));
  return json.items || [];
}
function audit(item) {
  const s = item.snippet || {};
  const title = s.title || '';
  const desc = s.description || '';
  const publishedAt = s.publishedAt || null;
  const views = Number(item.statistics?.viewCount);
  const publishedYear = publishedAt ? Number(publishedAt.slice(0,4)) : null;
  const eventTitle = stormHits(title);
  const titlePlaces = hits(title,locationWords);
  const descPlaces = hits(desc,locationWords);
  const wrongStorm = otherStorm(title);
  const later = publishedYear !== null && publishedYear > YEAR;
  const contemporary = publishedYear === YEAR;
  const metadataPass = Number.isFinite(views) && views >= MIN_VIEWS &&
    item.status?.privacyStatus === 'public' && eventTitle.length > 0 &&
    titlePlaces.length > 0 && wrongStorm.length === 0 && contemporary;
  const lowerTitle = normalize(title);
  const footageClaim = /footage|raw video|storm chaser|riding out|aerial video/.test(lowerTitle);
  const aftermathClaim = /aftermath|damage|destroy|devastat|wreck|ruins|fires/.test(lowerTitle);
  const preparations = /prepare|brace|before the storm/.test(lowerTitle);
  const footageCategory = preparations ? 'PRE_STORM_PREPARATIONS' : aftermathClaim ? 'AFTERMATH_OR_DAMAGE' : footageClaim ? 'STORM_ORIGINAL_FOOTAGE_CLAIM' : 'NEWS_OR_UNDETERMINED';
  const reviewFlags = [];
  if (!Number.isFinite(views) || views < MIN_VIEWS) reviewFlags.push('MINIMUM_VIEWS_NOT_MET');
  if (!eventTitle.length) reviewFlags.push('EVENT_NOT_IN_TITLE');
  if (!titlePlaces.length) reviewFlags.push(descPlaces.length ? 'LOCATION_ONLY_IN_DESCRIPTION' : 'LOCATION_NOT_EVIDENCED');
  if (wrongStorm.length) reviewFlags.push('OTHER_STORM_IN_TITLE');
  if (later) reviewFlags.push('LATER_UPLOAD_REQUIRES_ARCHIVAL_PROVENANCE');
  if (!contemporary && !later) reviewFlags.push('UPLOAD_YEAR_UNKNOWN_OR_EARLIER');
  if (preparations) reviewFlags.push('PREPARATIONS_NOT_STORM_IMPACT_FOOTAGE');
  return {
    videoId:item.id, url:`https://www.youtube.com/watch?v=${item.id}`,
    title, channel:s.channelTitle || null, channelId:s.channelId || null,
    publishedAt, uploadYear:publishedYear, verifiedViews:views,
    meets1000Views:Number.isFinite(views) && views >= MIN_VIEWS,
    privacyStatus:item.status?.privacyStatus || 'UNKNOWN',
    sourceType:sourceCategory(s.channelTitle), footageCategory,
    metadataEvidence:{eventInTitle:eventTitle,locationInTitle:titlePlaces,
      locationInDescription:descPlaces,otherStormsInTitle:wrongStorm,
      uploadYearMatchesEventYear:contemporary, laterUpload:later,
      uploadDateProvesRecordingDate:false},
    reviewFlags,
    metadataCandidate:metadataPass,
    authenticity:{
      videoFramesInspected:false, recordingDateVerified:false,
      depictedLocationVerified:false, depictedEventVerified:false,
      independentProvenanceVerified:false,
      authenticated:false,
      decision:'PENDING_MANUAL_FOOTAGE_AND_PROVENANCE_REVIEW'
    },
    reviewChecklist:[
      'Watch the actual video and document exact timestamps of relevant scenes',
      'Confirm the scenes depict New Jersey, not merely a New Jersey mention',
      'Confirm the scenes depict Hurricane Sandy in 2012, not another storm',
      'Establish source provenance and recording date; upload date alone is insufficient',
      'Identify whether footage is original, news, aftermath, preparations, or archival',
      'Document a human review decision and supporting evidence'
    ]
  };
}
async function main() {
  if (!API_KEY) throw new Error('Missing GitHub secret YOUTUBE_API_KEY');
  const fetched = await youtubeVideos(IDS);
  const byId = new Map(fetched.map(x => [x.id,x]));
  const audited = IDS.map(id => byId.has(id) ? audit(byId.get(id)) : ({
    videoId:id,url:`https://www.youtube.com/watch?v=${id}`,
    metadataCandidate:false,reviewFlags:['NOT_RETURNED_BY_YOUTUBE_API'],
    authenticity:{authenticated:false,decision:'NOT_EVALUATED'}
  }));
  const report = {
    engine:3,test:39,generatedAt:new Date().toISOString(),state:STATE,year:YEAR,event:EVENT,
    minimumViews:MIN_VIEWS,grade:'Not Evaluated',score:null,
    status:'SOURCE_EVIDENCE_AUDITED_VISUAL_AUTHENTICITY_PENDING',
    method:'Official YouTube Data API videos.list refresh for Test 38 candidate IDs; conservative provenance checklist',
    limitations:[
      'API metadata and publisher identity cannot authenticate video frames.',
      'Upload date is not proof of recording date.',
      'Channel name is a claim, not independently validated provenance.',
      'No video was watched by this script; zero videos can be automatically marked authenticated.'
    ],
    summary:{requested:IDS.length,apiReturned:fetched.length,
      meeting1000Views:audited.filter(x=>x.meets1000Views).length,
      metadataCandidates:audited.filter(x=>x.metadataCandidate).length,
      footageAuthenticated:0,
      pendingReview:audited.length},
    priorityReview:audited.filter(x=>x.metadataCandidate).sort((a,b)=>{
      const p=x=>x.footageCategory==='STORM_ORIGINAL_FOOTAGE_CLAIM'?0:x.footageCategory==='AFTERMATH_OR_DAMAGE'?1:2;
      return p(a)-p(b);
    }).map(x=>x.videoId),
    candidates:audited
  };
  fs.mkdirSync(path.dirname(OUT),{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({test:39,report:OUT,summary:report.summary,grade:report.grade},null,2));
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});
