
'use strict';
/** Weather Time Machine — Engine 3, Test 34.
 * Bing Videos/Web discovery + strict metadata relevance + YouTube Data API verification.
 * Discovery does NOT equal verification. This script never assigns an A–F grade.
 */
const fs = require('node:fs');
const { chromium } = require('playwright');
const STATE = String(process.env.WEATHER_STATE || 'New Jersey').trim();
const YEAR = String(process.env.WEATHER_YEAR || '2012').trim();
const EVENT = String(process.env.WEATHER_EVENT || 'Hurricane Sandy').trim();
const API_KEY = String(process.env.YOUTUBE_API_KEY || '').trim();
const OUT = 'reports/engine3-bing-test34.json';
const MIN_VIEWS = 1000;
if (!STATE || !/^(18|19|20)\d{2}$/.test(YEAR) || !EVENT) throw Error('Invalid state, year or event');
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const tokens = s => norm(s).split(' ').filter(Boolean);
const stop = new Set(['the','and','of','in','on','at','for','a','an']);
const eventTokens = tokens(EVENT).filter(x=>!stop.has(x));
const eventDistinctive = eventTokens.filter(x=>!['hurricane','storm','tropical','winter','flood','tornado','blizzard','weather','severe'].includes(x));
const unique = a => [...new Set(a)];
const stateAliases = STATE.toLowerCase()==='new jersey' ? ['new jersey','nj','jersey shore','jersey'] : [norm(STATE)];
const safe = s => String(s || '').replace(/\s+/g,' ').trim().slice(0,2000);
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const searches = [
 {kind:'videos',q:`"${EVENT}" "${YEAR}" "${STATE}" footage`},
 {kind:'videos',q:`"${EVENT}" ${YEAR} ${STATE} aftermath news video`},
 {kind:'videos',q:`${EVENT} ${YEAR} ${STATE} storm surge documentary`},
 {kind:'web',q:`"${EVENT}" "${YEAR}" "${STATE}" site:youtube.com/watch`},
 {kind:'web',q:`"${EVENT}" ${YEAR} ${STATE} news video`},
 {kind:'web',q:`"${EVENT}" ${YEAR} ${STATE} site:archive.org/details`},
 {kind:'web',q:`"${EVENT}" ${YEAR} ${STATE} historical footage`}
];
function bingDecode(raw) {
 try {
  const u = new URL(raw);
  if (!/(^|\.)bing\.com$/i.test(u.hostname)) return raw;
  for (const key of ['u','url','r','target','mediaurl','murl']) {
   let val=u.searchParams.get(key); if (!val) continue;
   if (/^a1[A-Za-z0-9_=-]+$/.test(val)) {
    try { val=Buffer.from(val.slice(2).replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'); } catch {}
   }
   if (/^https?:\/\//i.test(val)) return bingDecode(val);
  }
 } catch {}
 return null;
}
function canonical(raw) {
 if (!raw) return null;
 let v=String(raw).replace(/&amp;/g,'&').replace(/\\\//g,'/');
 if (/^https?:\/\//i.test(v)) v=bingDecode(v);
 if (!v) return null;
 try {
  const u=new URL(v);
  if (!['http:','https:'].includes(u.protocol)) return null;
  const host=u.hostname.toLowerCase();
  if (host==='youtu.be') {const id=u.pathname.split('/')[1];return /^[\w-]{11}$/.test(id)?`https://www.youtube.com/watch?v=${id}`:null;}
  if (host==='youtube.com'||host.endsWith('.youtube.com')) {
   const id=u.searchParams.get('v')||u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})/)?.[1];
   return /^[\w-]{11}$/.test(id||'')?`https://www.youtube.com/watch?v=${id}`:null;
  }
  if (host==='bing.com'||host.endsWith('.bing.com')||host==='r.bing.com'||host.endsWith('.mm.bing.net')) return null;
  if (/\.(css|js|png|jpe?g|gif|svg|webp)$/i.test(u.pathname)) return null;
  for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k))u.searchParams.delete(k);
  u.hash='';return u.toString();
 } catch{return null;}
}
function youtubeId(url) {try {const u=new URL(url);return u.hostname==='www.youtube.com'?u.searchParams.get('v'):null;}catch{return null;}}
function matchEvidence(title,description) {
 const t=norm(title), d=norm(description), all=` ${t} ${d} `;
 const phrase=norm(EVENT);
 const eventTitle=t.includes(phrase) || (eventDistinctive.length>0 && eventDistinctive.every(x=>tokens(t).includes(x)) && eventTokens.some(x=>tokens(t).includes(x)));
 const eventDescription=d.includes(phrase) || (eventDistinctive.length>0 && eventDistinctive.every(x=>tokens(d).includes(x)));
 const yearPresent=new RegExp(`(^|\\D)${YEAR}(\\D|$)`).test(`${title} ${description}`);
 const statePresent=stateAliases.some(a=>new RegExp(`(?:^|\\s)${a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:\\s|$)`).test(all));
 const conflictingEvents=unique((`${title} ${description}`).match(/\b(?:hurricane|tropical storm)\s+(?:isaias|ida|ian|irene|katrina|maria|harvey|florence|matthew|helene|milton)\b/gi)||[]).filter(x=>!norm(EVENT).includes(norm(x)));
 const eventPresent=eventTitle||eventDescription;
 const status=conflictingEvents.length?'REJECT_CONFLICTING_EVENT':!eventPresent?'REJECT_WRONG_EVENT':!yearPresent?'REVIEW_YEAR_UNCONFIRMED':!statePresent?'REVIEW_LOCATION_UNCONFIRMED':'METADATA_MATCH';
 return {status,eventInTitle:eventTitle,eventInDescription:eventDescription,yearPresent,statePresent,conflictingEvents};
}
function reportedViews(s){const m=String(s||'').match(/\b([\d,.]+)\s*([KMB])?\s*views?\b/i);if(!m)return null;const n=Number(m[1].replace(/,/g,''))*({K:1000,M:1e6,B:1e9}[String(m[2]||'').toUpperCase()]||1);return Number.isFinite(n)?Math.round(n):null;}
async function getCards(page,kind){return page.evaluate(kind=>{
 const selectors=kind==='videos'?['.mc_vtvc.b_canvas','.mc_vtvc','.mc_vtvc_card','.b_vList > li']:['li.b_algo','.b_algo'];
 let nodes=[];for(const s of selectors){nodes=[...document.querySelectorAll(s)];if(nodes.length)break;}
 return nodes.slice(0,45).map(node=>{
  const titleNode=node.querySelector(kind==='web'?'h2 a, h2':'.mc_vtvc_title, a[title], [class*="title"]');
  const title=(titleNode?.getAttribute('title')||titleNode?.textContent||node.getAttribute('aria-label')||'').trim();
  const snippet=(node.innerText||'').trim().slice(0,1300);
  const anchors=[...node.querySelectorAll('a[href]')].slice(0,20).map(a=>({href:a.href,text:(a.innerText||'').slice(0,100)}));
  const metadata=[];
  for(const el of [node,...node.querySelectorAll('[mmeta],[data-mmeta],[ourl],[data-url]')].slice(0,25))
   for(const a of [...el.attributes])if(/^(mmeta|data-mmeta|ourl|data-url|vrhdata)$/i.test(a.name))metadata.push({name:a.name,value:a.value.slice(0,6000)});
  return {title,snippet,anchors,metadata};
 });
},kind);}
function cardLinks(c,kind){
 const found=[];const push=(v,origin)=>{const u=canonical(v);if(u)found.push({url:u,origin});};
 for(const m of c.metadata){if(['mmeta','data-mmeta','vrhdata'].includes(m.name)){try{const o=JSON.parse(m.value);for(const key of ['murl','pgurl','ourl','url'])if(o[key])push(o[key],`metadata:${key}`);}catch{}}else push(m.value,`attribute:${m.name}`);}
 for(const a of c.anchors)push(a.href,'anchor');
 const distinct=[...new Map(found.map(x=>[x.url,x])).values()];
 const youtube=distinct.filter(x=>youtubeId(x.url));
 const first=kind==='web'?distinct.find(x=>x.origin==='anchor'):null;
 return {url:first?.url||youtube[0]?.url||distinct[0]?.url||null,possibleUrls:distinct.slice(0,8)};
}
async function youtubeVerify(ids) {
 const result=new Map();
 if(!API_KEY)return {status:'MISSING_YOUTUBE_API_KEY',result};
 let errors=[];
 for(let i=0;i<ids.length;i+=50){
  const chunk=ids.slice(i,i+50);
  const endpoint=new URL('https://www.googleapis.com/youtube/v3/videos');
  endpoint.searchParams.set('part','snippet,statistics,status');endpoint.searchParams.set('id',chunk.join(','));endpoint.searchParams.set('key',API_KEY);
  try{
   const res=await fetch(endpoint,{signal:AbortSignal.timeout(25000)});
   const body=await res.json();
   if(!res.ok){errors.push({httpStatus:res.status,reason:body?.error?.errors?.[0]?.reason||'API_ERROR'});continue;}
   for(const item of body.items||[]){const views=Number(item.statistics?.viewCount);result.set(item.id,{title:item.snippet?.title||'',description:item.snippet?.description||'',publishedAt:item.snippet?.publishedAt||null,channelTitle:item.snippet?.channelTitle||'',viewCount:Number.isSafeInteger(views)&&views>=0?views:null,embeddable:item.status?.embeddable??null,privacyStatus:item.status?.privacyStatus??null});}
  }catch(e){errors.push({reason:safe(e.message)});}
 }
 return {status:errors.length?'PARTIAL_API_ERROR':'API_RESPONDED',errors,result};
}
async function main(){
 const browser=await chromium.launch({headless:true});
 const runs=[],observations=[];
 try{
  const page=await browser.newPage({locale:'en-US',viewport:{width:1365,height:900}});
  for(const s of searches){
   const url=`https://www.bing.com/${s.kind==='videos'?'videos/search':'search'}?q=${encodeURIComponent(s.q)}&setlang=en-US`;
   try{
    const res=await page.goto(url,{waitUntil:'domcontentloaded',timeout:40000});await sleep(1800);
    const cards=await getCards(page,s.kind);
    const run={kind:s.kind,query:s.q,httpStatus:res?.status()??null,actualUrl:page.url(),cards:cards.length,linked:0,metadataMatches:0,topTitles:cards.slice(0,5).map(c=>safe(c.title))};
    for(const c of cards){const links=cardLinks(c,s.kind);const evidence=matchEvidence(c.title,c.snippet);if(links.url)run.linked++;if(evidence.status==='METADATA_MATCH')run.metadataMatches++;
     observations.push({kind:s.kind,query:s.q,title:safe(c.title),snippet:safe(c.snippet).slice(0,800),url:links.url,possibleUrls:links.possibleUrls,reportedViews:reportedViews(c.snippet),searchRelevance:evidence});
    }
    run.status=run.httpStatus!==200?'HTTP_ERROR':cards.length===0?'NO_CARDS':run.linked===0?'NO_SOURCE_LINKS':run.metadataMatches===0?'SEARCH_RESULTS_IRRELEVANT':'CANDIDATES_FOUND';
    runs.push(run);console.log(`${s.kind}: ${run.status}; cards=${run.cards}; links=${run.linked}; metadataMatches=${run.metadataMatches}`);
   }catch(e){runs.push({kind:s.kind,query:s.q,status:'FAILED',error:safe(e.message)});console.log(`${s.kind}: FAILED`);}
  }
 }finally{await browser.close();}
 const byUrl=new Map();for(const o of observations){if(!o.url)continue;const old=byUrl.get(o.url);if(!old || (o.searchRelevance.status==='METADATA_MATCH' && old.searchRelevance.status!=='METADATA_MATCH'))byUrl.set(o.url,o);}
 const sources=[...byUrl.values()];const ids=unique(sources.map(o=>youtubeId(o.url)).filter(Boolean));
 const verification=await youtubeVerify(ids);
 const results=sources.map(o=>{
  const id=youtubeId(o.url),meta=id?verification.result.get(id):null;
  const relevance=meta?matchEvidence(meta.title,meta.description):o.searchRelevance;
  const count=meta?.viewCount??null;
  const verified=!!meta&&relevance.status==='METADATA_MATCH'&&count!==null&&count>=MIN_VIEWS&&meta.privacyStatus==='public';
  const status=verified?'VERIFIED_METADATA_MATCH_1000_VIEWS':relevance.status.startsWith('REJECT')?'REJECTED_IRRELEVANT':!id?'EXTERNAL_SOURCE_REQUIRES_VERIFICATION':!meta?'YOUTUBE_METADATA_NOT_VERIFIED':relevance.status!=='METADATA_MATCH'?'RELEVANCE_REQUIRES_REVIEW':count===null?'VIEW_COUNT_UNAVAILABLE':count<MIN_VIEWS?'BELOW_1000_VERIFIED_VIEWS':meta.privacyStatus!=='public'?'NOT_PUBLIC':'NOT_EVALUATED';
  return {url:o.url,source:o.kind,title:meta?.title||o.title,videoId:id,searchTitle:o.title,searchRelevance:o.searchRelevance,verifiedRelevance:meta?relevance:null,reportedViews:o.reportedViews,verifiedViews:count,publishedAt:meta?.publishedAt||null,channelTitle:meta?.channelTitle||null,verificationStatus:status,metadataVerified:!!meta,qualified:verified};
 });
 const verified=results.filter(r=>r.qualified), rejected=results.filter(r=>r.verificationStatus==='REJECTED_IRRELEVANT');
 const report={engine:3,test:34,generatedAt:new Date().toISOString(),state:STATE,year:YEAR,event:EVENT,minimumViews:MIN_VIEWS,
  grade:'Not Evaluated',score:null,status:verified.length?'VERIFIED_CANDIDATES_FOUND':'NOT_EVALUATED',
  notes:['A successful GitHub workflow is not proof of relevant results.','Bing-reported view counts are never considered verified.','YouTube API metadata establishes title/description/view-count facts but cannot independently prove video footage depicts the claimed event.','Metadata matching is a candidate filter, not a final content-authenticity grade.','No changes to Blogger or other engines.'],
  summary:{searchesRequested:searches.length,searchesWithCards:runs.filter(x=>x.cards>0).length,observations:observations.length,linkedObservations:observations.filter(x=>x.url).length,uniqueLinks:byUrl.size,youtubeIds:ids.length,youtubeMetadataVerified:results.filter(x=>x.metadataVerified).length,verified1000ViewMetadataMatches:verified.length,rejectedIrrelevant:rejected.length},
  youtubeApi:{status:verification.status,errors:verification.errors||[],keyConfigured:!!API_KEY},searches:runs,
  verifiedCandidates:verified,needsReview:results.filter(x=>!x.qualified&&!x.verificationStatus.startsWith('REJECTED')).slice(0,150),rejected:rejected.slice(0,150),allSources:results.slice(0,200),unresolved:observations.filter(x=>!x.url).slice(0,30)};
 fs.mkdirSync('reports',{recursive:true});fs.writeFileSync(OUT,JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,summary:report.summary,youtubeApi:report.youtubeApi.status,report:OUT},null,2));
}
main().catch(e=>{console.error('TEST #34 ERROR:',e);process.exitCode=1;});
