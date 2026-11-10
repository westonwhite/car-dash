/* node suggest/memo.test.js */
var assert = require("assert");
var ask = require("../suggest.js").DashAsk;

var annaInfo = {
  requester: "anna",
  audience: "grok",
  tag: "suggestion",
  page: "Anna · Caroline's whip",
  url: "https://westonwhite.github.io/anna/",
  when: "Tue, Nov 10, 2026, 10:15 AM ET (2026-11-10T15:15:00.000Z)",
  screen: "1920x1200 screen, 1920x1200 window, 1 dpr"
};
var change = ask.buildIssue("  Make the clock bigger\r\nplease  ", annaInfo);
assert.ok(change.title.indexOf("Anna request: Make the clock bigger please") === 0);
assert.deepStrictEqual(change.labels, ["anna-request", "for-grokbot", "suggestion"]);
assert.ok(change.body.indexOf("Page: Anna · Caroline's whip") >= 0);
assert.ok(change.body.indexOf("For: Grok Bot") >= 0);
assert.ok(change.body.indexOf("Tag: Suggest a change") >= 0);
assert.ok(change.body.indexOf("Screen: 1920x1200 screen") >= 0);
assert.ok(change.text.indexOf("Make the clock bigger\nplease") === 0);

var weston = ask.buildIssue("Bring the dog bed", {
  requester: "weston",
  audience: "muse",
  tag: "note",
  page: "Miracle Whip · Mission Control",
  url: "https://westonwhite.github.io/car-dash/hub.html",
  when: annaInfo.when,
  screen: "1280x800 screen, 1280x800 window, 1 dpr"
});
assert.ok(weston.title.indexOf("Weston request: Bring the dog bed") === 0);
assert.deepStrictEqual(weston.labels, ["weston-request", "for-muse", "memo"]);
assert.ok(weston.body.indexOf("For: Muse") >= 0);
assert.ok(weston.body.indexOf("Tag: Just a note") >= 0);
assert.ok(weston.body.indexOf("Page: Miracle Whip · Mission Control") >= 0);

var unknown = ask.buildIssue("hi", {requester: "someone", audience: "other", tag: "nope"});
assert.deepStrictEqual(unknown.labels, ["weston-request", "for-grokbot", "memo"]);
assert.ok(unknown.title.indexOf("Weston request: ") === 0);

var long = new Array(80).join("word ");
var clipped = ask.buildIssue(long, annaInfo);
assert.ok(clipped.text.length <= ask.MAX);
assert.ok(/\.\.\.$/.test(clipped.title));
assert.ok(clipped.title.indexOf("Anna request: ") === 0);

var url = ask.issueUrl("westonwhite/dash-requests", change);
assert.ok(url.indexOf("https://github.com/westonwhite/dash-requests/issues/new?") === 0);
assert.ok(url.indexOf("labels=" + encodeURIComponent("anna-request,for-grokbot,suggestion")) >= 0);
assert.ok(url.length < 7000);

var huge = ask.buildIssue(new Array(2001).join("é"), annaInfo);
var hugeUrl = ask.issueUrl("not a repo", huge);
assert.ok(hugeUrl.indexOf("https://github.com/westonwhite/dash-requests/issues/new?") === 0);
assert.ok(hugeUrl.length < 7000);
assert.ok(decodeURIComponent(hugeUrl.split("body=")[1]).indexOf("truncated for the link") >= 0);

var mail = ask.mailtoUrl("weston@example.com", weston);
assert.ok(mail.indexOf("mailto:weston@example.com?subject=") === 0);

assert.strictEqual(ask.safeEndpoint(""), "");
assert.strictEqual(ask.safeEndpoint("http://example.com/hook"), "");
assert.strictEqual(ask.safeEndpoint("https://script.google.com/macros/s/abc/exec"), "https://script.google.com/macros/s/abc/exec");

var openReply = ask.statusOf({state: "open"}, null);
assert.strictEqual(openReply.text, "Waiting");
var answered = ask.statusOf({state: "closed"}, {body: "Done"});
assert.strictEqual(answered.text, "Answered");
assert.strictEqual(ask.statusOf({state: "open"}, {body: "Looking"}).text, "Open");

var issues = [{number: 4, comments: 1}, {number: 9, comments: 0}];
var replies = ask.latestReplies([
  {issue_url: "https://api.github.com/repos/westonwhite/dash-requests/issues/4", body: "newest"},
  {issue_url: "https://api.github.com/repos/westonwhite/dash-requests/issues/4", body: "older"},
  {issue_url: "https://api.github.com/repos/westonwhite/dash-requests/issues/2", body: "other"}
], issues);
assert.strictEqual(replies["4"].body, "newest");
assert.strictEqual(replies["9"], undefined);

assert.strictEqual(ask.statusOf({state: "open", labels: [{name: "nav-request"}], comments: 1}, null).text, "Sent to car navigation");
assert.strictEqual(ask.statusOf({state: "closed", labels: ["nav-request"], comments: 0}, null).text, "Sent to car navigation");
assert.strictEqual(ask.statusOf({state: "open", labels: [{name: "nav-request"}], comments: 0}, null).text, "Waiting");

var nav = ask.buildNav({
  requester: "anna",
  name: "Weston",
  address: "",
  lat: 28.14612,
  lon: -82.75699,
  car: "Caroline's whip",
  page: "Anna · Caroline's whip",
  url: "https://westonwhite.github.io/anna/",
  when: annaInfo.when,
  screen: annaInfo.screen
});
assert.strictEqual(nav.title, "Anna nav: Weston");
assert.deepStrictEqual(nav.labels, ["anna-request", "nav-request"]);
assert.ok(nav.body.indexOf("Car: Caroline's whip") >= 0);
assert.ok(nav.body.indexOf("Lat: 28.14612") >= 0);
assert.ok(nav.body.indexOf("Lon: -82.75699") >= 0);
assert.strictEqual(nav.payload.kind, "nav");
assert.strictEqual(nav.payload.requester, "anna");
var badNav = ask.buildNav({requester: "weston", name: "Home", lat: "nope", lon: 999, car: "the miracle whip"});
assert.strictEqual(badNav.payload.lat, null);
assert.strictEqual(badNav.payload.lon, null);
assert.ok(badNav.title.indexOf("Weston nav: ") === 0);

assert.strictEqual(ask.POLL_MS, 120000);

var toWeston = ask.buildIssue("Bring the dog bed please", {
  requester: "anna",
  audience: "person",
  page: "Anna · Caroline's whip",
  url: "https://westonwhite.github.io/anna/",
  when: annaInfo.when,
  screen: annaInfo.screen
});
assert.strictEqual(toWeston.confirm, "Memo sent to Weston");
assert.deepStrictEqual(toWeston.labels, ["anna-request", "memo-to-weston"]);
assert.ok(toWeston.title.indexOf("Memo to Weston: Bring the dog bed please") === 0);
assert.ok(toWeston.body.indexOf("Bring the dog bed please") >= 0);

var longMemo = new Array(30).join("private note ");
var toAnna = ask.buildIssue(longMemo, {
  requester: "weston",
  audience: "person",
  page: "Miracle Whip · Mission Control",
  url: "https://westonwhite.github.io/car-dash/hub.html",
  when: annaInfo.when,
  screen: annaInfo.screen
});
assert.strictEqual(toAnna.title, "Memo to Anna");
assert.strictEqual(toAnna.confirm, "Memo sent to Anna");
assert.deepStrictEqual(toAnna.labels, ["weston-request", "memo-to-anna"]);
assert.ok(toAnna.body.indexOf("Public preview only") >= 0);
assert.ok(toAnna.body.indexOf(longMemo) < 0);
var previewLine = toAnna.body.split("\n").pop();
assert.ok(previewLine.length <= 83);
assert.strictEqual(ask.statusOf({state: "open", labels: [{name: "memo-to-anna"}], comments: 0}, null).text, "Memo to Anna");
assert.strictEqual(ask.statusOf({state: "open", labels: ["memo-to-weston"], comments: 0}, null).text, "Memo to Weston");

var fs = require("fs");
var src = fs.readFileSync(__dirname + "/../suggest.js", "utf8") +
  fs.readFileSync(__dirname + "/../ask-config.js", "utf8") +
  fs.readFileSync(__dirname + "/relay.gs", "utf8");
assert.ok(!/ghp_|github_pat_|gho_|ghu_|ghs_|ghr_/.test(src));
assert.ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(src));
assert.ok(src.indexOf("Don't include passwords or account numbers.") >= 0);
assert.ok(src.indexOf("anna-request") >= 0);
assert.ok(src.indexOf("weston-request") >= 0);
assert.ok(src.indexOf("for-grokbot") >= 0);
assert.ok(src.indexOf("for-muse") >= 0);

console.log("ask tests ok");
