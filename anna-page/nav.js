/* Send a destination to this Tesla.
   The browser cannot set navigation itself. Maps links open immediately.
   Send files a nav-request issue; the screen says "Sent to car navigation"
   once that issue is closed or commented on. */
(function () {
  var dest = null;
  var timer = null;

  function carName() {
    var s = document.querySelector("script[data-car]");
    return (s && s.getAttribute("data-car")) || "Caroline's whip";
  }
  function query(d) {
    var lat = Number(d.lat), lon = Number(d.lon);
    if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return lat + "," + lon;
    return d.address || d.name || "";
  }
  function links(d) {
    var q = encodeURIComponent(query(d));
    return {
      g: "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + q,
      a: "https://maps.apple.com/?dirflg=d&daddr=" + q
    };
  }
  function setState(text, sent) {
    var ids = ["navState", "rnavState"];
    var i;
    for (i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (!el) continue;
      el.textContent = text || "";
      el.className = sent ? "sent" : "";
    }
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }
  function watch(n) {
    stop();
    function tick() {
      if (!window.DashAsk || !DashAsk.readIssue) return;
      DashAsk.readIssue(n, function (issue) {
        if (!issue) return;
        if (issue.state === "closed" || issue.comments > 0) {
          setState("Sent to car navigation", true);
          stop();
        }
      });
    }
    tick();
    timer = setInterval(tick, 60000);
  }
  function watchQueued(id) {
    stop();
    function tick() {
      if (!window.DashAsk || !DashAsk.findByQueueId) return;
      DashAsk.findByQueueId(id, function (issue) {
        if (issue && issue.number) {
          stop();
          watch(issue.number);
        }
      });
    }
    tick();
    timer = setInterval(tick, 60000);
  }
  function buttons(disabled, label) {
    var ids = ["navSend", "rnavSend"];
    var i;
    for (i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (!el) continue;
      el.disabled = disabled;
      if (label) el.textContent = label;
    }
  }
  function fill(d) {
    dest = d;
    var L = links(d);
    var where = d.address ? " · " + d.address : "";
    var sub = "This sends " + carName() + " to " + (d.name || "this place") + where + ". Google Maps and Apple Maps open in this browser. They do not set the car's navigation. That happens after Send, once the request is finished.";
    var title = document.getElementById("navTitle");
    var p = document.getElementById("navSub");
    if (title) title.textContent = d.name || "Send to the car";
    if (p) p.textContent = sub;
    var g = ["navGoogle", "rnavG"], a = ["navApple", "rnavA"], i;
    for (i = 0; i < g.length; i++) {
      var ge = document.getElementById(g[i]);
      var ae = document.getElementById(a[i]);
      if (ge) ge.href = L.g;
      if (ae) ae.href = L.a;
    }
    var details = document.getElementById("navDetails");
    if (details) {
      if (d.url) { details.hidden = false; details.href = d.url; }
      else details.hidden = true;
    }
    buttons(false, "Send to car navigation");
    setState("", false);
  }
  function send() {
    if (!dest || !window.DashAsk || !DashAsk.buildNav || !DashAsk.postRequest) {
      setState("Couldn't queue it. Use Google Maps or Apple Maps.", false);
      return;
    }
    var info = DashAsk.meta ? DashAsk.meta() : {requester: "anna"};
    info.name = dest.name;
    info.address = dest.address || "";
    info.lat = dest.lat;
    info.lon = dest.lon;
    info.car = carName();
    var issue = DashAsk.buildNav(info);
    buttons(true, "Send to car navigation");
    setState("Sending…", false);
    DashAsk.postRequest(issue.payload, function (res) {
      buttons(false);
      if (res && res.ok) {
        setState("Queued for the car. This changes to Sent to car navigation when it's done.", false);
        if (res.number) watch(res.number);
        else if (res.queued && res.id) watchQueued(res.id);
      } else if (res && res.configured === false) {
        setState("Not connected yet, so the car wasn't updated. Use Google Maps or Apple Maps.", false);
      } else {
        setState("Couldn't queue it. Use Google Maps or Apple Maps.", false);
      }
    });
  }

  window.openNav = function (d) {
    fill(d);
    var box = document.getElementById("navbox");
    if (box) box.hidden = false;
  };
  window.armNav = fill;

  document.getElementById("navSend").addEventListener("click", send);
  var rsend = document.getElementById("rnavSend");
  if (rsend) rsend.addEventListener("click", send);
  document.getElementById("navClose").addEventListener("click", function () {
    document.getElementById("navbox").hidden = true;
    stop();
  });
  document.getElementById("navbox").addEventListener("click", function (e) {
    if (e.target.id === "navbox") {
      document.getElementById("navbox").hidden = true;
      stop();
    }
  });
})();
