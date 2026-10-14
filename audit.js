// Independent Engine 3 test. Requires yt-dlp executable installed on PATH.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const query='Great Blizzard of 1978 Illinois news';
const limit=20;
const args=['--no-download','--dump-single-json','--ignore-errors','--no-warnings',`ytsearch${limit}:${query}`];
const result=spawnSync('yt-dlp',args,{encoding:'utf8',timeout:180000,maxBuffer:20*1024*1024});
if(result.status!==0){console.error(result.stderr||'yt-dlp failed');process.exit(1)}
let data;try{data=JSON.parse(result.stdout)}catch{console.error('No valid JSON returned');process.exit(1)}
const entries=Array.isArray(data.entries)?data.entries:[];
const seen=new Set();const videos=[];
for(const e of entries){if(!e)continue;const id=String(e.id||e.url||'');if(!id||seen.has(id))continue;seen.add(id);videos.push({id,url:e.webpage_url||e.url||'',view_count:Number.isFinite(e.view_count)?e.view_count:null})}
if(!videos.length){console.error('No video results retrieved; audit not verified.');process.exit(1)}
const qualifying=videos.filter(v=>v.view_count!==null&&v.view_count>=1000).length;
const out={engine:3,provider:'yt-dlp',query,requested_limit:limit,generated_at:new Date().toISOString(),videos};
fs.writeFileSync('audit-results.json',JSON.stringify(out,null,2));
console.log(JSON.stringify({query,scanned:videos.length,with_known_views:videos.filter(v=>v.view_count!==null).length,qualifying_1000_plus:qualifying,below_or_unknown:videos.length-qualifying},null,2));
if(!videos.some(v=>v.view_count!==null)){console.error('No usable view counts; audit not verified.');process.exit(1)}
