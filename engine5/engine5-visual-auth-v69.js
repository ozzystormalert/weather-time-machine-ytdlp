
'use strict';
/** Weather Time Machine — Engine 5 v6.9, independent visual-review evidence test.
 * Node 22; no dependencies. Does NOT perform machine vision or assert authenticity.
 * Leaves production v6.5, Blogger and Engines 1–4 unchanged.
 */
const fs = require('node:fs');
const crypto = require('node:crypto');
const BASE = process.env.ENGINE5_URL || 'https://weather-time-machine-engine5.onrender.com';
const EVENT = process.env.EVENT || 'Superstorm Sandy';
const STATE = process.env.STATE || 'New Jersey';
const YEAR = String(process.env.YEAR || '2012');
const JSON_OUT = 'engine5-v69-visual-results.json';
const HTML_OUT = 'engine5-v69-visual-review.html';
const wait = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain = s => String(s ?? '').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();
const meta = (obj, key) => plain(obj?.[key]?.value ?? obj?.[key] ?? '');
const titles = [
 'File:Sandy Radar 20121029 2318 UTC.gif',
 'File:Sandy 2012 track.png',
 'File:Sandy 2012 full track.png',
 'File:Sandy Radar 20121029 1818 UTC.gif',
 'File:Sandy 2012-10-25 GOES-13.jpg',
 'File:Sandy 2012 path.png'
];
function commonsTitle(v) {return 'File:' + String(v).replace(/^File:/i,'').replace(/_/g,' ').trim();}
function candidateTitle(c) {
 if (c.title) return commonsTitle(c.title);
 const m = String(c.sourceURL || '').match(/\/wiki\/File:([^?#]+)/);
 if (!m) return null;
 try {return commonsTitle(decodeURIComponent(m[1]));} catch {return commonsTitle(m[1]);}
}
function yearTokens(s) {
 // Exclude 4-digit UTC clock values and avoid treating upload dates as event dates.
 return [...new Set((String(s).replace(/\b(?:[01]\d|2[0-3])[0-5]\s*UTC\b/gi,' UTC').match(/\b(?:18|19|20)\d{2}\b/g) || []))];
}
async function get(url, accept='application/json') {
 let err;
 for(let i=0;i<4;i++) {
  const ac=new AbortController(), timer=setTimeout(()=>ac.abort(),30000);
  try {
   const r=await fetch(url,{signal:ac.signal,headers:{'User-Agent':'WeatherTimeMachineEngine5-v69/1.0 (historical map research)','Accept':accept}});
   if(r.ok) return r;
   err=new Error(`HTTP ${r.status}`);
   if(![429,500,502,503,504].includes(r.status) || i===3) throw err;
   const h=r.headers.get('retry-after'); const n=Number(h);
   const retry=Number.isFinite(n)&&h!==null ? n*1000 : Math.max(0,Date.parse(h)-Date.now())||0;
   await r.body?.cancel();
   await wait(Math.min(90000,Math.max(retry,4000*2**i)));
  } catch(e) {err=e;if(i===3 || (/^HTTP (?!429|500|502|503|504)/.test(e.message))) throw e;await wait(3000*2**i);}
  finally {clearTimeout(timer);}
 }
 throw err;
}
function formatCard(c) {
 const u=c.imageURL && /^https:\/\/upload\.wikimedia\.org\//.test(c.imageURL) ? c.imageURL : null;
 const link=c.sourceURL && /^https:\/\/commons\.wikimedia\.org\//.test(c.sourceURL) ? c.sourceURL : null;
 const image=u?`<img loading="lazy" src="${esc(u)}" alt="${esc(c.title)}" />`:'<p>Image unavailable — open source page.</p>';
 return `<article><h2>${esc(c.title)}</h2>${image}<p><a href="${esc(link||'#')}" target="_blank" rel="noopener">Commons source page</a></p><p><strong>Metadata source:</strong> ${esc(c.sourceAttribution||'Not established')}</p><p><strong>Observation date evidence:</strong> ${esc(c.observationDate||'Not established')}</p><p><strong>Download:</strong> ${esc(c.download.status)}; <strong>File type:</strong> ${esc(c.download.type||'Unknown')}</p><p><strong>Flags:</strong> ${esc(c.flags.join('; ')||'No automated conflict detected')}</p><fieldset><legend>Human review — mark only after examining the image and independent source</legend><label><input type="checkbox"> Weather map/radar/track is visibly confirmed</label><label><input type="checkbox"> Sandy 2012 and relevant geography are visibly confirmed</label><label><input type="checkbox"> Original agency record independently corroborates source and observation time</label></fieldset><p><strong>Automated decision: NOT EVALUATED</strong></p></article>`;
}
function html(report) {return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Engine 5 v6.9 — Visual Review</title><style>body{font:16px Arial,sans-serif;background:#eef1f5;color:#17212c;margin:0;padding:24px}main{max-width:1100px;margin:auto}article{background:white;padding:20px;margin:20px 0;border:1px solid #c5cdd6;border-radius:8px;break-inside:avoid}img{max-width:100%;max-height:460px;object-fit:contain;background:#eee}label{display:block;margin:10px 0}a{color:#0758ad}small{color:#555}fieldset{border:1px solid #bbb}@media print{body{background:white;padding:0}article{border:1px solid #888}a{color:black}}</style></head><body><main><h1>Weather Time Machine — Engine 5 v6.9</h1><h2>Visual evidence review: ${esc(EVENT)} · ${esc(STATE)} · ${esc(YEAR)}</h2><p>This is a manual review worksheet, not automatic visual authentication. Checkboxes are local and are NOT recorded in the JSON report. External images require internet access. Never award a grade based solely on this worksheet.</p><small>Generated ${esc(report.completedAt)}</small>${report.candidates.map(formatCard).join('\n')}</main></body></html>`;}
async function main(){
 const report={engine:5,version:'6.9',test:'Visual Evidence and Source Authentication Review',event:EVENT,state:STATE,year:YEAR,startedAt:new Date().toISOString(),status:'not_evaluated',candidates:[],summary:{},score:null,grade:null,finalGrade:false,authenticatedMaps:0,visualVerification:false,provenanceVerification:false};
 try {
  const url=new URL('/audit5',BASE);for(const [k,v] of Object.entries({event:EVENT,state:STATE,year:YEAR}))url.searchParams.set(k,v);
  const audit=await (await get(url)).json();
  if(!Array.isArray(audit.candidates))throw new Error('Live /audit5 response lacks candidates');
  report.discovery={sourceVersion:audit.version||null,discoveryCompleted:audit.discoveryCompleted===true,searchCompleted:audit.searchCompleted===true};
  // Only the six eligible Sandy images; exclude the unrelated Alex 2022 file.
  const found=audit.candidates.filter(c=>titles.some(t=>t.toLowerCase()===candidateTitle(c)?.toLowerCase()));
  for(const title of titles){
   const source=found.find(c=>candidateTitle(c)?.toLowerCase()===title.toLowerCase());
   const c={title,sourceURL:source?.sourceURL||'https://commons.wikimedia.org/wiki/'+title.replace(/ /g,'_'),imageURL:null,sourceAttribution:null,observationDate:null,flags:[],download:{status:'not_attempted'},visualVerified:false,provenanceVerified:false,authenticated:false,acceptedForGrading:false,score:null,grade:null,status:'manual_visual_review_required'};
   try {
    const api=new URL('https://commons.wikimedia.org/w/api.php');for(const [k,v] of Object.entries({action:'query',format:'json',prop:'imageinfo',iiprop:'url|mime|size|sha1|extmetadata',titles:title}))api.searchParams.set(k,v);
    const data=await (await get(api)).json();const page=Object.values(data.query?.pages||{})[0];const info=page?.imageinfo?.[0];if(!info)throw new Error('Commons metadata unavailable');
    c.sourceURL=info.descriptionurl||c.sourceURL;c.imageURL=info.url||null;c.sourceAttribution=meta(info.extmetadata,'Credit')||meta(info.extmetadata,'Artist')||meta(info.extmetadata,'Source')||null;c.observationDate=meta(info.extmetadata,'DateTimeOriginal')||null;
    c.description=meta(info.extmetadata,'ImageDescription');c.mime=info.mime||null;c.sourceSha1=info.sha1||null;
    const titleYears=yearTokens(title);if(!titleYears.includes(YEAR))c.flags.push('Requested year not explicit in title');
    if(c.observationDate && !yearTokens(c.observationDate).includes(YEAR))c.flags.push('Observation-date field does not confirm '+YEAR+'; may be creation/upload date');
    if(!/\bsandy\b/i.test(title+' '+c.description))c.flags.push('Event name absent from title and description');
    if(!/radar|track|path|goes|satellite/i.test(title+' '+c.description))c.flags.push('Map type not established by title or description');
    if(!c.sourceAttribution)c.flags.push('Original source attribution absent');
    if(!c.imageURL)throw new Error('Image URL absent');
    // Download the image and inspect signatures; this is NOT image understanding.
    const r=await get(c.imageURL,'image/*');const buf=Buffer.from(await r.arrayBuffer());if(buf.length>16*1024*1024)throw new Error('Image exceeds 16 MB');
    let type=null;if(buf.subarray(0,3).toString()==='GIF')type='gif';else if(buf.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))type='png';else if(buf[0]===255&&buf[1]===216&&buf[2]===255)type='jpeg';else if(buf.subarray(0,4).toString()==='RIFF'&&buf.subarray(8,12).toString()==='WEBP')type='webp';
    c.download={status:type?'valid_image_signature':'unrecognized_signature',type,bytes:buf.length,sha256:crypto.createHash('sha256').update(buf).digest('hex')};
    if(!type)c.flags.push('Image file signature not recognized');
   }catch(e){c.flags.push(String(e.message));c.download={status:'unavailable',error:String(e.message)};c.status='review_blocked';}
   report.candidates.push(c);console.log(`${report.candidates.length}/6 ${c.title}: ${c.download.status}`);await wait(2000);
  }
 }catch(e){report.error=String(e.message);process.exitCode=1;}
 report.summary={examined:report.candidates.length,validImageFiles:report.candidates.filter(c=>c.download.status==='valid_image_signature').length,reviewBlocked:report.candidates.filter(c=>c.status==='review_blocked').length,manualVisualReviewRequired:report.candidates.filter(c=>c.status==='manual_visual_review_required').length,authenticatedMaps:0,finalGradingEnabled:false};
 report.completedAt=new Date().toISOString();fs.writeFileSync(JSON_OUT,JSON.stringify(report,null,2));fs.writeFileSync(HTML_OUT,html(report));console.log(`Reports: ${JSON_OUT}, ${HTML_OUT}`);console.log(JSON.stringify(report.summary));console.log('Final grade: NOT EVALUATED — independent human visual and original-source authentication still required');if(report.error)console.error(report.error);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
