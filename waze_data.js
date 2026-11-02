/* waze_data.js: reads the weekday-morning Waze snapshot (waze_traffic.json) for waze.html, index.html and hub.html.
   Source: Weston's PUBLIC road-data gist (no setup on any browser). Tries the GitHub gist API first; when the API is
   rate-limited (60/hr per IP) or fails it falls back to the raw gist URL. Both fetches are cache-busted.
   Accepts the current shape {updated_et,date,better_route,sample,routes:[{name,minutes,cops,hazards,delay_min}],
   items:[{type,label,lat,lon,route,delay_min,speed_mph,line:[[lat,lon],..]}]} and older ones (updated ISO, or
   updated_et + items only). Jam items may carry `line` (2-20 points) and no lat/lon. */
(function(){
const TZ='America/New_York',GIST='474d9210d5355ce6de61eae535ba1bf8',FILE='waze_traffic.json';
const API='https://api.github.com/gists/'+GIST,RAW='https://gist.githubusercontent.com/westonwhite/'+GIST+'/raw/'+FILE;
const RLK='waze_api_wait';   /* epoch ms until which the API is known rate-limited */
const ROUTES=[{key:'Belcher',label:'Belcher'},{key:'US-19',label:'US-19'},{key:'East Lake / McMullen Booth',label:'East Lake / McMullen'}];
function rkey(n){n=String(n||'');if(/belcher/i.test(n))return 'Belcher';if(/east\s*lake|mcmullen/i.test(n))return 'East Lake / McMullen Booth';if(/\b(us[- ]?)?19\b/i.test(n)&&!/alt/i.test(n))return 'US-19';return null;}
const ymd=d=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const hm=d=>d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:TZ});
function niceDate(s){const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(s||'');if(!m)return s||'unknown date';
 return new Date(Date.UTC(+m[1],+m[2]-1,+m[3],12)).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});}
const num=v=>{const n=Number(v);return v==null||v===''||!isFinite(n)?null:n;};
function normType(t){t=String(t||'').toLowerCase();if(/police|cop/.test(t))return 'police';if(/crash|accident/.test(t))return 'crash';
 if(/clos/.test(t))return 'closure';if(/construct|roadwork/.test(t))return 'construction';if(/jam|traffic/.test(t))return 'jam';return 'hazard';}
function normalize(j){
 const out={ok:true,raw:j,sample:!!j.sample,better:String(j.better_route||''),items:[],jams:[],routes:[],best:null};
 let iso=j.updated?new Date(j.updated):null;if(iso&&isNaN(iso))iso=null;
 out.date=/^\d{4}-\d\d-\d\d$/.test(j.date||'')?j.date:(iso?ymd(iso):null);
 out.asOf=j.updated_et?String(j.updated_et):(iso?hm(iso):null);
 out.today=ymd(new Date());out.stale=out.date!==out.today;out.dateNice=niceDate(out.date);
 for(const it of Array.isArray(j.items)?j.items.slice(0,25):[]){if(!it||typeof it!=='object')continue;
  const type=normType(it.type);let line=null;
  if(type==='jam'&&Array.isArray(it.line)){line=it.line.slice(0,20).map(p=>Array.isArray(p)?[num(p[0]),num(p[1])]:[null,null])
   .filter(p=>p[0]!=null&&p[1]!=null&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180);if(line.length<2)line=null;}
  let lat=num(it.lat),lon=num(it.lon);
  if((lat==null||lon==null)&&line){const m=line[Math.floor(line.length/2)];lat=m[0];lon=m[1];}
  if(lat==null||lon==null)continue;
  out.items.push({type,label:String(it.label||''),lat,lon,route:rkey(it.route),delay:num(it.delay_min),speed:num(it.speed_mph),line});}
 out.jams=out.items.filter(i=>i.line);
 const byKey={};
 for(const r of Array.isArray(j.routes)?j.routes:[]){const k=rkey(r&&r.name);if(!k||byKey[k])continue;
  byKey[k]={key:k,name:String(r.name),minutes:num(r.minutes),cops:num(r.cops)||0,hazards:num(r.hazards)||0,delay:num(r.delay_min)};}
 if(!Object.keys(byKey).length&&out.items.some(i=>i.route)){ /* old-ish file: count from items */
  for(const i of out.items){if(!i.route)continue;const r=byKey[i.route]||(byKey[i.route]={key:i.route,name:i.route,minutes:null,cops:0,hazards:0,delay:null});
   if(i.type==='police')r.cops++;else r.hazards++;}}
 out.routes=ROUTES.map(R=>Object.assign({label:R.label},byKey[R.key]||{key:R.key,name:R.key,minutes:null,cops:0,hazards:0,delay:null,missing:true}));
 /* fastest: route named first in better_route, else lowest minutes */
 let bi=-1,bk=null;for(const r of out.routes){const re=r.key==='US-19'?/\bUS[- ]?19\b(?!\s*alt)/i:r.key==='Belcher'?/belcher/i:/east\s*lake|mcmullen/i;
  const m=re.exec(out.better);if(m&&!/^\s*alt/i.test(out.better.slice(m.index-4,m.index))&&(bi<0||m.index<bi)){bi=m.index;bk=r.key;}}
 if(!bk){let best=null;for(const r of out.routes)if(r.minutes!=null&&(!best||r.minutes<best.minutes))best=r;bk=best?best.key:null;}
 out.best=bk;return out;}
const bust=u=>u+(u.includes('?')?'&':'?')+'t='+Date.now();
function apiWait(){try{return +localStorage.getItem(RLK)||0}catch(e){return 0}}
async function viaApi(){
 if(Date.now()<apiWait())return null;
 const r=await fetch(bust(API),{cache:'no-store'});
 if(r.status===403||r.status===429){const reset=+r.headers.get('x-ratelimit-reset')||0;
  try{localStorage.setItem(RLK,String(reset?reset*1000:Date.now()+15*60*1000))}catch(e){}return null;}
 if(r.status===404)return {nf:true};if(!r.ok)return null;
 const g=await r.json(),f=g&&g.files&&g.files[FILE];if(!f)return {nf:true};
 if(f.truncated||typeof f.content!=='string')return null;   /* too big for the API body: use raw */
 return {j:JSON.parse(f.content)};}
async function viaRaw(){const r=await fetch(bust(RAW),{cache:'no-store'});
 if(r.status===404)return {nf:true};if(!r.ok)return {err:'HTTP '+r.status};return {j:await r.json()};}
async function load(){
 try{localStorage.removeItem('waze_src')}catch(e){}   /* forget the retired per-browser link */
 let res=null;try{res=await viaApi()}catch(e){res=null}
 if(!res||res.nf){try{const raw=await viaRaw();if(!res||raw.j)res=raw;}catch(e){if(!res)res={err:'unavailable'};}}
 if(res.j)try{return normalize(res.j)}catch(e){return {ok:false,why:'unreadable'};}
 return {ok:false,why:res.nf?'not published yet':(res.err||'unavailable')};}
/* clock helpers for the pages: ET time with/without seconds */
const nowET=(sec)=>new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',second:sec?'2-digit':undefined,timeZone:TZ});
window.WAZE={load,normalize,ROUTES,source:RAW,nowET};
})();
