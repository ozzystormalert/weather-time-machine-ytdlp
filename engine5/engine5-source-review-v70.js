
'use strict';
/** Weather Time Machine Engine 5 v7.0 — independent original-source review.
 * Node.js 22, no packages. No automated visual authentication or grades.
 * Does not modify production Engine 5 v6.5 or Blogger.
 */
const fs = require('node:fs');
const BASE = process.env.ENGINE5_URL || 'https://weather-time-machine-engine5.onrender.com';
const EVENT = process.env.EVENT || 'Superstorm Sandy';
const STATE = process.env.STATE || 'New Jersey';
const YEAR = String(process.env.YEAR || '2012');
const OUT_JSON = 'engine5-v70-source-review-results.json';
const OUT_HTML = 'engine5-v70-human-review.html';
const TARGETS = [
 'File:Sandy Radar 20121029 2318 UTC.gif',
 'File:Sandy 2012 track.png',
 'File:Sandy 2012 full track.png',
 'File:Sandy Radar 20121029 1818 UTC.gif',
 'File:Sandy 2012-10-25 GOES-13.jpg',
 'File:Sandy 2012 path.png'
];
const REFERENCES = [
 {name:'NHC Sandy 2012 Tropical Cyclone Report',url:'https://www.nhc.noaa.gov/data/tcr/AL182012_Sandy.pdf',kind:'event reference — not proof of individual file'},
 {name:'NOAA Hurricane Research Division — Sandy',url:'https://www.aoml.noaa.gov/hrd/Storm_pages/sandy2012/',kind:'radar and satellite research collection'},
 {name:'NHC 2012 Tropical Cyclone Reports',url:'https://www.nhc.noaa.gov/data/tcr/index.php?season=2012',kind:'track source reference'},
 {name:'NOAA Weather Prediction Center Sandy',url:'https://www.wpc.ncep.noaa.gov/tropical/rain/sandy2012.html',kind:'rainfall map reference'}
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const plain = s => String(s ?? '').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
const field = (obj,k) => plain(obj?.[k]?.value ?? obj?.[k] ?? '');
const normalized = s => String(s ?? '').replace(/^File:/i,'').replace(/_/g,' ').trim().toLowerCase();
function yearFromTitle(title) {
 const compact = [...String(title).matchAll(/(?:^|\D)((?:18|19|20)\d{2})(\d{2})(\d{2})(?!\d)/g)]
   .filter(m => +m[2]>=1 && +m[2]<=12 && +m[3]>=1 && +m[3]<=31).map(m => m[1]);
 const cleaned = String(title).replace(/\b(?:[01]\d|2[0-3])[0-5]\d\s*UTC\b/gi,' UTC');
 return [...new Set([...compact,...(cleaned.match(/\b(?:18|19|20)\d{2}\b/g)||[])])];
}
async function fetchRetry(url) {
 let last;
 for(let attempt=0;attempt<4;attempt++){
  const ac = new AbortController(), timer=setTimeout(()=>ac.abort(),25000);
  try {
   const r=await fetch(url,{signal:ac.signal,headers:{'User-Agent':'WeatherTimeMachine-Engine5-v70/1.0 (research verification)','Accept':'application/json'}});
   if(r.ok) return r;
   last=new Error(`HTTP ${r.status}`);
   if(![429,500,502,503,504].includes(r.status)) throw last;
   const header=r.headers.get('retry-after'); const seconds=header!==null?Number(header):NaN;
   const retry=Number.isFinite(seconds)?seconds*1000:(Date.parse(header||'')-Date.now())||0;
   await r.body?.cancel();
   if(attempt===3) throw last;
   await sleep(Math.min(90000,Math.max(4000*2**attempt,retry)));
  } catch(e) {
   last=e;
   if(attempt===3 || /^HTTP (?:400|401|403|404|405|410|422)\b/.test(e.message)) throw e;
   await sleep(3000*2**attempt);
  } finally {clearTimeout(timer);}
 }
 throw last;
}
function classify(title, author, credit, description) {
 const text=[title,author,credit,description].join(' ');
 const map=/\b(track|path)\b/i.test(title);
 const radar=/\bradar\b/i.test(title);
 const satellite=/GOES|satellite/i.test(title);
 const self=/own work|self.made|created by|based on|using (?:nhc|noaa|wpc)|derived from/i.test(text);
 if(map) return {category:'derived_storm_track_map',reason:'Track/path map; distinguish map creator from underlying NHC/WPC data.'};
 if(radar) return {category:'radar_image',reason:'Radar image; original radar provider and timestamp need confirmation.'};
 if(satellite) return {category:'satellite_image',reason:'Satellite image; instrument, observation timestamp, and original archive need confirmation.'};
 return {category:'unclassified',reason:'Visual map type requires review.'};
}
function makeEntry(title,info) {
 const m=info.extmetadata||{};
 const description=field(m,'ImageDescription');
 const artist=field(m,'Artist');
 const credit=field(m,'Credit');
 const source=field(m,'Source');
 const dateOriginal=field(m,'DateTimeOriginal');
 const dateOther=field(m,'DateTime');
 const years=yearFromTitle(title);
 const kind=classify(title,artist,credit+' '+source,description);
 const flags=[];
 if(!years.includes(YEAR)) flags.push('Event year not established by filename');
 if(dateOriginal && !dateOriginal.includes(YEAR)) flags.push('Commons DateTimeOriginal differs from requested event year; field semantics must be reviewed');
 if(!/\bsandy\b/i.test(title+' '+description)) flags.push('Sandy not explicitly identified in title or description');
 if(!artist && !credit && !source) flags.push('Attribution fields are empty');
 if(!/new jersey|\bnj\b|mid.atlantic|northeast|new york/i.test(title+' '+description)) flags.push('New Jersey geographic coverage needs visual confirmation');
 return {title,commonsURL:info.descriptionurl||`https://commons.wikimedia.org/wiki/${title.replaceAll(' ','_')}`,
  imageURL:info.url||null,mime:info.mime||null,sourceSHA1:info.sha1||null,
  metadata:{description,artist,credit,source,dateOriginal,dateOther,license:field(m,'LicenseShortName')},
  classification:kind,filenameYears:years,flags,
  checks:{fileMetadataRetrieved:true,originalFileLocated:false,sourceAgencyIndependentlyConfirmed:false,
    observationTimeConfirmed:false,geographicCoverageVisuallyConfirmed:false,contentVisuallyConfirmed:false},
  status:'human_review_required',authenticated:false,acceptedForGrading:false,score:null,grade:null};
}
function html(report){
 const cards=report.candidates.map((c,i)=>{
  const sourceURL=c.commonsURL&&c.commonsURL.startsWith('https://commons.wikimedia.org/')?c.commonsURL:'#';
  const image=c.imageURL&&c.imageURL.startsWith('https://upload.wikimedia.org/')?`<img loading="lazy" src="${escapeHtml(c.imageURL)}" alt="${escapeHtml(c.title)}">`:'<p>Image URL unavailable.</p>';
  return `<section class="candidate" data-index="${i}"><h2>${i+1}. ${escapeHtml(c.title)}</h2>${image}<p><a href="${escapeHtml(sourceURL)}" target="_blank" rel="noopener">Commons source record</a></p><p><strong>Type:</strong> ${escapeHtml(c.classification?.category||'unknown')} — ${escapeHtml(c.classification?.reason||'')}</p><p><strong>Artist:</strong> ${escapeHtml(c.metadata?.artist||'Unknown')}<br><strong>Credit:</strong> ${escapeHtml(c.metadata?.credit||'Unknown')}<br><strong>Source:</strong> ${escapeHtml(c.metadata?.source||'Unknown')}<br><strong>DateTimeOriginal:</strong> ${escapeHtml(c.metadata?.dateOriginal||'Unspecified')}</p><p><strong>Flags:</strong> ${escapeHtml((c.flags||[]).join('; ')||'None from metadata screening')}</p><fieldset><legend>Human evidence review</legend><label>Visible map content <select data-key="visualContent"><option value="pending">Pending</option><option value="yes">Confirmed</option><option value="no">Rejected</option></select></label><label>Sandy event and 2012 date <select data-key="eventDate"><option value="pending">Pending</option><option value="yes">Confirmed</option><option value="no">Rejected</option></select></label><label>New Jersey geographic relevance <select data-key="geography"><option value="pending">Pending</option><option value="yes">Confirmed</option><option value="no">Rejected</option></select></label><label>Original source/creator independently verified <select data-key="originalSource"><option value="pending">Pending</option><option value="yes">Confirmed</option><option value="no">Rejected</option></select></label><label>Observation timestamp independently verified <select data-key="timestamp"><option value="pending">Pending</option><option value="yes">Confirmed</option><option value="no">Rejected</option></select></label><label>Evidence URL <input data-key="evidenceURL" type="url" placeholder="https://..." size="60"></label><label>Reviewer notes <textarea data-key="notes" rows="3"></textarea></label></fieldset></section>`;
 }).join('\n');
 const links=REFERENCES.map(x=>`<li><a href="${escapeHtml(x.url)}" target="_blank" rel="noopener">${escapeHtml(x.name)}</a> — ${escapeHtml(x.kind)}</li>`).join('');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Engine 5 v7.0 Source and Visual Review</title><style>body{font:16px Arial,sans-serif;background:#e9edf2;color:#17212c;margin:0;padding:22px}main{max-width:1050px;margin:auto}section{background:#fff;border:1px solid #c7cbd2;border-radius:8px;padding:18px;margin:20px 0}img{max-width:100%;max-height:480px;object-fit:contain}label{display:block;margin:12px 0}select,input,textarea{font:inherit;max-width:100%}button{font:bold 16px Arial;padding:12px 20px;background:#173a67;color:white;border:0;border-radius:5px;cursor:pointer}small{color:#555}fieldset{margin-top:16px;border:1px solid #bbc4cf} @media print{body{background:#fff}section{break-inside:avoid}}</style></head><body><main><h1>Weather Time Machine — Engine 5 v7.0</h1><h2>Original Source Cross-Verification and Human Visual Review</h2><p>${escapeHtml(EVENT)} · ${escapeHtml(STATE)} · ${escapeHtml(YEAR)}</p><p><strong>Important:</strong> This worksheet does not authenticate maps automatically. Reviewer decisions are not part of the machine-generated JSON and do not award grades. Compare each image against original source evidence before marking it confirmed.</p><h3>Official cross-reference resources</h3><ul>${links}</ul><button id="export" type="button">Export human review JSON</button><p><small>Exported decisions are unverified reviewer input and must be audited separately before authentication.</small></p>${cards}</main><script>
const records=${JSON.stringify(report.candidates.map(c=>({title:c.title,commonsURL:c.commonsURL})))};
document.getElementById('export').addEventListener('click',()=>{
 const results=[...document.querySelectorAll('.candidate')].map((section,i)=>{
  const decisions={};section.querySelectorAll('[data-key]').forEach(el=>decisions[el.dataset.key]=el.value);
  return {...records[i],decisions,reviewStatus:'human_input_unverified',authenticated:false,grade:null};
 });
 const payload={engine:5,version:'7.0',kind:'human_review_input',exportedAt:new Date().toISOString(),event:${JSON.stringify(EVENT)},state:${JSON.stringify(STATE)},year:${JSON.stringify(YEAR)},finalGrade:false,results};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='engine5-v70-human-review-decisions.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);
});
</script></body></html>`;
}
async function main(){
 const report={engine:5,version:'7.0',test:'Original Source Cross-Verification and Human Visual Review',event:EVENT,state:STATE,year:YEAR,startedAt:new Date().toISOString(),status:'not_evaluated',sourceReferences:REFERENCES,candidates:[],score:null,grade:null,finalGrade:false,authenticatedMaps:0};
 try {
  const url=new URL('/audit5',BASE);for(const [k,v] of Object.entries({event:EVENT,state:STATE,year:YEAR}))url.searchParams.set(k,v);
  const audit=await (await fetchRetry(url)).json();
  report.discovery={sourceVersion:audit.version||null,discoveryCompleted:audit.discoveryCompleted===true,searchCompleted:audit.searchCompleted===true};
  for(const title of TARGETS){
   try{
    const api=new URL('https://commons.wikimedia.org/w/api.php');
    for(const [k,v] of Object.entries({action:'query',format:'json',prop:'imageinfo',iiprop:'url|mime|sha1|extmetadata',titles:title}))api.searchParams.set(k,v);
    const data=await (await fetchRetry(api)).json();const page=Object.values(data.query?.pages||{})[0];
    if(!page?.imageinfo?.[0]) throw new Error('Commons imageinfo missing');
    report.candidates.push(makeEntry(title,page.imageinfo[0]));
   }catch(e){report.candidates.push({title,status:'metadata_unavailable',error:String(e.message),flags:['Metadata not retrieved'],classification:{category:'unknown'},metadata:{},authenticated:false,acceptedForGrading:false,score:null,grade:null});}
   console.log(`${report.candidates.length}/${TARGETS.length}: ${title} — ${report.candidates.at(-1).status}`);
   await sleep(2000);
  }
 }catch(e){report.error=String(e.message);process.exitCode=1;}
 report.summary={examined:report.candidates.length,metadataRetrieved:report.candidates.filter(c=>c.status==='human_review_required').length,metadataUnavailable:report.candidates.filter(c=>c.status==='metadata_unavailable').length,authenticatedMaps:0,finalGradingEnabled:false};
 report.completedAt=new Date().toISOString();fs.writeFileSync(OUT_JSON,JSON.stringify(report,null,2));fs.writeFileSync(OUT_HTML,html(report));
 console.log('Generated:',OUT_JSON,OUT_HTML);console.log('Summary:',JSON.stringify(report.summary));console.log('Final grade: NOT EVALUATED; human source verification required.');
 if(report.error)console.error(report.error);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
