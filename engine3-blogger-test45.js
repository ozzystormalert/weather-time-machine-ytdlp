
'use strict';
// Weather Time Machine — Engine 3 — Test 45
// Final acceptance gate: metadata, safe HTML, and optional master Blogger regression.
// Node 22; no dependencies. Never authenticates footage automatically.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const INPUT='reports/engine3-test43-blogger-preview.json';
const COMPONENT='reports/engine3-test44-blogger-component.html';
const MASTER=process.env.WTM_MASTER_HTML || 'weather-time-machine-master.html';
const OUT='reports/engine3-test45-acceptance.json';
const PAGE='reports/engine3-test45-integration-preview.html';
const SUMMARY='reports/engine3-test45-summary.md';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const results=[];
function check(name,fn){try{fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',detail:e.message});}}
function skip(name,reason){results.push({name,status:'NOT_TESTED',detail:reason});}
function read(p){return fs.readFileSync(p,'utf8');}
function component(d){
 const cards=d.videos.map(v=>`<article class="wtm-e3-card"><h4>${esc(v.title)}</h4><p>Channel: ${esc(v.channel)} · ${v.views.toLocaleString('en-US')} views</p><p class="wtm-e3-pending">Pending Independent Authentication</p><a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">Watch original YouTube video ↗</a></article>`).join('\n');
 return `<!-- WTM ENGINE 3 TEST 45 START -->\n<section id="wtm-engine3-test45" aria-labelledby="wtm-e3-title"><style>\n#wtm-engine3-test45{font-family:Arial,sans-serif;color:#1b2734;background:#f5f7fa;border:2px solid #34495e;border-radius:10px;padding:20px;margin:18px 0}#wtm-engine3-test45 *{box-sizing:border-box}#wtm-engine3-test45 h3{margin:0 0 8px;font-size:24px}#wtm-engine3-test45 .wtm-e3-note{font-size:14px;line-height:1.5;margin:0 0 16px}#wtm-engine3-test45 .wtm-e3-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}#wtm-engine3-test45 .wtm-e3-card{border:1px solid #cbd5e1;border-radius:8px;background:white;padding:14px;min-width:0}#wtm-engine3-test45 .wtm-e3-card h4{font-size:17px;margin:0 0 8px;overflow-wrap:anywhere}#wtm-engine3-test45 .wtm-e3-card p{font-size:13px;margin:5px 0}#wtm-engine3-test45 .wtm-e3-pending{font-weight:bold;color:#755900}#wtm-engine3-test45 a{font-size:14px;color:#145da0;text-decoration:underline;overflow-wrap:anywhere}@media print{#wtm-engine3-test45 .wtm-e3-card{break-inside:avoid}}\n</style><h3 id="wtm-e3-title">Engine 3 — Historical Weather Videos</h3><p class="wtm-e3-note"><strong>${esc(d.event)} · ${esc(d.state)} · ${esc(d.year)}</strong> — ${d.videos.length} metadata-eligible videos. <strong>Historical authenticity: Not Evaluated.</strong> No video has been independently authenticated. View counts are a dated API snapshot, not live counts.</p><div class="wtm-e3-grid">${cards}</div></section>\n<!-- WTM ENGINE 3 TEST 45 END -->`;
}
function main(){
 fs.mkdirSync('reports',{recursive:true});
 let d=null, html=null;
 if(!fs.existsSync(INPUT)){
  check('Test 43 Blogger export exists',()=>assert.fail(`Missing ${INPUT}`));
 }else{
  check('Test 43 Blogger export parses',()=>{d=JSON.parse(read(INPUT));});
 }
 if(d){
  check('Schema and event identity',()=>{assert.equal(d.schemaVersion,1);assert.equal(d.engine,3);assert.equal(d.event,'Hurricane Sandy');assert.equal(d.state,'New Jersey');assert.equal(d.year,2012);});
  check('No unsupported historical grade',()=>assert.equal(d.grade,'Not Evaluated'));
  check('Exactly 20 candidate videos',()=>assert.equal(d.videos.length,20));
  check('All video IDs unique and valid',()=>{const ids=d.videos.map(v=>v.id);assert.equal(new Set(ids).size,ids.length);ids.forEach(id=>assert.match(id,/^[A-Za-z0-9_-]{11}$/));});
  check('Original HTTPS YouTube URLs',()=>d.videos.forEach(v=>assert.equal(v.url,`https://www.youtube.com/watch?v=${v.id}`)));
  check('Official API snapshot threshold at least 1000',()=>d.videos.forEach(v=>assert.ok(Number.isSafeInteger(v.views)&&v.views>=1000)));
  check('No false authentication labels',()=>d.videos.forEach(v=>assert.equal(v.verificationStatus,'Pending Independent Authentication')));
  check('Required title and channel fields',()=>d.videos.forEach(v=>{assert.ok(typeof v.title==='string'&&v.title.trim());assert.ok(typeof v.channel==='string'&&v.channel.trim());}));
  html=component(d);
  check('Rendered links use safe external-link attributes',()=>{assert.equal((html.match(/rel="noopener noreferrer"/g)||[]).length,d.videos.length);});
  check('All video cards rendered',()=>assert.equal((html.match(/class="wtm-e3-card"/g)||[]).length,d.videos.length));
  check('Rendered output escapes HTML metacharacters',()=>{const hostile=structuredClone(d);hostile.videos[0].title='<img src=x onerror=alert(1)>';const test=component(hostile);assert.ok(test.includes('&lt;img'));assert.ok(!test.includes('<img src=x'));});
  check('No API credentials in output',()=>{assert.ok(!html.includes('YOUTUBE_API_KEY'));assert.ok(!html.includes('AIza'));});
 }else skip('Video and component checks','Missing or invalid input');
 if(!fs.existsSync(COMPONENT))skip('Test 44 component comparison','Test 44 component not committed; Test 45 builds its own equivalent component');
 else check('Test 44 output exists and has video cards',()=>{const prev=read(COMPONENT);assert.ok(prev.includes('wtm-e3-card'));assert.ok(prev.includes('Not Evaluated'));});
 let master=null;
 if(!fs.existsSync(MASTER))skip('Master Blogger HTML integration regression',`Missing ${MASTER}. Supply approved Blogger HTML before final acceptance.`);
 else {
  master=read(MASTER);
  check('Master HTML has existing page content',()=>assert.ok(master.length>1000));
  check('Master HTML not already injected with Test 45',()=>assert.ok(!master.includes('id="wtm-engine3-test45"')));
  // Do not infer Engine 1/2 health from keyword checks; manual functional testing is mandatory.
  skip('Engine 1 and Engine 2 functional preservation','Requires browser verification of the original working controls and seven grading cards');
 }
 let merged=false;
 if(html){
  const page=master && !results.some(r=>r.status==='FAIL'&&r.name.startsWith('Master HTML'))
    ? master.replace(/<\/body\s*>/i,html+'\n</body>')
    : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Engine 3 Test 45 Standalone Preview</title></head><body>${html}</body></html>`;
  merged=!!master && /<\/body\s*>/i.test(master) && page.includes('id="wtm-engine3-test45"');
  fs.writeFileSync(PAGE,page+'\n');
 }
 if(master && !merged)check('Master HTML contains closing body for insertion',()=>assert.fail('Cannot safely inject component into master HTML'));
 const failures=results.filter(x=>x.status==='FAIL');
 const pending=results.filter(x=>x.status==='NOT_TESTED');
 const status=failures.length?'FAILED':pending.length?'PROVISIONAL_PENDING_FINAL_INTEGRATION':'PROVISIONAL_REQUIRES_BROWSER_REVIEW';
 const report={engine:3,test:45,generatedAt:new Date().toISOString(),status,grade:'Not Evaluated',independentlyAuthenticated:0,masterProvided:!!master,masterMerged:merged,videoCount:d?.videos?.length||0,checks:{passed:results.filter(x=>x.status==='PASS').length,failed:failures.length,notTested:pending.length},results,manualAcceptanceRequired:['Confirm Engine 1 Wikipedia searches and links still work','Confirm Engine 2 Wikimedia Commons searches and images still work','Confirm all seven grading cards and Step 4 research links are unchanged','Verify Engine 3 cards and YouTube links in Blogger desktop/mobile','Confirm Blogger save/publish succeeds and no console errors','Do not claim footage authenticated without independent visual audit']};
 fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(SUMMARY,['# Weather Time Machine — Test 45',`Status: ${status}`,`Passed: ${report.checks.passed}; Failed: ${report.checks.failed}; Not tested: ${report.checks.notTested}`,'','Historical authenticity: Not Evaluated.','',...results.map(r=>`- ${r.status}: ${r.name}${r.detail?' — '+r.detail:''}`),'','A green GitHub run is NOT final Blogger acceptance. Manual functional testing is required.'].join('\n')+'\n');
 console.log(JSON.stringify({status,checks:report.checks,masterMerged:merged,outputs:[OUT,PAGE,SUMMARY]},null,2));
 if(failures.length)process.exitCode=1;
}
main();
