/**
 * Car dashboards POST a request here. This script does not call GitHub.
 * It stores the request in a queue. A machine running suggest/sync_requests.py
 * files the GitHub issue and acks the queue.
 *
 * Setup: suggest/SETUP.md
 *   WESTON_EMAIL, ANNA_EMAIL, MEMO_KEY_WESTON, MEMO_KEY_ANNA, SYNC_KEY
 *
 * Deploy as a web app: execute as me, access Anyone.
 * The page POSTs text/plain so the browser can read the reply.
 */
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
  "memo-to-anna": ["7c3aed", "Memo from Weston to Anna"]
};

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === "memos") return json(listMemos(p["for"], p.key));
  if (p.action === "queue") return json(listQueue(p.key));
  return json({ok: true, ready: true});
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : "";
    var data;
    try { data = JSON.parse(raw); } catch (err) { return json({ok: false, error: "Bad request"}); }
    if (!data || typeof data !== "object") return json({ok: false, error: "Bad request"});
    if (data.action === "read") return json(markMemoRead(data["for"], data.key, data.id));
    if (data.action === "ack") return json(ackQueue(data.key, data.ids, data.issues));
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
    var id = enqueue(issue, info, text);
    try { notifyBot(text, info, id); } catch (errN) {}
    return json({ok: true, queued: true, id: id});
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

function knownLabels(labels) {
  var out = [];
  var i;
  for (i = 0; i < labels.length; i++) {
    if (LABEL_META[labels[i]] && out.indexOf(labels[i]) === -1) out.push(labels[i]);
  }
  return out;
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

/* Wakes Weston's Grok Bot by email for anything it should act on or relay.
   Set script property BOT_NOTIFY_EMAIL to the bot's tagged inbox. Empty means off. */
function notifyBot(text, info, id) {
  var to = clip(PropertiesService.getScriptProperties().getProperty("BOT_NOTIFY_EMAIL"), 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
  var forBot = info.kind === "person" ? info.requester === "anna" : (info.audience === "grok" || info.kind === "nav");
  if (!forBot) return;
  var who = info.requester === "anna" ? "Anna" : "Weston";
  var what = info.kind === "person" ? "memo to Weston" : (info.kind === "nav" ? "nav request" : "request for Grok Bot");
  MailApp.sendEmail(to, "Dash request: " + who + " " + what + " [" + id + "]",
    [who + " sent a " + what + ".", "Page: " + info.page, "Queue-Id: " + id, "", text].join("\n"));
}

function readIndex(name) {
  var raw = PropertiesService.getScriptProperties().getProperty(name);
  var index = [];
  try { index = JSON.parse(raw || "[]"); } catch (e) { index = []; }
  if (!index || typeof index.unshift !== "function") index = [];
  return index;
}

function enqueue(issue, info, text) {
  var props = PropertiesService.getScriptProperties();
  var id = String(new Date().getTime()) + "-" + Math.floor(Math.random() * 1000);
  var labels = knownLabels(issue.labels || []);
  var rec = {
    id: id,
    created: new Date().toISOString(),
    title: clip(issue.title, 240),
    body: String(issue.body || "") + "\n\nQueue-Id: " + id,
    labels: labels,
    kind: info.kind || "",
    requester: info.requester,
    audience: info.audience || "",
    tag: info.tag || "",
    name: info.name || "",
    address: info.address || "",
    lat: info.lat,
    lon: info.lon,
    car: info.car || "",
    page: info.page || "",
    url: info.url || "",
    when: info.when || "",
    screen: info.screen || "",
    text: clip(text, MAX_TEXT),
    synced: false,
    issue: null
  };
  var packed = JSON.stringify(rec);
  if (packed.length > 8500) {
    rec.text = "";
    packed = JSON.stringify(rec);
  }
  props.setProperty("QUEUE_" + id, packed);
  var index = readIndex("QUEUE_INDEX");
  index.unshift(id);
  if (index.length > 40) {
    var drop = index.slice(40);
    index = index.slice(0, 40);
    var i;
    for (i = 0; i < drop.length; i++) props.deleteProperty("QUEUE_" + drop[i]);
  }
  props.setProperty("QUEUE_INDEX", JSON.stringify(index));
  return id;
}

function syncKeyOk(key) {
  var expect = clip(PropertiesService.getScriptProperties().getProperty("SYNC_KEY"), 80);
  return !!expect && clip(key, 80) === expect;
}

function listQueue(key) {
  if (!syncKeyOk(key)) return {ok: false, error: "SYNC_KEY is not set"};
  var props = PropertiesService.getScriptProperties();
  var index = readIndex("QUEUE_INDEX");
  var out = [];
  var i;
  for (i = 0; i < index.length; i++) {
    var raw = props.getProperty("QUEUE_" + index[i]);
    if (!raw) continue;
    var rec = null;
    try { rec = JSON.parse(raw); } catch (e) { rec = null; }
    if (!rec || rec.synced) continue;
    out.push(rec);
  }
  return {ok: true, items: out};
}

function ackQueue(key, ids, issues) {
  if (!syncKeyOk(key)) return {ok: false, error: "SYNC_KEY is not set"};
  if (!ids || typeof ids.length !== "number") return {ok: false, error: "Bad ids"};
  issues = issues || {};
  var props = PropertiesService.getScriptProperties();
  var done = {};
  try { done = JSON.parse(props.getProperty("QUEUE_DONE") || "{}"); } catch (e) { done = {}; }
  if (!done || typeof done !== "object") done = {};
  var i, id, raw, rec, num;
  for (i = 0; i < ids.length; i++) {
    id = String(ids[i] || "");
    if (!/^[0-9]+-[0-9]+$/.test(id)) continue;
    raw = props.getProperty("QUEUE_" + id);
    num = parseInt(issues[id], 10);
    if (raw) {
      try { rec = JSON.parse(raw); } catch (e2) { rec = null; }
      if (rec) {
        rec.synced = true;
        if (num) rec.issue = num;
        props.setProperty("QUEUE_" + id, JSON.stringify(rec));
      }
    }
    if (num) done[id] = num;
  }
  var keys = [];
  for (id in done) if (done.hasOwnProperty(id)) keys.push(id);
  if (keys.length > 80) {
    keys.sort();
    for (i = 0; i < keys.length - 80; i++) delete done[keys[i]];
  }
  props.setProperty("QUEUE_DONE", JSON.stringify(done));
  return {ok: true};
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
  var index = readIndex("MEMOS_INDEX");
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
  var index = readIndex("MEMOS_INDEX");
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

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
