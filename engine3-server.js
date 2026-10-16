
'use strict';
// Engine 3: independent YouTube Data API v3 metadata search and grading server.
// Deploy as a Node web service on Render with YOUTUBE_API_KEY environment variable.
const http=require('node:http');
const PORT=Number(process.env.PORT||10000);
const KEY=process.env.YOUTUBE_API_KEY;
const allowedOrigin=process.env.ALLOWED_ORIGIN||'*';
const cap=(s,n=140)=>String(s||'').trim().slice(0,n);
const words=s=>cap(s,200).toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>2);
const yearOk=(v,y)=>new RegExp('(^|\\D)'+y+'(\\D|$)').test(v);
function grade(v,state,year,event){
  const title=(v.snippet.title||'').toLowerCase(), desc=(v.snippet.description||'').toLowerCase();
  const all=title+' '+desc, ewords=words(event).filter(x=>!['the','and','of','great','north','american'].includes(x));
  const hit=ewords.length?ewords.filter(x=>all.includes(x)).length/ewords.length:0;
  const titleHit=ewords.length?ewords.filter(x=>title.includes(x)).length/ewords.length:0;
  const yr=yearOk(all,year), st=all.includes(state.toLowerCase());
  const channel=(v.snippet.channelTitle||'').toLowerCase();
  const news=/news|weather|abc|nbc|cbs|fox|pbs|archive|noaa|national weather service|history|meteorolog/.test(channel);
  const score=Math.min(100,Math.round(20*hit+20*titleHit+(yr?25:0)+(st?20:0)+(news?15:0)));
  return {score,match:yr&&hit>=0.5&&(st||titleHit>=0.8)&&score>=65,checks:{year:yr,state:st,event_overlap:hit,news_or_archive_channel:news}};
}
async function yt(endpoint,params){const u=new URL('https://www.googleapis.com/youtube/v3/'+endpoint);Object.entries({...params,key:KEY}).forEach(([k,v])=>u.searchParams.set(k,String(v)));const r=await fetch(u);const data=await r.json();if(!r.ok)throw Error('YouTube API '+r.status+': '+cap(data.error?.message,180));return data;}
async function audit(body){
 const state=cap(body.state,60),year=cap(body.year,4),event=cap(body.event||body.name,140);
 if(!/^[A-Za-z ]{3,60}$/.test(state)||!/^(18|19|20)\d{2}$/.test(year)||event.length<4)throw Error('State, four-digit year and event name are required');
 if(!KEY)throw Error('YOUTUBE_API_KEY not configured on server');
 const queries=[`${year} ${event} ${state} historical news`,`${year} ${event} ${state} footage`];
 const ids=new Set();let searches=0;
 for(const q of queries){const d=await yt('search',{part:'snippet',q,type:'video',maxResults:25,safeSearch:'moderate'});searches++;for(const x of d.items||[])if(x.id?.videoId)ids.add(x.id.videoId);}
 const list=[...ids],results=[];
 for(let i=0;i<list.length;i+=50){const d=await yt('videos',{part:'snippet,statistics,status',id:list.slice(i,i+50).join(',')});for(const v of d.items||[]){
   const views=Number(v.statistics?.viewCount||0);if(v.status?.privacyStatus!=='public'||views<1000)continue;
   const g=grade(v,state,year,event);
   results.push({title:v.snippet.title,channel:v.snippet.channelTitle,url:'https://www.youtube.com/watch?v='+v.id,views,candidate_score:g.score,metadata_match:g.match,content_verified:false,checks:g.checks});
 }}
 results.sort((a,b)=>Number(b.metadata_match)-Number(a.metadata_match)||b.candidate_score-a.candidate_score);
 const good=results.filter(v=>v.metadata_match);
 const score=good.length?Math.round(good.reduce((a,v)=>a+v.candidate_score,0)/good.length):0;
 return {state,year,event,status:good.length?'metadata_matches_found':'no_acceptable_resources',score,grade:score>=90?'A':score>=80?'B':score>=70?'C':score>=60?'D':'F',search_completed:true,searches_completed:searches,checked_count:list.length,candidate_count:good.length,results:results.slice(0,20),message:good.length?'Metadata relevance only; video content not verified.':'Completed search found no acceptable metadata-matched videos. This is not proof none exist on YouTube.'};
}
http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin',allowedOrigin);res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
 if(req.method==='GET'&&req.url==='/health'){res.writeHead(200);return res.end(JSON.stringify({ok:true,engine:3,live:true}));}
 if(req.method!=='POST'||req.url!=='/audit3'){res.writeHead(404);return res.end(JSON.stringify({error:'Not found'}));}
 let raw='';try{for await(const chunk of req){raw+=chunk;if(raw.length>10000)throw Error('Request too large');}const result=await audit(JSON.parse(raw));res.writeHead(200);res.end(JSON.stringify(result));}
 catch(e){res.writeHead(/required|large|JSON/.test(e.message)?400:503);res.end(JSON.stringify({status:'not_evaluated',error:e.message}));}
}).listen(PORT,()=>console.log('Engine 3 listening on',PORT));
