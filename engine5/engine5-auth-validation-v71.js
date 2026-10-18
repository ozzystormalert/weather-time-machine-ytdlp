
'use strict';
/** Weather Time Machine — Engine 5 v7.1
 * Independent evidence validation. Node.js 22, no dependencies.
 * Does not alter production server, Blogger, or earlier engines.
 * Does not independently authenticate sources or assign A–F grades.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SOURCE = process.env.SOURCE_REPORT || 'engine5-v70-source-review-results.json';
const REVIEWS = process.env.HUMAN_REVIEW || 'engine5-v70-human-review-decisions.json';
const OUT = 'engine5-v71-auth-validation-results.json';
const EXPECTED = {event:process.env.EVENT||'Superstorm Sandy',state:process.env.STATE||'New Jersey',year:String(process.env.YEAR||'2012')};
const required = ['visualContent','eventDate','geography','originalSource','timestamp'];
const canonical = s => String(s||'').normalize('NFKC').replace(/_/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
const isHttpUrl = s => {try {const u=new URL(s);return ['https:','http:'].includes(u.protocol)&&Boolean(u.hostname);}catch{return false;}};
const read = p => JSON.parse(fs.readFileSync(path.resolve(p),'utf8'));
const fingerprint = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const report = {engine:5,version:'7.1',test:'Final Authentication Evidence Validation',startedAt:new Date().toISOString(),...EXPECTED,sourceFiles:{sourceReport:SOURCE,humanReview:REVIEWS},status:'not_evaluated',candidates:[],summary:{},authenticatedMaps:0,score:null,grade:null,finalGrade:false};
try {
 const source=read(SOURCE);
 if(source.engine!==5||String(source.version)!=='7.0'||!Array.isArray(source.candidates)) throw Error('Invalid v7.0 source report');
 if(source.event!==EXPECTED.event||source.state!==EXPECTED.state||String(source.year)!==EXPECTED.year) throw Error('Source report event/state/year mismatch');
 report.sourceFiles.sourceSHA256=fingerprint(source);
 let reviews=null;
 if(fs.existsSync(REVIEWS)) {
  reviews=read(REVIEWS);
  if(reviews.engine!==5||String(reviews.version)!=='7.0'||reviews.kind!=='human_review_input'||!Array.isArray(reviews.results)) throw Error('Invalid human review export');
  if(reviews.event!==EXPECTED.event||reviews.state!==EXPECTED.state||String(reviews.year)!==EXPECTED.year) throw Error('Human review event/state/year mismatch');
  report.sourceFiles.reviewSHA256=fingerprint(reviews);
 } else report.warning='Human review file not supplied; all candidates remain pending';
 const reviewMap=new Map();
 for(const r of reviews?.results||[]) {
  const key=canonical(r.title);
  if(!key||reviewMap.has(key)) throw Error('Missing or duplicate human review title');
  reviewMap.set(key,r);
 }
 const sourceTitles=new Set();
 for(const c of source.candidates){
  const key=canonical(c.title);
  if(!key||sourceTitles.has(key)) throw Error('Missing or duplicate source candidate title');
  sourceTitles.add(key);
  const r=reviewMap.get(key);
  const decisions=r?.decisions||{};
  const flags=[];
  if(c.status!=='human_review_required') flags.push('Source metadata not successfully retrieved');
  if(!c.imageURL||!isHttpUrl(c.imageURL)) flags.push('No valid image URL');
  if(!isHttpUrl(c.commonsURL)) flags.push('No valid Commons record URL');
  if(!c.metadata?.artist&&!c.metadata?.credit&&!c.metadata?.source) flags.push('Attribution missing');
  if(!Array.isArray(c.filenameYears)||!c.filenameYears.includes(EXPECTED.year)) flags.push('Requested year not established in filename');
  if(c.metadata?.dateOriginal&&!String(c.metadata.dateOriginal).includes(EXPECTED.year)) flags.push('Original-date metadata discrepancy needs resolution');
  if(!r) flags.push('Human review not supplied');
  else {
   if(canonical(r.commonsURL)!==canonical(c.commonsURL)) flags.push('Human review Commons URL does not match source report');
   for(const k of required) if(!['yes','no','pending'].includes(decisions[k])) flags.push(`Invalid or missing review decision: ${k}`);
   if(required.some(k=>decisions[k]==='no')) flags.push('Reviewer rejected at least one required criterion');
   if(required.some(k=>decisions[k]!=='yes')) flags.push('Human review incomplete');
   if(!isHttpUrl(decisions.evidenceURL)) flags.push('Independent evidence URL missing or invalid');
  }
  // A URL and a checkbox are only assertions; source corroboration and image content
  // still require independent checking. Never mark authenticated here.
  flags.push('Independent original-source corroboration not machine-verified');
  const reviewerComplete=Boolean(r)&&required.every(k=>decisions[k]==='yes')&&isHttpUrl(decisions.evidenceURL);
  report.candidates.push({title:c.title,classification:c.classification?.category||'unknown',sourceURL:c.commonsURL||null,evidenceURL:isHttpUrl(decisions.evidenceURL)?decisions.evidenceURL:null,reviewerComplete,reviewDecisions:Object.fromEntries(required.map(k=>[k,decisions[k]||'pending'])),flags,status:required.some(k=>decisions[k]==='no')?'reviewer_rejected':reviewerComplete?'pending_independent_corroboration':'pending_evidence',authenticated:false,acceptedForGrading:false,score:null,grade:null});
 }
 for(const key of reviewMap.keys()) if(!sourceTitles.has(key)) report.warningExtraReviewEntries=(report.warningExtraReviewEntries||0)+1;
} catch(e) {report.error=String(e.message);process.exitCode=1;}
report.summary={examined:report.candidates.length,reviewerComplete:report.candidates.filter(x=>x.reviewerComplete).length,reviewerRejected:report.candidates.filter(x=>x.status==='reviewer_rejected').length,pendingEvidence:report.candidates.filter(x=>x.status==='pending_evidence').length,pendingIndependentCorroboration:report.candidates.filter(x=>x.status==='pending_independent_corroboration').length,authenticatedMaps:0,finalGradingEnabled:false};
report.completedAt=new Date().toISOString();
fs.writeFileSync(OUT,JSON.stringify(report,null,2));
console.log('Engine 5 v7.1:',JSON.stringify(report.summary));
console.log('Output:',OUT,'Grade: NOT EVALUATED');
if(report.error) console.error(report.error);
