#!/usr/bin/env python3
"""Casdoor 管理 API 工具（夜间部署用；命令行小工具）。

凭据**只从环境变量读**，不写死：
  CASDOOR_BASE        默认 https://sso.hbut.site
  CASDOOR_ADMIN_CID   app-built-in 的 client_id
  CASDOOR_ADMIN_CSEC  app-built-in 的 client_secret（放在 NAS secrets / 本机文件里，勿入库）

用法：
  python casdoor_admin.py listapps
  python casdoor_admin.py dumpapp <app_name> <out.json>
  python casdoor_admin.py users [org]
"""
from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.getenv("CASDOOR_BASE", "https://sso.hbut.site").rstrip("/")
ADMIN_CID = os.getenv("CASDOOR_ADMIN_CID", "")
ADMIN_CSEC = os.getenv("CASDOOR_ADMIN_CSEC", "")


def _auth_header() -> str:
    if not ADMIN_CID or not ADMIN_CSEC:
        raise SystemExit("缺少 CASDOOR_ADMIN_CID / CASDOOR_ADMIN_CSEC 环境变量")
    raw = f"{ADMIN_CID}:{ADMIN_CSEC}".encode()
    return "Basic " + base64.b64encode(raw).decode()


def call(path: str, *, method: str = "GET", payload=None, query=None, timeout: int = 25):
    url = BASE + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = None
    headers = {"Authorization": _auth_header()}
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:  # noqa: PERF203
        return exc.code, exc.read().decode("utf-8", "replace")


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd = argv[1]
    if cmd == "listapps":
        status, body = call("/api/get-applications", query={"owner": "admin"})
        data = json.loads(body)
        for item in data.get("data") or []:
            print(f"{item['name']:24s} org={item.get('organization'):12s} grantTypes={item.get('grantTypes')}")
        return 0
    if cmd == "dumpapp":
        status, body = call("/api/get-application", query={"id": f"admin/{argv[2]}"})
        app = json.loads(body).get("data") or {}
        with open(argv[3], "w", encoding="utf-8") as fh:
            json.dump(app, fh, ensure_ascii=False, indent=2)
        print(
            json.dumps(
                {
                    "http": status,
                    "fields": len(app),
                    "organization": app.get("organization"),
                    "grantTypes": app.get("grantTypes"),
                    "federatedCredentials": app.get("federatedCredentials"),
                    "tokenFormat": app.get("tokenFormat"),
                    "tokenFields": app.get("tokenFields"),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    if cmd == "users":
        org = argv[2] if len(argv) > 2 else "fdl-users"
        status, body = call("/api/get-users", query={"owner": org})
        rows = (json.loads(body).get("data") or [])
        print("count=", len(rows))
        return 0
    print("unknown cmd", cmd)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
