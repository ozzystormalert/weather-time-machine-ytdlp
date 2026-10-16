
'use strict';
// Weather Time Machine — Engine 3 / Test 44
// Builds a Blogger-safe video component from Test 43's verified metadata export.
// No YouTube API key is used in the browser. No footage is auto-authenticated.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const INPUT = process.env.ENGINE3_INPUT || 'reports/engine3-test43-blogger-preview.json';
const OUTPUT = 'reports/engine3-test44-blogger-component.html';
const REPORT = 'reports/engine3-test44-report.json';
const PREVIEW = 'reports/engine3-test44-preview.html';
const ESCAPE = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const YOUTUBE = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/;
function validate(data) {
  assert.equal(data.schemaVersion,1,'Unsupported export schema');
  assert.equal(data.engine,3,'Expected Engine 3');
  assert.equal(data.grade,'Not Evaluated','Do not claim authentication');
  assert.ok(Array.isArray(data.videos),'Expected videos array');
  assert.ok(data.videos.length>0,'No videos to export');
  const seen = new Set();
  return data.videos.map((v,i)=>{
    assert.ok(typeof v.id==='string' && /^[A-Za-z0-9_-]{11}$/.test(v.id),`Bad ID at ${i}`);
    assert.equal(v.url,`https://www.youtube.com/watch?v=${v.id}`,`URL mismatch at ${i}`);
    assert.match(v.url,YOUTUBE);
    assert.ok(!seen.has(v.id),`Duplicate ID ${v.id}`); seen.add(v.id);
    assert.ok(typeof v.title==='string' && v.title.trim(),`Missing title at ${i}`);
    assert.ok(typeof v.channel==='string' && v.channel.trim(),`Missing channel at ${i}`);
    assert.ok(Number.isSafeInteger(v.views) && v.views>=1000,`Unverified view threshold at ${i}`);
    assert.equal(v.verificationStatus,'Pending Independent Authentication',`Unsafe verification label at ${i}`);
    return {id:v.id,url:v.url,title:v.title,channel:v.channel,views:v.views};
  });
}
function component(data,videos) {
  const cards = videos.map(v=>`<article class="wtm-e3-card"><h4>${ESCAPE(v.title)}</h4><p>Channel: ${ESCAPE(v.channel)} · ${v.views.toLocaleString('en-US')} views</p><p class="wtm-e3-pending">Pending Independent Authentication</p><a href="${ESCAPE(v.url)}" target="_blank" rel="noopener noreferrer">Watch original YouTube video ↗</a></article>`).join('\n');
  return `<!-- WTM ENGINE 3 TEST 44 START — standalone insert; Engines 1 and 2 unchanged -->
<section id="wtm-engine3-test44" aria-labelledby="wtm-e3-heading">
<style>
#wtm-engine3-test44{font-family:Arial,sans-serif;color:#1b2734;background:#f5f7fa;border:2px solid #34495e;border-radius:10px;padding:20px;margin:18px 0}
#wtm-engine3-test44 *{box-sizing:border-box}
#wtm-engine3-test44 h3{margin:0 0 8px;font-size:24px}
#wtm-engine3-test44 .wtm-e3-note{font-size:14px;line-height:1.5;margin:0 0 16px}
#wtm-engine3-test44 .wtm-e3-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
#wtm-engine3-test44 .wtm-e3-card{border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:14px;min-width:0}
#wtm-engine3-test44 .wtm-e3-card h4{font-size:17px;margin:0 0 8px;overflow-wrap:anywhere}
#wtm-engine3-test44 .wtm-e3-card p{font-size:13px;margin:5px 0}
#wtm-engine3-test44 .wtm-e3-pending{font-weight:bold;color:#755900}
#wtm-engine3-test44 a{font-size:14px;color:#145da0;text-decoration:underline;overflow-wrap:anywhere}
@media print{#wtm-engine3-test44{break-inside:avoid}#wtm-engine3-test44 .wtm-e3-card{break-inside:avoid}}
</style>
<h3 id="wtm-e3-heading">Engine 3 — Historical Weather Videos</h3>
<p class="wtm-e3-note"><strong>${ESCAPE(data.event)} · ${ESCAPE(data.state)} · ${ESCAPE(data.year)}</strong> — ${videos.length} metadata-eligible YouTube videos. <strong>Historical authenticity: Not Evaluated.</strong> These videos have not been independently authenticated. View counts reflect the Test 43 API snapshot, not live counts.</p>
<div class="wtm-e3-grid">${cards}</div>
</section>
<!-- WTM ENGINE 3 TEST 44 END -->`;
}
function test() {
  const fixture={schemaVersion:1,engine:3,grade:'Not Evaluated',videos:[{id:'imPLZeKCpxg',url:'https://www.youtube.com/watch?v=imPLZeKCpxg',title:'<sample>',channel:'Example',views:1000,verificationStatus:'Pending Independent Authentication'}]};
  const tests=[];
  const run=(name,fn)=>{fn();tests.push({name,passed:true});};
  run('Valid metadata accepted',()=>assert.equal(validate(fixture).length,1));
  run('Video titles are HTML-escaped',()=>assert.ok(component({event:'Sandy',state:'NJ',year:2012},validate(fixture)).includes('&lt;sample&gt;')));
  run('Subthreshold views rejected',()=>assert.throws(()=>validate({...fixture,videos:[{...fixture.videos[0],views:999}]})));
  run('Unsafe URL rejected',()=>assert.throws(()=>validate({...fixture,videos:[{...fixture.videos[0],url:'javascript:alert(1)'}]})));
  run('False authentication rejected',()=>assert.throws(()=>validate({...fixture,grade:'A+'})));
  run('Misleading video status rejected',()=>assert.throws(()=>validate({...fixture,videos:[{...fixture.videos[0],verificationStatus:'Authenticated'}]})));
  run('Duplicate IDs rejected',()=>assert.throws(()=>validate({...fixture,videos:[fixture.videos[0],fixture.videos[0]]})));
  run('Original video URL retained',()=>assert.ok(component({event:'Sandy',state:'NJ',year:2012},validate(fixture)).includes('https://www.youtube.com/watch?v=imPLZeKCpxg')));
  return tests;
}
function main() {
  const tests=test();
  if(!fs.existsSync(INPUT)) throw new Error(`Missing ${INPUT}. Upload the Test 43 blogger preview JSON to that repository path before running Test 44.`);
  const raw=fs.readFileSync(INPUT,'utf8');
  const data=JSON.parse(raw);
  const videos=validate(data);
  const html=component(data,videos);
  const preview=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Weather Time Machine Engine 3 — Test 44 Preview</title></head><body><main>${html}</main></body></html>`;
  assert.ok(!html.includes('YOUTUBE_API_KEY')&&!html.includes('AIza'),'No API credentials permitted');
  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,html+'\n');
  fs.writeFileSync(PREVIEW,preview+'\n');
  const report={engine:3,test:44,status:'COMPONENT_BUILT_NOT_YET_MERGED_INTO_EXISTING_BLOGGER_HTML',generatedAt:new Date().toISOString(),source:INPUT,videosExported:videos.length,tests,grade:'Not Evaluated',independentlyAuthenticated:0,outputs:[OUTPUT,PREVIEW],nextStep:'Merge into latest approved Blogger HTML and test Engines 1, 2 and 3 together.'};
  fs.writeFileSync(REPORT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
try{main();}catch(e){console.error('TEST 44 FAILED:',e.message);process.exitCode=1;}
