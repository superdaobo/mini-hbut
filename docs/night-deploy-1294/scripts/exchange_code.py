#!/usr/bin/env python3
"""用浏览器拿到的授权码换令牌（PKCE），并验证 claim / 取数据 / 验签。

输入（环境变量）：
  LAB_CODE      授权码
  LAB_VERIFIER  PKCE code_verifier
"""
from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from casdoor_admin import call  # noqa: E402

BASE = "https://sso.hbut.site"
APP = "mini-hbut-lab"
REDIRECT = "http://127.0.0.1:8412/identity/callback"


def jwt_payload(tok: str) -> dict:
    parts = tok.split(".")
    if len(parts) < 2:
        return {}
    seg = parts[1] + "=" * (-len(parts[1]) % 4)
    return json.loads(base64.urlsafe_b64decode(seg.encode()))


def main() -> int:
    code = os.getenv("LAB_CODE", "").strip()
    verifier = os.getenv("LAB_VERIFIER", "").strip()
    if not code or not verifier:
        print("need LAB_CODE / LAB_VERIFIER")
        return 2
    status, body = call("/api/get-application", query={"id": f"admin/{APP}"})
    app = json.loads(body).get("data") or {}

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
            raw = resp.read().decode()
            print("token http=", resp.status)
            tokens = json.loads(raw)
    except urllib.error.HTTPError as exc:
        print("token HTTPError", exc.code, exc.read()[:500])
        return 1
    print("token keys=", sorted(tokens.keys()))
    print("token_type=", tokens.get("token_type"), "expires_in=", tokens.get("expires_in"), "scope=", tokens.get("scope"))

    at = tokens.get("access_token") or ""
    idt = tokens.get("id_token") or ""
    rt = tokens.get("refresh_token") or ""
    for label, tok in (("access_token", at), ("id_token", idt)):
        if not tok:
            print(f"  {label}: <missing>")
            continue
        claims = jwt_payload(tok)
        print(f"  {label} base={json.dumps({k: claims.get(k) for k in ('iss','aud','sub','exp','iat','name','type') if k in claims}, ensure_ascii=False)}")
        print(f"  {label} hbut_*={json.dumps({k: v for k, v in claims.items() if k.startswith('hbut_')}, ensure_ascii=False)}")

    # 取数据
    req = urllib.request.Request(BASE + "/api/userinfo", headers={"Authorization": f"Bearer {at}"})
    ui_ok = None
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            ui = json.loads(resp.read().decode())
            d = ui.get("data") or {}
            print("/api/userinfo http=", resp.status, "status=", ui.get("status"))
            print("  name=", d.get("name"), "owner=", d.get("owner"), "displayName=", d.get("displayName"))
            print("  properties=", json.dumps(d.get("properties") or {}, ensure_ascii=False))
            print("  groups=", d.get("groups"))
            ui_ok = True
    except urllib.error.HTTPError as exc:
        print("/api/userinfo HTTPError", exc.code, exc.read()[:300])
        ui_ok = False

    # JWKS 验签（用 PyJWT + cryptography）
    jwks_ok = None
    try:
        import jwt as pyjwt  # noqa: PLC0415
        from jwt import PyJWKClient  # noqa: PLC0415

        client = PyJWKClient(BASE + "/.well-known/jwks")
        signing_key = client.get_signing_key_from_jwt(at)
        decoded = pyjwt.decode(at, signing_key.key, algorithms=["RS256"], audience=app["clientId"], issuer=BASE)
        print("JWT 验签通过: sub=", decoded.get("sub"), "aud=", decoded.get("aud"), "iss=", decoded.get("iss"))
        jwks_ok = True
    except Exception as exc:  # noqa: BLE001
        print("JWT 验签异常:", type(exc).__name__, str(exc)[:200])
        jwks_ok = False

    summary = {
        "app": APP,
        "clientId": app.get("clientId"),
        "student": "fdl-users/9900000001",
        "accessToken": bool(at),
        "refreshToken": bool(rt),
        "idToken": bool(idt),
        "userinfoOk": ui_ok,
        "jwksVerifyOk": jwks_ok,
        "accessTokenClaims": {k: v for k, v in jwt_payload(at).items() if k.startswith("hbut_") or k in ("iss", "aud", "sub", "exp")},
        "idTokenClaims": {k: v for k, v in jwt_payload(idt).items() if k.startswith("hbut_") or k in ("iss", "aud", "sub", "exp")},
    }
    with open("lab_result.json", "w", encoding="utf-8") as fh:
        json.dump(summary, fh, ensure_ascii=False, indent=2)
    print("=" * 50)
    print("RESULT:", json.dumps(summary, ensure_ascii=False)[:600])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
