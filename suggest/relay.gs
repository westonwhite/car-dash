/**
 * Car dashboards POST a request here. This script files a GitHub issue.
 * The token stays in Script properties, never in the website.
 *
 * Setup: suggest/SETUP.md
 *   GITHUB_TOKEN  issues-only fine-grained PAT for the public requests repo
 *   GITHUB_REPO   owner/name, default westonwhite/dash-requests
 *
 * Deploy as a web app: execute as me, access Anyone.
 * The page POSTs text/plain so the browser can read the reply.
 */
var DEFAULT_REPO = "westonwhite/dash-requests";
var MAX_TEXT = 2000;
var LABEL_META = {
  "anna-request": ["7c3aed", "Request from Anna's page"],
  "weston-request": ["0e7490", "Request from Weston's Mission Control"],
  "for-grokbot": ["1d76db", "For Grok Bot"],
  "for-muse": ["8957e5", "For Muse, Anna's assistant"],
  "memo": ["6b7280", "Just a note"],
  "suggestion": ["0e8a16", "Change requested from the car"],
  "nav-request": ["c2410c", "Send this destination to the car's navigation"],
  "memo-to-weston": ["1d4e89", "Memo from Anna to Weston"],
  "memo-to-anna": ["7c3aed", "Memo from Weston to Anna"],
};

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === "memos") return json(listMemos(p["for"], p.key));
  return json({ok: true, ready: true});
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : "";
    var data;
    try { data = JSON.parse(raw); } catch (err) { return json({ok: false, error: "Bad request"}); }
    if (!data || typeof data !== "object") return json({ok: false, error: "Bad request"});
    if (data.action === "read") return json(markMemoRead(data["for"], data.key, data.id));
    if (data.company) return json({ok: false, error: "Rejected"});
    var text = clip(data.text, MAX_TEXT);
    if (!text) return json({ok: false, error: "Write a request first"});
    if (data.requester !== "anna" && data.requester !== "weston") return json({ok: false, error: "Bad request"});
    if (tooMany()) return json({ok: false, error: "Too many requests. Try again in a little while."});
    var info = {
      kind: data.kind === "nav" ? "nav" : (data.kind === "person" ? "person" : ""),
      requester: data.requester,
      audience: data.audience === "muse" ? "muse" : "grok",
      tag: data.tag === "suggestion" ? "suggestion" : "note",
      name: clip(data.name, 160),
      address: clip(data.address, 300),
      lat: coord(data.lat, 90),
      lon: coord(data.lon, 180),
      car: clip(data.car, 80),
      page: clip(data.page, 200) || "unknown",
      url: clip(data.url, 500),
      when: clip(data.when, 120),
      screen: clip(data.screen, 160)
    };
    var issue = makeIssue(text, info);
    if (info.kind === "person") {
      sendPersonMail(text, info);
      saveMemo({
        to: info.requester === "anna" ? "weston" : "anna",
        from: info.requester === "anna" ? "Anna" : "Weston",
        text: text,
        label: info.when
      });
    }
    var created = createIssue(issue);
    return json({ok: true, number: created.number});
  } catch (err2) {
    return json({ok: false, error: String(err2 && err2.message ? err2.message : err2).slice(0, 180)});
  }
}

function clip(v, n) {
  var s = String(v == null ? "" : v).replace(/^\s+|\s+$/g, "");
  return s.length > n ? s.slice(0, n) : s;
}

function coord(v, lim) {
  var n = Number(v);
  if (!isFinite(n) || Math.abs(n) > lim) return null;
  return Math.round(n * 1e5) / 1e5;
}

function previewText(text, n) {
  var flat = String(text || "").replace(/\s+/g, " ");
  if (flat.length <= n) return flat;
  return flat.slice(0, n) + "...";
}

function makeIssue(text, info) {
  var anna = info.requester === "anna";
  if (info.kind === "person") {
    var meta = [
      "Page: " + info.page,
      "URL: " + info.url,
      "When: " + info.when,
      "Screen: " + info.screen
    ];
    if (anna) {
      var shown = text.replace(/\s+/g, " ");
      var westonTitle = "Memo to Weston: " + (shown.slice(0, 72) || "memo");
      if (shown.length > 72) westonTitle += "...";
      return {
        title: westonTitle,
        labels: ["anna-request", "memo-to-weston"],
        body: meta.concat(["", text]).join("\n")
      };
    }
    return {
      title: "Memo to Anna",
      labels: ["weston-request", "memo-to-anna"],
      body: meta.concat([
        "",
        "Public preview only. The full memo is emailed, not stored here.",
        "",
        previewText(text, 80)
      ]).join("\n")
    };
  }
  if (info.kind === "nav") {
    var place = info.name || "destination";
    var title = (anna ? "Anna nav: " : "Weston nav: ") + place.slice(0, 80);
    return {
      title: title,
      labels: [anna ? "anna-request" : "weston-request", "nav-request"],
      body: [
        "Car: " + (info.car || ""),
        "Destination: " + place,
        "Address: " + (info.address || ""),
        "Lat: " + (info.lat == null ? "" : info.lat),
        "Lon: " + (info.lon == null ? "" : info.lon),
        "Page: " + info.page,
        "URL: " + info.url,
        "When: " + info.when,
        "Screen: " + info.screen,
        "",
        text
      ].join("\n")
    };
  }
  var muse = info.audience === "muse";
  var suggestion = info.tag === "suggestion";
  var flat = text.replace(/\s+/g, " ");
  var title = (anna ? "Anna request: " : "Weston request: ") + (flat.slice(0, 72) || "dashboard request");
  if (flat.length > 72) title += "...";
  return {
    title: title,
    labels: [
      anna ? "anna-request" : "weston-request",
      muse ? "for-muse" : "for-grokbot",
      suggestion ? "suggestion" : "memo"
    ],
    body: [
      "Page: " + info.page,
      "URL: " + info.url,
      "When: " + info.when,
      "Screen: " + info.screen,
      "For: " + (muse ? "Muse" : "Grok Bot"),
      suggestion ? "Tag: Suggest a change" : "Tag: Just a note",
      "",
      text
    ].join("\n")
  };
}

function sendPersonMail(text, info) {
  var anna = info.requester === "anna";
  var props = PropertiesService.getScriptProperties();
  var key = anna ? "WESTON_EMAIL" : "ANNA_EMAIL";
  var to = clip(props.getProperty(key), 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error(key + " is not set");
  }
  var subject = anna ? "Memo from Anna (Caroline's whip)" : "Memo from Weston (Mission Control)";
  var body = [
    anna ? "Memo from Anna" : "Memo from Weston",
    "Page: " + (info.page || ""),
    "When: " + (info.when || ""),
    "",
    text
  ].join("\n");
  MailApp.sendEmail(to, subject, body);
}

function memoKeyOk(who, key) {
  if (who !== "anna" && who !== "weston") return false;
  var expect = PropertiesService.getScriptProperties().getProperty(who === "anna" ? "MEMO_KEY_ANNA" : "MEMO_KEY_WESTON");
  expect = clip(expect, 80);
  key = clip(key, 80);
  return !!expect && key === expect;
}

function saveMemo(memo) {
  var props = PropertiesService.getScriptProperties();
  var id = String(new Date().getTime()) + "-" + Math.floor(Math.random() * 1000);
  var rec = {
    id: id,
    to: memo.to,
    from: memo.from,
    text: clip(memo.text, MAX_TEXT),
    at: new Date().toISOString(),
    label: clip(memo.label, 120),
    read: false
  };
  props.setProperty("MEMO_" + id, JSON.stringify(rec));
  var index = [];
  try { index = JSON.parse(props.getProperty("MEMOS_INDEX") || "[]"); } catch (e) { index = []; }
  if (!index || !index.length && !index.unshift) index = [];
  index.unshift(id);
  if (index.length > 40) {
    var drop = index.slice(40);
    index = index.slice(0, 40);
    var i;
    for (i = 0; i < drop.length; i++) props.deleteProperty("MEMO_" + drop[i]);
  }
  props.setProperty("MEMOS_INDEX", JSON.stringify(index));
}

function listMemos(who, key) {
  if (!memoKeyOk(who, key)) return {ok: false, error: "Memos aren't set up"};
  var props = PropertiesService.getScriptProperties();
  var index = [];
  try { index = JSON.parse(props.getProperty("MEMOS_INDEX") || "[]"); } catch (e2) { index = []; }
  var out = [];
  var i;
  for (i = 0; i < index.length; i++) {
    var raw = props.getProperty("MEMO_" + index[i]);
    if (!raw) continue;
    var rec = null;
    try { rec = JSON.parse(raw); } catch (e3) { rec = null; }
    if (!rec || rec.to !== who) continue;
    out.push({id: rec.id, from: rec.from, text: rec.text, at: rec.at, label: rec.label, read: !!rec.read});
  }
  return {ok: true, memos: out};
}

function markMemoRead(who, key, id) {
  if (!memoKeyOk(who, key)) return {ok: false, error: "Memos aren't set up"};
  if (!/^[0-9]+-[0-9]+$/.test(String(id || ""))) return {ok: false, error: "Bad id"};
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("MEMO_" + id);
  if (!raw) return {ok: false, error: "Missing"};
  var rec = JSON.parse(raw);
  if (!rec || rec.to !== who) return {ok: false, error: "Missing"};
  rec.read = true;
  props.setProperty("MEMO_" + id, JSON.stringify(rec));
  return {ok: true};
}

function tooMany() {
  try {
    var cache = CacheService.getScriptCache();
    if (cache.get("ask-gap")) return true;
    var n = Number(cache.get("ask-hour") || "0");
    if (n >= 12) return true;
    cache.put("ask-gap", "1", 20);
    cache.put("ask-hour", String(n + 1), 3600);
    return false;
  } catch (e) {
    return false;
  }
}

function props() {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty("GITHUB_TOKEN");
  var repo = p.getProperty("GITHUB_REPO") || DEFAULT_REPO;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("GITHUB_REPO is not owner/name");
  return {token: token, repo: repo};
}

function gh(path, method, body, token) {
  var opt = {
    method: method,
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "User-Agent": "dash-ask-relay",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    muteHttpExceptions: true
  };
  if (body) opt.payload = JSON.stringify(body);
  var res = UrlFetchApp.fetch("https://api.github.com" + path, opt);
  var code = res.getResponseCode();
  var parsed = null;
  try { parsed = JSON.parse(res.getContentText() || ""); } catch (e) {}
  return {code: code, data: parsed};
}

function ensureLabel(repo, token, name) {
  var meta = LABEL_META[name];
  if (!meta) return;
  var got = gh("/repos/" + repo + "/labels/" + encodeURIComponent(name), "get", null, token);
  if (got.code === 200) return;
  gh("/repos/" + repo + "/labels", "post", {name: name, color: meta[0], description: meta[1]}, token);
}

function createIssue(issue) {
  var cfg = props();
  var labels = [];
  var i;
  for (i = 0; i < issue.labels.length; i++) {
    if (!LABEL_META[issue.labels[i]] || labels.indexOf(issue.labels[i]) !== -1) continue;
    labels.push(issue.labels[i]);
    ensureLabel(cfg.repo, cfg.token, issue.labels[i]);
  }
  var res = gh("/repos/" + cfg.repo + "/issues", "post", {
    title: issue.title,
    body: issue.body,
    labels: labels
  }, cfg.token);
  if (res.code !== 201 || !res.data || !res.data.number) throw new Error("GitHub returned " + res.code);
  return res.data;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
