
'use strict';
// Weather Time Machine Engine 3 — Test 43
// Evidence-validation self-tests + Blogger-safe export. Node.js 22, no dependencies.
// This script NEVER authenticates footage automatically.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const IDS = ['imPLZeKCpxg','_rf-4fgUOUE','Qtqhz-twPNA','HvA8F_vBvCw','ady9mc7fdTU','nJp3I5P0dBs','_wLS2OBRHo8','FudBfDWRZc4','jXM2J6Z20ds','LBTYcCM-4N8','HBcbdt-pPz4','b1G4uuM1GNo','g6-HmaXgA-I','PPl04srE6k0','ejNGUvpq5E4','jVd9ys1garA','qR1bct_5Tbc','dW-e0be1cJo','wrVUFQIMBHw','iQORtHIRJ98'];
const INPUT = 'reports/engine3-test43-evidence.json';
const REPORT = 'reports/engine3-youtube-test43.json';
const BLOGGER = 'reports/engine3-test43-blogger-preview.json';
const MARKDOWN = 'reports/engine3-test43-review.md';
const MIN_VIEWS = 1000;
const hasText = x => typeof x === 'string' && x.trim().length >= 12;
const timeOK = x => typeof x === 'string' && /^(?:\d{1,3}:)?[0-5]?\d:[0-5]\d$/.test(x);
const dateOK = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x)) && new Date(x).toISOString().slice(0,10) === x;
function independentURL(s) {
  try {
    const u = new URL(s);
    return ['https:','http:'].includes(u.protocol) && !/(^|\.)(youtube\.com|youtu\.be)$/.test(u.hostname.toLowerCase());
  } catch { return false; }
}
function evaluate(r, eligible) {
  if (!r) return {decision:'Pending Review',evidencePoints:0,missing:['No review submitted']};
  if (r.decision === 'Rejected') {
    return hasText(r.rejectionReason)
      ? {decision:'Rejected',evidencePoints:0,missing:[],reason:r.rejectionReason}
      : {decision:'Pending Review',evidencePoints:0,missing:['Rejection reason']};
  }
  let points = 0;
  const missing = [];
  function check(ok, value, name) { if(ok) points+=value; else missing.push(name); }
  check(hasText(r.reviewer) && dateOK(r.reviewDate),10,'Reviewer and review date');
  check(r.videoWatched === true && Array.isArray(r.scenes) && r.scenes.length>=2 && r.scenes.every(s=>timeOK(s.timestamp)&&hasText(s.observation)),25,'Two timestamped observations');
  check(r.locationConfirmed===true && hasText(r.locationEvidence),15,'New Jersey scene location');
  check(r.eventConfirmed===true && hasText(r.eventEvidence),15,'Hurricane Sandy 2012 event');
  check(r.recordingDateConfirmed===true && hasText(r.recordingDateEvidence),10,'Actual filming date');
  check(r.sourceProvenanceConfirmed===true && hasText(r.sourceProvenanceEvidence),10,'Source provenance');
  check(Array.isArray(r.corroboration) && r.corroboration.some(c=>independentURL(c.url)&&hasText(c.explanation)),15,'Independent corroboration');
  if (!eligible) missing.push('Public video with >=1000 API-verified views');
  const complete = eligible && points===100 && r.decision==='Authenticated';
  return {decision:complete?'Evidence Complete — Independent Audit Required':'Pending Review',evidencePoints:points,missing};
}
function testGrader() {
  const sample = {videoId:'TEST_ONLY',decision:'Authenticated',reviewer:'Example Human Reviewer',reviewDate:'2026-10-16',videoWatched:true,scenes:[{timestamp:'00:15',observation:'Synthetic test scene observation A'},{timestamp:'01:20',observation:'Synthetic test scene observation B'}],locationConfirmed:true,locationEvidence:'Synthetic location corroboration',eventConfirmed:true,eventEvidence:'Synthetic event corroboration',recordingDateConfirmed:true,recordingDateEvidence:'Synthetic recording date proof',sourceProvenanceConfirmed:true,sourceProvenanceEvidence:'Synthetic original source record',corroboration:[{url:'https://example.org/fictional-source',explanation:'Synthetic independent citation only'}]};
  const checks = [];
  function run(name, fn) {fn();checks.push({name,passed:true});}
  run('No review stays Pending Review',()=>assert.equal(evaluate(null,true).decision,'Pending Review'));
  run('Synthetic complete evidence is not authenticated',()=>{const x=evaluate(sample,true);assert.equal(x.evidencePoints,100);assert.equal(x.decision,'Evidence Complete — Independent Audit Required');});
  run('Missing footage observations lowers points',()=>assert.ok(evaluate({...sample,scenes:[]},true).evidencePoints<100));
  run('YouTube URL is not independent corroboration',()=>assert.ok(evaluate({...sample,corroboration:[{url:'https://youtube.com/watch?v=abc',explanation:'Synthetic youtube source only'}]},true).evidencePoints<100));
  run('Ineligible video cannot be evidence-complete',()=>assert.equal(evaluate(sample,false).decision,'Pending Review'));
  run('Valid rejection requires explanation',()=>assert.equal(evaluate({decision:'Rejected',rejectionReason:'This footage shows a different storm.'},true).decision,'Rejected'));
  run('Missing rejection reason stays pending',()=>assert.equal(evaluate({decision:'Rejected'},true).decision,'Pending Review'));
  run('Timestamp validator rejects invalid seconds',()=>assert.equal(timeOK('01:99'),false));
  return checks;
}
function readEvidence() {
  if (!fs.existsSync(INPUT)) return [];
  const parsed = JSON.parse(fs.readFileSync(INPUT,'utf8'));
  if (!parsed || !Array.isArray(parsed.reviews)) throw Error('Expected {"reviews":[]} in '+INPUT);
  const seen = new Set();
  for (const review of parsed.reviews) {
    if (!review || !IDS.includes(review.videoId) || seen.has(review.videoId)) throw Error('Unknown or duplicate videoId: '+review?.videoId);
    seen.add(review.videoId);
  }
  return parsed.reviews;
}
async function fetchCandidates() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw Error('Missing GitHub secret YOUTUBE_API_KEY');
  const u = new URL('https://www.googleapis.com/youtube/v3/videos');
  u.searchParams.set('part','snippet,statistics,status');
  u.searchParams.set('id',IDS.join(','));
  u.searchParams.set('key',key);
  const response = await fetch(u,{signal:AbortSignal.timeout(30000)});
  const body = await response.json();
  if (!response.ok || body.error) throw Error('YouTube API error: '+(body.error?.message||response.status));
  return new Map((body.items||[]).map(v=>[v.id,v]));
}
async function main() {
  const unitTests = testGrader();
  const videos = await fetchCandidates();
  const reviews = readEvidence();
  const byID = new Map(reviews.map(r=>[r.videoId,r]));
  const candidates = IDS.map(id=>{
    const v=videos.get(id);
    const raw=v?.statistics?.viewCount;
    const views=typeof raw==='string' && /^\d+$/.test(raw)?Number(raw):null;
    const eligible=views!==null && Number.isSafeInteger(views) && views>=MIN_VIEWS && v?.status?.privacyStatus==='public';
    const result=evaluate(byID.get(id),eligible);
    return {videoId:id,url:'https://www.youtube.com/watch?v='+id,title:v?.snippet?.title||null,channel:v?.snippet?.channelTitle||null,uploadDate:v?.snippet?.publishedAt||null,officialViews:views,eligible,review:result};
  });
  const summary={requested:IDS.length,apiReturned:videos.size,eligible:candidates.filter(c=>c.eligible).length,reviewsSubmitted:reviews.length,completeEvidencePendingIndependentAudit:candidates.filter(c=>c.review.decision.startsWith('Evidence Complete')).length,rejected:candidates.filter(c=>c.review.decision==='Rejected').length,pendingReview:candidates.filter(c=>c.review.decision==='Pending Review').length,independentlyAuthenticated:0,unitTestsPassed:unitTests.length};
  const report={engine:3,test:43,generatedAt:new Date().toISOString(),event:'Hurricane Sandy',state:'New Jersey',year:2012,grade:'Not Evaluated',historicalAuthenticityScore:null,status:'INDEPENDENT_VISUAL_AUTHENTICATION_PENDING',summary,unitTests,candidates,limitations:['Synthetic self-tests are not real video reviews','YouTube API verifies metadata and view counts, not depicted frames','A complete review submission requires independent audit before authentication']};
  // Safe, static export for future Blogger integration. Never include API keys or reviewer-private notes.
  const blogger={schemaVersion:1,engine:3,test:43,event:report.event,state:report.state,year:report.year,generatedAt:report.generatedAt,grade:report.grade,disclaimer:'Video metadata candidates only; no footage independently authenticated.',videos:candidates.filter(c=>c.eligible && c.review.decision!=='Rejected').map(c=>({id:c.videoId,title:c.title,channel:c.channel,url:c.url,views:c.officialViews,verificationStatus:'Pending Independent Authentication'}))};
  fs.mkdirSync(path.dirname(REPORT),{recursive:true});
  fs.writeFileSync(REPORT,JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(BLOGGER,JSON.stringify(blogger,null,2)+'\n');
  const lines=['# Engine 3 — Test 43 Acceptance Report','','**Historical grade: Not Evaluated**','','## Summary',...Object.entries(summary).map(([k,v])=>`- ${k}: ${v}`),'','## Self-tests',...unitTests.map(x=>'- PASS: '+x.name),'','## Candidates',...candidates.map(c=>`- ${c.review.decision} | ${c.review.evidencePoints}/100 documentation points | ${c.officialViews??'N/A'} views | ${c.url}`),'','Blogger preview JSON contains metadata only, no private API key.','No footage has been independently authenticated.'];
  fs.writeFileSync(MARKDOWN,lines.join('\n')+'\n');
  console.log(JSON.stringify({test:43,grade:report.grade,summary,files:[REPORT,BLOGGER,MARKDOWN]},null,2));
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1;});
