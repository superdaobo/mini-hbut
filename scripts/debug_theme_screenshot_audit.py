import argparse
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
import requests

MODULES = [
    "home",
    "schedule",
    "qxzkb",
    "me",
    "official",
    "feedback",
    "config",
    "settings",
    "export_center",
    "grades",
    "electricity",
    "transactions",
    "campus_code",
    "notifications",
    "classroom",
    "studentinfo",
    "exams",
    "ranking",
    "calendar",
    "academic",
    "training",
    "ai",
    "campus_map",
    "library",
    "resource_share",
]


def load_private_key(repo_root: Path) -> str:
    key_path = repo_root / "keys" / "local_api_private.pem"
    if not key_path.exists():
        raise FileNotFoundError(f"未找到私钥: {key_path}")
    return key_path.read_text(encoding="utf-8")


def build_token(private_key: str, minutes: int = 60) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": "theme-audit",
        "scope": "cache:read",
        "exp": int((now + timedelta(minutes=minutes)).timestamp()),
        "iat": int(now.timestamp()),
    }
    return jwt.encode(payload, private_key, algorithm="RS256")


def headers(token: str) -> dict:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "x-local-token": token,
    }


def post_json(base_url: str, path: str, token: str, payload: dict, timeout: int = 15):
    resp = requests.post(
        f"{base_url}{path}",
        headers=headers(token),
        json=payload,
        timeout=timeout,
    )
    try:
        body = resp.json()
    except Exception:
        body = {"success": False, "error": {"message": resp.text}}
    return resp.status_code, body


def read_student_id(base_url: str, timeout: int = 8) -> str:
    resp = requests.post(f"{base_url}/fetch_student_info", json={}, timeout=timeout)
    data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    sid = (
        data.get("data", {}).get("student_id")
        or data.get("data", {}).get("xh")
        or data.get("data", {}).get("studentId")
        or ""
    )
    return str(sid).strip()


def main():
    parser = argparse.ArgumentParser(description="深海石墨主题截图巡检")
    parser.add_argument("--base-url", default="http://127.0.0.1:4399")
    parser.add_argument("--student-id", default="")
    parser.add_argument("--selector", default=".view-transition-root")
    parser.add_argument("--delay", type=float, default=0.8)
    parser.add_argument("--out", default="debug-captures/theme-audit")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    out_dir = (repo_root / args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    private_key = load_private_key(repo_root)
    token = build_token(private_key)

    status, health = requests.get(f"{args.base_url}/health", timeout=6).status_code, None
    if status != 200:
        raise RuntimeError(f"桥接服务不可用，health status={status}")

    student_id = str(args.student_id or "").strip() or read_student_id(args.base_url)

    report = {
        "base_url": args.base_url,
        "student_id": student_id,
        "selector": args.selector,
        "delay": args.delay,
        "timestamp": datetime.now().isoformat(),
        "modules": [],
        "errors": [],
    }

    for view in MODULES:
        nav_payload = {"view": view, "student_id": student_id}
        nav_code, nav_body = post_json(args.base_url, "/debug/navigate", token, nav_payload, timeout=10)
        if nav_code >= 400 or not nav_body.get("success"):
            report["errors"].append({
                "view": view,
                "stage": "navigate",
                "status": nav_code,
                "body": nav_body,
            })
            continue

        time.sleep(max(0.2, args.delay))
        filename = f"{view}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.png"
        shot_payload = {
            "selector": args.selector,
            "format": "png",
            "return": "path",
            "filename": filename,
        }
        shot_code, shot_body = post_json(args.base_url, "/debug/screenshot", token, shot_payload, timeout=20)

        if shot_code >= 400 or not shot_body.get("success"):
            report["errors"].append({
                "view": view,
                "stage": "screenshot",
                "status": shot_code,
                "body": shot_body,
            })
            continue

        data = shot_body.get("data") or {}
        report["modules"].append(
            {
                "view": view,
                "path": data.get("saved_path", ""),
                "mime": data.get("mime", ""),
                "width": data.get("width", 0),
                "height": data.get("height", 0),
            }
        )

    report_path = out_dir / f"audit-report-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({
        "ok": True,
        "report": str(report_path),
        "module_count": len(report["modules"]),
        "error_count": len(report["errors"]),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
