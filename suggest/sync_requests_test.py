"""python3 suggest/sync_requests_test.py"""
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

    def run(args):
        if args[0] == "issue" and args[1] == "list":
            return Result(0, "[]")
        if args[0] == "label":
            return Result(0)
        if args[0] == "issue" and args[1] == "create":
            body_path = args[args.index("--body-file") + 1]
            body = open(body_path, encoding="utf-8").read()
            assert "Queue-Id: 10-1" in body
            assert "--label" in args
            return Result(0, "https://github.com/westonwhite/dash-requests/issues/15\n")
        raise AssertionError(args)

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
    sync.sync_once("https://relay.example/exec", "k", fetch_empty, boom, boom, logs.append)
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

    def run(args):
        if args[0] == "issue" and args[1] == "list":
            return Result(0, json.dumps([{"number": 9, "body": "preview\n\nQueue-Id: 4-2"}]))
        if args[0] == "issue" and args[1] == "create":
            raise AssertionError("duplicate create")
        return Result(0)

    logs = []
    sync.sync_once("https://relay.example/exec", "k", fetch_one, post_json, run, logs.append)
    assert posted[0]["issues"]["4-2"] == 9
    assert logs == ["already filed 4-2 -> #9"]


if __name__ == "__main__":
    test_creates_then_acks()
    test_quiet_and_idempotent()
    print("sync tests ok")
