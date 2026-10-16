
'use strict';
// WEATHER TIME MACHINE — ENGINE 3 — TEST #33
// Bing Video + Web source recovery and search diagnostics.
// Independent discovery test. No final A-F grade, no edits to other engines.
const fs = require('node:fs');
const { chromium } = require('playwright');

const STATE = (process.env.WEATHER_STATE || 'New Jersey').trim();
const YEAR = (process.env.WEATHER_YEAR || '2012').trim();
const EVENT = (process.env.WEATHER_EVENT || 'Hurricane Sandy').trim();
const OUT = 'reports/engine3-bing-test33.json';
const MIN_VIEWS = 1000;
if (!STATE || !/^(18|19|20)\d{2}$/.test(YEAR) || !EVENT) throw Error('State, year, and event are required');
const root = `${EVENT} ${YEAR} ${STATE}`;
const searches = [
  { kind: 'videos', q: `"${EVENT}" "${YEAR}" "${STATE}"` },
  { kind: 'videos', q: `"${EVENT}" ${YEAR} ${STATE} news footage` },
  { kind: 'web', q: `"${EVENT}" "${YEAR}" "${STATE}" video` },
  { kind: 'web', q: `"${EVENT}" ${YEAR} ${STATE} site:youtube.com/watch` },
  { kind: 'web', q: `"${EVENT}" ${YEAR} ${STATE} site:archive.org` },
  { kind: 'web', q: `"${EVENT}" ${YEAR} ${STATE} NOAA weather video` },
  { kind: 'web', q: `${root} historical television news documentary footage` }
];
const clean = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
const words = s => clean(s).toLowerCase().match(/[a-z0-9]+/g) || [];
const eventTokens = [...new Set(words(EVENT).filter(w => !['hurricane','storm','blizzard','flood','tornado','the','of','great','winter','weather'].includes(w)))];
const stateTokens = words(STATE).filter(w => w.length > 2);
const yearRx = new RegExp(`(^|\\D)${YEAR}(\\D|$)`);
function relevance(title, snippet) {
  const titleText = clean(title).toLowerCase();
  const text = `${titleText} ${clean(snippet).toLowerCase()}`;
  const tokens = eventTokens.length ? eventTokens : words(EVENT);
  const eventInTitle = tokens.some(t => new RegExp(`\\b${t}\\b`, 'i').test(titleText));
  const eventInText = tokens.some(t => new RegExp(`\\b${t}\\b`, 'i').test(text));
  const yearInText = yearRx.test(text);
  const stateInText = text.includes(STATE.toLowerCase());
  // Search query terms do not count as evidence: only result title/snippet.
  return { eventInTitle, eventInText, yearInText, stateInText,
    status: eventInTitle && yearInText && stateInText ? 'POTENTIAL_MATCH' : eventInText ? 'REVIEW' : 'UNRELATED' };
}
function viewsFrom(text) {
  const m = clean(text).match(/\b([\d,.]+)\s*([KMB])?\s*views?\b/i);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g,'')) * ({K:1e3,M:1e6,B:1e9}[String(m[2]||'').toUpperCase()] || 1);
  return Number.isFinite(value) ? Math.round(value) : null;
}
function decode(s) {
  let t = String(s || '').replace(/&amp;|&#38;/gi,'&').replace(/&quot;|&#34;/gi,'"').replace(/\\u0026/gi,'&').replace(/\\u003d/gi,'=').replace(/\\\//g,'/');
  for(let i=0;i<2;i++){ try {const d=decodeURIComponent(t); if(d===t)break; t=d;}catch{break;} }
  return t;
}
function decodeBingClick(value) {
  // Bing /ck/a?u=a1<base64url(absolute destination)> links.
  // Decode only the URL parameter; never navigate to a tracking link.
  const candidate = String(value || '');
  if (/^https?:\/\//i.test(candidate)) return candidate;
  const encoded = candidate.startsWith('a1') ? candidate.slice(2) : candidate;
  if (!/^[A-Za-z0-9_-]{12,}={0,2}$/.test(encoded)) return null;
  try {
    const decoded = Buffer.from(encoded.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8');
    return /^https?:\/\//i.test(decoded) ? decoded : null;
  } catch { return null; }
}
function directUrl(raw) {
  const t = decode(raw);
  try {
    const u = new URL(t);
    if (!['http:','https:'].includes(u.protocol)) return null;
    const host = u.hostname.toLowerCase();
    if (host === 'bing.com' || host.endsWith('.bing.com')) {
      for (const key of ['url','u','r','target','mediaurl','murl']) {
        const value = u.searchParams.get(key);
        if (value) { const dest=decodeBingClick(value) || decode(value); if (/^https?:\/\//i.test(dest)) return directUrl(dest); }
      }
      return null;
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const id = u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})/)?.[1];
      return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
    }
    if (host === 'youtu.be') {
      const id=u.pathname.slice(1).split('/')[0];
      return /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
    }
    if (host.endsWith('.microsoft.com') || host==='microsoft.com' || host.endsWith('.mm.bing.net') || host==='r.bing.com') return null;
    if (/\.(?:css|js|png|jpg|jpeg|gif|webp|svg)(?:$|\?)/i.test(u.pathname)) return null;
    for(const k of [...u.searchParams.keys()]) if(k.startsWith('utm_'))u.searchParams.delete(k);
    return u.href;
  } catch {return null;}
}
function urlsIn(raw) {
  const t=decode(raw), out=[];
  const urlRx=/https?:\/\/[^\s"'<>\\]+/gi;
  for(const m of t.matchAll(urlRx)) {const url=directUrl(m[0].replace(/[),;]+$/,'')); if(url)out.push(url);}
  return out;
}
function resolveCard(card,kind) {
  const found=[];
  const push=(raw,where)=>{
    const direct=directUrl(raw);
    if(direct)found.push({url:direct,where});
    for(const url of urlsIn(raw))found.push({url,where:`${where}:embedded`});
  };
  for(const a of card.anchors) push(a.href,'anchor');
  for(const a of card.attributes) push(a.value,`attribute:${a.name}`);
  const unique=[...new Map(found.map(x=>[x.url,x])).values()];
  const youtube=unique.filter(x=>x.url.startsWith('https://www.youtube.com/watch?v='));
  const primary = kind==='web' ? unique.find(x=>x.where==='anchor' && x.url) : null;
  const selected=primary || (youtube.length===1 ? youtube[0] : unique.length===1 ? unique[0] : null);
  return {url:selected?.url||null,identity:selected?.where||'UNRESOLVED',possibleUrls:unique.slice(0,8)};
}
async function extract(page,kind) {
  return page.evaluate(kind=>{
    const selectors=kind==='videos'?['.mc_vtvc.b_canvas','.mc_vtvc','.mc_vtvc_card','.b_vList > li']:['li.b_algo','.b_algo'];
    let nodes=[];
    for(const selector of selectors){nodes=[...document.querySelectorAll(selector)];if(nodes.length)break;}
    return nodes.slice(0,40).map(node=>{
      const titleNode=node.querySelector(kind==='web'?'h2 a, h2':'.mc_vtvc_title, a[title], [class*="title"]');
      const title=(titleNode?.getAttribute('title')||titleNode?.textContent||node.getAttribute('aria-label')||'').trim().slice(0,300);
      const snippet=(node.innerText||'').trim().slice(0,1200);
      const anchors=[...node.querySelectorAll('a[href]')].slice(0,25).map(a=>({href:a.href,text:(a.innerText||'').slice(0,80)}));
      const attributes=[];
      for(const el of [node,...[...node.querySelectorAll('[mmeta],[data-mmeta],[ourl],[vrhdata],[data-url],[href]')].slice(0,35)]){
        for(const a of [...el.attributes]) if(/href|url|mmeta|vrhdata|ourl|data-/i.test(a.name)) attributes.push({name:a.name,value:a.value.slice(0,7000)});
      }
      return {title,snippet,anchors,attributes};
    });
  },kind);
}
async function main(){
  const browser=await chromium.launch({headless:true});
  const runs=[], records=[];
  try {
    const page=await browser.newPage({locale:'en-US',viewport:{width:1440,height:900}});
    for(const search of searches){
      const endpoint=search.kind==='videos'?'videos/search':'search';
      const requestedUrl=`https://www.bing.com/${endpoint}?q=${encodeURIComponent(search.q)}`;
      try{
        const response=await page.goto(requestedUrl,{waitUntil:'domcontentloaded',timeout:45000});
        await page.waitForTimeout(2200);
        const actualUrl=page.url(), status=response?.status()??null;
        const body=(await page.locator('body').innerText().catch(()=>'' )).slice(0,3000);
        const blocked=/verify you are human|unusual traffic|captcha|access denied/i.test(body);
        const cards=await extract(page,search.kind);
        const run={kind:search.kind,query:search.q,httpStatus:status,actualUrl,cards:cards.length,blocked,sourceLinks:0,potentialMatches:0,
          sampleCards:cards.slice(0,3).map(c=>({title:clean(c.title),anchorSamples:c.anchors.slice(0,4),attributeSamples:c.attributes.slice(0,5).map(a=>({name:a.name,value:a.value.slice(0,350)}))}))};
        for(const card of cards){
          const link=resolveCard(card,search.kind);
          const rel=relevance(card.title,card.snippet);
          const reportedViews=viewsFrom(card.snippet);
          const reasons=[];
          if(!link.url)reasons.push('SOURCE_LINK_UNRESOLVED');
          if(rel.status==='UNRELATED')reasons.push('EVENT_UNRELATED');
          if(rel.status==='REVIEW')reasons.push('EVENT_NEEDS_REVIEW');
          if(reportedViews===null)reasons.push('VIEW_COUNT_UNVERIFIED');
          else if(reportedViews<MIN_VIEWS)reasons.push('BELOW_1000_REPORTED_VIEWS');
          if(link.url)run.sourceLinks++;
          if(rel.status==='POTENTIAL_MATCH')run.potentialMatches++;
          records.push({kind:search.kind,query:search.q,title:clean(card.title),snippet:clean(card.snippet).slice(0,550),
            url:link.url,identity:link.identity,possibleUrls:link.possibleUrls,relevance:rel,reportedViews,
            provisional:!!link.url && rel.status==='POTENTIAL_MATCH',viewsQualifiedProvisional:!!link.url && rel.status==='POTENTIAL_MATCH' && reportedViews!==null && reportedViews>=MIN_VIEWS,
            independentlyVerified:false,reasons});
        }
        run.status=blocked?'BLOCKED':status!==200?'HTTP_ERROR':cards.length===0?'NO_CARDS':run.sourceLinks===0?'NO_SOURCE_LINKS':run.potentialMatches===0?'NO_EVENT_MATCHES':'PROVISIONAL_DISCOVERY';
        runs.push(run);
        console.log(`${search.kind}: ${run.status}; cards=${run.cards}; links=${run.sourceLinks}; matches=${run.potentialMatches}`);
      }catch(error){runs.push({kind:search.kind,query:search.q,status:'FAILED',error:clean(error.message)});}
    }
  }finally{await browser.close();}
  const unique=new Map();
  for(const r of records)if(r.url && !unique.has(r.url))unique.set(r.url,r);
  const relevant=[...unique.values()].filter(r=>r.relevance.status==='POTENTIAL_MATCH');
  const complete=runs.every(r=>!['BLOCKED','HTTP_ERROR','FAILED','NO_CARDS','NO_SOURCE_LINKS'].includes(r.status));
  const report={engine:3,test:33,state:STATE,year:YEAR,event:EVENT,generatedAt:new Date().toISOString(),
    status:complete?'PROVISIONAL_DISCOVERY_COMPLETED':'NOT_EVALUATED',grade:'Not Evaluated',score:null,
    method:'Bing Videos + Bing Web Search via Playwright; source metadata extraction',
    minimumViews:MIN_VIEWS,notes:['Search page success is not evidence of event relevance.',
      'Bing-reported views are not independently verified.', 'All links and event matches require verification; encoded Bing redirect destinations are decoded without visiting source pages.',
      'Seven-category grading remains unchanged; no zeros assigned for incomplete searches.'],
    summary:{searchesRequested:searches.length,searchesWithCards:runs.filter(r=>r.cards>0).length,
      observations:records.length,linkedObservations:records.filter(r=>r.url).length,uniqueLinks:unique.size,
      potentialMatches:relevant.length,provisional1000ViewMatches:relevant.filter(r=>r.viewsQualifiedProvisional).length},
    searches:runs,candidates:relevant.slice(0,100),rejected:[...unique.values()].filter(r=>r.relevance.status==='UNRELATED').slice(0,100),needsReview:[...unique.values()].filter(r=>r.relevance.status==='REVIEW').slice(0,100),allLinked:[...unique.values()].slice(0,100),
    unresolved:records.filter(r=>!r.url).slice(0,50)};
  fs.mkdirSync('reports',{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,summary:report.summary,report:OUT},null,2));
  // Exit successfully so the report can be inspected even when discovery is incomplete.
}
main().catch(error=>{console.error('TEST #33 ERROR:',error);process.exitCode=1;});
