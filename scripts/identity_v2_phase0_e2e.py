#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""P0-8 阶段 0 四方联调一键脚本（p0-8-phase0-e2e-spec.md §4，纯标准库）。

用法（一条命令，退出码 0/1）：

  python scripts/identity_v2_phase0_e2e.py --root . --ocr-dir <ocr-service 检出> \
      --sa-dir <mini-hbut-student-auth 检出> \
      [--seed-hex <64位hex>] [--keep] [--json-out docs/architecture/identity-v2-phase0-evidence.json]
      [--cargo-target-dir <主仓预热 target>] [--base-port 8941] [--log-dir D:/ct_scratch/p08-logs]
      [--device-id phase0-dev-0001] [--student-id 2510234567] [--student-name 张三]
      [--health-timeout 60] [--no-app --preset-proof <proof.json>]

流程（11 步，失败即 [RESULT] FAIL + 退出 1；每步打印 [step N] 与原始响应体）：

  1.  端口探测（8941 ocr / 8942 新服务 / 8943 假 Casdoor；被占则 +10）+ 启动 3 个服务
      + 等 /health 200（超时 60s，stdout/stderr 落盘 <log-dir>/*.log）；
  2.  App 签名：cargo run --example identity_v2_dev_sign（复用 App 的 identity::v2_signature；
      默认必须真跑；cargo 不可用时 --no-app + --preset-proof 允许预置证明文件）；
      解析 JSON、断言 self_check_ok=true、并用纯 Python 重算 canonical 做跨语言一致性断言；
  3.  未登记失败路径：POST 新服务 /debug/verify（该 device_id 尚未登记）→ 必须 fail-closed；
      根因 reason（device_not_registered）在 ocr 层直接断言（见下方「规格偏差说明」）；
  4.  登记：POST ocr /identity/debug/device/register（JWK 来自 App 证明）→ 200 ok:true；
  5.  验签成功：POST 新服务 /debug/verify（完整证明）→ 200 ok:true；
  6.  重放失败路径：同一证明再发一次 → **必须命中 nonce_replayed**（ocr 层直接断言）；
  7.  授权码：POST 新服务 /debug/authorize（**新证明/新 nonce**）→ 200 且 code 匹配 ^dbg_[0-9a-f]{32}$；
  8.  假 Casdoor 换令牌：POST 假 /oidc/exchange（假调新服务 /debug/exchange 并 HS256 验签）
      → 200 {"ok":true,"claims":…,"id_token_fingerprint":…}；
  9.  错签失败路径：把签名改一个 base64url 字符（**新证明/新 nonce**）→ 必须 signature_invalid；
  10. 设备列表：GET 新服务 /debug/devices → 200，条目恰好 10 字段、学号掩码；
  11. 汇总：写 --json-out（每步命令/状态码/响应体/断言/时间戳），打印 [RESULT] PASS/FAIL；
      --keep 时不杀进程（默认杀）。

规格偏差说明（诚实记录，见证据文档）：
  新服务 /debug/verify 是透传层，其冻结实现（tests/test_debug_routes.py:1263）把上游 ocr 的
  401 固定映射为 401 {"error":"not_verified","reason":"upstream_unauthorized"}；因此
  规格 §4 步骤 3/6/9 里的根因 reason（device_not_registered / nonce_replayed /
  signature_invalid）只可能在 **ocr 层**直接观察到。本脚本在 SA 层断言「fail-closed」
  （401 not_verified 或 200 ok:false 均接受），并在 ocr 层对同一证明直接断言根因 reason，
  两处都过才算该步通过——不放宽、不跳过。

幂等：每次运行新 nonce / 重新探测端口 / 全新服务进程（内存存储），不依赖上一次状态。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

#: 响应体打印截断长度（规格：800 字符）
BODY_PREVIEW_LIMIT = 800
#: 失败时完整打印响应体（不截断）
B64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
CODE_RE = re.compile(r"^dbg_[0-9a-f]{32}$")
MASKED_RE = re.compile(r"^\d{4}\*\*\*$")
#: 默认种子（规格固定值，保证可复现）
DEFAULT_SEED_HEX = "07" * 32
#: 设备列表固定字段数（规格 §4 步骤 10）
DEVICE_FIELDS_EXPECTED = 10


# ── 小工具 ────────────────────────────────────────────────────────────────────

def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def normalize_path(path: str) -> str:
    """归一化路径：兼容 Git-Bash MSYS 形式 ``/d/...`` 与 Windows 形式 ``D:\\...``。"""
    if re.match(r"^[a-zA-Z]:[\\/]", path):
        return path
    if re.match(r"^/[a-zA-Z](/|$)", path):  # MSYS 形式 /d/foo
        return path[1].upper() + ":" + path.replace("/", "\\")
    return path


def snippet(text: str, limit: int = BODY_PREVIEW_LIMIT) -> str:
    if text is None:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit] + f" …（截断，共 {len(text)} 字符）"


def http_request(method: str, url: str, payload: dict | None = None, timeout: float = 15.0):
    """发一个 HTTP 请求，返回 (状态码|None, 响应体文本)。

    状态码为 None 表示连接层失败（body 里是错误说明）。
    """
    data = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return int(resp.status), resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        return int(exc.code), body
    except Exception as exc:  # noqa: BLE001 —— 连接失败（服务未起/拒绝连接等）
        return None, f"transport error: {type(exc).__name__}: {exc}"


def try_json(text: str):
    try:
        return json.loads(text)
    except Exception:  # noqa: BLE001
        return None


def git_head(repo_dir: str) -> str:
    """只读 git 操作：取检出当前提交哈希（证据用）。"""
    try:
        out = subprocess.run(
            ["git", "-C", repo_dir, "log", "-1", "--format=%H"],
            capture_output=True,
            timeout=10,
        )
        return out.stdout.decode("utf-8", "replace").strip() or "unknown"
    except Exception:  # noqa: BLE001
        return "unknown"


def port_free(port: int) -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def probe_ports(base: int):
    """探测 (ocr, sa, fake) 三连端口；任一被占则 +10 递增。返回 (p1, p2, p3, 尝试记录)。"""
    attempts = []
    offset = 0
    while True:
        triple = (base + offset, base + offset + 1, base + offset + 2)
        free = [port_free(p) for p in triple]
        attempts.append({"triple": list(triple), "free": free})
        if all(free):
            return triple[0], triple[1], triple[2], attempts
        offset += 10
        if offset > 600:  # 防御：最多试 60 组
            raise RuntimeError("端口探测失败：8941 起的 60 组端口均被占用")


def build_canonical_py(*, device_id: str, student_id: str, student_name: str, nonce: str, ts: int) -> str:
    """纯 Python 重算 canonical（与 ocr 侧 build_canonical 同形）：
    ``v1|device_id|student_id|sha256(student_name)|nonce|ts``。
    姓名为空时 sha256(空串) = e3b0c442…，两种情况统一处理。"""
    name_hash = hashlib.sha256((student_name or "").encode("utf-8")).hexdigest()
    return "|".join(("v1", str(device_id), str(student_id), name_hash, str(nonce), str(int(ts))))


def b64url_tamper(sig: str) -> str:
    """把签名改一个 base64url 字符（保持长度/字母表 → 解码仍 64 字节 → 命中 signature_invalid）。"""
    if not sig:
        raise ValueError("签名为空，无法篡改")
    first = sig[0]
    replacement = "A" if first != "A" else "B"
    return replacement + sig[1:]


# ── 步骤记录 ──────────────────────────────────────────────────────────────────

class Recorder:
    """逐步记录命令/HTTP 调用/断言结论，最终落 JSON 证据。"""

    def __init__(self) -> None:
        self.steps: list[dict] = []
        self._current: dict | None = None

    def start_step(self, no: str, name: str, desc: str) -> None:
        self._current = {
            "no": no,
            "name": name,
            "desc": desc,
            "ts": now_iso(),
            "http": [],
            "assertions": [],
            "notes": [],
            "pass": None,
        }
        self.steps.append(self._current)
        print(f"[step {no}] {desc}")

    def finish_step(self) -> None:
        if self._current is None:
            return
        passed = self._current["assertions"]
        if not passed:
            # 纯环境/汇总步骤（无断言）：pass 置 None，不标记成功或失败
            self._current["pass"] = None
        else:
            self._current["pass"] = all(a["pass"] for a in passed)

    def note(self, text: str) -> None:
        if self._current is not None:
            self._current["notes"].append(text)
            print(f"  · {text}")

    def http_call(self, method: str, url: str, status, body: str, label: str = "") -> None:
        print(f"  → {label or method + ' ' + url}")
        print(f"    HTTP {status}")
        print(f"    响应体（截断 {BODY_PREVIEW_LIMIT}）：{snippet(body)}")
        if self._current is not None:
            self._current["http"].append(
                {
                    "method": method,
                    "url": url,
                    "status": status,
                    "body_preview": snippet(body),
                    # 完整响应体一并落盘（本链路响应都很小；失败时排障直接看这里）
                    "body_full": body,
                }
            )

    def check(self, name: str, expected: str, cond, actual: str) -> bool:
        """记一条断言；失败时完整响应体已在 http_call 里落盘（排障用）。

        注意：cond 可能是真值对象（如 re.Match），统一 bool 化后再记录/返回，
        保证 JSON 可序列化且返回值是真正的布尔。
        """
        cond = bool(cond)
        mark = "✓" if cond else "✗"
        print(f"  {mark} 断言「{name}」：期望 {expected}；实际 {actual}")
        if self._current is not None:
            entry = {
                "name": name,
                "expected": expected,
                "actual": actual,
                "pass": cond,
            }
            self._current["assertions"].append(entry)
        return cond


# ── 服务管理 ──────────────────────────────────────────────────────────────────

class Service:
    """一个子进程服务：启动（stdout/stderr 落盘）、等健康、停止。"""

    def __init__(self, name: str, cmd: list[str], cwd: str, env: dict, log_path: str) -> None:
        self.name = name
        self.cmd = cmd
        self.cwd = cwd
        self.env = env
        self.log_path = log_path
        self.proc: subprocess.Popen | None = None
        self._logf = None

    def start(self) -> None:
        self._logf = open(self.log_path, "wb")
        self.proc = subprocess.Popen(
            self.cmd,
            cwd=self.cwd,
            env=self.env,
            stdout=self._logf,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
        )
        print(f"  已启动 {self.name}（pid={self.proc.pid}，日志 {self.log_path}）")

    def tail(self, limit: int = 2500) -> str:
        try:
            with open(self.log_path, "rb") as f:
                data = f.read()
            return data[-limit:].decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            return "(日志读取失败)"

    def stop(self, keep: bool) -> None:
        if keep:
            print(f"  保留 {self.name}（--keep，pid={self.proc.pid if self.proc else '?'}）")
            return
        if self.proc is None:
            return
        try:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=5)
            print(f"  已停止 {self.name}")
        except Exception as exc:  # noqa: BLE001
            print(f"  停止 {self.name} 失败：{exc}")
        finally:
            if self._logf is not None:
                try:
                    self._logf.close()
                except Exception:  # noqa: BLE001
                    pass


# ── App 签名（cargo example）────────────────────────────────────────────────

def run_app_sign(
    *,
    src_tauri_dir: str,
    cargo_target_dir: str | None,
    device_id: str,
    student_id: str,
    student_name: str,
    seed_hex: str,
    nonce: str,
    ts: int,
    cargo_bin: str,
    timeout: float,
) -> tuple[int, str, str, str]:
    """跑 ``cargo run --quiet --example identity_v2_dev_sign -- …``。

    返回 (退出码, stdout 文本, stderr 文本, 命令描述)。stdout 解码按 UTF-8
    （cargo/serde_json 输出 UTF-8 字节）。
    """
    cmd = [
        cargo_bin,
        "run",
        "--quiet",
        "--example",
        "identity_v2_dev_sign",
        "--",
        "--device-id",
        device_id,
        "--student-id",
        student_id,
        "--student-name",
        student_name,
        "--seed-hex",
        seed_hex,
        "--nonce",
        nonce,
        "--ts",
        str(ts),
    ]
    env = dict(os.environ)
    if cargo_target_dir:
        # 复用主仓预热 target（避免冷编译；crates.io 依赖指纹一致，仅重编路径依赖）
        env["CARGO_TARGET_DIR"] = cargo_target_dir
    start = time.time()
    proc = subprocess.run(cmd, cwd=src_tauri_dir, env=env, capture_output=True, timeout=timeout)
    elapsed = time.time() - start
    return (
        proc.returncode,
        proc.stdout.decode("utf-8", "replace"),
        proc.stderr.decode("utf-8", "replace"),
        f"{' '.join(cmd)}（cwd={src_tauri_dir}，耗时 {elapsed:.1f}s）",
    )


def parse_proof_line(stdout: str) -> dict:
    """从 stdout 取出那一行 JSON 证明（容错：取最后一行可解析的 JSON 对象）。"""
    for line in reversed([l for l in stdout.splitlines() if l.strip()]):
        obj = try_json(line.strip())
        if isinstance(obj, dict) and "self_check_ok" in obj:
            return obj
    raise ValueError(f"stdout 中找不到证明 JSON 行：{snippet(stdout, 300)}")


# ── 断言辅助 ──────────────────────────────────────────────────────────────────

def sa_verify_fail_closed(status, body: str) -> tuple[bool, str]:
    """SA /debug/verify 的 fail-closed 形状（规格偏差说明见文件头）：
    401 {"error":"not_verified",…}（冻结实现映射）或 200 {"ok": false, …}（规格字面形状）。"""
    obj = try_json(body)
    if status == 401 and isinstance(obj, dict) and obj.get("error") == "not_verified":
        return True, "401 not_verified（fail-closed）"
    if status == 200 and isinstance(obj, dict) and obj.get("ok") is False:
        return True, "200 ok=false（fail-closed）"
    return False, f"HTTP {status} {snippet(body, 200)}"


def ocr_verify_reason_ok(status, body: str, expected_reason: str) -> tuple[bool, str]:
    """ocr 层验签失败体：401 {"error":"signature_invalid","reason":<期望根因>}。"""
    obj = try_json(body)
    if status == 401 and isinstance(obj, dict) and obj.get("reason") == expected_reason:
        return True, f"401 reason={expected_reason}"
    return False, f"HTTP {status} {snippet(body, 200)}"


def proof_verify_payload(proof: dict, *, include_signature: bool = True) -> dict:
    """由 App 证明组装 SA/ocr 的 verify 请求体（字段与 DebugVerifyRequest 同形）。"""
    payload = {
        "device_id": proof["device_id"],
        "student_id": proof["student_id"],
        "signature": proof["signature"] if include_signature else "",
        "nonce": proof["nonce"],
        "ts": str(proof["ts"]),
    }
    if proof.get("alg"):
        payload["alg"] = proof["alg"]
    if proof.get("canonical"):
        payload["canonical"] = proof["canonical"]
    if proof.get("student_name"):
        payload["student_name"] = proof["student_name"]
    return payload


# ── 主流程 ────────────────────────────────────────────────────────────────────

def redact_secret(value: str, secret: str) -> str:
    """把命令行/文本里的密钥明文替换成 ``***``（证据文件绝不落密钥）。"""
    if not secret:
        return value
    return value.replace(secret, "***")


def main() -> int:
    # Windows 控制台默认 GBK：强制 stdout/stderr 用 UTF-8（含 ✓/✗ 等符号），
    # 无法编码时替换而不是崩溃（联调输出以可复现为重）
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:  # noqa: BLE001 —— 某些平台无 reconfigure，忽略
            pass

    parser = argparse.ArgumentParser(description="P0-8 阶段 0 四方联调一键脚本（纯标准库）")
    parser.add_argument("--root", required=True, help="mini-hbut 仓库根（cargo 工作目录的基准）")
    parser.add_argument("--ocr-dir", required=True, help="ocr-service 检出目录")
    parser.add_argument("--sa-dir", required=True, help="mini-hbut-student-auth 检出目录")
    parser.add_argument("--seed-hex", default=DEFAULT_SEED_HEX, help="64 位 hex 种子（可复现）")
    parser.add_argument("--keep", action="store_true", help="结束后保留 3 个服务进程（默认杀）")
    parser.add_argument(
        "--json-out",
        default=None,
        help="JSON 证据输出路径（默认 <root>/docs/architecture/identity-v2-phase0-evidence.json）",
    )
    parser.add_argument(
        "--cargo-target-dir",
        default="D:/Documents/C_learn/成绩查询/tauri-app/apps/client/src-tauri/target",
        help="cargo 目标目录（复用主仓预热 target；传空串则不设置 CARGO_TARGET_DIR）",
    )
    parser.add_argument("--base-port", type=int, default=8941, help="端口探测基准（默认 8941）")
    parser.add_argument("--log-dir", default="D:/ct_scratch/p08-logs", help="服务日志目录")
    parser.add_argument("--device-id", default="phase0-dev-0001", help="联调设备 ID（8–128 位）")
    parser.add_argument("--student-id", default="2510234567", help="联调学号（默认 10 位数字）")
    parser.add_argument("--student-name", default="张三", help="联调姓名（进 canonical 的 sha256）")
    parser.add_argument("--health-timeout", type=float, default=60.0, help="每个服务 /health 等待超时（秒）")
    parser.add_argument("--cargo-timeout", type=float, default=2400.0, help="cargo run 超时（秒，首次含编译）")
    parser.add_argument("--no-app", action="store_true", help="跳过 cargo（配合 --preset-proof 用预置证明）")
    parser.add_argument("--preset-proof", default=None, help="--no-app 时的预置证明 JSON 文件")
    parser.add_argument("--cargo", default="cargo", help="cargo 可执行名（默认 cargo）")
    args = parser.parse_args()

    root = normalize_path(args.root)
    ocr_dir = normalize_path(args.ocr_dir)
    sa_dir = normalize_path(args.sa_dir)
    log_dir = normalize_path(args.log_dir)
    src_tauri_dir = os.path.join(root, "apps", "client", "src-tauri")
    json_out = normalize_path(args.json_out) if args.json_out else os.path.join(
        root, "docs", "architecture", "identity-v2-phase0-evidence.json"
    )

    if not re.fullmatch(r"[0-9a-fA-F]{64}", args.seed_hex or ""):
        print(f"[ERROR] --seed-hex 必须是 64 位 hex（实际 {len(args.seed_hex or '')} 位）")
        return 1
    for label, path in (("--ocr-dir", ocr_dir), ("--sa-dir", sa_dir)):
        if not os.path.isdir(path):
            print(f"[ERROR] {label} 目录不存在：{path}")
            return 1
    os.makedirs(log_dir, exist_ok=True)

    # id_token 密钥（阶段 0 缝）：本次运行随机生成，同时注入新服务 env 与假 Casdoor 参数
    idtoken_secret = secrets.token_hex(32)

    rec = Recorder()
    services: list[Service] = []
    result = "PASS"
    failed_steps: list[str] = []
    skipped_steps: list[str] = []
    proof_a = proof_b = proof_c = None
    authorize_code = None
    ports = None
    port_attempts = None
    health_results: list[dict] = []
    t0 = time.time()

    class StepFailure(Exception):
        pass

    def fail(step_no: str, message: str) -> None:
        raise StepFailure(f"step {step_no}: {message}")

    try:
        # ── 步骤 1：端口探测 + 启动 3 个服务 + 等 /health ─────────────────────
        rec.start_step("1", "services", "端口探测 + 启动 3 个服务（ocr / 新服务 / 假 Casdoor）+ 等 /health")
        p_ocr, p_sa, p_fake, port_attempts = probe_ports(args.base_port)
        ports = {"ocr": p_ocr, "student-auth": p_sa, "fake-casdoor": p_fake}
        rec.note(f"端口探测：实际使用 ocr={p_ocr} / 新服务={p_sa} / 假Casdoor={p_fake}（尝试记录见 JSON）")
        rec.note(f"MINI_HBUT_DEBUG_IDTOKEN_SECRET 已生成（不回显，只注入 env/参数）")

        base_env = dict(os.environ)
        ocr_env = dict(base_env, MINI_HBUT_IDENTITY_DEBUG="1")
        sa_env = dict(
            base_env,
            DEBUG_ENDPOINTS="1",
            ENVIRONMENT="dev",
            ISSUER=f"http://127.0.0.1:{p_sa}",
            OCR_SERVICE_BASE_URL=f"http://127.0.0.1:{p_ocr}",
            OCR_SERVICE_DEVICE_API_PREFIX="/identity/debug/device",
            PORT=str(p_sa),
            MINI_HBUT_DEBUG_IDTOKEN_SECRET=idtoken_secret,
        )
        fake_script = os.path.join(
            normalize_path(os.path.dirname(os.path.abspath(__file__))), "identity_v2_phase0_fake_casdoor.py"
        )

        ocr = Service(
            "ocr",
            [sys.executable, "-m", "uvicorn", "runtime.entrypoint:app", "--host", "127.0.0.1", "--port", str(p_ocr)],
            ocr_dir,
            ocr_env,
            os.path.join(log_dir, "ocr.log"),
        )
        sa = Service(
            "student-auth",
            [sys.executable, "-m", "mini_hbut_student_auth.main"],
            sa_dir,
            sa_env,
            os.path.join(log_dir, "student-auth.log"),
        )
        fake_env = dict(base_env)
        fake_env["FAKE_CASDOOR_IDTOKEN_SECRET"] = idtoken_secret  # 不进程列表/证据文件里落密钥
        fake = Service(
            "fake-casdoor",
            [sys.executable, fake_script, "--port", str(p_fake), "--host", "127.0.0.1"],
            root,
            fake_env,
            os.path.join(log_dir, "fake-casdoor.log"),
        )
        services = [ocr, sa, fake]

        ocr.start()
        time.sleep(0.5)
        sa.start()
        time.sleep(0.3)
        fake.start()

        health_results = []
        for svc, port in ((ocr, p_ocr), (sa, p_sa), (fake, p_fake)):
            url = f"http://127.0.0.1:{port}/health"
            start = time.time()
            ok = elapsed = status = body = None
            deadline = time.time() + args.health_timeout
            while time.time() < deadline:
                if svc.proc.poll() is not None:
                    break
                status, body = http_request("GET", url, timeout=5.0)
                if status == 200:
                    ok, elapsed = True, time.time() - start
                    break
                time.sleep(0.5)
            if ok is None:
                ok = status == 200
                elapsed = time.time() - start
            health_results.append({"service": svc.name, "url": url, "ok": bool(ok), "elapsed_s": round(elapsed or 0, 2), "status": status})
            if ok:
                rec.note(f"{svc.name} /health 200（{elapsed:.1f}s，响应体见 JSON 证据 meta.health）")
                health_results[-1]["body_preview"] = snippet(body, 400)
            else:
                print(f"  [ERROR] {svc.name} /health 未就绪（status={status}）；日志尾部：")
                print("  " + svc.tail().replace("\n", "\n  "))
                health_results[-1]["log_tail"] = svc.tail()
                fail("1", f"{svc.name} /health 等待超时（{args.health_timeout}s）")

        rec.finish_step()

        # ── 步骤 2：App 签名 ─────────────────────────────────────────────────
        rec.start_step("2", "app-sign", "App 签名：cargo run --example identity_v2_dev_sign（复用 identity::v2_signature）")
        nonce_a = secrets.token_hex(16)
        ts_a = int(time.time())
        if args.no_app:
            if not args.preset_proof:
                fail("2", "--no-app 需要 --preset-proof 预置证明文件")
            with open(normalize_path(args.preset_proof), "r", encoding="utf-8") as f:
                proof_a = try_json(f.read().strip())
            if not isinstance(proof_a, dict) or "self_check_ok" not in proof_a:
                fail("2", "预置证明文件不是合法的证明 JSON")
            rec.note(f"使用预置证明（--no-app）：{normalize_path(args.preset_proof)}")
        else:
            code, stdout, stderr, cmd_desc = run_app_sign(
                src_tauri_dir=src_tauri_dir,
                cargo_target_dir=args.cargo_target_dir or None,
                device_id=args.device_id,
                student_id=args.student_id,
                student_name=args.student_name,
                seed_hex=args.seed_hex,
                nonce=nonce_a,
                ts=ts_a,
                cargo_bin=args.cargo,
                timeout=args.cargo_timeout,
            )
            rec.note("cargo 命令：" + cmd_desc)
            rec.note(f"cargo 退出码：{code}；stderr 尾部：{snippet(stderr[-600:], 300) if stderr else '(空)'}")
            if code != 0:
                fail("2", f"cargo 退出码 {code}（非 0）")
            proof_a = parse_proof_line(stdout)
            rec.note("App 证明（stdout 那行 JSON）：" + json.dumps(proof_a, ensure_ascii=False))
            if not rec.check(
                "self_check_ok",
                "self_check_ok == true 且退出码 0",
                proof_a.get("self_check_ok") is True and code == 0,
                f"self_check_ok={proof_a.get('self_check_ok')}, exit={code}",
            ):
                fail("2", "self_check_ok 断言失败")
            if proof_a.get("alg") != "Ed25519":
                rec.check("alg", '"Ed25519"', False, str(proof_a.get("alg")))
                fail("2", "alg 不是 Ed25519")
            # 跨语言 canonical 一致性（纯 Python 重算 vs Rust 侧输出）
            expected_canonical = build_canonical_py(
                device_id=proof_a.get("device_id", ""),
                student_id=proof_a.get("student_id", ""),
                student_name=proof_a.get("student_name", ""),
                nonce=proof_a.get("nonce", ""),
                ts=int(proof_a["ts"]),
            )
            if not rec.check(
                "canonical 跨语言一致",
                "Rust build_v2_canonical 输出 == Python 重算",
                proof_a.get("canonical") == expected_canonical,
                f"rust={proof_a.get('canonical')!r} py={expected_canonical!r}",
            ):
                fail("2", "canonical 跨语言不一致")
            jwk = try_json(proof_a.get("public_key_jwk", ""))
            jwk_ok = (
                isinstance(jwk, dict)
                and jwk.get("kty") == "OKP"
                and jwk.get("crv") == "Ed25519"
                and isinstance(jwk.get("x"), str)
                and len(jwk["x"]) == 43
                and "d" not in jwk
            )
            if not rec.check("public_key_jwk", "OKP/Ed25519 公钥 JWK（43 位 base64url x，无 d）", jwk_ok, str(proof_a.get("public_key_jwk"))):
                fail("2", "public_key_jwk 形状异常")
        rec.finish_step()

        sa_base = f"http://127.0.0.1:{p_sa}"
        ocr_base = f"http://127.0.0.1:{p_ocr}"

        # ── 步骤 3：未登记失败路径 ───────────────────────────────────────────
        rec.start_step("3", "not-registered", "未登记失败路径：device_id 尚未登记时 /debug/verify 必须 fail-closed")
        payload_a = proof_verify_payload(proof_a)
        status, body = http_request("POST", sa_base + "/debug/verify", payload_a)
        rec.http_call("POST", sa_base + "/debug/verify", status, body)
        closed, closed_desc = sa_verify_fail_closed(status, body)
        if not rec.check(
            "SA 层 fail-closed",
            "401 not_verified（冻结映射）或 200 ok:false（规格字面）",
            closed,
            closed_desc,
        ):
            fail("3", "SA 层未 fail-closed")
        status, body = http_request("POST", ocr_base + "/identity/debug/device/verify", payload_a)
        rec.http_call("POST", ocr_base + "/identity/debug/device/verify（直接探 ocr 根因）", status, body)
        ok3, desc3 = ocr_verify_reason_ok(status, body, "device_not_registered")
        if not rec.check("ocr 层根因", "401 且 reason==device_not_registered", ok3, desc3):
            fail("3", "ocr 层根因不是 device_not_registered")
        rec.finish_step()

        # ── 步骤 4：登记 ─────────────────────────────────────────────────────
        rec.start_step("4", "register", "登记：POST ocr /identity/debug/device/register（JWK 来自 App 证明）")
        reg_payload = {
            "device_id": proof_a["device_id"],
            "student_id": proof_a["student_id"],
            "alg": proof_a["alg"],
            "public_key_jwk": proof_a["public_key_jwk"],
            "student_name_hash": proof_a.get("student_name_hash", ""),
            "actor": "phase0",
        }
        status, body = http_request("POST", ocr_base + "/identity/debug/device/register", reg_payload)
        rec.http_call("POST", ocr_base + "/identity/debug/device/register", status, body)
        obj = try_json(body) or {}
        expected_mask = args.student_id[:4] + "***"
        if not rec.check(
            "登记成功",
            "200 且 ok=true，student_id_masked==" + expected_mask,
            status == 200 and obj.get("ok") is True and obj.get("student_id_masked") == expected_mask,
            f"HTTP {status} {snippet(body, 200)}",
        ):
            fail("4", "登记失败")
        rec.finish_step()

        # ── 步骤 5：验签成功 ─────────────────────────────────────────────────
        rec.start_step("5", "verify-ok", "验签成功：同一证明再发 → /debug/verify ok:true（跨语言 Ed25519）")
        status, body = http_request("POST", sa_base + "/debug/verify", payload_a)
        rec.http_call("POST", sa_base + "/debug/verify", status, body)
        obj = try_json(body) or {}
        if not rec.check(
            "验签通过",
            "200 且 ok=true 且 bound=true",
            status == 200 and obj.get("ok") is True and obj.get("bound") is True,
            f"HTTP {status} {snippet(body, 200)}",
        ):
            fail("5", "验签未通过")
        rec.finish_step()

        # ── 步骤 6：重放失败路径（必须命中 nonce_replayed）───────────────────
        rec.start_step("6", "replay", "重放失败路径：同一证明再发一次 → 必须命中 nonce_replayed（跨语言 nonce 一次性）")
        status, body = http_request("POST", sa_base + "/debug/verify", payload_a)
        rec.http_call("POST", sa_base + "/debug/verify（重放）", status, body)
        closed, closed_desc = sa_verify_fail_closed(status, body)
        if not rec.check("SA 层 fail-closed", "401 not_verified 或 200 ok:false", closed, closed_desc):
            fail("6", "SA 层未 fail-closed")
        status, body = http_request("POST", ocr_base + "/identity/debug/device/verify", payload_a)
        rec.http_call("POST", ocr_base + "/identity/debug/device/verify（重放，直接探 ocr 根因）", status, body)
        ok6, desc6 = ocr_verify_reason_ok(status, body, "nonce_replayed")
        if not rec.check("nonce 一次性", "401 且 reason==nonce_replayed（必须命中）", ok6, desc6):
            fail("6", "未命中 nonce_replayed")
        rec.finish_step()

        # ── 步骤 7：授权码（新证明/新 nonce）─────────────────────────────────
        rec.start_step("7", "authorize", "授权码：/debug/authorize（新证明/新 nonce）→ 200 且 code 匹配 dbg_+32hex")
        nonce_b = secrets.token_hex(16)
        ts_b = int(time.time())
        if args.no_app:
            fail("7", "--no-app 模式无法为 authorize 生成新证明（需要新 nonce 的签名）")
        code, stdout, stderr, cmd_desc = run_app_sign(
            src_tauri_dir=src_tauri_dir,
            cargo_target_dir=args.cargo_target_dir or None,
            device_id=args.device_id,
            student_id=args.student_id,
            student_name=args.student_name,
            seed_hex=args.seed_hex,
            nonce=nonce_b,
            ts=ts_b,
            cargo_bin=args.cargo,
            timeout=args.cargo_timeout,
        )
        rec.note("cargo 命令：" + cmd_desc + f"（退出码 {code}）")
        if code != 0:
            fail("7", f"cargo 退出码 {code}（authorize 新证明）")
        proof_b = parse_proof_line(stdout)
        rec.note(f"新证明 B（nonce={proof_b['nonce']}）")
        payload_b = proof_verify_payload(proof_b)
        payload_b["redirect_uri"] = ""
        status, body = http_request("POST", sa_base + "/debug/authorize", payload_b)
        rec.http_call("POST", sa_base + "/debug/authorize", status, body)
        obj = try_json(body) or {}
        code_val = obj.get("code")
        code_ok = status == 200 and obj.get("ok") is True and isinstance(code_val, str) and CODE_RE.match(code_val)
        if not rec.check(
            "授权码签发",
            "200 且 ok=true 且 code 匹配 ^dbg_[0-9a-f]{32}$",
            code_ok,
            f"HTTP {status} code={code_val!r}",
        ):
            fail("7", "授权码未签发")
        authorize_code = code_val
        rec.finish_step()

        # ── 步骤 8：假 Casdoor 换令牌 ────────────────────────────────────────
        rec.start_step("8", "fake-exchange", "假 Casdoor 换令牌：fake /oidc/exchange → 新服务 /debug/exchange → JWT 校验")
        fake_base = f"http://127.0.0.1:{p_fake}"
        status, body = http_request(
            "POST",
            fake_base + "/oidc/exchange",
            {"code": authorize_code, "new_service_base": sa_base, "client_id": "phase0-fake-casdoor"},
            timeout=30.0,
        )
        rec.http_call("POST", fake_base + "/oidc/exchange", status, body)
        obj = try_json(body) or {}
        claims = obj.get("claims") if isinstance(obj.get("claims"), dict) else {}
        fp = obj.get("id_token_fingerprint")
        fp_ok = isinstance(fp, str) and re.fullmatch(r"[0-9a-f]{16}", fp) is not None
        claims_ok = (
            isinstance(claims, dict)
            and all(k in claims for k in ("iss", "aud", "exp", "sub", "jti"))
            and str(claims.get("sub", "")).startswith("hbut_")
        )
        if not rec.check(
            "换令牌成功",
            "200 且 ok=true，claims 含 iss/aud/exp/sub/jti 且 sub 以 hbut_ 开头，指纹 16 位 hex",
            status == 200 and obj.get("ok") is True and claims_ok and fp_ok,
            f"HTTP {status} ok={obj.get('ok')} err={obj.get('error')} fp={fp!r} sub={claims.get('sub')!r}",
        ):
            fail("8", "假 Casdoor 换令牌失败（若新服务 /debug/exchange 尚未就位，此处为并行依赖缺口）")
        rec.finish_step()

        # ── 步骤 9：错签失败路径（新证明/新 nonce）───────────────────────────
        rec.start_step("9", "bad-signature", "错签失败路径：签名改一个 base64url 字符（新证明/新 nonce）→ signature_invalid")
        nonce_c = secrets.token_hex(16)
        ts_c = int(time.time())
        code, stdout, stderr, cmd_desc = run_app_sign(
            src_tauri_dir=src_tauri_dir,
            cargo_target_dir=args.cargo_target_dir or None,
            device_id=args.device_id,
            student_id=args.student_id,
            student_name=args.student_name,
            seed_hex=args.seed_hex,
            nonce=nonce_c,
            ts=ts_c,
            cargo_bin=args.cargo,
            timeout=args.cargo_timeout,
        )
        rec.note("cargo 命令：" + cmd_desc + f"（退出码 {code}）")
        if code != 0:
            fail("9", f"cargo 退出码 {code}（错签证明）")
        proof_c = parse_proof_line(stdout)
        tampered_sig = b64url_tamper(proof_c["signature"])
        rec.note(f"错签构造：原签名首字符 {proof_c['signature'][0]!r} → {tampered_sig[0]!r}（nonce 为新的 {nonce_c[:8]}…）")
        proof_c["signature"] = tampered_sig
        payload_c = proof_verify_payload(proof_c)
        status, body = http_request("POST", sa_base + "/debug/verify", payload_c)
        rec.http_call("POST", sa_base + "/debug/verify（错签）", status, body)
        closed, closed_desc = sa_verify_fail_closed(status, body)
        if not rec.check("SA 层 fail-closed", "401 not_verified 或 200 ok:false（ok 必须为假）", closed, closed_desc):
            fail("9", "SA 层未 fail-closed")
        status, body = http_request("POST", ocr_base + "/identity/debug/device/verify", payload_c)
        rec.http_call("POST", ocr_base + "/identity/debug/device/verify（错签，直接探 ocr 根因）", status, body)
        ok9, desc9 = ocr_verify_reason_ok(status, body, "signature_invalid")
        if not rec.check("签名校验", "401 且 reason==signature_invalid", ok9, desc9):
            fail("9", "未命中 signature_invalid")
        rec.finish_step()

        # ── 步骤 10：设备列表 ────────────────────────────────────────────────
        rec.start_step("10", "devices", "设备列表：GET /debug/devices → 含该设备、条目恰好 10 字段、学号掩码")
        status, body = http_request("GET", sa_base + "/debug/devices")
        rec.http_call("GET", sa_base + "/debug/devices", status, body)
        obj = try_json(body) or {}
        devices = obj.get("devices") if isinstance(obj.get("devices"), list) else []
        mine = next((d for d in devices if isinstance(d, dict) and d.get("device_id") == args.device_id), None)
        if mine is None:
            rec.check("设备在列", f"devices 含 {args.device_id}", False, f"共 {len(devices)} 条，未找到")
            fail("10", "设备列表中找不到该设备")
        else:
            fields_ok = len(mine) == DEVICE_FIELDS_EXPECTED and "public_key_jwk" not in mine
            mask_ok = MASKED_RE.match(str(mine.get("student_id_masked") or "")) is not None
            if not rec.check(
                "条目形状",
                f"恰好 {DEVICE_FIELDS_EXPECTED} 个字段、无 public_key_jwk、status=active、学号掩码 {expected_mask}",
                fields_ok
                and mask_ok  # 严格掩码形状（^\d{4}\*\*\*$）必须成立（复核发现它原本未被使用=死代码）
                and mine.get("status") == "active"
                and mine.get("student_id_masked") == expected_mask,
                f"fields={list(mine.keys())} status={mine.get('status')} mask={mine.get('student_id_masked')!r}",
            ):
                fail("10", "设备条目形状异常")

        rec.finish_step()

        # ── 步骤 11：汇总 ────────────────────────────────────────────────────
        rec.start_step("11", "summary", "汇总：写 JSON 证据 + 打印 [RESULT]")
        elapsed_total = time.time() - t0
        rec.note(f"全部 11 步执行完毕，总耗时 {elapsed_total:.1f}s")
        rec.finish_step()

    except StepFailure as exc:
        result = "FAIL"
        step_no = str(exc).split(":")[0].replace("step ", "")
        failed_steps.append(step_no)
        # 失败步骤的 pass 标记为 False（诚实：该步未通过）
        if rec.steps and rec.steps[-1].get("pass") is None:
            rec.steps[-1]["pass"] = False
        # 记录被跳过的步骤
        all_steps = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]
        done = {s["no"] for s in rec.steps}
        for s in all_steps:
            if s not in done:
                skipped_steps.append(s)
        print()
        print(f"[step {step_no}] 失败，后续步骤不再执行：{exc}")
    except Exception as exc:  # noqa: BLE001 —— 未预期异常也要落证据
        result = "FAIL"
        failed_steps.append(f"unhandled:{type(exc).__name__}")
        print(f"[FATAL] 未预期异常：{type(exc).__name__}: {exc}")
    finally:
        # 清理服务（--keep 保留）
        for svc in reversed(services):
            try:
                svc.stop(keep=args.keep)
            except Exception as exc:  # noqa: BLE001
                print(f"  清理 {svc.name} 出错：{exc}")

    # 写 JSON 证据（无论成败都写；密钥等敏感值一律不落盘）
    evidence = {
        "meta": {
            "generated_at": now_iso(),
            "script": "scripts/identity_v2_phase0_e2e.py",
            "spec": "goal-10/evidence/p0-8-phase0-e2e-spec.md §4/§5",
            "result": result,
            "elapsed_s": round(time.time() - t0, 1),
            "python": sys.version.split()[0],
            "machine": os.name,
            "ports": ports,
            "port_attempts": port_attempts,
            "health": health_results,
            "repos": {
                "mini-hbut": {"dir": root, "head": git_head(root)},
                "ocr-service": {"dir": ocr_dir, "head": git_head(ocr_dir)},
                "student-auth": {"dir": sa_dir, "head": git_head(sa_dir)},
            },
            "params": {
                "seed_hex": args.seed_hex,
                "device_id": args.device_id,
                "student_id": args.student_id,
                "student_name": args.student_name,
                "keep": args.keep,
                "no_app": args.no_app,
                "cargo_target_dir": args.cargo_target_dir or None,
                "log_dir": log_dir,
                # 注意：MINI_HBUT_DEBUG_IDTOKEN_SECRET 不落盘（每次运行随机生成）
            },
            "services": [
                {
                    "name": s.name,
                    # 记录前**脱敏**：假 Casdoor 的 argv 里带 HS256 密钥，
                    # 证据 JSON 不允许出现密钥明文（独立复核发现）
                    "cmd": [redact_secret(part, idtoken_secret) for part in s.cmd],
                    "cwd": s.cwd,
                    "log": s.log_path,
                }
                for s in services
            ],
        },
        "steps": rec.steps,
        "failed_steps": failed_steps,
        "skipped_steps": skipped_steps,
    }
    try:
        os.makedirs(os.path.dirname(json_out), exist_ok=True)
        with open(json_out, "w", encoding="utf-8") as f:
            json.dump(evidence, f, ensure_ascii=False, indent=2)
        print(f"[evidence] JSON 已写入 {json_out}")
    except Exception as exc:  # noqa: BLE001
        print(f"[evidence] JSON 写入失败：{exc}")

    if failed_steps:
        print(f"[RESULT] FAIL（失败步骤：{', '.join(failed_steps)}）")
        return 1
    print("[RESULT] PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
