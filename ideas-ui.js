/* Things-to-do sheet for index.html and hub.html.
   Saved ideas come from ideas.js (OUTINGS). Dated Tampa Bay events are read from
   Anna's picks.js when that script loads; otherwise the sheet stays on saved ideas. */
(function () {
  if (window.__ideasUI) return;
  window.__ideasUI = true;
  var btn = document.getElementById('ideasOpen');
  if (!btn) return;

  var PICKS_URL = 'https://westonwhite.github.io/anna/picks.js';
  var tz = 'America/New_York';
  var picksPromise = null;
  var tab = 'ideas';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c];
    });
  }
  function safeUrl(u) {
    try {
      var x = new URL(u, location.href);
      if (x.protocol === 'https:' || x.protocol === 'http:') return x.href;
    } catch (e) {}
    return '';
  }
  function mapsUrl(where) {
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(where || '');
  }
  function clock(d) {
    return d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit', timeZone: tz}).replace(':00', '');
  }
  function dayLabel(d) {
    return d.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric', timeZone: tz});
  }
  function sameDay(a, b) {
    var opt = {year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz};
    return a.toLocaleDateString('en-US', opt) === b.toLocaleDateString('en-US', opt);
  }
  function whenOf(p) {
    var s = new Date(p.start), e = new Date(p.end);
    if (isNaN(s)) return '';
    if (p.day || isNaN(e)) return dayLabel(s);
    if (sameDay(s, e)) return dayLabel(s) + ' · ' + clock(s) + ' – ' + clock(e);
    return dayLabel(s) + ' – ' + dayLabel(e);
  }
  function livePicks(list) {
    var saved = {};
    (window.OUTINGS || []).forEach(function (o) {
      var u = safeUrl(o.url);
      if (u) saved[u] = 1;
    });
    var now = Date.now();
    var long = 21 * 86400000;
    return (list || []).filter(function (p) {
      if (!p || !p.t || /^someday:/i.test(p.t)) return false;
      if (p.url && saved[safeUrl(p.url)]) return false;
      var start = p.start ? new Date(p.start).getTime() : NaN;
      var end = p.end ? new Date(p.end).getTime() : Infinity;
      if (isNaN(end) || end < now) return false;
      if (!isNaN(start) && end - start > long) return false;
      return true;
    }).sort(function (a, b) {
      return new Date(a.start) - new Date(b.start);
    });
  }

  function actions(site, where, siteLabel) {
    var html = '<div class="idea-acts">';
    if (site) html += '<a class="site" href="' + esc(site) + '">' + esc(siteLabel || 'Website') + '</a>';
    if (where) html += '<a class="dir" href="' + esc(mapsUrl(where)) + '">Directions</a>';
    return html + '</div>';
  }
  function outingCard(o) {
    var bits = [];
    if (o.season) bits.push(o.season);
    if (o.hours) bits.push(o.hours);
    var tag = o.tag ? '<div class="idea-kicker"><span class="idea-tag ' + esc(o.tag) + '">' + esc(o.tag) + '</span></div>' : '';
    return '<article class="idea-card">' + tag + '<h3>' + esc(o.name) + '</h3>' +
      (o.where ? '<div class="idea-where">' + esc(o.where) + '</div>' : '') +
      (bits.length ? '<div class="idea-when">' + esc(bits.join(' · ')) + '</div>' : '') +
      (o.desc ? '<p class="idea-desc">' + esc(o.desc) + '</p>' : '') +
      actions(safeUrl(o.url), o.where, 'Website') + '</article>';
  }
  function eventCard(p) {
    var tag = p.tag ? '<div class="idea-kicker"><span class="idea-tag ' + esc(p.tag) + '">' + esc(p.tag) + '</span></div>' : '';
    var when = whenOf(p);
    return '<article class="idea-card">' + tag + '<h3>' + esc(p.t) + '</h3>' +
      (when ? '<div class="idea-when">' + esc(when) + '</div>' : '') +
      (p.where ? '<div class="idea-where">' + esc(p.where) + '</div>' : '') +
      (p.desc ? '<p class="idea-desc">' + esc(p.desc) + '</p>' : '') +
      actions(safeUrl(p.url), p.where, 'Details') + '</article>';
  }
  function savedList() {
    var list = window.OUTINGS || [];
    if (!list.length) return '<div class="idea-note">No saved ideas yet. Add one in ideas.js.</div>';
    return list.map(outingCard).join('');
  }

  var dlg = document.createElement('div');
  dlg.id = 'ideasDlg';
  dlg.hidden = true;
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-labelledby', 'ideasTitle');
  dlg.innerHTML =
    '<div class="ideas-panel" role="document">' +
      '<div class="ideas-top"><div><h2 id="ideasTitle">Things to do</h2><p>Saved ideas for a fun outing</p></div>' +
      '<button type="button" class="ideas-x" id="ideasClose">Close</button></div>' +
      '<div class="ideas-tabs" role="tablist">' +
        '<button type="button" id="ideasTabIdeas" role="tab" aria-selected="true">Want to do</button>' +
        '<button type="button" id="ideasTabEvents" role="tab" aria-selected="false">Upcoming events</button>' +
      '</div>' +
      '<div class="ideas-body" id="ideasBody"></div>' +
    '</div>';
  document.body.appendChild(dlg);

  var body = dlg.querySelector('#ideasBody');
  var tabIdeas = dlg.querySelector('#ideasTabIdeas');
  var tabEvents = dlg.querySelector('#ideasTabEvents');
  var closeBtn = dlg.querySelector('#ideasClose');

  function paintTabs() {
    var ideasOn = tab === 'ideas';
    tabIdeas.classList.toggle('on', ideasOn);
    tabEvents.classList.toggle('on', !ideasOn);
    tabIdeas.setAttribute('aria-selected', ideasOn ? 'true' : 'false');
    tabEvents.setAttribute('aria-selected', ideasOn ? 'false' : 'true');
  }
  function showIdeas() {
    tab = 'ideas';
    paintTabs();
    body.innerHTML = savedList();
  }
  function showEvents(html) {
    tab = 'events';
    paintTabs();
    body.innerHTML = html;
  }
  function loadPicks() {
    if (picksPromise) return picksPromise;
    picksPromise = new Promise(function (resolve) {
      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        resolve(ok && Array.isArray(window.PICKS) ? window.PICKS : null);
      }
      var s = document.createElement('script');
      s.src = PICKS_URL;
      s.async = true;
      s.onload = function () { finish(true); };
      s.onerror = function () { finish(false); };
      setTimeout(function () { finish(Array.isArray(window.PICKS)); }, 6000);
      document.head.appendChild(s);
    });
    return picksPromise;
  }
  function openEvents() {
    showEvents('<div class="idea-note">Loading upcoming Tarpon Springs and Tampa Bay events…</div>');
    loadPicks().then(function (list) {
      if (tab !== 'events') return;
      if (!list) {
        showEvents('<div class="idea-note">Upcoming events didn’t load. Saved ideas are still here.</div>' + savedList());
        return;
      }
      var upcoming = livePicks(list);
      if (!upcoming.length) {
        showEvents('<div class="idea-note">No dated events coming up. Saved ideas are on Want to do.</div>');
        return;
      }
      showEvents(upcoming.map(eventCard).join(''));
    });
  }
  function setOpen(on) {
    dlg.hidden = !on;
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    document.documentElement.classList.toggle('ideas-open', on);
    if (on) {
      showIdeas();
      closeBtn.focus();
    } else {
      btn.focus();
    }
  }

  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-controls', 'ideasDlg');
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', function () { setOpen(dlg.hidden); });
  closeBtn.addEventListener('click', function () { setOpen(false); });
  tabIdeas.addEventListener('click', showIdeas);
  tabEvents.addEventListener('click', openEvents);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) setOpen(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !dlg.hidden) setOpen(false);
  });
})();
