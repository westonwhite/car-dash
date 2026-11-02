/* waze_data.js: reads the weekday-morning Waze snapshot (waze_traffic.json) for waze.html, index.html and hub.html.
   The snapshot lives in Weston's private gist, so its id is NOT in this public repo. Link a browser once with
   <page>#wz=<gist id>  (or #wz=<full raw URL>); it is kept in localStorage 'waze_src'. #wz=off unlinks.
   Accepts the current shape {updated_et,date,better_route,sample,routes:[{name,minutes,cops,hazards,delay_min}],
   items:[{type,label,lat,lon,route,delay_min}]} and older ones (updated ISO, or updated_et + items only). */
(function(){
const KEY='waze_src',TZ='America/New_York';
try{const h=new URLSearchParams(location.hash.slice(1));if(h.has('wz')){const v=(h.get('wz')||'').trim();
 if(v==='off'||!v)localStorage.removeItem(KEY);else localStorage.setItem(KEY,v);h.delete('wz');const r=h.toString();
 history.replaceState(null,'',location.pathname+location.search+(r?'#'+r:''));}}catch(e){}
const ROUTES=[{key:'Belcher',label:'Belcher'},{key:'US-19',label:'US-19'},{key:'East Lake / McMullen Booth',label:'East Lake / McMullen'}];
function rkey(n){n=String(n||'');if(/belcher/i.test(n))return 'Belcher';if(/east\s*lake|mcmullen/i.test(n))return 'East Lake / McMullen Booth';if(/\b(us[- ]?)?19\b/i.test(n)&&!/alt/i.test(n))return 'US-19';return null;}
function src(){let v='';try{v=localStorage.getItem(KEY)||''}catch(e){}if(!v)return '';
 if(/^[0-9a-f]{20,40}$/i.test(v))return 'https://gist.githubusercontent.com/westonwhite/'+v+'/raw/waze_traffic.json';
 return /^https:\/\//.test(v)?v:'';}
const ymd=d=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const hm=d=>d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:TZ});
function niceDate(s){const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(s||'');if(!m)return s||'unknown date';
 return new Date(Date.UTC(+m[1],+m[2]-1,+m[3],12)).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});}
const num=v=>{const n=Number(v);return v==null||v===''||!isFinite(n)?null:n;};
function normType(t){t=String(t||'').toLowerCase();if(/police|cop/.test(t))return 'police';if(/crash|accident/.test(t))return 'crash';
 if(/clos/.test(t))return 'closure';if(/construct|roadwork/.test(t))return 'construction';if(/jam|traffic/.test(t))return 'jam';return 'hazard';}
function normalize(j){
 const out={ok:true,raw:j,sample:!!j.sample,better:String(j.better_route||''),items:[],routes:[],best:null};
 let iso=j.updated?new Date(j.updated):null;if(iso&&isNaN(iso))iso=null;
 out.date=/^\d{4}-\d\d-\d\d$/.test(j.date||'')?j.date:(iso?ymd(iso):null);
 out.asOf=j.updated_et?String(j.updated_et):(iso?hm(iso):null);
 out.today=ymd(new Date());out.stale=out.date!==out.today;out.dateNice=niceDate(out.date);
 for(const it of Array.isArray(j.items)?j.items.slice(0,25):[]){const lat=num(it&&it.lat),lon=num(it&&it.lon);if(lat==null||lon==null)continue;
  out.items.push({type:normType(it.type),label:String(it.label||''),lat,lon,route:rkey(it.route),delay:num(it.delay_min)});}
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
async function load(){const u=src();if(!u)return {ok:false,why:'unlinked'};
 try{const r=await fetch(u+(u.includes('?')?'&':'?')+'t='+Date.now(),{cache:'no-store'});
  if(r.status===404)return {ok:false,why:'not published yet'};if(!r.ok)return {ok:false,why:'HTTP '+r.status};
  return normalize(await r.json());}catch(e){return {ok:false,why:'unavailable'};}}
window.WAZE={load,normalize,ROUTES,linked:()=>!!src()};
})();
