#!/usr/bin/env python3
"""部署后冒烟：对 mini.hbut.site 打一批只读/幂等端点，记录状态码与关键字段。"""
from __future__ import annotations

import json
import urllib.error
import urllib.request

BASE = "https://mini.hbut.site"
CHECKS = [
    ("GET", "/health", None),
    ("GET", "/health/deps", None),
    ("GET", "/api/cloud-sync/ping?secret_ref=kv1-main", None),
    ("GET", "/api/game-rank/ping", None),
    ("GET", "/api/grade-distribution/health", None),
    ("GET", "/api/game-platform/v1/meta", None),
    ("GET", "/api/forum/categories", None),
    ("GET", "/api/forum/threads?limit=2", None),
    ("GET", "/api/usage-stats/ping?secret_ref=kv1-main", None),
    ("GET", "/openapi.json", None),
    # 身份端点：main 只保留设备链，未配置内部令牌 → 期望 404/401，不是 500
    ("POST", "/identity/device/verify", {"student_id": "9900000001", "device_id": "lab", "timestamp": 1, "signature": "x"}),
    ("POST", "/identity/bootstrap", {"student_id": "9900000001", "proof": {}}),
    ("GET", "/identity/jwks.json", None),
]


def call(method: str, path: str, payload):
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8", "replace")
            return resp.status, body
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001
        return -1, f"{type(exc).__name__}: {exc}"


def main() -> int:
    results = []
    for method, path, payload in CHECKS:
        status, body = call(method, path, payload)
        snippet = body[:160].replace("\n", " ")
        print(f"{status:>4} {method:6s} {path}  ::  {snippet}")
        results.append({"method": method, "path": path, "status": status, "snippet": snippet})
    with open("smoke_after.json", "w", encoding="utf-8") as fh:
        json.dump(results, fh, ensure_ascii=False, indent=2)
    bad = [r for r in results if r["status"] >= 500]
    print("=" * 60)
    print("5xx 项:", [f"{r['method']} {r['path']}" for r in bad] or "none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
