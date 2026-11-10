/* Ask Grok Bot for the car dashboards.
   ES5 on purpose: Anna's page is written for the in-car browser.
   This file never holds a GitHub token. Creating an issue goes through
   the relay in suggest/SETUP.md. Reading answers uses the public
   GitHub API with no token, and only while this box is open. */
(function (root) {
  var MAX = 2000;
  var POLL_MS = 120000;
  var requester = "weston";
  var pageFromScript = "";
  if (typeof document !== "undefined" && document.currentScript) {
    var reqAttr = document.currentScript.getAttribute("data-requester");
    if (reqAttr === "anna" || reqAttr === "weston") requester = reqAttr;
    pageFromScript = document.currentScript.getAttribute("data-page") || "";
  }

  function clip(s, n) {
    s = String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
    return s.length > n ? s.slice(0, n) : s;
  }
  function safeRepo(repo) {
    repo = String(repo || "");
    return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ? repo : "westonwhite/dash-requests";
  }
  function safeMail(mail) {
    mail = clip(mail, 120);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) ? mail : "";
  }
  function safeEndpoint(url) {
    url = clip(url, 400);
    return /^https:\/\/\S+$/i.test(url) ? url : "";
  }
  function config() {
    var c = root.ASK_CONFIG || {};
    return {
      endpoint: safeEndpoint(c.endpoint),
      repo: safeRepo(c.repo),
      mail: safeMail(c.mail),
      memoKey: clip(c.memoKey, 80)
    };
  }
  function meta() {
    var s = root.screen || {};
    var dpr = root.devicePixelRatio || 1;
    var when = "";
    try {
      when = new Date().toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short", month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit"
      }) + " ET";
    } catch (e) {
      when = new Date().toISOString();
    }
    when += " (" + new Date().toISOString() + ")";
    var page = pageFromScript || (typeof document !== "undefined" ? document.title : "") || "Dashboard";
    var url = "";
    try { url = root.location && root.location.href ? root.location.href.split("#")[0] : ""; } catch (e2) {}
    return {
      requester: requester,
      page: clip(page, 200),
      url: clip(url, 500),
      when: clip(when, 120),
      screen: (s.width || "?") + "x" + (s.height || "?") + " screen, " +
        (root.innerWidth || "?") + "x" + (root.innerHeight || "?") + " window, " + dpr + " dpr"
    };
  }
  function buildIssue(text, info) {
    info = info || {};
    var clean = clip(String(text || "").replace(/\r\n/g, "\n"), MAX);
    var anna = info.requester === "anna";
    var flat = clean.replace(/\s+/g, " ");
    if (info.audience === "person") return personIssue(clean, flat, info, anna);
    var muse = info.audience === "muse";
    var suggestion = info.tag === "suggestion";
    var title = (anna ? "Anna request: " : "Weston request: ") + (flat.slice(0, 72) || "dashboard request");
    if (flat.length > 72) title += "...";
    var labels = [
      anna ? "anna-request" : "weston-request",
      muse ? "for-muse" : "for-grokbot",
      suggestion ? "suggestion" : "memo"
    ];
    var body = [
      "Page: " + (info.page || "unknown"),
      "URL: " + (info.url || ""),
      "When: " + (info.when || ""),
      "Screen: " + (info.screen || ""),
      "For: " + (muse ? "Muse" : "Grok Bot"),
      suggestion ? "Tag: Suggest a change" : "Tag: Just a note",
      "",
      clean
    ].join("\n");
    return {title: title, body: body, labels: labels, text: clean, suggestion: suggestion, anna: anna, muse: muse, person: ""};
  }
  function personIssue(clean, flat, info, anna) {
    var meta = [
      "Page: " + (info.page || "unknown"),
      "URL: " + (info.url || ""),
      "When: " + (info.when || ""),
      "Screen: " + (info.screen || "")
    ];
    if (anna) {
      var title = "Memo to Weston: " + (flat.slice(0, 72) || "memo");
      if (flat.length > 72) title += "...";
      return {
        title: title,
        body: meta.concat(["", clean]).join("\n"),
        labels: ["anna-request", "memo-to-weston"],
        text: clean,
        person: "Weston",
        confirm: "Memo sent to Weston"
      };
    }
    var preview = flat.slice(0, 80);
    if (flat.length > 80) preview += "...";
    return {
      title: "Memo to Anna",
      body: meta.concat(["", "Public preview only. The full memo is emailed, not stored here.", "", preview]).join("\n"),
      labels: ["weston-request", "memo-to-anna"],
      text: clean,
      person: "Anna",
      confirm: "Memo sent to Anna"
    };
  }
  function buildNav(info) {
    info = info || {};
    var anna = info.requester === "anna";
    var name = clip(info.name, 160) || "destination";
    var lat = coord(info.lat, 90);
    var lon = coord(info.lon, 180);
    var title = (anna ? "Anna nav: " : "Weston nav: ") + name.slice(0, 72);
    var body = [
      "Car: " + (info.car || ""),
      "Destination: " + name,
      "Address: " + (info.address || ""),
      "Lat: " + (lat == null ? "" : lat),
      "Lon: " + (lon == null ? "" : lon),
      "Page: " + (info.page || ""),
      "URL: " + (info.url || ""),
      "When: " + (info.when || ""),
      "Screen: " + (info.screen || "")
    ].join("\n");
    return {
      title: title,
      body: body,
      labels: [anna ? "anna-request" : "weston-request", "nav-request"],
      payload: {
        kind: "nav",
        text: "Navigate " + (info.car || "the car") + " to " + name,
        requester: anna ? "anna" : "weston",
        name: name,
        address: info.address || "",
        lat: lat,
        lon: lon,
        car: info.car || "",
        page: info.page || "",
        url: info.url || "",
        when: info.when || "",
        screen: info.screen || "",
        company: ""
      }
    };
  }
  function coord(v, lim) {
    var n = Number(v);
    if (!isFinite(n) || Math.abs(n) > lim) return null;
    return Math.round(n * 1e5) / 1e5;
  }
  function issueUrl(repo, issue) {
    var body = issue.body;
    var url = "https://github.com/" + safeRepo(repo) + "/issues/new?labels=" +
      encodeURIComponent(issue.labels.join(",")) + "&title=" + encodeURIComponent(issue.title) + "&body=";
    var room = 6000 - url.length;
    if (room < 200) room = 200;
    var encoded = encodeURIComponent(body);
    if (encoded.length > room) {
      var note = "\n\n(truncated for the link)";
      var keep = body.length;
      while (keep > 40 && encodeURIComponent(body.slice(0, keep) + note).length > room) keep -= 40;
      encoded = encodeURIComponent(body.slice(0, keep) + note);
    }
    return url + encoded;
  }
  function mailtoUrl(addr, issue) {
    var body = issue.body;
    if (body.length > 1500) body = body.slice(0, 1500) + "\n\n(truncated for email)";
    return "mailto:" + addr + "?subject=" + encodeURIComponent(issue.title) + "&body=" + encodeURIComponent(body);
  }
  function labelName(label) {
    return label && label.name ? label.name : String(label || "");
  }
  function hasLabel(issue, name) {
    var labels = issue && issue.labels || [];
    var i;
    for (i = 0; i < labels.length; i++) if (labelName(labels[i]) === name) return true;
    return false;
  }
  function statusOf(issue, reply) {
    if (hasLabel(issue, "memo-to-anna")) return {text: "Memo to Anna", cls: "done"};
    if (hasLabel(issue, "memo-to-weston")) return {text: "Memo to Weston", cls: "done"};
    var navDone = hasLabel(issue, "nav-request") && (issue.state === "closed" || reply || issue.comments > 0);
    if (navDone) return {text: "Sent to car navigation", cls: "done"};
    if (issue.state === "closed") return reply ? {text: "Answered", cls: "done"} : {text: "Closed", cls: "shut"};
    return reply ? {text: "Open", cls: "open"} : {text: "Waiting", cls: "wait"};
  }
  function latestReplies(comments, issues) {
    var want = {};
    var i;
    for (i = 0; i < issues.length; i++) want[String(issues[i].number)] = 1;
    var found = {};
    var list = comments || [];
    for (i = 0; i < list.length; i++) {
      var c = list[i];
      var m = String(c.issue_url || "").match(/\/issues\/(\d+)$/);
      var n = m ? m[1] : "";
      if (n && want[n] && !found[n]) found[n] = c;
    }
    return found;
  }
  function shapeMemos(list) {
    var items = (list || []).slice().sort(function (a, b) {
      return String(b.at || b.when || "").localeCompare(String(a.at || a.when || ""));
    });
    var unread = 0;
    var i;
    for (i = 0; i < items.length; i++) if (!items[i].read) unread++;
    return {items: items, unread: unread};
  }
  function postRequest(payload, cb) {
    var cfg = config();
    if (!cfg.endpoint) { cb({ok: false, configured: false}); return; }
    var done = false;
    var timer = root.setTimeout(function () {
      if (done) return;
      done = true;
      cb({ok: false, error: "Timed out"});
    }, 15000);
    root.fetch(cfg.endpoint, {
      method: "POST",
      headers: {"Content-Type": "text/plain;charset=utf-8"},
      body: JSON.stringify(payload)
    }).then(function (r) { return r.text(); }).then(function (raw) {
      if (done) return;
      done = true;
      root.clearTimeout(timer);
      var data = null;
      try { data = JSON.parse(raw); } catch (e) {}
      if (data && data.ok) cb({ok: true, number: data.number});
      else cb({ok: false, error: data && data.error ? String(data.error) : "Refused"});
    }).catch(function () {
      if (done) return;
      done = true;
      root.clearTimeout(timer);
      cb({ok: false, error: "Unreachable"});
    });
  }
  function readIssue(number, cb) {
    var cfg = config();
    var n = parseInt(number, 10);
    if (!n) { cb(null); return; }
    root.fetch("https://api.github.com/repos/" + cfg.repo + "/issues/" + n, {
      headers: {Accept: "application/vnd.github+json"}
    }).then(function (r) {
      if (r.status !== 200) { cb(null); return null; }
      return r.json();
    }).then(function (data) { if (data) cb(data); }).catch(function () { cb(null); });
  }

  root.DashAsk = {
    MAX: MAX,
    POLL_MS: POLL_MS,
    buildIssue: buildIssue,
    buildNav: buildNav,
    issueUrl: issueUrl,
    mailtoUrl: mailtoUrl,
    safeEndpoint: safeEndpoint,
    statusOf: statusOf,
    latestReplies: latestReplies,
    shapeMemos: shapeMemos,
    hasLabel: hasLabel,
    meta: meta,
    postRequest: postRequest,
    readIssue: readIssue
  };

  if (typeof document === "undefined") return;
  if (root.__askUI) return;
  root.__askUI = true;

  var audience = "grok";
  var tag = "note";
  var mode = "write";
  var pollTimer = null;
  var pollDelay = POLL_MS;
  var lastFetch = 0;
  var fetchGen = 0;
  var open = false;

  var btn = document.createElement("button");
  btn.id = "askOpen";
  btn.type = "button";
  btn.textContent = "Ask Grok Bot";

  var dlg = document.createElement("div");
  dlg.id = "askDlg";
  dlg.hidden = true;
  dlg.innerHTML =
    '<div class="ask-panel" role="dialog" aria-modal="true" aria-labelledby="askTitle">' +
      '<div class="ask-top"><div><h2 id="askTitle">Ask Grok Bot</h2>' +
      '<p>Answers show up in this box.</p></div>' +
      '<button type="button" class="ask-x" id="askClose">Close</button></div>' +
      '<p class="ask-lab" id="askWhoLab">Who it&rsquo;s for</p>' +
      '<div class="ask-picks" id="askWho" role="group" aria-label="Who it is for">' +
        '<button type="button" id="askForGrok" data-aud="grok" aria-pressed="true">Grok Bot</button>' +
        '<button type="button" id="askForMuse" data-aud="muse" aria-pressed="false">Muse</button>' +
        '<button type="button" id="askForPerson" data-aud="person" aria-pressed="false"></button></div>' +
      '<p class="ask-lab" id="askKindLab">Memo or a change</p>' +
      '<div class="ask-picks" id="askKind" role="group" aria-label="Memo or a change">' +
        '<button type="button" id="askTagNote" data-tag="note" aria-pressed="true">Just a note</button>' +
        '<button type="button" id="askTagChange" data-tag="suggestion" aria-pressed="false">Suggest a change</button></div>' +
      '<label class="ask-sr" for="askText">Request</label>' +
      '<textarea id="askText" maxlength="2000" autocapitalize="sentences" autocomplete="off" spellcheck="true" placeholder="Type here, or tap the mic on the keyboard and talk."></textarea>' +
      '<div class="ask-hp" aria-hidden="true"><label>Leave blank<input id="askHp" tabindex="-1" autocomplete="off" value=""></label></div>' +
      '<p class="ask-warn">' + "Don't include passwords or account numbers." + '</p>' +
      '<div class="ask-foot"><p class="ask-hint" id="askHint"></p>' +
      '<button type="button" class="ask-send" id="askSend">Send</button></div>' +
      '<div class="ask-thanks" id="askThanks" hidden>Thanks, sent!</div>' +
      '<div class="ask-fall" id="askFall" hidden><p id="askFallMsg"></p>' +
      '<a class="primary" id="askIssue" target="_blank" rel="noopener">Open a prefilled issue</a>' +
      '<a id="askMail" hidden>Email the request</a>' +
      '<button type="button" id="askCopy">Copy request</button>' +
      '<button type="button" id="askBack">Back</button></div>' +
      '<div class="ask-list" id="askList"><h3>Recent requests</h3><div id="askItems"><p class="ask-note">Loading requests…</p></div></div>' +
    '</div>';

  function el(id) { return dlg.querySelector("#" + id); }
  function hintText() {
    var n = el("askText").value.length;
    if (audience === "person") {
      var to = requester === "anna" ? "Weston" : "Anna";
      var extra = requester === "anna"
        ? "Memo to Weston. He gets the full note by email and on GitHub."
        : "Memo to Anna. She gets the full note by email. The public issue keeps only a short preview.";
      return extra + " " + n + " / " + MAX;
    }
    var who = audience === "muse" ? "For Muse." : "For Grok Bot.";
    var kind = tag === "suggestion" ? "Tagged as a change." : "Just a note.";
    return who + " " + kind + " Page, time, and screen size are included. " + n + " / " + MAX;
  }
  function paint() {
    el("askForGrok").setAttribute("aria-pressed", audience === "grok" ? "true" : "false");
    el("askForMuse").setAttribute("aria-pressed", audience === "muse" ? "true" : "false");
    el("askForPerson").textContent = requester === "anna" ? "Send a memo to Weston" : "Send a memo to Anna";
    el("askForPerson").setAttribute("aria-pressed", audience === "person" ? "true" : "false");
    el("askTagNote").setAttribute("aria-pressed", tag === "note" ? "true" : "false");
    el("askTagChange").setAttribute("aria-pressed", tag === "suggestion" ? "true" : "false");
    var person = audience === "person";
    el("askKindLab").style.display = person ? "none" : "";
    el("askKind").style.display = person ? "none" : "";
    el("askSend").textContent = person ? "Send memo" : "Send";
    var hint = el("askHint");
    hint.className = "ask-hint";
    hint.textContent = hintText();
  }
  function showWrite() {
    mode = "write";
    el("askFall").hidden = true;
    el("askText").style.display = "";
    el("askHint").parentNode.style.display = "";
    var picks = dlg.querySelectorAll(".ask-picks");
    var i;
    for (i = 0; i < picks.length; i++) picks[i].style.display = "";
    var labs = dlg.querySelectorAll(".ask-lab");
    for (i = 0; i < labs.length; i++) labs[i].style.display = "";
    paint();
  }
  function fit() {
    var vv = root.visualViewport;
    var top = vv ? vv.offsetTop : 0;
    var h = vv ? vv.height : root.innerHeight;
    dlg.style.top = top + "px";
    dlg.style.height = Math.max(240, h) + "px";
  }
  function currentIssue() {
    var info = meta();
    info.audience = audience;
    info.tag = tag;
    return buildIssue(el("askText").value, info);
  }
  function showFallback(message) {
    mode = "fallback";
    var issue = currentIssue();
    var cfg = config();
    var picks = dlg.querySelectorAll(".ask-picks");
    var labs = dlg.querySelectorAll(".ask-lab");
    var i;
    for (i = 0; i < picks.length; i++) picks[i].style.display = "none";
    for (i = 0; i < labs.length; i++) labs[i].style.display = "none";
    el("askText").style.display = "none";
    el("askHint").parentNode.style.display = "none";
    el("askThanks").hidden = true;
    el("askFall").hidden = false;
    el("askFallMsg").textContent = message;
    el("askIssue").href = issueUrl(cfg.repo, issue);
    var mail = el("askMail");
    if (cfg.mail) {
      mail.hidden = false;
      mail.href = mailtoUrl(cfg.mail, issue);
    } else {
      mail.hidden = true;
      mail.removeAttribute("href");
    }
  }
  function setOpen(on) {
    open = on;
    dlg.hidden = !on;
    btn.hidden = on;
    document.documentElement.classList.toggle("ask-open", on);
    btn.setAttribute("aria-expanded", on ? "true" : "false");
    if (on) {
      if (mode !== "fallback") showWrite();
      fit();
      startPoll();
      setTimeout(function () { if (mode === "write") el("askText").focus(); }, 30);
    } else {
      stopPoll();
      btn.focus();
    }
  }
  function stopPoll() {
    if (pollTimer) root.clearInterval(pollTimer);
    pollTimer = null;
  }
  function armPoll() {
    if (pollTimer) root.clearInterval(pollTimer);
    pollTimer = root.setInterval(refresh, pollDelay);
  }
  function startPoll() {
    pollDelay = POLL_MS;
    armPoll();
    refresh();
  }
  function node(tagName, cls, text) {
    var n = document.createElement(tagName);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function renderList(state) {
    var box = el("askItems");
    while (box.firstChild) box.removeChild(box.firstChild);
    if (!state || state.loading) {
      box.appendChild(node("p", "ask-note", "Loading requests…"));
      return;
    }
    if (state.error) {
      box.appendChild(node("p", "ask-note", state.error));
      return;
    }
    var issues = state.issues || [];
    if (!issues.length) {
      box.appendChild(node("p", "ask-note", "No requests yet."));
      return;
    }
    var i;
    for (i = 0; i < issues.length; i++) {
      var issue = issues[i];
      var reply = state.replies[String(issue.number)];
      var st = statusOf(issue, reply);
      var card = node("article", "ask-item");
      card.appendChild(node("b", "", issue.title || "Request"));
      var metaRow = node("div", "ask-meta");
      metaRow.appendChild(node("span", "ask-st " + st.cls, st.text));
      var who = hasLabel(issue, "memo-to-anna") ? "Memo to Anna" : hasLabel(issue, "memo-to-weston") ? "Memo to Weston" : hasLabel(issue, "for-muse") ? "Muse" : hasLabel(issue, "nav-request") ? "Navigation" : "Grok Bot";
      var kind = hasLabel(issue, "memo-to-anna") || hasLabel(issue, "memo-to-weston") ? "Email" : hasLabel(issue, "nav-request") ? "Navigation" : hasLabel(issue, "suggestion") ? "Suggest a change" : "Just a note";
      metaRow.appendChild(node("span", "", who));
      metaRow.appendChild(node("span", "", kind));
      card.appendChild(metaRow);
      if (reply && reply.body) {
        var body = String(reply.body);
        if (body.length > 500) body = body.slice(0, 500) + "…";
        card.appendChild(node("p", "ask-reply", body));
      } else {
        card.appendChild(node("p", "ask-reply none", "No reply yet."));
      }
      box.appendChild(card);
    }
  }
  function refresh() {
    if (!open && lastFetch) return;
    if (root.document && root.document.hidden) return;
    var now = Date.now();
    if (now - lastFetch < 60000 && el("askItems").childNodes.length) return;
    var cfg = config();
    var label = requester === "anna" ? "anna-request" : "weston-request";
    var base = "https://api.github.com/repos/" + cfg.repo;
    var gen = ++fetchGen;
    lastFetch = now;
    var headers = {Accept: "application/vnd.github+json"};
    root.fetch(base + "/issues?state=all&per_page=8&sort=created&direction=desc&labels=" + encodeURIComponent(label), {headers: headers})
      .then(function (r) {
        var remaining = r.headers && r.headers.get ? Number(r.headers.get("X-RateLimit-Remaining")) : NaN;
        if (!isNaN(remaining) && remaining < 8 && pollDelay !== 300000) {
          pollDelay = 300000;
          if (open) armPoll();
        }
        return r.json().then(function (data) { return {status: r.status, data: data}; });
      })
      .then(function (res) {
        if (gen !== fetchGen) return null;
        if (res.status === 404) {
          renderList({error: "Answers show up here once " + cfg.repo + " is a public repo."});
          return null;
        }
        if (res.status === 403 || res.status === 429) {
          renderList({error: "GitHub is limiting refreshes. This list will try again later."});
          pollDelay = 300000;
          if (open) armPoll();
          return null;
        }
        if (res.status !== 200 || !res.data || typeof res.data.slice !== "function") {
          renderList({error: "Couldn't load requests."});
          return null;
        }
        var issues = [];
        var i;
        for (i = 0; i < res.data.length; i++) {
          var item = res.data[i];
          if (!item || item.pull_request) continue;
          issues.push(item);
        }
        var needComments = false;
        for (i = 0; i < issues.length; i++) if (issues[i].comments > 0) needComments = true;
        if (!needComments) {
          renderList({issues: issues, replies: {}});
          return null;
        }
        return root.fetch(base + "/issues/comments?sort=updated&direction=desc&per_page=30", {headers: headers})
          .then(function (r2) { return r2.json().then(function (data) { return {status: r2.status, data: data, issues: issues}; }); });
      })
      .then(function (res) {
        if (!res || gen !== fetchGen) return;
        var replies = res.status === 200 && res.data && res.data.slice ? latestReplies(res.data, res.issues) : {};
        renderList({issues: res.issues, replies: replies});
      })
      .catch(function () {
        if (gen !== fetchGen) return;
        renderList({error: "Couldn't load requests."});
      });
  }
  function showThanks() {
    mode = "write";
    el("askThanks").textContent = audience === "person"
      ? (requester === "anna" ? "Memo sent to Weston" : "Memo sent to Anna")
      : "Thanks, sent!";
    el("askThanks").hidden = false;
    el("askText").value = "";
    tag = "note";
    audience = "grok";
    paint();
    lastFetch = 0;
    refresh();
  }
  function send() {
    var text = clip(el("askText").value, MAX);
    var hint = el("askHint");
    if (!text) {
      hint.className = "ask-hint bad";
      hint.textContent = "Write a request first.";
      el("askText").focus();
      return;
    }
    if (el("askHp").value) {
      showFallback("Nothing was filed. You can still open it yourself. The GitHub link is public.");
      return;
    }
    var cfg = config();
    var info = meta();
    info.audience = audience;
    info.tag = tag;
    if (!cfg.endpoint) {
      showFallback("This screen can't file the request itself until Weston turns the connection on. Nothing was sent. The link is public, so skip anything private.");
      return;
    }
    var sendBtn = el("askSend");
    sendBtn.disabled = true;
    hint.className = "ask-hint";
    hint.textContent = "Sending…";
    var payload = {
      text: text,
      requester: info.requester,
      audience: info.audience,
      tag: info.tag,
      kind: audience === "person" ? "person" : "",
      page: info.page,
      url: info.url,
      when: info.when,
      screen: info.screen,
      company: ""
    };
    postRequest(payload, function (res) {
      sendBtn.disabled = false;
      if (res.ok) showThanks();
      else if (!res.configured) showFallback("This screen can't file the request itself until Weston turns the connection on. Nothing was sent. The link is public, so skip anything private.");
      else showFallback((res.error ? res.error + " " : "") + "Nothing was filed. The link below is public.");
    });
  }

  document.body.appendChild(btn);
  document.body.appendChild(dlg);
  paint();
  btn.setAttribute("aria-haspopup", "dialog");
  btn.setAttribute("aria-controls", "askDlg");
  btn.setAttribute("aria-expanded", "false");
  btn.addEventListener("click", function () { setOpen(true); });
  el("askClose").addEventListener("click", function () { setOpen(false); });
  el("askBack").addEventListener("click", showWrite);
  el("askForGrok").addEventListener("click", function () { audience = "grok"; paint(); });
  el("askForMuse").addEventListener("click", function () { audience = "muse"; paint(); });
  el("askForPerson").addEventListener("click", function () { audience = "person"; paint(); });
  el("askTagNote").addEventListener("click", function () { tag = "note"; paint(); });
  el("askTagChange").addEventListener("click", function () { tag = "suggestion"; paint(); });
  el("askText").addEventListener("input", function () {
    el("askThanks").hidden = true;
    if (mode === "write") paint();
  });
  el("askSend").addEventListener("click", send);
  el("askCopy").addEventListener("click", function () {
    var issue = currentIssue();
    var text = issue.title + "\n\n" + issue.body;
    var copyBtn = el("askCopy");
    if (root.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { copyBtn.textContent = "Copied"; }, function () { copyBtn.textContent = "Copy didn't work"; });
    } else {
      copyBtn.textContent = "Copy didn't work";
    }
  });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) setOpen(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !dlg.hidden) setOpen(false);
  });
  if (root.visualViewport) {
    root.visualViewport.addEventListener("resize", fit);
    root.visualViewport.addEventListener("scroll", fit);
  }
  root.addEventListener("resize", fit);

  var inboxEl = document.getElementById("memoInbox");
  if (inboxEl) {
    var inboxTitle = requester === "anna" ? "Memos from Weston" : "Memos from Anna";
    inboxEl.innerHTML = '<div class="inbox-top"><h2>' + inboxTitle + '</h2><span class="inbox-badge" id="inboxBadge" hidden></span></div><div class="inbox-list" id="inboxList"></div>';
    renderInbox({setup: true});
    loadInbox();
    root.setInterval(function () { if (!document.hidden) loadInbox(); }, POLL_MS);
  }
  function renderInbox(state) {
    var list = document.getElementById("inboxList");
    var badge = document.getElementById("inboxBadge");
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);
    if (!state || state.setup) {
      if (badge) badge.hidden = true;
      list.appendChild(node("p", "inbox-note", "Memos will appear here once setup is done."));
      return;
    }
    if (state.error) {
      if (badge) badge.hidden = true;
      list.appendChild(node("p", "inbox-note", state.error));
      return;
    }
    var shaped = shapeMemos(state.memos || []);
    if (badge) {
      badge.hidden = shaped.unread < 1;
      badge.textContent = shaped.unread === 1 ? "1 new" : shaped.unread + " new";
    }
    if (!shaped.items.length) {
      list.appendChild(node("p", "inbox-note", "No memos yet."));
      return;
    }
    var i;
    for (i = 0; i < shaped.items.length; i++) {
      (function (memo) {
        var row = node("button", "inbox-item" + (memo.read ? "" : " unread"));
        row.type = "button";
        var meta = node("div", "meta");
        meta.appendChild(node("b", "", memo.from || "Memo"));
        meta.appendChild(node("span", "", memo.label || memo.at || ""));
        if (!memo.read) meta.appendChild(node("span", "inbox-new", "New"));
        row.appendChild(meta);
        row.appendChild(node("p", "", memo.text || ""));
        row.addEventListener("click", function () { if (!memo.read) markRead(memo.id, row); });
        list.appendChild(row);
      })(shaped.items[i]);
    }
  }
  function loadInbox() {
    var cfg = config();
    if (!cfg.endpoint || !cfg.memoKey) { renderInbox({setup: true}); return; }
    var join = cfg.endpoint.indexOf("?") >= 0 ? "&" : "?";
    var url = cfg.endpoint + join + "action=memos&for=" + encodeURIComponent(requester) + "&key=" + encodeURIComponent(cfg.memoKey);
    root.fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      if (!data || data.ok === false) renderInbox({error: "Couldn't load memos."});
      else renderInbox({memos: data.memos || []});
    }).catch(function () { renderInbox({error: "Couldn't load memos."}); });
  }
  function markRead(id, row) {
    var cfg = config();
    if (!cfg.endpoint || !cfg.memoKey || !id) return;
    postRequest({action: "read", id: id, "for": requester, key: cfg.memoKey}, function (res) {
      if (!res || !res.ok) return;
      var pill = row.querySelector(".inbox-new");
      if (pill && pill.parentNode) pill.parentNode.removeChild(pill);
      row.className = "inbox-item";
      loadInbox();
    });
  }
})(typeof window !== "undefined" ? window : this);
