#!/usr/bin/env python3
"""验证 Casdoor 用 `POST /api/login` + `type=code` 直接拿授权码（PKCE S256）。

Casdoor 的登录接口本身支持 type=code：认证通过后直接返回带 code 的回调 URL，
不需要浏览器交互（T09 实测口径）。
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://sso.hbut.site"
APP = "mini-hbut-lab"
REDIRECT = "http://127.0.0.1:8412/identity/callback"
ORG = "fdl-users"
SID = "9900000001"


def main() -> int:
    import casdoor_admin  # noqa: F401  (确保 sys.path)

    # 读应用凭据
    from casdoor_admin import call

    status, body = call("/api/get-application", query={"id": f"admin/{APP}"})
    app = json.loads(body).get("data") or {}
    print("app:", APP, "clientId_len=", len(app.get("clientId") or ""), "tokenFormat=", app.get("tokenFormat"))

    # 读测试用户密码（Casdoor 存加密，无法读回）→ 用 env 传入
    password = os.getenv("LAB_PASSWORD", "")
    if not password:
        print("需要 LAB_PASSWORD 环境变量")
        return 2

    verifier = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    state = "st" + base64.urlsafe_b64encode(os.urandom(6)).decode().rstrip("=")

    payload = {
        "application": APP,
        "organization": ORG,
        "username": SID,
        "password": password,
        "type": "code",
        "autoSignin": False,
        "clientId": app["clientId"],
        "redirectUri": REDIRECT,
        "responseType": "code",
        "scope": "openid profile email",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    req = urllib.request.Request(
        BASE + "/api/login",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = resp.read().decode()
            print("login(type=code) http=", resp.status)
            print("body=", raw[:700])
            data = json.loads(raw)
    except urllib.error.HTTPError as exc:
        print("HTTPError", exc.code, exc.read()[:600])
        return 1

    if data.get("status") != "ok":
        print("FAILED status=", data.get("status"), "msg=", data.get("msg"))
        return 1
    url = str(data.get("data") or "")
    qs = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    code = (qs.get("code") or [""])[0]
    print("redirect url present=", bool(url), "code_len=", len(code), "state_ok=", (qs.get("state") or [""])[0] == state)
    if not code:
        print("no code in:", url[:300])
        return 1

    # 换令牌
    form = {
        "grant_type": "authorization_code",
        "client_id": app["clientId"],
        "client_secret": app["clientSecret"],
        "code": code,
        "redirect_uri": REDIRECT,
        "code_verifier": verifier,
    }
    req = urllib.request.Request(
        BASE + "/api/login/oauth/access_token",
        data=urllib.parse.urlencode(form).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            tokens = json.loads(resp.read().decode())
            print("token http=", resp.status, "keys=", sorted(tokens.keys()))
    except urllib.error.HTTPError as exc:
        print("token HTTPError", exc.code, exc.read()[:600])
        return 1

    def payload_of(tok: str) -> dict:
        parts = tok.split(".")
        if len(parts) < 2:
            return {}
        seg = parts[1] + "=" * (-len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(seg.encode()))

    for label in ("access_token", "id_token"):
        tok = tokens.get(label) or ""
        if not tok:
            print(f"  {label}: <missing>")
            continue
        claims = payload_of(tok)
        base = {k: claims.get(k) for k in ("iss", "aud", "sub", "exp", "iat", "name", "type") if k in claims}
        print(f"  {label} base={json.dumps(base, ensure_ascii=False)}")
        print(f"  {label} hbut_*={json.dumps({k: v for k, v in claims.items() if k.startswith('hbut_')}, ensure_ascii=False)}")

    # 取数据
    at = tokens.get("access_token") or ""
    req = urllib.request.Request(BASE + "/api/userinfo", headers={"Authorization": f"Bearer {at}"})
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            ui = json.loads(resp.read().decode())
            d = ui.get("data") or {}
            print("  /api/userinfo http=", resp.status, "status=", ui.get("status"))
            print("    name=", d.get("name"), "owner=", d.get("owner"), "displayName=", d.get("displayName"))
            print("    properties=", json.dumps(d.get("properties") or {}, ensure_ascii=False))
    except urllib.error.HTTPError as exc:
        print("  /api/userinfo HTTPError", exc.code, exc.read()[:300])

    out = {
        "app": APP,
        "clientId": app.get("clientId"),
        "student": f"{ORG}/{SID}",
        "accessTokenPresent": bool(at),
        "refreshTokenPresent": bool(tokens.get("refresh_token")),
        "idTokenPresent": bool(tokens.get("id_token")),
    }
    with open("lab_result.json", "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
