#!/usr/bin/env python3
"""
抓取官网 AI 模型列表，并写入 tauri-app/remote_config.json 的 ai_models 字段。

用法示例：
  python tools/scrape_ai_models.py --capture ..\captured_requests.json
  python tools/scrape_ai_models.py --entry-url "https://virtualhuman2h5.59wanmei.com/digitalPeople3/index.html?token=..."

可选参数：
  --cookie "key=value; ..."  (如需带 Cookie)
  --output "..\tauri-app\remote_config.json"
"""

import argparse
import json
import os
from typing import Dict, List, Optional
from urllib.parse import parse_qs, urlparse

import requests

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
)
OAUTH_BASIC = "Basic d214eTp3bXh5X3NlY3JldA=="  # wmxy:wmxy_secret
DEFAULT_TENANT_ID = "000000"
DEFAULT_ROLE_ID = "1664528453134516226"


def load_entry_url_from_capture(capture_path: str) -> Optional[str]:
    if not os.path.exists(capture_path):
        return None
    with open(capture_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    for req in reversed(data):
        url = req.get("url", "")
        if "virtualhuman2h5.59wanmei.com/digitalPeople3/index.html" in url:
            return url
    return None


def parse_entry_params(entry_url: str) -> Dict[str, str]:
    parsed = urlparse(entry_url)
    params = parse_qs(parsed.query, keep_blank_values=True)
    return {k: v[0] for k, v in params.items()}


def oauth_token(base_url: str, entry_url: str, cookie: str = "") -> Dict[str, str]:
    params = parse_entry_params(entry_url)
    params["grant_type"] = "wmxy"
    params["scope"] = "all"

    headers = {
        "authorization": OAUTH_BASIC,
        "referer": entry_url,
        "user-agent": DEFAULT_USER_AGENT,
        "accept": "application/json, text/plain, */*",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "tenant-id": DEFAULT_TENANT_ID,
        "role-id": DEFAULT_ROLE_ID,
    }
    if cookie:
        headers["cookie"] = cookie

    url = f"{base_url}/apis/blade-auth/oauth/token"
    resp = requests.post(url, data=params, headers=headers, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if "access_token" not in data:
        raise RuntimeError(f"oauth/token response missing access_token: {data}")
    return data


def init_param(base_url: str, access_token: str, entry_url: str, cookie: str = "") -> Dict:
    url = f"{base_url}/apis/virtualhuman/serverApi/config/initParam"
    headers = {
        "blade-auth": f"bearer {access_token}",
        "referer": entry_url,
        "user-agent": DEFAULT_USER_AGENT,
        "accept": "application/json, text/plain, */*",
    }
    if cookie:
        headers["cookie"] = cookie
    resp = requests.post(url, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json()


def normalize_model_item(item) -> Optional[Dict[str, str]]:
    if isinstance(item, str):
        return {"label": item, "value": item}
    if not isinstance(item, dict):
        return None
    label = (
        item.get("label")
        or item.get("name")
        or item.get("modelName")
        or item.get("title")
        or item.get("display")
    )
    value = (
        item.get("value")
        or item.get("model")
        or item.get("code")
        or item.get("id")
        or item.get("key")
    )
    if not label and value:
        label = value
    if not value and label:
        value = label
    if not label or not value:
        return None
    return {"label": str(label), "value": str(value)}


def extract_models(payload: Dict) -> List[Dict[str, str]]:
    data = payload.get("data") if isinstance(payload, dict) else None
    data = data or payload
    candidates = []
    for key in ("modelList", "models", "model_list", "aiModels", "modelOptions"):
        value = data.get(key) if isinstance(data, dict) else None
        if isinstance(value, list):
            candidates = value
            break
    models: List[Dict[str, str]] = []
    for item in candidates:
        normalized = normalize_model_item(item)
        if normalized:
            models.append(normalized)
    # 去重
    seen = set()
    unique = []
    for item in models:
        if item["value"] in seen:
            continue
        seen.add(item["value"])
        unique.append(item)
    return unique


def merge_remote_config(config_path: str, models: List[Dict[str, str]]) -> None:
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    else:
        cfg = {}
    cfg["ai_models"] = models
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--capture", default="..\\captured_requests.json")
    parser.add_argument("--entry-url", default="")
    parser.add_argument("--cookie", default="")
    parser.add_argument("--output", default="..\\tauri-app\\remote_config.json")
    args = parser.parse_args()

    entry_url = args.entry_url or load_entry_url_from_capture(args.capture)
    if not entry_url:
        raise SystemExit("未找到 entry_url，请提供 --entry-url 或 --capture")

    parsed = urlparse(entry_url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"

    token_data = oauth_token(base_url, entry_url, cookie=args.cookie)
    access_token = token_data["access_token"]
    init_payload = init_param(base_url, access_token, entry_url, cookie=args.cookie)
    models = extract_models(init_payload)

    if not models:
        raise SystemExit("未解析到模型列表，请检查响应结构。")

    merge_remote_config(args.output, models)
    print(f"已写入 {len(models)} 个模型到: {args.output}")


if __name__ == "__main__":
    main()
