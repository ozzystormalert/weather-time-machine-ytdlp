
'use strict';
/**
 * Weather Time Machine — Engine 3 — Test #40
 * Final historical footage evidence audit.
 * Node.js 22, no dependencies. Never automatically authenticates footage.
 * Optional reviewed evidence: reports/engine3-test40-evidence.json
 */
const fs = require('node:fs');
const path = require('node:path');
const KEY = (process.env.YOUTUBE_API_KEY || '').trim();
const STATE = (process.env.WEATHER_STATE || 'New Jersey').trim();
const YEAR = Number(process.env.WEATHER_YEAR || '2012');
const EVENT = (process.env.WEATHER_EVENT || 'Hurricane Sandy').trim();
const MIN_VIEWS = 1000;
const OUTPUT = 'reports/engine3-youtube-test40.json';
const REVIEW_MD = 'reports/engine3-youtube-test40-review.md';
const EVIDENCE_PATH = process.env.TEST40_EVIDENCE_PATH || 'reports/engine3-test40-evidence.json';

const IDS = [
  'imPLZeKCpxg','_rf-4fgUOUE','Qtqhz-twPNA','HvA8F_vBvCw',
  'ady9mc7fdTU','nJp3I5P0dBs','_wLS2OBRHo8','FudBfDWRZc4',
  'jXM2J6Z20ds','LBTYcCM-4N8','HBcbdt-pPz4','b1G4uuM1GNo',
  'g6-HmaXgA-I','PPl04srE6k0','ejNGUvpq5E4','jVd9ys1garA',
  'qR1bct_5Tbc','dW-e0be1cJo','wrVUFQIMBHw','iQORtHIRJ98'
];

const PRIORITY = [
  'ady9mc7fdTU','_rf-4fgUOUE','Qtqhz-twPNA',
  'imPLZeKCpxg','HvA8F_vBvCw'
];

const norm = s => String(s || '').toLowerCase()
  .replace(/[^a-z0-9]+/g,' ').trim();

const has = (s, p) =>
  (` ${norm(s)} `).includes(` ${norm(p)} `);

const places = [
  'new jersey','nj','n j','jersey shore','union beach',
  'seaside heights','seaside park','mantoloking','atlantic city',
  'point pleasant','hoboken','sea bright','long beach island',
  'asbury park','belmar','ocean county','monmouth county'
];

const wrongStorms = [
  'hurricane irene','hurricane isaias','hurricane ida',
  'hurricane katrina','hurricane ian','hurricane maria',
  'hurricane harvey','hurricane florence'
];

const eventWords = /\bsandy\b/i.test(EVENT)
  ? ['hurricane sandy','superstorm sandy','sandy']
  : [EVENT];

const isUrl = s => {
  try {
    const u = new URL(s);
    return ['https:','http:'].includes(u.protocol) && !!u.hostname;
  } catch {
    return false;
  }
};

const nonempty = s =>
  typeof s === 'string' && s.trim().length >= 12;

const timestamp = s =>
  typeof s === 'string' &&
  /^(?:\d{1,3}:)?[0-5]?\d:[0-5]\d$/.test(s.trim());

const report = {
  engine:3,
  test:40,
  generatedAt:new Date().toISOString(),
  event:EVENT,
  state:STATE,
  year:YEAR,
  minimumViews:MIN_VIEWS,
  grade:'Not Evaluated',
  score:null,
  status:'RUNNING',
  rules:[
    'YouTube videos.list statistics.viewCount must independently confirm >=1000 views.',
    'Title, upload date, publisher name and description are leads, not visual authentication.',
    'Human reviewer must inspect and document scene timestamps, New Jersey location, 2012 Sandy event, and filming provenance.',
    'At least one independent corroborating URL with a meaningful explanation is required for authentication.',
    'Unreviewed videos stay Pending Review; contradictory evidence may support Rejected.',
    'No overall historical authenticity grade until review evidence has been supplied and validated.'
  ],
  errors:[],
  summary:{},
  candidates:[]
};

async function fetchVideos() {
  if (!KEY) throw new Error('Missing YOUTUBE_API_KEY GitHub secret');

  const all=[];

  for(let i=0;i<IDS.length;i+=50) {
    const url=new URL('https://www.googleapis.com/youtube/v3/videos');

    url.searchParams.set('part','snippet,statistics,status,contentDetails');
    url.searchParams.set('id',IDS.slice(i,i+50).join(','));
    url.searchParams.set('key',KEY);

    const res=await fetch(url,{
      signal:AbortSignal.timeout(30000)
    });

    const data=await res.json();

    if(!res.ok || data.error) {
      throw new Error(
        `YouTube API ${res.status}: ${data.error?.message||'unknown error'}`
      );
    }

    all.push(...(data.items||[]));
  }

  return all;
}

function readReviews() {
  if(!fs.existsSync(EVIDENCE_PATH)) return {};

  const data=JSON.parse(fs.readFileSync(EVIDENCE_PATH,'utf8'));

  if(!data || typeof data!=='object' || !Array.isArray(data.reviews)) {
    throw new Error('Evidence file must contain {"reviews": [...]}');
  }

  const result={};

  for(const review of data.reviews) {
    if(!IDS.includes(review.videoId)) {
      throw new Error(`Unknown review videoId: ${review.videoId}`);
    }

    if(result[review.videoId]) {
      throw new Error(`Duplicate review videoId: ${review.videoId}`);
    }

    result[review.videoId]=review;
  }

  return result;
}

function validateReview(r, candidate) {
  if(!r) {
    return {
      decision:'Pending Review',
      checks:[],
      missing:['Human visual review not submitted']
    };
  }

  const requested=String(r.decision||'Pending Review');

  if(!['Authenticated','Rejected','Pending Review'].includes(requested)) {
    return {
      decision:'Pending Review',
      checks:[],
      missing:['Invalid decision value']
    };
  }

  const checks=[];
  const check=(label,pass)=>
    checks.push({label,pass:Boolean(pass)});

  check('Reviewer identified',nonempty(r.reviewer));

  check(
    'Reviewed on ISO date',
    /^\d{4}-\d{2}-\d{2}$/.test(r.reviewedOn||'')
  );

  check(
    'Actual video viewed',
    r.videoFramesInspected===true
  );

  check(
    'Scene timestamps documented',
    Array.isArray(r.scenes) &&
    r.scenes.length>0 &&
    r.scenes.every(s=>
      timestamp(s.timestamp) &&
      nonempty(s.observation)
    )
  );

  check(
    'Depicted New Jersey location confirmed',
    r.depictedLocationVerified===true &&
    nonempty(r.locationEvidence)
  );

  check(
    'Hurricane Sandy 2012 confirmed',
    r.depictedEventVerified===true &&
    nonempty(r.eventEvidence)
  );

  check(
    'Recording date established',
    r.recordingDateVerified===true &&
    nonempty(r.recordingDateEvidence)
  );

  check(
    'Original source provenance established',
    r.independentProvenanceVerified===true &&
    nonempty(r.provenanceEvidence)
  );

  check(
    'Independent corroborating source',
    Array.isArray(r.corroboration) &&
    r.corroboration.length>0 &&
    r.corroboration.some(c=>
      isUrl(c.url) &&
      nonempty(c.explanation) &&
      !c.url.includes('youtube.com/watch')
    )
  );

  check(
    'API view count >=1000 and public',
    candidate.meets1000Views &&
    candidate.publicVideo
  );

  check(
    'No clear conflicting storm',
    !candidate.wrongStormInTitle
  );

  const missing=checks
    .filter(x=>!x.pass)
    .map(x=>x.label);

  if(requested==='Rejected') {
    if(!nonempty(r.rejectionReason)) {
      return {
        decision:'Pending Review',
        checks,
        missing:['Documented rejection reason required']
      };
    }

    return {
      decision:'Rejected',
      checks,
      missing:[],
      rejectionReason:r.rejectionReason
    };
  }

  if(requested==='Authenticated' && missing.length===0) {
    return {
      decision:'Authenticated',
      checks,
      missing:[],
      reviewer:r.reviewer,
      reviewedOn:r.reviewedOn
    };
  }

  return {
    decision:'Pending Review',
    checks,
    missing:requested==='Authenticated'
      ? missing
      : ['Reviewer has not declared authentication']
  };
}

function buildCandidate(id,video,reviews) {
  if(!video) {
    return {
      videoId:id,
      url:`https://www.youtube.com/watch?v=${id}`,
      metadataStatus:'NOT_RETURNED_BY_API',
      meets1000Views:false,
      publicVideo:false,
      authenticity:{
        decision:'Pending Review',
        missing:['Video not returned by official API']
      }
    };
  }

  const s=video.snippet||{};
  const title=s.title||'';
  const description=s.description||'';

  const viewsRaw=video.statistics?.viewCount;

  const views=viewsRaw!==undefined &&
    /^\d+$/.test(String(viewsRaw))
      ? Number(viewsRaw)
      : null;

  const uploadYear=s.publishedAt
    ? Number(s.publishedAt.slice(0,4))
    : null;

  const eventInTitle=eventWords.some(w=>has(title,w));
  const locationInTitle=places.filter(w=>has(title,w));
  const locationInDescription=places.filter(w=>has(description,w));
  const wrongStormInTitle=wrongStorms.some(w=>has(title,w));

  const publicVideo=video.status?.privacyStatus==='public';
  const meets1000Views=views!==null && views>=MIN_VIEWS;

  const candidate={
    videoId:id,
    url:`https://www.youtube.com/watch?v=${id}`,
    title,
    channel:s.channelTitle||null,
    publishedAt:s.publishedAt||null,
    uploadYear,
    verifiedViews:views,
    meets1000Views,
    publicVideo,
    eventInTitle,
    locationInTitle,
    locationInDescription,
    wrongStormInTitle,
    metadataStatus:
      meets1000Views &&
      publicVideo &&
      eventInTitle &&
      locationInTitle.length &&
      !wrongStormInTitle
        ? 'ELIGIBLE_FOR_AUTHENTICITY_REVIEW'
        : 'METADATA_REQUIRES_REVIEW',
    filmingDateFromUploadProven:false,
    depictedLocationFromMetadataProven:false,
    priority:PRIORITY.includes(id)
  };

  const verdict=validateReview(reviews[id],candidate);

  candidate.authenticity=verdict;

  if(reviews[id]) {
    candidate.submittedReview=reviews[id];
  }

  return candidate;
}

function markdown(candidates) {
  const lines=[
    '# Engine 3 — Test #40 Historical Footage Review',
    '',
    `Event: ${EVENT} | State: ${STATE} | Year: ${YEAR} | Minimum views: ${MIN_VIEWS}`,
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '**Important:** API metadata is not footage authentication. A green GitHub Action is not an authenticity verdict.',
    '',
    `**Current grade:** ${report.grade}`,
    '',
    '| Video | API views | Metadata | Authenticity |',
    '|---|---:|---|---|'
  ];

  for(const c of candidates) {
    lines.push(
      `| [${(c.title||c.videoId).replace(/\|/g,' ')}](${c.url}) | ${c.verifiedViews??'unknown'} | ${c.metadataStatus} | ${c.authenticity.decision} |`
    );
  }

  lines.push(
    '',
    '## Priority footage review — exact evidence required',
    ''
  );

  for(const id of PRIORITY) {
    const c=candidates.find(x=>x.videoId===id);

    if(!c) continue;

    lines.push(
      `### ${c.title||id}`,
      c.url,
      '',
      '- [ ] Watch video and record scene timestamps (MM:SS or HH:MM:SS)',
      '- [ ] Identify visible New Jersey location evidence',
      '- [ ] Confirm actual scenes depict Hurricane Sandy in 2012',
      '- [ ] Establish original recording date (not merely upload date)',
      '- [ ] Establish filming/publisher provenance and independent corroboration',
      '- [ ] Record reviewer, review date, and decision',
      `- Current decision: **${c.authenticity.decision}**`,
      ''
    );
  }

  lines.push(
    '## Optional structured evidence file',
    '',
    'Save `reports/engine3-test40-evidence.json` in the repository and rerun Test #40.',
    'See `engine3-test40-evidence-template.json` for the required fields.',
    'A reviewer must provide actual observed evidence; never set verification booleans based on metadata alone.',
    ''
  );

  return lines.join('\n');
}

async function main() {
  const reviews=readReviews();
  const videos=await fetchVideos();

  const byId=new Map(videos.map(v=>[v.id,v]));

  report.candidates=IDS.map(id=>
    buildCandidate(id,byId.get(id),reviews)
  );

  const counts={
    Authenticated:0,
    Rejected:0,
    'Pending Review':0
  };

  for(const c of report.candidates) {
    counts[c.authenticity.decision]++;
  }

  report.summary={
    requested:IDS.length,
    apiReturned:videos.length,
    officialViewCountAtLeast1000:
      report.candidates.filter(c=>c.meets1000Views).length,
    eligibleMetadata:
      report.candidates.filter(c=>
        c.metadataStatus==='ELIGIBLE_FOR_AUTHENTICITY_REVIEW'
      ).length,
    reviewsSubmitted:Object.keys(reviews).length,
    authenticated:counts.Authenticated,
    rejected:counts.Rejected,
    pendingReview:counts['Pending Review'],
    apiErrors:0
  };

  report.status=counts.Authenticated>0
    ? 'AT_LEAST_ONE_DOCUMENTED_AUTHENTICATION_REQUIRES_FINAL_AUDIT'
    : 'AWAITING_HUMAN_VISUAL_AND_PROVENANCE_AUTHENTICATION';

  // The seven-category resource grade is separate and never
  // inferred from one authenticated video.
  report.grade='Not Evaluated';
  report.score=null;

  fs.mkdirSync(path.dirname(OUTPUT),{
    recursive:true
  });

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(report,null,2)+'\n'
  );

  fs.writeFileSync(
    REVIEW_MD,
    markdown(report.candidates)+'\n'
  );

  console.log(JSON.stringify({
    test:40,
    status:report.status,
    grade:report.grade,
    summary:report.summary,
    output:[OUTPUT,REVIEW_MD]
  },null,2));
}

main().catch(err=>{
  report.status='TEST_ERROR';
  report.errors.push(String(err.stack||err));

  fs.mkdirSync(path.dirname(OUTPUT),{
    recursive:true
  });

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(report,null,2)+'\n'
  );

  console.error(err.stack||err);
  process.exitCode=1;
});
