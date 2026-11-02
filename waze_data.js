/* waze_data.js: reads the weekday-morning Waze snapshot (waze_traffic.json) for waze.html, index.html and hub.html.
   Source: Weston's PUBLIC road-data gist (no setup on any browser). Tries the GitHub gist API first; when the API is
   rate-limited (60/hr per IP) or fails it falls back to the raw gist URL. Both fetches are cache-busted.
   Accepts the current shape {updated_et,date,better_route,sample,time_source,routes:[{name,minutes,cops,hazards}],
   minutes straight from the Google Maps Routes API (TRAFFIC_AWARE), possibly null; shown exactly as given, never
   padded (no buffer, no +delay_min, no rounding up, no typical-time fallback). Legacy delay_min is tolerated, not added.
   items:[{type,label,lat,lon,route,delay_min,speed_mph,line:[[lat,lon],..]}]} and older ones (updated ISO, or
   updated_et + items only). Jam items may carry `line` (2-20 points) and no lat/lon.
   SHOW WINDOW: cops, jam lines and route minutes are shown only weekdays 8:30-9:30 AM America/New_York (checks run
   8:50 and 9:00 AM ET), and only when the snapshot is today's in ET. If the JSON has expires_et, items hide after it.
   Outside the window normalize() blanks items/jams/minutes/cops and sets show=false + offMsg. ET math uses Intl with
   timeZone America/New_York, so the browser's own timezone never matters. */
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
/* ---- ET show window ---- */
const WIN_START=8*60+30,WIN_END=9*60+30,CHECKS=[8*60+50,9*60];
const ETF=new Intl.DateTimeFormat('en-US',{timeZone:TZ,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function etParts(d){const o={};for(const p of ETF.formatToParts(d))o[p.type]=p.value;
 const h=(+o.hour)%24;return {ymd:o.year+'-'+o.month+'-'+o.day,y:+o.year,mo:+o.month,d:+o.day,h,mi:+o.minute,mins:h*60+(+o.minute),wd:o.weekday,weekday:!/^(Sat|Sun)/.test(o.weekday)};}
/* ET wall clock -> real instant (DST-safe) */
function etWall(y,mo,d,h,mi){let t=Date.UTC(y,mo-1,d,h,mi);for(let k=0;k<3;k++){const p=etParts(new Date(t));t-=Date.UTC(p.y,p.mo-1,p.d,p.h,p.mi)-Date.UTC(y,mo-1,d,h,mi);}return new Date(t);}
/* expires_et: ISO with Z/offset; ISO without offset (= ET wall time); or a time only ("9:30 AM", "09:30") on the snapshot date */
function parseExp(v,date){if(v==null||v==='')return null;const s=String(v).trim();let m;
 if(/^\d{4}-\d\d-\d\dT.*(Z|[+-]\d\d:?\d\d)$/i.test(s)){const d=new Date(s);return isNaN(d)?null:d;}
 if((m=/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d?):(\d\d)/.exec(s)))return etWall(+m[1],+m[2],+m[3],+m[4],+m[5]);
 if((m=/^(\d\d?):(\d\d)(?::\d\d)?\s*([AP]\.?M\.?)?/i.exec(s))&&date){let h=+m[1]%12;if(!m[3])h=+m[1];else if(/^p/i.test(m[3]))h+=12;
  const q=/^(\d{4})-(\d\d)-(\d\d)$/.exec(date);return q?etWall(+q[1],+q[2],+q[3],h,+m[2]):null;}
 const d=new Date(s);return isNaN(d)?null:d;}
const fmtMins=m=>{const h=Math.floor(m/60),mi=m%60;return (h%12||12)+':'+String(mi).padStart(2,'0')+' '+(h<12?'AM':'PM');};
function nextCheck(now){const p=etParts(now);
 if(p.weekday)for(const c of CHECKS)if(p.mins<c)return fmtMins(c);
 for(let k=1;k<=7;k++){const q=etParts(new Date(now.getTime()+k*864e5));if(q.weekday)return (k===1?'tomorrow ':q.wd+' ')+fmtMins(CHECKS[0]);}
 return fmtMins(CHECKS[0]);}
function inWindow(now){const p=etParts(now||new Date());return p.weekday&&p.mins>=WIN_START&&p.mins<WIN_END;}
function gate(j,out,now){const p=etParts(now),exp=parseExp(j.expires_et,out.date);
 const today=out.date===p.ymd;let show,why;
 if(!today)why='not today';
 else if(exp){show=p.weekday&&p.mins>=WIN_START&&now<exp;why=show?'':(now>=exp?'expired':'outside window');}
 else{show=p.weekday&&p.mins>=WIN_START&&p.mins<WIN_END;why=show?'':'outside window';}
 out.show=!!(today&&show);out.hideWhy=out.show?'':why;out.expires=exp;out.next=nextCheck(now);
 out.offMsg='Cops & traffic show weekdays 8:30–9:30 AM · next check '+out.next;
 if(!out.show){out.items=[];out.jams=[];out.best=null;
  out.routes=out.routes.map(r=>Object.assign({},r,{minutes:null,cops:0,hazards:0,delay:null}));}
 return out;}
function normalize(j,now){now=now||new Date();
 const out={ok:true,raw:j,sample:!!j.sample,better:String(j.better_route||''),source:j.time_source?String(j.time_source).slice(0,40):'',items:[],jams:[],routes:[],best:null};
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
 /* fastest: lowest non-null minutes; better_route wins only when consistent (its road ties the lowest time, or no road has a time) */
 let lo=null;for(const r of out.routes)if(r.minutes!=null&&(!lo||r.minutes<lo.minutes))lo=r;
 let bi=-1,bk=null;for(const r of out.routes){const re=r.key==='US-19'?/\bUS[- ]?19\b(?!\s*alt)/i:r.key==='Belcher'?/belcher/i:/east\s*lake|mcmullen/i;
  const m=re.exec(out.better);if(m&&!/^\s*alt/i.test(out.better.slice(m.index-4,m.index))&&(bi<0||m.index<bi)){bi=m.index;bk=r.key;}}
 if(bk&&lo){const n=out.routes.find(r=>r.key===bk);if(!n||n.minutes!==lo.minutes)bk=null;}
 if(!bk)bk=lo?lo.key:null;
 out.best=bk;return gate(j,out,now);}
/* minutes exactly as published ("17", "17.5"); '—' for null */
const fmtMin=m=>m==null?'—':String(m);
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
window.WAZE={load,normalize,ROUTES,source:RAW,nowET,fmtMin,inWindow,nextCheck,etParts,offMsg:n=>'Cops & traffic show weekdays 8:30–9:30 AM · next check '+nextCheck(n||new Date())};
})();
