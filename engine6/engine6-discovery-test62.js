
'use strict';
// Weather Time Machine — Engine 6 Test 6.2
// Authorized web discovery via Brave Search API. No Google scraping.
// Node 22, no packages. All unverified discoveries remain Not Evaluated.
const fs = require('node:fs');
const { queryFor, googleLink } = require('./engine6-photo-gallery');
const BLOCKED = /^(localhost|.*\.localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|\[::1\]$)/i;
function publicUrl(value) {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port && !['80','443'].includes(u.port)) return false;
    if (BLOCKED.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) return false;
    return u.hostname.includes('.');
  } catch { return false; }
}
function clean(s) { return String(s ?? '').replace(/<[^>]*>/g,' ').replace(/&(?:amp|quot|lt|gt|#39);/g,' ').replace(/\s+/g,' ').trim(); }
function tokens(s) { return clean(s).toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>2); }
function assess(result, event, state) {
  const url = String(result?.url || '');
  if (!publicUrl(url)) return null;
  const title = clean(result?.title);
  const description = clean(result?.description);
  const hay = `${title} ${description}`.toLowerCase();
  const eventTerms = tokens(event);
  const stateTerms = tokens(state);
  const eventMatch = eventTerms.length>0 && eventTerms.every(t=>hay.includes(t));
  const stateMatch = stateTerms.length>0 && stateTerms.every(t=>hay.includes(t));
  const galleryHint = /\b(photo|photos|photograph|photographs|gallery|galleries|images|pictures)\b/i.test(hay);
  return { url, title, description, eventMatch, stateMatch, galleryHint,
    candidate: eventMatch && stateMatch && galleryHint,
    verified:false, score:null, status:'Not Evaluated',
    reason:'Search snippet is a discovery lead; gallery contents and photographs not independently verified' };
}
async function discover({event, state, year='', apiKey=process.env.BRAVE_SEARCH_API_KEY, fetcher=fetch, count=10}) {
  const query=queryFor(event,state);
  const base={engine:6,version:'6.2',event,state,year:String(year),searchTerm:query,
    googleSearchUrl:googleLink(event,state),provider:'Brave Search API',score:null,grade:null,
    status:'Not Evaluated',searchCompleted:false,candidates:[],resultsExamined:0};
  if (!apiKey) return {...base,error:'BRAVE_SEARCH_API_KEY missing; live discovery not attempted'};
  const url=new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q',query);
  url.searchParams.set('count',String(Math.min(20,Math.max(1,count))));
  try {
    const res=await fetcher(url.toString(),{headers:{'Accept':'application/json','X-Subscription-Token':apiKey},signal:AbortSignal.timeout(20000)});
    if (!res.ok) return {...base,error:`Search API returned HTTP ${res.status}`};
    const json=await res.json();
    if (!Array.isArray(json?.web?.results)) return {...base,error:'Search API response missing web.results array'};
    const items=json.web.results;
    const candidates=items.map(x=>assess(x,event,state)).filter(Boolean);
    return {...base,searchCompleted:true,resultsExamined:items.length,candidates,
      potentialGalleries:candidates.filter(x=>x.candidate).length,
      note:'Discovery completed, not photo verification. No automatic grade or confirmed-zero finding.'};
  } catch(e) { return {...base,error:`Search request failed: ${e.message}`}; }
}
if(require.main===module){
  discover({event:process.env.EVENT||'Tropical Storm Irene',state:process.env.STATE||'Vermont',year:process.env.YEAR||'2011'})
    .then(r=>{const path=process.env.OUTPUT||'engine6-test62-results.json';fs.writeFileSync(path,JSON.stringify(r,null,2));console.log(JSON.stringify({status:r.status,searchCompleted:r.searchCompleted,resultsExamined:r.resultsExamined,candidates:r.potentialGalleries||0,error:r.error||null},null,2));if(r.error)process.exitCode=1;})
    .catch(e=>{console.error(e);process.exitCode=1;});
}
module.exports={publicUrl,clean,assess,discover};
