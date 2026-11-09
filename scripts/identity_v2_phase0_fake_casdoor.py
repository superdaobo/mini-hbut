#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""P0-8 阶段 0（goal-10 / mini-hbut#1214）联调「假 Casdoor」——OIDC 客户端 stub。

纯标准库（http.server / urllib / hmac / hashlib / base64 / json），无第三方依赖。

职责（p0-8-phase0-e2e-spec.md §4 末段）：

- ``GET /health`` → 200，供一键脚本（identity_v2_phase0_e2e.py）等就绪；
- ``POST /oidc/exchange``（body ``{"code", "new_service_base", "client_id"?}``）：
  1. 调新服务 ``POST {new_service_base}/debug/exchange``（阶段 0 的 dev-only 缝）；
  2. 用 ``--idtoken-secret``（与新服务 env ``MINI_HBUT_DEBUG_IDTOKEN_SECRET`` 同一密钥）
     校验返回的 id_token：
     - 三段 JWT 形状 + base64url 可解码；
     - header 的 ``alg`` 必须为 ``HS256``；
     - HMAC-SHA256 验签（key = ``--idtoken-secret``，比对 ``header.payload`` 的签名）；
     - claims：``iss``/``aud``/``exp``/``sub``/``jti`` 必须存在，且 ``exp > now``；
     - ``sub`` 必须以 ``hbut_`` 开头（身份主体约定）；
  3. 成功 → 200 ``{"ok": true, "claims": {...}, "id_token_fingerprint": "sha256 前 16 位 hex"}``；
     失败 → 200 ``{"ok": false, "error": "<稳定错误码>"}``（上游失败另带 502/400）。

安全约束（与规格同口径）：
- **绝不回显完整 id_token**：响应/日志只允许 claims 与 16 位指纹，防整段令牌
  落进日志/证据；
- 上游（新服务）的 4xx/5xx 或连接失败 → 本进程回 502，只带稳定错误码与上游
  状态码，不回显任何令牌材料。

定位：本程序是阶段 0 的联调 stub（dev 缝），不是生产 Casdoor 客户端。
生产链路为 P2-1 的真实 OIDC（discovery/authorize/token + JWKS）。
"""

from __future__ import annotations

import argparse
import os
import base64
import hashlib
import hmac
import json
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys_stdout = sys.stdout
sys_stderr = sys.stderr

SERVICE_NAME = "phase0-fake-casdoor"
DEFAULT_CLIENT_ID = "phase0-fake-casdoor"
#: 上游交换调用的超时（秒）
UPSTREAM_TIMEOUT_SECONDS = 10.0
#: 指纹长度（sha256 hex 前 16 位）
FINGERPRINT_HEX_LEN = 16


# ── JWT（HS256）校验：纯标准库实现 ─────────────────────────────────────────────

def _b64url_decode(segment: str) -> bytes:
    """base64url 解码（自动补 padding）；失败抛异常。"""
    padded = segment + "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(padded)


def verify_hs256_jwt(token: str, key: bytes) -> tuple[dict | None, str | None]:
    """校验 HS256 JWT。

    返回 ``(claims, None)`` 或 ``(None, 稳定错误码)``：
    ``invalid_shape`` / ``invalid_encoding`` / ``bad_header`` / ``bad_signature`` /
    ``missing_claim`` / ``expired`` / ``bad_sub``。
    """
    if not isinstance(token, str):
        return None, "invalid_shape"
    parts = token.split(".")
    if len(parts) != 3 or not all(parts):
        return None, "invalid_shape"
    header_b64, payload_b64, sig_b64 = parts
    try:
        header_raw = _b64url_decode(header_b64)
        payload_raw = _b64url_decode(payload_b64)
        sig = _b64url_decode(sig_b64)
        header = json.loads(header_raw)
        payload = json.loads(payload_raw)
    except Exception:  # noqa: BLE001 —— 编码/JSON 失败统一归 invalid_encoding
        return None, "invalid_encoding"
    if not isinstance(header, dict) or header.get("alg") != "HS256":
        return None, "bad_header"
    signing_input = (header_b64 + "." + payload_b64).encode("ascii")
    expected = hmac.new(key, signing_input, hashlib.sha256).digest()
    if not hmac.compare_digest(expected, sig):
        return None, "bad_signature"
    if not isinstance(payload, dict):
        return None, "invalid_encoding"
    now = int(time.time())
    for field in ("iss", "aud", "exp", "sub", "jti"):
        if field not in payload:
            return None, "missing_claim"
    exp = payload["exp"]
    if isinstance(exp, bool) or not isinstance(exp, (int, float)) or exp <= now:
        return None, "expired"
    if not str(payload.get("sub", "")).startswith("hbut_"):
        return None, "bad_sub"
    return payload, None


def token_fingerprint(token: str) -> str:
    """id_token 指纹：sha256 hex 前 16 位（唯一允许的令牌投影）。"""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:FINGERPRINT_HEX_LEN]


def is_loopback_base(url: str) -> bool:
    """阶段 0 stub 只接受回环 http(s) base（127.0.0.1 / localhost / [::1]）。"""
    from urllib.parse import urlsplit

    try:
        parts = urlsplit(url)
    except ValueError:
        return False
    if parts.scheme not in ("http", "https"):
        return False
    host = (parts.hostname or "").lower()
    return host in ("127.0.0.1", "localhost", "::1", "0.0.0.0")



def _selftest_sign(payload: dict, key: bytes) -> str:
    """selftest 专用：签一个 HS256 token（与服务端同规范）。"""
    header = {"alg": "HS256", "typ": "JWT"}
    def enc(obj: dict) -> str:
        return base64.urlsafe_b64encode(
            json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        ).decode("ascii").rstrip("=")
    signing_input = f"{enc(header)}.{enc(payload)}"
    sig = hmac.new(key, signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{base64.urlsafe_b64encode(sig).decode('ascii').rstrip('=')}"


def run_selftest() -> int:
    """复核（检查 2 / 红队 B）要求的**拒绝路径回归**：本 stub 的验签器必须拒绝伪造票。

    `--selftest` 由一键脚本在 step 1 调用；任何一条不符合预期即非零退出
    → 让「把验签改成 skip」这类变异**无法**再静默通过。
    """
    import time as _time

    key = b"selftest-key-0123456789abcdef"
    now = int(_time.time())
    good = {"iss": "http://127.0.0.1:1", "aud": "phase0-fake-casdoor", "exp": now + 600,
            "iat": now, "jti": "a" * 32, "sub": "hbut_2510231106", "nonce": "n1"}
    cases: list[tuple[str, str, str | None]] = []

    cases.append(("真票通过", _selftest_sign(good, key), None))
    # alg=none：手工拼 header，去掉签名
    header_none = base64.urlsafe_b64encode(
        json.dumps({"alg": "none", "typ": "JWT"}).encode()
    ).decode().rstrip("=")
    body = base64.urlsafe_b64encode(json.dumps(good).encode()).decode().rstrip("=")
    cases.append(("alg=none 拒绝", f"{header_none}.{body}.", "invalid_shape"))
    # 篡改签名
    tok = _selftest_sign(good, key)
    cases.append(("签名篡改拒绝", tok[:-1] + ("A" if tok[-1] != "A" else "B"), "bad_signature"))
    cases.append(("错钥拒绝", _selftest_sign(good, b"another-key-0123456789abcdef"), "bad_signature"))
    # claims 类
    cases.append(("缺 jti 拒绝", _selftest_sign({k: v for k, v in good.items() if k != "jti"}, key), "missing_claim"))
    cases.append(("过期拒绝", _selftest_sign({**good, "exp": now}, key), "expired"))
    cases.append(("过期（now-1）拒绝", _selftest_sign({**good, "exp": now - 1}, key), "expired"))
    cases.append(("sub 非 hbut_ 拒绝", _selftest_sign({**good, "sub": "2510231106"}, key), "bad_sub"))

    failures = []
    for name, token, expected_err in cases:
        claims, err = verify_hs256_jwt(token, key)
        if expected_err is None:
            ok = err is None and isinstance(claims, dict)
        else:
            ok = err == expected_err
        print(f"  [selftest] {name}: claims={bool(claims)} err={err} -> {'PASS' if ok else 'FAIL'}")
        if not ok:
            failures.append(name)
    if failures:
        print(f"[selftest] FAILED: {failures}", file=sys.stderr)
        return 1
    print(f"[selftest] 全部 {len(cases)} 条符合预期（拒绝路径有回归保护）")
    return 0


def exchange_upstream(new_service_base: str, code: str, client_id: str) -> tuple[int, dict | str]:
    """调新服务 ``POST {base}/debug/exchange``。

    返回 ``(http 状态码, 解析后的 dict 或 错误文本)``；连接失败 → ``(0, 错误文本)``。
    """
    base = new_service_base.rstrip("/")
    url = f"{base}/debug/exchange"
    body = json.dumps({"code": code, "client_id": client_id}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT_SECONDS) as resp:
            raw = resp.read().decode("utf-8", "replace")
            try:
                return int(resp.status), json.loads(raw)
            except Exception:  # noqa: BLE001
                return int(resp.status), raw
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            return int(exc.code), json.loads(raw)
        except Exception:  # noqa: BLE001
            return int(exc.code), raw
    except Exception as exc:  # noqa: BLE001 —— 连接类错误
        return 0, f"{type(exc).__name__}"


# ── HTTP 服务 ─────────────────────────────────────────────────────────────────

def build_handler(idtoken_secret: bytes):
    """构造请求处理器闭包（密钥只进闭包，不进日志/响应）。"""

    class Handler(BaseHTTPRequestHandler):
        # 静默默认日志：本 stub 自己打精简行（避免默认格式带 query）
        def log_message(self, fmt: str, *args) -> None:  # noqa: N802
            sys_stdout_print(f"[fake-casdoor] {self.log_date_time_string()} {fmt % args}")

        # GET /health
        def do_GET(self) -> None:  # noqa: N802
            if self.path.split("?")[0] == "/health":
                self._send_json(200, {"ok": True, "service": SERVICE_NAME})
            else:
                self._send_json(404, {"ok": False, "error": "not_found"})

        # POST /oidc/exchange
        def do_POST(self) -> None:  # noqa: N802
            path = self.path.split("?")[0]
            if path != "/oidc/exchange":
                self._send_json(404, {"ok": False, "error": "not_found"})
                return

            try:
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length) if length > 0 else b""
                body = json.loads(raw.decode("utf-8", "replace") or "{}")
            except Exception:  # noqa: BLE001
                self._send_json(400, {"ok": False, "error": "invalid_request"})
                return
            if not isinstance(body, dict):
                self._send_json(400, {"ok": False, "error": "invalid_request"})
                return

            code = body.get("code")
            new_service_base = body.get("new_service_base")
            client_id = body.get("client_id") or DEFAULT_CLIENT_ID
            if not isinstance(code, str) or not code:
                self._send_json(400, {"ok": False, "error": "invalid_request"})
                return
            if not isinstance(new_service_base, str) or not new_service_base:
                self._send_json(400, {"ok": False, "error": "invalid_request"})
                return
            # 复核建议：阶段 0 stub 只允许打**回环**地址（不接受任意外部 base，
            # 避免这个 dev 工具被拿去当 SSRF 跳板）
            if not is_loopback_base(new_service_base):
                self._send_json(400, {"ok": False, "error": "invalid_request", "detail": "base 必须是回环地址"})
                return

            upstream_status, upstream_body = exchange_upstream(new_service_base, code, client_id)
            if upstream_status == 0:
                self._send_json(
                    502,
                    {
                        "ok": False,
                        "error": "exchange_failed",
                        "detail": "upstream_unreachable",
                        "upstream_status": 0,
                    },
                )
                return
            if not isinstance(upstream_body, dict):
                self._send_json(
                    502,
                    {
                        "ok": False,
                        "error": "exchange_failed",
                        "detail": "upstream_bad_response",
                        "upstream_status": upstream_status,
                    },
                )
                return
            if upstream_status != 200:
                # 上游 400（invalid_grant 等）/ 其它：只回稳定信息，绝不回显令牌
                upstream_error = upstream_body.get("error")
                self._send_json(
                    502,
                    {
                        "ok": False,
                        "error": "exchange_failed",
                        "upstream_status": upstream_status,
                        "upstream_error": str(upstream_error) if upstream_error is not None else None,
                    },
                )
                return

            id_token = upstream_body.get("id_token")
            if not isinstance(id_token, str) or not id_token:
                self._send_json(
                    502,
                    {
                        "ok": False,
                        "error": "exchange_failed",
                        "detail": "missing_id_token",
                        "upstream_status": upstream_status,
                    },
                )
                return

            claims, err = verify_hs256_jwt(id_token, idtoken_secret)
            if err is not None:
                # 校验失败：只回稳定错误码；完整 token 绝不进响应/日志
                self._send_json(200, {"ok": False, "error": err})
                return

            fingerprint = token_fingerprint(id_token)
            self._send_json(200, {"ok": True, "claims": claims, "id_token_fingerprint": fingerprint})

        def _send_json(self, status: int, obj: dict) -> None:
            data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    return Handler


def sys_stdout_print(msg: str) -> None:
    """统一日志出口（stdout 由一键脚本落盘到 p08-logs）。"""
    print(msg, flush=True)


def main() -> int:
    # Windows 控制台默认 GBK：日志口统一 UTF-8（与一键脚本同口径）
    for _stream in (sys_stdout, sys_stderr):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            pass

    parser = argparse.ArgumentParser(description="P0-8 阶段 0 假 Casdoor（OIDC 客户端 stub，纯标准库）")
    parser.add_argument("--selftest", action="store_true", help="只跑验签器自检（拒绝路径回归）后退出")
    parser.add_argument("--port", type=int, default=8943, help="监听端口（默认 8943）")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址（默认 127.0.0.1）")
    parser.add_argument(
        "--idtoken-secret",
        default="",
        help="与新服务 MINI_HBUT_DEBUG_IDTOKEN_SECRET 相同的 HS256 密钥（不回显）；"
        "也可用 env FAKE_CASDOOR_IDTOKEN_SECRET 传入（一键脚本走 env，避免密钥进 argv）",
    )
    args = parser.parse_args()

    if args.selftest:
        return run_selftest()


    # 密钥来源：`--idtoken-secret` 优先，其次 env `FAKE_CASDOOR_IDTOKEN_SECRET`
    # （一键脚本用 env 传，避免密钥出现在 argv/进程列表/证据文件里）
    secret_text = args.idtoken_secret or os.environ.get("FAKE_CASDOOR_IDTOKEN_SECRET", "")
    if not secret_text:
        print("缺少 id_token 密钥：用 --idtoken-secret 或 env FAKE_CASDOOR_IDTOKEN_SECRET", file=sys.stderr)
        return 2
    server = ThreadingHTTPServer((args.host, args.port), build_handler(secret_text.encode("utf-8")))
    print(f"[fake-casdoor] listening on http://{args.host}:{args.port} (DEV ONLY stub)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:  # 手动停止
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
