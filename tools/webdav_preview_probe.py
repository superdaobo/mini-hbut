import requests
import xml.etree.ElementTree as ET
from collections import deque
from urllib.parse import quote, unquote, urlparse

BASE = "https://mini-hbut-chaoxing-webdav.hf.space"
AUTH = ("mini-hbut", "mini-hbut")
TARGET = {"pdf", "docx", "xlsx", "pptx"}


def norm(path: str) -> str:
    p = (path or "/").replace("\\", "/")
    if not p.startswith("/"):
        p = "/" + p
    while "//" in p:
        p = p.replace("//", "/")
    if len(p) > 1 and p.endswith("/"):
        p = p[:-1]
    return p


def dav_url(path: str) -> str:
    encoded = "/".join(quote(seg, safe="") for seg in norm(path).split("/"))
    return f"{BASE}/dav{encoded}"


def parse_propfind(xml_text: str, current: str):
    ns = {"d": "DAV:"}
    root = ET.fromstring(xml_text)
    target = norm(current)
    items = []
    for resp in root.findall(".//d:response", ns):
        href = (resp.findtext("d:href", default="", namespaces=ns) or "").strip()
        if not href:
            continue
        p = urlparse(href).path
        idx = p.find("/dav")
        p = p[idx + 4 :] if idx >= 0 else p
        p = norm(unquote(p))
        if p == target:
            continue
        prop = resp.find(".//d:prop", ns)
        is_dir = prop is not None and prop.find(".//d:collection", ns) is not None
        name = (
            prop.findtext("d:displayname", default="", namespaces=ns) if prop is not None else ""
        ) or p.split("/")[-1]
        items.append({"path": p, "name": name, "is_dir": is_dir})
    return items


def discover_files():
    session = requests.Session()
    session.auth = AUTH
    queue = deque(["/"])
    seen = set()
    found = {}
    while queue and len(found) < 4 and len(seen) < 600:
        cur = queue.popleft()
        if cur in seen:
            continue
        seen.add(cur)
        try:
            resp = session.request("PROPFIND", dav_url(cur), headers={"Depth": "1"}, timeout=25)
        except Exception:
            continue
        if resp.status_code not in (200, 207):
            continue
        try:
            entries = parse_propfind(resp.text, cur)
        except Exception:
            continue
        for item in entries:
            if item["is_dir"]:
                queue.append(item["path"])
            else:
                lower = item["name"].lower()
                ext = lower.rsplit(".", 1)[-1] if "." in lower else ""
                if ext in TARGET and ext not in found:
                    found[ext] = item
    return found


def get_direct_info(session: requests.Session, path: str):
    remote = dav_url(path)
    head = session.head(remote, allow_redirects=False, timeout=20)
    loc = head.headers.get("location")
    if loc:
        return {"status": head.status_code, "need_auth": False, "remote": remote, "direct": loc}

    probe = session.get(remote, headers={"Range": "bytes=0-0"}, allow_redirects=False, timeout=20)
    loc = probe.headers.get("location")
    if loc:
        return {"status": probe.status_code, "need_auth": False, "remote": remote, "direct": loc}
    if probe.status_code < 400:
        return {"status": probe.status_code, "need_auth": True, "remote": remote, "direct": remote}
    return {"status": probe.status_code, "need_auth": False, "remote": remote, "direct": ""}


def run():
    files = discover_files()
    print("发现文件：")
    for ext in ("pdf", "docx", "xlsx", "pptx"):
        print(f"  {ext}: {files.get(ext, {}).get('path', '未找到')}")

    session = requests.Session()
    session.auth = AUTH
    print("\n链路验证：")
    for ext in ("pdf", "docx", "xlsx", "pptx"):
        item = files.get(ext)
        if not item:
            print(f"[{ext}] 未找到，跳过")
            continue
        info = get_direct_info(session, item["path"])
        print(f"[{ext}] status={info['status']} need_auth={info['need_auth']}")
        if ext == "pdf":
            resp = session.get(info["remote"], stream=True, timeout=30)
            signature = resp.raw.read(8)
            print(f"      代理返回签名: {signature!r}")
        elif ext in {"docx", "xlsx", "pptx"} and info["direct"] and not info["need_auth"]:
            office = (
                "https://view.officeapps.live.com/op/embed.aspx?src="
                + quote(info["direct"], safe="")
            )
            r = requests.get(office, timeout=30)
            print(f"      Office 预览状态: {r.status_code}")


if __name__ == "__main__":
    run()

