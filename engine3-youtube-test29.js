
'use strict';
// Engine 3 Test 29: one YouTube search per state, no scraping or paid search provider.
const fs = require('node:fs');
const path = require('node:path');
const events = require('./engine3-test29-events.json');
const key = process.env.YOUTUBE_API_KEY;
const out = path.join('reports','engine3-test29-50states.json');
const sleep = ms => new Promise(r => setTimeout(r,ms));
const norm = s => String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const stop = new Set(['the','of','and','in','a','an','north','american','united','states']);
const words = s => norm(s).split(' ').filter(w=>w.length>2&&!stop.has(w));
async function youtube(endpoint,params){
  const u = new URL('https://www.googleapis.com/youtube/v3/'+endpoint);
  for(const [k,v] of Object.entries({...params,key}))u.searchParams.set(k,String(v));
  const r=await fetch(u,{signal:AbortSignal.timeout(20000)});
  const data=await r.json();
  if(!r.ok)throw new Error('YouTube HTTP '+r.status+': '+(data.error?.message||'API request failed'));
  return data;
}
function grade(n){return n>=97?'A+':n>=90?'A':n>=80?'B':n>=70?'C':n>=60?'D':'F';}
async function evaluate(row){
 const base={...row,category:'YouTube News Coverage',status:'not_evaluated',score:null,grade:null,checked_count:0,qualifying_count:0,results:[]};
 if(!row.event||!row.year)return {...base,message:'No event for this state in supplied Blogger sample dataset. Choose and verify an event before testing.'};
 if(row.research_lead)return {...base,message:'Event is marked RESEARCH LEAD in Blogger dataset; verify state impact before grading.'};
 if(!key)return {...base,message:'YOUTUBE_API_KEY secret is missing.'};
 try{
  // search.list costs 100 quota units; videos.list costs 1 quota unit.
  const q=`${row.year} ${row.event} ${row.state} news footage`;
  const search=await youtube('search',{part:'snippet',q,type:'video',maxResults:20});
  const ids=(search.items||[]).map(x=>x.id?.videoId).filter(Boolean);
  if(!ids.length)return {...base,status:'no_acceptable_resources',score:0,grade:'F',message:'Search completed; no videos returned.'};
  const details=await youtube('videos',{part:'snippet,statistics,status',id:ids.join(',')});
  const entries=(details.items||[]).map(v=>{
   const title=v.snippet?.title||'',description=v.snippet?.description||'';
   const t=norm(title),all=norm(title+' '+description);
   const eventTerms=words(row.event);
   const eventMatch=eventTerms.length>0&&eventTerms.every(w=>all.includes(w));
   const yearMatch=all.includes(String(row.year));
   const stateMatch=all.includes(norm(row.state));
   const views=Number(v.statistics?.viewCount||0);
   const newsMatch=/\b(news|report|coverage|broadcast|abc|nbc|cbs|fox|cnn|weather channel|associated press|reuters)\b/i.test(title+' '+description+' '+(v.snippet?.channelTitle||''));
   const eligible=eventMatch&&yearMatch&&stateMatch&&views>=1000&&newsMatch&&v.status?.privacyStatus==='public';
   const score=eligible?Math.min(100,60+(t.includes(norm(row.event))?15:0)+(t.includes(norm(row.state))?10:0)+(views>=10000?10:5)+(views>=100000?5:0)):null;
   return {title,channel:v.snippet?.channelTitle||'',url:'https://www.youtube.com/watch?v='+v.id,published_at:v.snippet?.publishedAt||null,views,eligible,score,checks:{eventMatch,yearMatch,stateMatch,newsMatch,viewsMinimum:views>=1000}};
  });
  const eligible=entries.filter(x=>x.eligible);
  const score=eligible.length?Math.round(eligible.reduce((a,b)=>a+b.score,0)/eligible.length):0;
  return {...base,status:eligible.length?'metadata_matches_found':'no_acceptable_resources',score,grade:grade(score),checked_count:entries.length,qualifying_count:eligible.length,results:entries,message:eligible.length?'Matches passed metadata filters; video content and historical accuracy still require independent review.':'Completed API search found no results meeting all metadata filters. This is not proof that no historical footage exists.'};
 }catch(e){return {...base,message:String(e.message||e).slice(0,300)};}
}
async function main(){
 const rows=[];
 for(const row of events){
  const result=await evaluate(row);rows.push(result);
  console.log(`${rows.length}/50 ${row.state}: ${result.status}${result.score===null?'':` ${result.score}/100`}`);
  await sleep(150);
 }
 const summary={total_states:rows.length,metadata_matches_found:rows.filter(x=>x.status==='metadata_matches_found').length,no_acceptable_resources:rows.filter(x=>x.status==='no_acceptable_resources').length,not_evaluated:rows.filter(x=>x.status==='not_evaluated').length};
 const report={engine:3,test:29,source:'YouTube Data API v3',scope:'50-state sample event coverage, one event per state',generated_at:new Date().toISOString(),method:'One search per state; metadata filtering; manual verification required',summary,states:rows};
 fs.mkdirSync('reports',{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 console.log('Saved '+out,JSON.stringify(summary));
}
main().catch(e=>{console.error(e);process.exitCode=1});
