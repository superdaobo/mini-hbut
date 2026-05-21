import argparse
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
import requests
from PIL import Image

MODULES = [
    "home",
    "schedule",
    "qxzkb",
    "course_selection",
    "me",
    "official",
    "feedback",
    "config",
    "settings",
    "export_center",
    "more",
    "more_shuake",
    "more_module_host",
    "more_chaoxing_checkin",
    "online_learning_chaoxing",
    "online_learning_yuketang",
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

LIGHT_PIXEL_RATIO_WARN = 0.18
NEAR_WHITE_PIXEL_RATIO_WARN = 0.04


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


def analyze_screenshot(path: str) -> dict:
    if not path:
        return {"ok": False, "error": "empty path"}

    image_path = Path(path)
    if not image_path.exists():
        return {"ok": False, "error": f"file not found: {path}"}

    with Image.open(image_path) as image:
        rgb = image.convert("RGB")
        width, height = rgb.size
        total = max(1, width * height)
        light_pixels = 0
        near_white_pixels = 0
        dark_pixels = 0

        for red, green, blue in rgb.getdata():
            if red > 220 and green > 220 and blue > 220:
                light_pixels += 1
            if red > 245 and green > 245 and blue > 245:
                near_white_pixels += 1
            if red < 64 and green < 74 and blue < 96:
                dark_pixels += 1

    light_ratio = light_pixels / total
    near_white_ratio = near_white_pixels / total
    dark_ratio = dark_pixels / total
    suspect = (
        light_ratio >= LIGHT_PIXEL_RATIO_WARN
        or near_white_ratio >= NEAR_WHITE_PIXEL_RATIO_WARN
    )
    return {
        "ok": True,
        "width": width,
        "height": height,
        "light_ratio": round(light_ratio, 4),
        "near_white_ratio": round(near_white_ratio, 4),
        "dark_ratio": round(dark_ratio, 4),
        "suspect": suspect,
    }


def main():
    parser = argparse.ArgumentParser(description="夜晚模式截图巡检")
    parser.add_argument("--base-url", default="http://127.0.0.1:4399")
    parser.add_argument("--student-id", default="")
    parser.add_argument("--selector", default=".view-transition-root")
    parser.add_argument("--delay", type=float, default=0.8)
    parser.add_argument("--out", default="debug-captures/night-mode-audit")
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
        nav_payload = {"view": view, "student_id": student_id, "payload": {"nightMode": True}}
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
        filename = f"night-{view}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.png"
        shot_payload = {
            "selector": args.selector,
            "format": "png",
            "return": "path",
            "filename": filename,
        }
        shot_code, shot_body = post_json(args.base_url, "/debug/dom_screenshot", token, shot_payload, timeout=20)

        if shot_code >= 400 or not shot_body.get("success"):
            report["errors"].append({
                "view": view,
                "stage": "screenshot",
                "status": shot_code,
                "body": shot_body,
            })
            continue

        data = shot_body.get("data") or {}
        saved_path = data.get("saved_path", "")
        pixel_stats = analyze_screenshot(saved_path)
        if pixel_stats.get("suspect"):
            report["errors"].append({
                "view": view,
                "stage": "pixel-audit",
                "body": pixel_stats,
            })

        report["modules"].append(
            {
                "view": view,
                "path": saved_path,
                "mime": data.get("mime", ""),
                "width": data.get("width", 0),
                "height": data.get("height", 0),
                "pixel_stats": pixel_stats,
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
