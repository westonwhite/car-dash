// "Things to do" card: live Tarpon Springs city calendar (Fun) + hand-checked dog, aviation and boating picks (picks.js).
// Anytime ideas (someday:true, or tag/kind "Ideas") stay off the dated lists and open from the Ideas chip / Ideas tab.
var TODO=[],TODO_TAG='All',TD_TAG='All',TAGS={Dog:'Dog-friendly',Aviation:'Aviation',Boating:'Boating',Fun:'Fun',Ideas:'Idea'};
var TRIBE='https://exploretarponsprings.com/wp-json/tribe/events/v1/events?per_page=25';
function unent(s){var d=document.createElement('textarea');d.innerHTML=String(s||'').replace(/<[^>]+>/g,' ');return d.value.replace(/\s+/g,' ').trim();}
function localDate(s){var m=String(s||'').match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)/);return m?new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5]):null;}
function isIdea(e){return !!(e&&(e.someday||e.tag==='Ideas'));}
function alive(e,now){
 if(isIdea(e)){if(e.s&&e.s.getTime()>now)return false;if(e.e&&e.e.getTime()<=now)return false;return true;}
 return !!e.s&&(e.e||e.s).getTime()>now;}
function whenTxt(e){if(isIdea(e))return e.when||'Anytime';
 var d=e.s,o={weekday:'short',month:'short',day:'numeric'},t=d.toLocaleDateString('en-US',o);
 if(e.e&&e.e.toDateString()!==d.toDateString())t+=' – '+e.e.toLocaleDateString('en-US',{month:'short',day:'numeric'});
 else if(!e.day)t+=' · '+hm(d).replace(':00','');return t;}
// Paged list: touch scrolling is unreliable in the car browser, so rows have a fixed height and big ▲/▼ buttons flip pages.
// "More" opens a full-screen page (#tdo) with a 1-3 column grid and large Prev/Next buttons.
var TP=0,TDP=0,TODO_MAX=60;
function viewList(tag){var now=Date.now();return TODO.filter(function(e){if(!alive(e,now))return false;var idea=isIdea(e);if(tag==='Ideas')return idea;if(idea)return false;return tag==='All'||e.tag===tag;}).slice(0,TODO_MAX);}
function todoList(){return viewList(TODO_TAG);}
function ideasChip(){var now=Date.now(),n=0,i,b=$('tideas'),ch=b&&b.parentNode;for(i=0;i<TODO.length;i++)if(isIdea(TODO[i])&&alive(TODO[i],now))n++;if(!b)return;b.hidden=n<1;if(ch&&ch.classList)ch.classList.toggle('hasideas',n>=1);b.textContent='Ideas ('+n+')';b.setAttribute('aria-label','Saved anytime ideas, '+n);}
function evHtml(e){var k=TODO.indexOf(e);
 return '<button type="button" class="ev'+(isIdea(e)?' idea':'')+'" data-i="'+k+'"><span class="ew">'+esc(whenTxt(e))+'</span><span class="et">'+esc(e.t)+'</span><span class="ex"><i class="tg t'+e.tag+'">'+esc(TAGS[e.tag]||e.tag||'')+'</i>'+esc(e.where||'')+'</span></button>';}
function emptyHtml(tag){if(tag==='Ideas')return '<div class="muted" style="padding:10px 4px">No saved ideas right now.</div>';return '<div class="muted" style="padding:10px 4px">'+(TODO.length?'Nothing coming up in this group right now.':'Loading events…')+'</div>';}
function tabsOn(id,tag){var bt=$(id).getElementsByTagName('button'),i;for(i=0;i<bt.length;i++)bt[i].className=bt[i].getAttribute('data-k')===tag?'on':'';}
function todoRender(){var list=todoList(),el=$('todolist');tabsOn('todotabs',TODO_TAG);ideasChip();
 var rh=parseFloat(getComputedStyle(el).getPropertyValue('--evh'))||60,per=Math.max(1,Math.floor((el.clientHeight+1)/rh)),pages=Math.max(1,Math.ceil(list.length/per));
 if(TP>=pages)TP=pages-1;if(TP<0)TP=0;
 el.innerHTML=list.length?list.slice(TP*per,TP*per+per).map(evHtml).join(''):emptyHtml(TODO_TAG);
 $('tup').disabled=TP<=0;$('tdn').disabled=TP>=pages-1;$('tpn').textContent=list.length?(TP+1)+'/'+pages:'';
 if(!$('tdo').hidden)tdRender();}
function tdRender(){var list=viewList(TD_TAG),g=$('tdgrid');tabsOn('tdtabs',TD_TAG);
 var W=g.clientWidth,cols=W>=1000?3:W>=520?2:1;g.style.setProperty('--tdc',cols);
 var rows=Math.max(1,Math.floor((g.clientHeight+6)/70)),per=rows*cols,pages=Math.max(1,Math.ceil(list.length/per));
 if(TDP>=pages)TDP=pages-1;if(TDP<0)TDP=0;
 g.innerHTML=list.length?list.slice(TDP*per,TDP*per+per).map(evHtml).join(''):emptyHtml(TD_TAG);
 $('tdup').disabled=TDP<=0;$('tddn').disabled=TDP>=pages-1;$('tdpn').textContent=list.length?'Page '+(TDP+1)+' / '+pages:'';}
function tdOpen(){TD_TAG=TODO_TAG;$('tdo').hidden=false;TDP=0;tdRender();}
function ideasOpen(){TD_TAG='Ideas';$('tdo').hidden=false;TDP=0;tdRender();}
function parsePickDate(v){if(!v)return null;var d=new Date(v);return isNaN(d.getTime())?null:d;}
function todoSet(live){var all=[];
 PICKS.forEach(function(p){var idea=!!(p.someday||p.tag==='Ideas'||p.kind==='Ideas');
  all.push({tag:p.tag,t:p.t,s:parsePickDate(p.start),e:parsePickDate(p.end),day:p.day,someday:idea,when:p.when,where:p.where,url:p.url,desc:p.desc,src:'Checked pick'});});
 (live||[]).forEach(function(x){var s=localDate(x.start||x.start_date),e=localDate(x.end||x.end_date);if(!s||!x.url)return;
  var t=unent(x.t||x.title);if(all.some(function(a){return a.s&&a.t.toLowerCase()===t.toLowerCase()&&a.s.toDateString()===s.toDateString();}))return;
  all.push({tag:'Fun',t:t,s:s,e:e,day:!!x.all_day,where:unent(x.where||(x.venue&&x.venue.venue)||'Tarpon Springs'),url:x.url,desc:unent(x.desc||x.excerpt||'').slice(0,400),src:'Explore Tarpon Springs'});});
 all.sort(function(a,b){var ia=isIdea(a),ib=isIdea(b);if(ia!==ib)return ia?1:-1;if(ia)return String(a.t).localeCompare(String(b.t));return a.s-b.s;});
 TODO=all;todoRender();}
function todo(){if(!TODO.length)todoSet(null);
 fetch(WORKER+'/events').then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(j){todoSet(j.items);$('todosrc').textContent='Tarpon Springs calendar + picks';})
 .catch(function(){fetch(TRIBE).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(j){todoSet(j.events||[]);$('todosrc').textContent='Tarpon Springs calendar + picks';})
  .catch(function(){$('todosrc').textContent='Checked picks (city calendar offline)';});});}
function marine(){Promise.all([
  fetch('https://marine-api.open-meteo.com/v1/marine?latitude=28.17&longitude=-82.86&current=wave_height&length_unit=imperial').then(function(r){return r.json();}),
  fetch('https://api.open-meteo.com/v1/forecast?latitude=28.17&longitude=-82.80&current=wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=kn').then(function(r){return r.json();})
 ]).then(function(a){var w=a[0].current&&a[0].current.wave_height,c=a[1].current,dirs=['N','NE','E','SE','S','SW','W','NW'];
  var kt=Math.round(c.wind_speed_10m),g=Math.round(c.wind_gusts_10m),d=dirs[Math.round(c.wind_direction_10m/45)%8];
  var mood=kt>=18||g>=28||(w!=null&&w>=3)?'<b style="color:var(--bad)">rough</b>':kt>=12||g>=20||(w!=null&&w>=2)?'<b style="color:#f5c26b">choppy</b>':'<b style="color:var(--good)">nice</b>';
  $('boat').innerHTML='<svg class="i" viewBox="0 0 24 24"><path d="M3 17c2 2 4 2 6 0 2 2 4 2 6 0 2 2 4 2 6 0"/><path d="M5 14l1-5h12l1 5M12 9V4l4 3"/></svg>Boating, Anclote: '+mood+' · '+d+' '+kt+' kt g'+g+(w!=null?' · '+w.toFixed(1)+' ft waves':'');})
 .catch(function(){$('boat').textContent='';});}
function todoTab(e){var b=e.target.closest('button[data-k]');if(!b)return;TODO_TAG=b.getAttribute('data-k');TD_TAG=TODO_TAG;TP=0;TDP=0;todoRender();}
function tdTab(e){var b=e.target.closest('button[data-k]');if(!b)return;var k=b.getAttribute('data-k');TD_TAG=k;TDP=0;if(k!=='Ideas'){TODO_TAG=k;TP=0;}todoRender();}
$('todotabs').addEventListener('click',todoTab);$('tdtabs').addEventListener('click',tdTab);
$('tup').onclick=function(){TP--;todoRender();};$('tdn').onclick=function(){TP++;todoRender();};$('tfull').onclick=tdOpen;
$('tideas').onclick=ideasOpen;
$('tdup').onclick=function(){TDP--;tdRender();};$('tddn').onclick=function(){TDP++;tdRender();};$('tdx').onclick=function(){$('tdo').hidden=true;};
var TD_RZ=null,TD_H=0;function todoRefit(){clearTimeout(TD_RZ);TD_RZ=setTimeout(todoRender,150);}window.addEventListener('resize',todoRefit);
// Re-page when the list's height changes (e.g. the boating line appears under it).
if(window.ResizeObserver)new ResizeObserver(function(){var h=$('todolist').clientHeight;if(h!==TD_H){TD_H=h;todoRefit();}}).observe($('todolist'));else setTimeout(todoRender,5000);
function todoOpenEv(e){var b=e.target.closest('.ev[data-i]');if(!b)return;var x=TODO[+b.getAttribute('data-i')];
 if(window.openNav){openNav({name:x.t,address:x.where||'',lat:x.lat,lon:x.lon,url:x.url,blurb:(x.where?x.where+'. ':'')+(x.desc||'')});return;}
 openReader({src:(isIdea(x)?'Idea':(TAGS[x.tag]||x.tag||''))+' · '+whenTxt(x),title:x.t,desc:(x.where?x.where+'. ':'')+(x.desc||''),link:x.url,btn:'Open event page'});}
$('todolist').addEventListener('click',todoOpenEv);$('tdgrid').addEventListener('click',todoOpenEv);
