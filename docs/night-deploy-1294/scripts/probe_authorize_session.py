#!/usr/bin/env python3
"""用会话 cookie 请求 /login/oauth/authorize（禁止跟随跳转），看是否 302 带 code。"""
from __future__ import annotations

import base64
import hashlib
import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from casdoor_admin import call  # noqa: E402

BASE = "https://sso.hbut.site"
ORG = "fdl-users"
SID = "9900000001"
APP = "mini-hbut-lab"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main() -> int:
    pw = os.getenv("LAB_PASSWORD", "")
    status, body = call("/api/get-application", query={"id": f"admin/{APP}"})
    app = json.loads(body).get("data") or {}
    redirect = (app.get("redirectUris") or [""])[1]
    v = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
    c = base64.urlsafe_b64encode(hashlib.sha256(v.encode()).digest()).decode().rstrip("=")
    state = "abc"

    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NoRedirect)

    req = urllib.request.Request(
        BASE + "/api/login",
        data=json.dumps(
            {"application": APP, "organization": ORG, "username": SID, "password": pw, "type": "login"}
        ).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with op.open(req, timeout=25) as resp:
        print("login:", resp.status, json.loads(resp.read().decode()).get("status"))
    print("cookies:", [(x.name, x.domain) for x in jar])

    for path in ("/login/oauth/authorize", "/oauth/authorize"):
        query = {
            "client_id": app.get("clientId"),
            "response_type": "code",
            "redirect_uri": redirect,
            "scope": "openid profile email",
            "state": state,
            "code_challenge": c,
            "code_challenge_method": "S256",
        }
        url = BASE + path + "?" + urllib.parse.urlencode(query)
        req = urllib.request.Request(url, method="GET")
        try:
            with op.open(req, timeout=25) as resp:
                text = resp.read().decode("utf-8", "replace")
                print(f"{path} -> {resp.status} loc={resp.headers.get('Location')} isHtml={'<!doctype html>' in text.lower()}")
        except urllib.error.HTTPError as exc:
            loc = exc.headers.get("Location") or ""
            print(f"{path} -> {exc.code} loc={loc[:250]}")
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(loc).query)
            code = (qs.get("code") or [""])[0]
            if code:
                print("   CODE len=", len(code))
                form = {
                    "grant_type": "authorization_code",
                    "client_id": app["clientId"],
                    "client_secret": app["clientSecret"],
                    "code": code,
                    "redirect_uri": redirect,
                    "code_verifier": v,
                }
                r2 = urllib.request.Request(
                    BASE + "/api/login/oauth/access_token",
                    data=urllib.parse.urlencode(form).encode(),
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    method="POST",
                )
                try:
                    with urllib.request.urlopen(r2, timeout=25) as resp2:
                        tokens = json.loads(resp2.read().decode())
                        print("   tokens:", sorted(tokens.keys()))
                        for label in ("access_token", "id_token"):
                            tok = tokens.get(label) or ""
                            parts = tok.split(".")
                            if len(parts) > 1:
                                seg = parts[1] + "=" * (-len(parts[1]) % 4)
                                claims = json.loads(base64.urlsafe_b64decode(seg.encode()))
                                print(f"   {label} base:", {k: claims.get(k) for k in ("iss", "aud", "sub", "exp")})
                                print(f"   {label} hbut_:", {k: v2 for k, v2 in claims.items() if k.startswith("hbut_")})
                except urllib.error.HTTPError as exc2:
                    print("   token HTTPError", exc2.code, exc2.read()[:400])
                return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
