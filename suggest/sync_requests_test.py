"""python3 suggest/sync_requests_test.py"""
import base64
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sync_requests as sync


class Result(object):
    def __init__(self, code, out="", err=""):
        self.returncode = code
        self.stdout = out
        self.stderr = err


def encoded_channel(threads, updated="2026-11-10T19:00:00Z"):
    text = sync.channel_text({"updated": updated, "threads": threads})
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def channel_run(threads, sha="abc123", allow_write=False, writes=None):
    encoded = encoded_channel(threads)

    def run(args):
        joined = " ".join(args)
        if args[0] == "issue" and args[1] == "list" and "--json" in args:
            fields = args[args.index("--json") + 1]
            if "createdAt" in fields:
                issues = []
                for thread in threads:
                    issues.append({
                        "number": thread["number"],
                        "title": "Weston request: " + thread["text"][:20],
                        "body": "Page: Miracle Whip · Mission Control\nURL: https://westonwhite.github.io/car-dash/hub.html\nWhen: now\nScreen: 1x1\nFor: Grok Bot\nTag: Just a note\n\n" + thread["text"] + "\n\nQueue-Id: 1-1\n",
                        "state": thread.get("state", "OPEN").upper(),
                        "createdAt": thread.get("at") or "2026-11-10T19:00:00Z",
                        "comments": [{"body": row["text"], "createdAt": row["at"]} for row in thread.get("replies") or []],
                        "labels": [{"name": "weston-request"}, {"name": "for-grokbot"}, {"name": "memo"}],
                    })
                return Result(0, json.dumps(issues))
            return Result(0, "[]")
        if args[0] == "api" and "contents/channel.json" in joined and "--method" not in args:
            return Result(0, json.dumps({"sha": sha, "content": encoded}))
        if args[0] == "api" and "--method" in args and "PUT" in args:
            if not allow_write:
                raise AssertionError("should not write channel")
            if writes is not None:
                writes.append(args)
            return Result(0, "{}")
        if args[0] == "label":
            return Result(0)
        raise AssertionError(args)

    return run


def test_creates_then_acks():
    posted = []

    def fetch_json(url):
        assert "action=queue" in url
        assert "key=sync-phrase" in url
        return {"ok": True, "items": [{
            "id": "10-1",
            "title": "Weston request: clock",
            "body": "Page: hub\n\nMake the clock bigger",
            "labels": ["weston-request", "for-grokbot", "memo"],
        }]}

    def post_json(url, payload):
        posted.append(payload)
        return {"ok": True}

    base_run = channel_run([], allow_write=False)

    def run(args):
        if args[0] == "issue" and args[1] == "list":
            fields = args[args.index("--json") + 1] if "--json" in args else ""
            if "createdAt" in fields:
                return Result(0, "[]")
            return Result(0, "[]")
        if args[0] == "label":
            return Result(0)
        if args[0] == "issue" and args[1] == "create":
            body_path = args[args.index("--body-file") + 1]
            body = open(body_path, encoding="utf-8").read()
            assert "Queue-Id: 10-1" in body
            assert "--label" in args
            return Result(0, "https://github.com/westonwhite/dash-requests/issues/15\n")
        return base_run(args)

    logs = []
    sync.sync_once("https://relay.example/exec", "sync-phrase", fetch_json, post_json, run, logs.append)
    assert posted and posted[0]["action"] == "ack"
    assert posted[0]["issues"]["10-1"] == 15
    assert any(line.startswith("created 10-1") for line in logs)


def test_quiet_and_idempotent():
    def fetch_empty(url):
        return {"ok": True, "items": []}

    def boom(*args, **kwargs):
        raise AssertionError("should not run")

    logs = []
    sync.sync_once("https://relay.example/exec", "k", fetch_empty, boom, channel_run([]), logs.append)
    assert logs == []

    def fetch_one(url):
        return {"ok": True, "items": [{
            "id": "4-2",
            "title": "Memo to Anna",
            "body": "preview\n\nQueue-Id: 4-2",
            "labels": ["weston-request", "memo-to-anna"],
        }]}

    posted = []

    def post_json(url, payload):
        posted.append(payload)
        return {"ok": True}

    inner = channel_run([])

    def run(args):
        if args[0] == "issue" and args[1] == "list":
            fields = args[args.index("--json") + 1] if "--json" in args else ""
            if "createdAt" in fields:
                return Result(0, "[]")
            return Result(0, json.dumps([{"number": 9, "body": "preview\n\nQueue-Id: 4-2"}]))
        if args[0] == "issue" and args[1] == "create":
            raise AssertionError("duplicate create")
        return inner(args)

    logs = []
    sync.sync_once("https://relay.example/exec", "k", fetch_one, post_json, run, logs.append)
    assert posted[0]["issues"]["4-2"] == 9
    assert logs == ["already filed 4-2 -> #9"]


def test_extract_and_sanitize():
    body = (
        "Page: Miracle Whip · Mission Control\n"
        "URL: https://westonwhite.github.io/car-dash/hub.html\n"
        "When: Tue, Nov 10, 2026, 2:02 PM ET (2026-11-10T19:02:11.712Z)\n"
        "Screen: 4163x1171 screen\n"
        "For: Grok Bot\n"
        "Tag: Suggest a change\n"
        "\n"
        "Please turn the memos tab into a two-way channel.\n"
        "\n"
        "Queue-Id: 1794337333724-280\n"
    )
    assert sync.extract_request_text(body) == "Please turn the memos tab into a two-way channel."
    dirty = "write me at weston@example.com VIN 1HGCM82633A004352 card 4111111111111111 token ghp_abcdefghijklmnopqrstuv"
    clean = sync.sanitize_text(dirty)
    assert "weston@example.com" not in clean
    assert "1HGCM82633A004352" not in clean
    assert "4111111111111111" not in clean
    assert "ghp_" not in clean
    assert clean.count("[redacted]") >= 4
    assert "Queue-Id" not in sync.extract_request_text(body)
    url = "https://support.uavionix.com/hc/en-us/articles/51689379867411-AV-Mag-External-Magnetometer-Installation-Configuration-Calibration"
    assert sync.sanitize_text("see " + url + " please") == "see " + url + " please"
    mixed = "see " + url + " and weston@example.com"
    out = sync.sanitize_text(mixed)
    assert url in out
    assert "weston@example.com" not in out


def test_shape_thread_skips_private_kinds_and_builds_replies():
    def run(args):
        raise AssertionError(args)

    skipped = sync.shape_thread({
        "number": 9,
        "body": "preview",
        "labels": ["weston-request", "memo-to-anna"],
        "comments": [],
        "state": "open",
        "createdAt": "2026-11-10T15:00:00Z",
    }, run)
    assert skipped is None

    thread = sync.shape_thread({
        "number": 15,
        "title": "Weston request: AV-Mag",
        "body": "Page: hub\nFor: Grok Bot\n\nPlease absorb the AV-Mag article\n\nQueue-Id: 9-9\n",
        "labels": [{"name": "weston-request"}, {"name": "for-grokbot"}, {"name": "memo"}],
        "comments": [{"body": "Done: saved the key points.", "createdAt": "2026-11-10T19:03:17Z"}],
        "state": "CLOSED",
        "createdAt": "2026-11-10T19:02:44Z",
    }, run)
    assert thread["number"] == 15
    assert thread["text"] == "Please absorb the AV-Mag article"
    assert thread["state"] == "closed"
    assert thread["replies"] == [{"text": "Done: saved the key points.", "at": "2026-11-10T19:03:17Z"}]


def test_publish_writes_only_when_threads_change():
    threads = [{
        "number": 14,
        "text": "Make the memos tab two-way",
        "at": "2026-11-10T19:02:41Z",
        "state": "open",
        "replies": [],
    }]
    writes = []
    logs = []
    # Same threads already on the site: no write.
    assert sync.publish_channel(channel_run(threads, allow_write=False), logs.append) is False
    assert logs == []

    def run_stale(args):
        joined = " ".join(args)
        if args[0] == "issue" and args[1] == "list" and "createdAt" in " ".join(args):
            return Result(0, json.dumps([{
                "number": 14,
                "title": "Weston request: Make the memos tab two-way",
                "body": "Page: hub\nFor: Grok Bot\n\nMake the memos tab two-way\n\nQueue-Id: 1-1\n",
                "state": "OPEN",
                "createdAt": "2026-11-10T19:02:41Z",
                "comments": [{"body": "Built it.", "createdAt": "2026-11-10T19:20:00Z"}],
                "labels": ["weston-request", "for-grokbot"],
            }]))
        if args[0] == "api" and "contents/channel.json" in joined and "--method" not in args:
            return Result(0, json.dumps({
                "sha": "oldsha",
                "content": encoded_channel(threads),
            }))
        if args[0] == "api" and "--method" in args:
            writes.append(args)
            return Result(0, "{}")
        raise AssertionError(args)

    logs = []
    assert sync.publish_channel(run_stale, logs.append) is True
    assert logs == ["updated channel.json"]
    assert writes and "--input" in writes[0]
    path = writes[0][writes[0].index("--input") + 1]
    # temp file is deleted after the call; the write was invoked with --input
    assert any(part.endswith("channel.json") or "contents/channel.json" in part for part in writes[0])


if __name__ == "__main__":
    test_creates_then_acks()
    test_quiet_and_idempotent()
    test_extract_and_sanitize()
    test_shape_thread_skips_private_kinds_and_builds_replies()
    test_publish_writes_only_when_threads_change()
    print("sync tests ok")
