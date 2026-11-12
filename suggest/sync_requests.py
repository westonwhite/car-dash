#!/usr/bin/env python3
"""File queued car-dashboard requests as GitHub issues.

Run from cron every 2 minutes. Reads RELAY_URL and SYNC_KEY from the
environment. Prints nothing when the queue is empty and the memo channel
is unchanged.

    */2 * * * * RELAY_URL='https://script.google.com/macros/s/DEPLOYMENT/exec' SYNC_KEY='phrase' python3 /path/to/suggest/sync_requests.py

After filing, the same pass writes a sanitized channel.json to
westonwhite/car-dash so Mission Control can show Weston-to-Grok Bot
threads without polling the GitHub API from the car.
"""
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime, timezone

REPO = "westonwhite/dash-requests"
CHANNEL_REPO = "westonwhite/car-dash"
CHANNEL_PATH = "channel.json"
CHANNEL_LIMIT = 30
TEXT_LIMIT = 8000
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
META_PREFIXES = (
    "Page:", "URL:", "When:", "Screen:", "For:", "Tag:",
    "Car:", "Destination:", "Address:", "Lat:", "Lon:",
)
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
KEY_RE = re.compile(r"\b(?:ghp_|github_pat_|gho_|ghu_|ghs_|ghr_|sk-live-|sk-test-|AKIA)[A-Za-z0-9_\-]+")
VIN_RE = re.compile(r"\b[A-HJ-NPR-Z0-9]{17}\b")
ACCOUNT_RE = re.compile(r"\b\d{12,19}\b")
URL_RE = re.compile(r"https?://[^\s]+", re.I)


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


def sanitize_text(text, limit=TEXT_LIMIT):
    text = str(text or "")
    held = []
    def stash(match):
        held.append(match.group(0))
        return "@@URL" + str(len(held) - 1) + "@@"
    text = URL_RE.sub(stash, text)
    text = EMAIL_RE.sub("[redacted]", text)
    text = KEY_RE.sub("[redacted]", text)
    text = VIN_RE.sub("[redacted]", text)
    text = ACCOUNT_RE.sub("[redacted]", text)
    i = 0
    while i < len(held):
        url = EMAIL_RE.sub("[redacted]", held[i])
        url = KEY_RE.sub("[redacted]", url)
        text = text.replace("@@URL" + str(i) + "@@", url)
        i += 1
    text = text.replace("\r\n", "\n").strip()
    if len(text) > limit:
        text = text[:limit].rstrip() + "…"
    return text


def extract_request_text(body):
    lines = str(body or "").replace("\r\n", "\n").split("\n")
    kept = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if stripped.startswith("Queue-Id:"):
            i += 1
            continue
        if not kept:
            if any(stripped.startswith(prefix) for prefix in META_PREFIXES) or stripped == "":
                i += 1
                continue
        kept.append(line)
        i += 1
    while kept and kept[-1].strip() == "":
        kept.pop()
    return "\n".join(kept).strip()


def label_names(issue):
    out = []
    for label in issue.get("labels") or []:
        if isinstance(label, dict):
            name = label.get("name") or ""
        else:
            name = str(label or "")
        if name:
            out.append(name)
    return out


def comment_rows(issue, run):
    comments = issue.get("comments")
    if isinstance(comments, list):
        return comments
    try:
        count = int(comments or 0)
    except (TypeError, ValueError):
        count = 0
    if count <= 0:
        return []
    number = int(issue.get("number") or 0)
    if not number:
        return []
    result = run([
        "api", "repos/%s/issues/%s/comments" % (REPO, number),
        "--paginate", "-H", "Accept: application/vnd.github+json",
    ])
    if result.returncode != 0:
        raise RuntimeError((result.stderr or "gh comments failed").strip())
    try:
        rows = json.loads(result.stdout or "[]")
    except ValueError:
        rows = []
    return rows if isinstance(rows, list) else []


def shape_comment(row):
    if not isinstance(row, dict):
        return None
    if row.get("isMinimized") or row.get("minimized"):
        return None
    text = sanitize_text(row.get("body") or "")
    if not text:
        return None
    at = row.get("createdAt") or row.get("created_at") or ""
    return {"text": text, "at": str(at)}


def shape_thread(issue, run):
    names = label_names(issue)
    if "weston-request" not in names or "for-grokbot" not in names:
        return None
    if "memo-to-anna" in names or "memo-to-weston" in names or "nav-request" in names:
        return None
    number = int(issue.get("number") or 0)
    if not number:
        return None
    text = sanitize_text(extract_request_text(issue.get("body") or ""))
    if not text:
        text = sanitize_text(issue.get("title") or "")
    replies = []
    for row in comment_rows(issue, run):
        item = shape_comment(row)
        if item:
            replies.append(item)
    state = str(issue.get("state") or "open").lower()
    at = issue.get("createdAt") or issue.get("created_at") or ""
    return {
        "number": number,
        "text": text,
        "at": str(at),
        "state": "closed" if state == "closed" else "open",
        "replies": replies,
    }


def list_channel_issues(run):
    result = run([
        "issue", "list", "--repo", REPO,
        "--label", "weston-request", "--label", "for-grokbot",
        "--state", "all", "--limit", str(CHANNEL_LIMIT),
        "--json", "number,title,body,state,createdAt,comments,labels",
    ])
    if result.returncode != 0:
        raise RuntimeError((result.stderr or "gh issue list failed").strip())
    try:
        rows = json.loads(result.stdout or "[]")
    except ValueError:
        rows = []
    return rows if isinstance(rows, list) else []


def build_channel(run, now=None):
    threads = []
    for issue in list_channel_issues(run):
        thread = shape_thread(issue, run)
        if thread:
            threads.append(thread)
    if now is None:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"updated": now, "threads": threads}


def channel_text(data):
    body = {
        "updated": data.get("updated") or "",
        "threads": data.get("threads") or [],
    }
    return json.dumps(body, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"


def read_channel_file(run):
    result = run([
        "api", "repos/%s/contents/%s" % (CHANNEL_REPO, CHANNEL_PATH),
        "-H", "Accept: application/vnd.github+json",
    ])
    if result.returncode != 0:
        err = (result.stderr or "") + (result.stdout or "")
        if "404" in err or "Not Found" in err:
            return None
        raise RuntimeError((result.stderr or "gh channel read failed").strip())
    try:
        payload = json.loads(result.stdout or "{}")
    except ValueError:
        return None
    raw = payload.get("content") or ""
    if isinstance(raw, list):
        return None
    try:
        content = base64.b64decode(raw.replace("\n", "")).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        content = ""
    return {"sha": payload.get("sha") or "", "content": content}


def parse_threads(raw):
    try:
        data = json.loads(raw or "")
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    threads = data.get("threads")
    return threads if isinstance(threads, list) else None


def write_channel_file(run, content, sha):
    payload = {
        "message": "Refresh memo channel",
        "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
        "branch": "main",
    }
    if sha:
        payload["sha"] = sha
    handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False)
    try:
        handle.write(json.dumps(payload))
        handle.close()
        result = run([
            "api", "--method", "PUT",
            "repos/%s/contents/%s" % (CHANNEL_REPO, CHANNEL_PATH),
            "--input", handle.name,
        ])
    finally:
        try:
            os.unlink(handle.name)
        except OSError:
            pass
    if result.returncode != 0:
        raise RuntimeError((result.stderr or "gh channel write failed").strip())
    return result


def publish_channel(run, log=None):
    log = log or (lambda line: print(line))
    data = build_channel(run)
    text = channel_text(data)
    current = read_channel_file(run)
    if current and parse_threads(current.get("content") or "") == data["threads"]:
        return False
    write_channel_file(run, text, current.get("sha") if current else "")
    log("updated %s" % CHANNEL_PATH)
    return True


def sync_once(relay_url, sync_key, fetch_json=None, post_json=None, run=None, log=None):
    fetch_json = fetch_json or default_fetch_json
    post_json = post_json or default_post_json
    run = run or default_run
    log = log or (lambda line: print(line))
    items = relay_get(relay_url, sync_key, fetch_json)
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
    publish_channel(run, log)
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
