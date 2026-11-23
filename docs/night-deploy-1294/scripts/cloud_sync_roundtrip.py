#!/usr/bin/env python3
"""云同步真实往返验证（legacy challenge 通道，合成学号）。

流程：ping 拿 challenge → upload 写入合成 payload → download 读回 → 逐字段比对。
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://mini.hbut.site"
SID = "0000000001"  # 明确的合成测试学号（10 位数字，形状合法）
REF = "kv1-main"


def req(method: str, path: str, *, payload=None, headers=None, timeout: int = 40):
    data = None
    hdrs = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode()
        hdrs["Content-Type"] = "application/json"
    hdrs.update(headers or {})
    r = urllib.request.Request(BASE + path, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(body)
        except Exception:
            return exc.code, {"raw": body[:300]}


def main() -> int:
    results = {}

    status, ping = req("GET", f"/api/cloud-sync/ping?secret_ref={REF}")
    print("ping:", status, json.dumps({k: ping.get(k) for k in ("success", "challenge", "challenge_expires_in")}, ensure_ascii=False))
    challenge = ping.get("challenge") or ""
    if not challenge:
        print("FATAL: no challenge")
        return 1
    results["ping"] = status

    nonce = str(int(time.time()))
    payload = {
        "v": 2,
        "sid": SID,
        "ts": int(time.time()),
        "did": "lab-device-1",
        "client": {"version": "1.4.14-night-lab", "platform": "windows"},
        "settings": {"theme": "dark", "night_lab_marker": "2026-11-15-lab", "nonce": nonce},
        "academic": {"semester": "2026-2027-1", "grades": [{"course": "合成课程", "score": 95}]},
        "events": [{"id": "evt-lab-1", "title": "联调事件", "start": "2026-11-15T08:00:00+08:00"}],
    }
    upload_body = {
        "student_id": SID,
        "device_id": "lab-device-1",
        "reason": "night-lab-roundtrip",
        "client_time": int(time.time()),
        "client_version": "1.4.14-night-lab",
        "secret_ref": REF,
        "payload": payload,
        "sections": {"settings": True, "academic": True, "personal_events": True},
    }
    status, up = req(
        "POST",
        "/api/cloud-sync/upload",
        payload=upload_body,
        headers={"x-cloud-sync-challenge": challenge},
    )
    print("upload:", status, json.dumps(up, ensure_ascii=False)[:400])
    results["upload"] = status
    if status != 200 or not up.get("success"):
        print("FATAL: upload failed")
        return 1

    time.sleep(2)  # 规避 download 最小间隔
    status, ping2 = req("GET", f"/api/cloud-sync/ping?secret_ref={REF}")
    challenge2 = ping2.get("challenge") or ""
    status, down = req(
        "GET",
        f"/api/cloud-sync/download?student_id={SID}&secret_ref={REF}&reason=night-lab-roundtrip&device_id=lab-device-1",
        headers={"x-cloud-sync-challenge": challenge2},
    )
    print("download:", status, json.dumps(down, ensure_ascii=False)[:500])
    results["download"] = status
    if status != 200 or not down.get("success"):
        print("FATAL: download failed")
        return 1

    got = (down.get("data") or down.get("payload") or {})
    got_settings = got.get("settings") if isinstance(got, dict) else {}
    got_academic = got.get("academic") if isinstance(got, dict) else {}
    got_events = got.get("events") if isinstance(got, dict) else []
    ok = (
        isinstance(got_settings, dict)
        and got_settings.get("night_lab_marker") == payload["settings"]["night_lab_marker"]
        and got_settings.get("nonce") == nonce
        and isinstance(got_academic, dict)
        and (got_academic.get("grades") or [{}])[0].get("score") == 95
        and isinstance(got_events, list)
        and len(got_events) == 1
        and got_events[0].get("id") == "evt-lab-1"
    )
    print("往返一致:", ok)
    print("  settings.marker:", got_settings.get("night_lab_marker"), "nonce:", got_settings.get("nonce"))
    print("  academic.grades[0].score:", (got_academic.get("grades") or [{}])[0].get("score"))
    print("  events:", json.dumps(got_events, ensure_ascii=False)[:200])
    results["roundtrip_ok"] = ok

    summary = {"student_id": SID, "secret_ref": REF, "results": results,
               "served": {k: down.get(k) for k in ("version", "updated_at", "client_version") if k in down}}
    with open("cloud_sync_roundtrip.json", "w", encoding="utf-8") as fh:
        json.dump(summary, fh, ensure_ascii=False, indent=2)
    print("汇总:", json.dumps(summary, ensure_ascii=False)[:400])
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
