#!/usr/bin/env python3
"""File queued car-dashboard requests as GitHub issues.

Run from cron every 2 minutes. Reads RELAY_URL and SYNC_KEY from the
environment. Prints nothing when the queue is empty.

    */2 * * * * RELAY_URL='https://script.google.com/macros/s/DEPLOYMENT/exec' SYNC_KEY='phrase' python3 /path/to/suggest/sync_requests.py
"""
import json
import os
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

REPO = "westonwhite/dash-requests"
LABELS = {
    "anna-request": ("7c3aed", "Request from Anna's page"),
    "weston-request": ("0e7490", "Request from Weston's Mission Control"),
    "for-grokbot": ("1d76db", "For Grok Bot"),
    "for-muse": ("8957e5", "For Muse, Anna's assistant"),
    "memo": ("6b7280", "Just a note"),
    "suggestion": ("0e8a16", "Change requested from the car"),
    "nav-request": ("c2410c", "Send this destination to the car's navigation"),
    "memo-to-weston": ("1d4e89", "Memo from Anna to Weston"),
    "memo-to-anna": ("7c3aed", "Memo from Weston to Anna"),
}


def relay_get(url, key, fetch_json):
    join = "&" if "?" in url else "?"
    target = url + join + urllib.parse.urlencode({"action": "queue", "key": key})
    data = fetch_json(target)
    if not isinstance(data, dict) or data.get("ok") is False:
        raise RuntimeError(data.get("error") if isinstance(data, dict) else "queue request failed")
    items = data.get("items") or []
    return items if isinstance(items, list) else []


def default_fetch_json(url):
    with urllib.request.urlopen(url, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def default_post_json(url, payload):
    raw = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=raw, headers={"Content-Type": "text/plain;charset=utf-8"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def default_run(args):
    return subprocess.run(["gh"] + args, check=False, capture_output=True, text=True)


def queue_marker(item_id):
    return "Queue-Id: " + str(item_id)


def find_existing(item_id, run):
    result = run(["issue", "list", "--repo", REPO, "--state", "all", "--limit", "40", "--json", "number,body"])
    if result.returncode != 0:
        raise RuntimeError((result.stderr or "gh issue list failed").strip())
    try:
        rows = json.loads(result.stdout or "[]")
    except ValueError:
        rows = []
    marker = queue_marker(item_id)
    for row in rows:
        if marker in str(row.get("body") or ""):
            return int(row["number"])
    return None


def ensure_labels(names, run):
    for name in names:
        meta = LABELS.get(name)
        if not meta:
            continue
        color, description = meta
        result = run([
            "label", "create", name, "--repo", REPO, "--force",
            "--color", color, "--description", description,
        ])
        if result.returncode != 0:
            raise RuntimeError((result.stderr or "gh label create failed").strip())


def create_issue(item, run):
    labels = [name for name in (item.get("labels") or []) if name in LABELS]
    ensure_labels(labels, run)
    body = str(item.get("body") or "")
    marker = queue_marker(item.get("id"))
    if marker not in body:
        body = body.rstrip() + "\n\n" + marker + "\n"
    handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False)
    try:
        handle.write(body)
        handle.close()
        args = ["issue", "create", "--repo", REPO, "--title", str(item.get("title") or "Dashboard request"), "--body-file", handle.name]
        for name in labels:
            args.extend(["--label", name])
        result = run(args)
    finally:
        try:
            os.unlink(handle.name)
        except OSError:
            pass
    if result.returncode != 0:
        raise RuntimeError((result.stderr or "gh issue create failed").strip())
    parts = (result.stdout or "").strip().rstrip("/").split("/")
    number = int(parts[-1]) if parts and parts[-1].isdigit() else 0
    if not number:
        raise RuntimeError("gh issue create did not print an issue number")
    return number


def ack(url, key, issues, post_json):
    payload = {"action": "ack", "key": key, "ids": list(issues.keys()), "issues": issues}
    data = post_json(url, payload)
    if not isinstance(data, dict) or data.get("ok") is False:
        raise RuntimeError(data.get("error") if isinstance(data, dict) else "ack failed")


def sync_once(relay_url, sync_key, fetch_json=None, post_json=None, run=None, log=None):
    fetch_json = fetch_json or default_fetch_json
    post_json = post_json or default_post_json
    run = run or default_run
    log = log or (lambda line: print(line))
    items = relay_get(relay_url, sync_key, fetch_json)
    if not items:
        return 0
    done = {}
    for item in items:
        item_id = str(item.get("id") or "")
        if not item_id:
            continue
        number = find_existing(item_id, run)
        if number is None:
            number = create_issue(item, run)
            log("created %s -> #%s" % (item_id, number))
        else:
            log("already filed %s -> #%s" % (item_id, number))
        done[item_id] = number
    if done:
        ack(relay_url, sync_key, done, post_json)
    return 0


def main(argv):
    relay_url = os.environ.get("RELAY_URL", "").strip()
    sync_key = os.environ.get("SYNC_KEY", "").strip()
    if not relay_url or not sync_key:
        print("RELAY_URL and SYNC_KEY are required", file=sys.stderr)
        return 1
    try:
        return sync_once(relay_url, sync_key)
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
