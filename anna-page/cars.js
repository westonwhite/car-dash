// "Where are the cars" map tile: live spots of both Teslas from the Worker's /fleet, using the same key this
// screen saved when it was paired (no key in any file). Refreshes every 60 s while visible. Labels never show a street.
var CM={map:null,mk:{},home:{},t:0,cen:[28.146,-82.757]};
function cmWho(c){return String(c.id)===CAR?{n:'Anna',cls:'a'}:{n:'Weston',cls:'w'};}
function cmPlace(){var phone=matchMedia('(max-width:560px)').matches,el=$('carsmap');if(!el)return;
 var want=phone?$('c3'):$('c1');if(el.parentNode!==want){if(phone)want.insertBefore(el,want.querySelector('.ac'));else want.appendChild(el);}}
function cmInit(){if(CM.map||!window.L)return CM.map;
 CM.map=L.map('cmap',{zoomControl:false,zoomSnap:0.25,attributionControl:true,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,touchZoom:false,tap:false}).setView(CM.cen,11);
 // Esri dark gray canvas (free, no key). CARTO dark_all now answers "API key required" for keyless requests.
 var E='https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_';
 L.tileLayer(E+'Base/MapServer/tile/{z}/{y}/{x}',{maxZoom:16,attribution:'Esri, HERE, Garmin, © OpenStreetMap'}).addTo(CM.map);
 L.tileLayer(E+'Reference/MapServer/tile/{z}/{y}/{x}',{maxZoom:16}).addTo(CM.map);
 CM.map.attributionControl.setPrefix(false);return CM.map;}
function cmMsg(h){var m=$('cmmsg');m.innerHTML=h||'';m.hidden=!h;}
function cmFit(){if(!CM.map)return;CM.map.invalidateSize(false);var ll=Object.keys(CM.mk).map(function(k){return CM.mk[k].getLatLng();});
 if(!ll.length){CM.map.setView(CM.cen,11);return;}
 if(ll.length===1){CM.map.setView(ll[0],14,{animate:false});CM.map.panBy([0,-14],{animate:false});return;}
 CM.map.fitBounds(L.latLngBounds(ll),{paddingTopLeft:[80,Math.min(44,Math.round(CM.map.getSize().y*.36))],paddingBottomRight:[80,Math.min(22,Math.round(CM.map.getSize().y*.12))],maxZoom:15,animate:false});cmUnclash();}
// two labels sit above their dots; if they would collide, the lower car's label flips below its dot
function cmUnclash(){var ks=Object.keys(CM.mk);ks.forEach(function(k){var e=CM.mk[k].getElement();if(e)e.firstChild.classList.remove('dn');});if(ks.length<2)return;
 var p=ks.map(function(k){return CM.map.latLngToContainerPoint(CM.mk[k].getLatLng());}),e=ks.map(function(k){return CM.mk[k].getElement();});if(!e[0]||!e[1])return;
 var w=(e[0].firstChild.firstChild.offsetWidth+e[1].firstChild.firstChild.offsetWidth)/2+6;
 if(Math.abs(p[0].x-p[1].x)<w&&Math.abs(p[0].y-p[1].y)<30){var lo=p[0].y>=p[1].y?0:1;e[lo].firstChild.classList.add('dn');}}
function cmStatus(c){if(c.shift_state&&c.shift_state!=='P')return c.speed?'Driving '+Math.round(c.speed)+' mph':'Driving';
 if(c.charging_state==='Charging')return 'Charging';return 'Parked';}
// "Home" check reuses the Worker's existing /eta?destination=home (same test the drive card uses: < 0.3 mi = there),
// only for parked cars and only when the parked spot changes, so no address is needed here.
function cmAtHome(c){if(c.shift_state&&c.shift_state!=='P')return Promise.resolve(false);
 var ck=c.lat.toFixed(3)+','+c.lon.toFixed(3);if(ck in CM.home)return Promise.resolve(CM.home[ck]);
 return api('/eta?destination=home&only=fastest&origin='+c.lat.toFixed(5)+','+c.lon.toFixed(5)).then(function(j){var h=!!(j.fastest&&j.fastest.miles<0.3);CM.home[ck]=h;return h;}).catch(function(){return false;});}
function cmTxt(c,home){var st=cmStatus(c);return home?(st==='Charging'?'Home · Charging':'Home'):st;}
function cmDraw(name,cls,ll,txt,dest){var ic=L.divIcon({className:'cmi',iconSize:[0,0],html:'<div class="cmpin '+cls+'"><span class="cmlbl">'+esc(txt)+'</span><i></i></div>'});
 if(CM.mk[name]){CM.mk[name].setLatLng(ll);CM.mk[name].setIcon(ic);}else CM.mk[name]=L.marker(ll,{icon:ic,interactive:true,keyboard:true}).addTo(CM.map);
 CM.mk[name].off('click');
 CM.mk[name].on('click',function(){if(window.openNav)openNav(dest);});}
function cmClear(){Object.keys(CM.mk).forEach(function(k){CM.map.removeLayer(CM.mk[k]);});CM.mk={};}
function cars(){cmPlace();if(!cmInit()){$('cmsrc').textContent='';cmMsg('Map unavailable right now.');return;}
 if(!key()){cmClear();cmFit();$('cmsrc').textContent='';cmMsg('<b>Pair this screen to see both cars</b>'+PAIR_BTN);return;}
 api('/fleet').then(function(j){var cs=(j.cars||[]).filter(function(c){return c.lat!=null&&c.lon!=null;});
  if(!cs.length){cmMsg('Waiting for the cars\u2019 locations…');return;}
  return Promise.all(cs.map(cmAtHome)).then(function(h){var seen={},it=cs.map(function(c,i){var w=cmWho(c);return {n:w.n,cls:w.cls,ll:L.latLng(c.lat,c.lon),t:cmTxt(c,h[i]),dest:{name:c.name||w.n,address:'',lat:+c.lat,lon:+c.lon}};});
   if(it.length===2&&it[0].ll.distanceTo(it[1].ll)<300){var a=it[0].n==='Anna'?it[0]:it[1],b=a===it[0]?it[1]:it[0];
    it=[{n:'Both',cls:'b',ll:a.ll,t:a.t===b.t?'Anna & Weston · '+a.t:'Anna · '+a.t+'  ·  Weston · '+b.t,dest:{name:b.n,address:'',lat:b.ll.lat,lon:b.ll.lng}}];}
   else it.forEach(function(x){x.t=x.n+' · '+x.t;});
   it.forEach(function(x){cmDraw(x.n,x.cls,x.ll,x.t,x.dest);seen[x.n]=1;});
   Object.keys(CM.mk).forEach(function(k){if(!seen[k]){CM.map.removeLayer(CM.mk[k]);delete CM.mk[k];}});
   cmMsg('');cmFit();$('cmsrc').textContent=(cs.length<2?'1 car located · ':'')+hm(new Date(j.fetched_at||Date.now()));});})
 .catch(function(e){if(!key()){cars();return;}cmMsg('Car locations unavailable right now. Retrying soon.');});}
addEventListener('resize',function(){clearTimeout(CM.rt);CM.rt=setTimeout(cmPlace,150);});
// the tile's height settles after the other cards fill in, so refit whenever its box changes size
if(window.ResizeObserver)new ResizeObserver(function(){clearTimeout(CM.ft);CM.ft=setTimeout(cmFit,120);}).observe($('cmap'));
