
'use strict';
// Weather Time Machine — Engine 3 — Bing Video + Web Discovery Test #31
// Discovery only. No YouTube page access, no invented views, no automatic grading.
const fs = require('node:fs');
const { chromium } = require('playwright');
const STATE = (process.env.WEATHER_STATE || 'New Jersey').trim();
const YEAR = (process.env.WEATHER_YEAR || '2012').trim();
const EVENT = (process.env.WEATHER_EVENT || 'Hurricane Sandy').trim();
const MIN_VIEWS = 1000;
const OUT = 'reports/engine3-bing-test31.json';
if (!/^[A-Za-z .'-]{2,70}$/.test(STATE) || !/^(18|19|20)\d{2}$/.test(YEAR) || EVENT.length < 4 || EVENT.length > 140) {
  throw new Error('Invalid WEATHER_STATE, WEATHER_YEAR, or WEATHER_EVENT');
}
const root = `${EVENT} ${YEAR} ${STATE}`;
const searches = [
  { kind:'videos', q:`${root} historical news footage` },
  { kind:'videos', q:`${root} documentary archive video` },
  { kind:'web', q:`${root} video news footage` },
  { kind:'web', q:`${root} archival film documentary` },
  { kind:'web', q:`${root} site:youtube.com/watch` },
  { kind:'web', q:`${root} site:archive.org video` },
  { kind:'web', q:`${root} site:weather.gov OR site:noaa.gov video` },
];
const clean = s => String(s ?? '').replace(/\s+/g,' ').trim().slice(0,800);
const terms = s => clean(s).toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x => x.length >= 3 && !['the','and','great','storm','weather','historic','historical'].includes(x));
const eventWords = [...new Set(terms(EVENT))];
const yearRegex = new RegExp(`(^|\\D)${YEAR}(\\D|$)`);
function assess(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  const hits = eventWords.filter(w => text.includes(w));
  const eventOverlap = eventWords.length ? hits.length/eventWords.length : 0;
  const yearMentioned = yearRegex.test(text);
  const stateMentioned = text.includes(STATE.toLowerCase());
  const eventMatch = eventWords.length > 0 && eventOverlap >= (eventWords.length === 1 ? 1 : .75);
  return {eventMatch,yearMentioned,stateMentioned,eventOverlap:Number(eventOverlap.toFixed(2)),
    provisional: eventMatch && yearMentioned && stateMentioned};
}
function parseViews(text) {
  const m = clean(text).match(/\b([\d,.]+)\s*([KMB])?\s*views?\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g,''));
  return Number.isFinite(n) ? Math.round(n*({K:1e3,M:1e6,B:1e9}[String(m[2]||'').toUpperCase()]||1)) : null;
}
function canonical(raw) {
  try {
    const u = new URL(raw);
    if (!['http:','https:'].includes(u.protocol)) return null;
    for (const key of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content']) u.searchParams.delete(key);
    return u.href;
  } catch { return null; }
}
async function extract(page,kind) {
  return page.evaluate(kind => {
    const selectors = kind === 'videos' ? ['.mc_vtvc','.b_vList .mc_vtvc','a[href]'] : ['li.b_algo','.b_algo'];
    let nodes = [];
    for (const selector of selectors) { nodes = [...document.querySelectorAll(selector)]; if (nodes.length) break; }
    return nodes.slice(0,40).map(node => {
      const heading = node.querySelector('h2 a, .mc_vtvc_title, a[title], h2') || node;
      const title = (heading.getAttribute('title') || heading.innerText || '').trim().slice(0,250);
      const description = (node.innerText || '').trim().slice(0,1000);
      const urls = [...node.querySelectorAll('a[href]')].map(a=>a.href).filter(Boolean).slice(0,30);
      if (node.matches('a[href]')) urls.unshift(node.href);
      return {title,description,urls};
    });
  },kind);
}
function chooseLink(urls) {
  const candidates = [...new Set(urls.map(canonical).filter(Boolean))];
  const external = candidates.filter(url => {
    try { const h=new URL(url).hostname; return !/(^|\.)bing\.com$|(^|\.)microsoft\.com$/.test(h); } catch {return false;}
  });
  return external.length === 1 ? {url:external[0],identity:'direct'} : {url:null,identity:external.length ? 'ambiguous':'unresolved'};
}
async function main() {
  const browser = await chromium.launch({headless:true});
  const records=[]; const runs=[];
  try {
    const page = await browser.newPage({locale:'en-US',viewport:{width:1440,height:900}});
    for (const search of searches) {
      const endpoint = search.kind === 'videos' ? 'videos/search' : 'search';
      const url = `https://www.bing.com/${endpoint}?q=${encodeURIComponent(search.q)}`;
      try {
        const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
        await page.waitForTimeout(2500);
        const cards=await extract(page,search.kind);
        const body=(await page.locator('body').innerText().catch(()=>'' )).slice(0,4000);
        const blocked=/verify you are human|unusual traffic|captcha|access denied|enable javascript/i.test(body);
        const httpStatus=response?.status()??null;
        const usable=httpStatus===200 && !blocked && cards.length>0;
        runs.push({kind:search.kind,query:search.q,httpStatus,cards:cards.length,status:usable?'RESULTS_RETRIEVED':blocked?'BLOCKED':httpStatus!==200?'HTTP_ERROR':'NO_USABLE_RESULTS'});
        if (!usable) continue;
        for (const card of cards) {
          const link=chooseLink(card.urls);
          const relevance=assess(card.title,card.description);
          const views=parseViews(card.description);
          const reasons=[];
          if (!link.url) reasons.push('SOURCE_LINK_NOT_UNAMBIGUOUS');
          if (!relevance.eventMatch) reasons.push('EVENT_NOT_MATCHED');
          if (!relevance.yearMentioned) reasons.push('YEAR_NOT_CONFIRMED');
          if (!relevance.stateMentioned) reasons.push('STATE_NOT_CONFIRMED');
          if (views===null) reasons.push('VIEW_COUNT_NOT_VERIFIED');
          else if (views<MIN_VIEWS) reasons.push('BELOW_1000_REPORTED_VIEWS');
          records.push({source:search.kind,query:search.q,title:clean(card.title),url:link.url,linkIdentity:link.identity,
            snippet:clean(card.description).slice(0,500),reportedViews:views,relevance,
            provisionalCandidate:!!link.url && relevance.provisional && views!==null && views>=MIN_VIEWS,
            requiresManualVerification:true,reasons});
        }
      } catch(err) {runs.push({kind:search.kind,query:search.q,status:'FAILED',error:clean(err.message)});}
    }
  } finally {await browser.close();}
  const unique = new Map();
  for(const item of records) if(item.url && !unique.has(item.url)) unique.set(item.url,item);
  const status = runs.every(r=>r.status==='RESULTS_RETRIEVED') ? 'DISCOVERY_COMPLETED' : 'NOT_EVALUATED';
  const result={engine:3,test:31,method:'Bing Videos + Bing Web Search via Playwright',state:STATE,year:YEAR,event:EVENT,
    generatedAt:new Date().toISOString(),minimumReportedViews:MIN_VIEWS,status,score:null,grade:'Not Evaluated',
    verification:'PROVISIONAL_DISCOVERY_ONLY',searches:runs,
    summary:{searchesRequested:searches.length,searchesWithResults:runs.filter(r=>r.status==='RESULTS_RETRIEVED').length,
      observations:records.length,uniqueSourceLinks:unique.size,provisionalVideoCandidates:[...unique.values()].filter(r=>r.provisionalCandidate).length},
    note:'Search result snippets and reported views are not independently verified. Zero is not assigned for missing or blocked searches. Seven-category grading is unchanged.',
    results:[...unique.values()].slice(0,100),unresolved:records.filter(r=>!r.url).slice(0,40)};
  fs.mkdirSync('reports',{recursive:true});fs.writeFileSync(OUT,JSON.stringify(result,null,2));
  console.log(JSON.stringify({status:result.status,summary:result.summary,report:OUT},null,2));
  if(status==='NOT_EVALUATED') process.exitCode=1;
}
main().catch(e=>{console.error('TEST #31 FAILED:',e.message);process.exitCode=1;});
