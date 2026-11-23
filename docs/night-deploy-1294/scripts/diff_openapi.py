#!/usr/bin/env python3
"""对比旧镜像（生产基线）与新镜像的 OpenAPI 契约差异。

关注：同一路径同一方法下，query/path 参数集合、requestBody 是否存在、$ref 是否变化。
任何变化都打印出来，供人工判定是否回归。
"""
from __future__ import annotations

import json

OLD = "live_openapi.json"  # 部署前抓的生产基线（3662bdf）
NEW = "openapi_new.json"  # 新镜像（main 5be5121）


def sig(doc: dict, path: str, method: str) -> dict:
    op = doc["paths"][path][method]
    params = sorted((p.get("in"), p.get("name"), bool(p.get("required"))) for p in op.get("parameters", []))
    rb = op.get("requestBody") or {}
    content = (rb.get("content") or {}).get("application/json", {}).get("schema", {})
    return {
        "params": params,
        "body_ref": content.get("$ref") or (json.dumps(content, sort_keys=True)[:80] if content else ""),
        "summary": (op.get("summary") or "").strip(),
    }


def main() -> int:
    old = json.load(open(OLD, encoding="utf-8"))
    new = json.load(open(NEW, encoding="utf-8"))
    old_paths = set(old["paths"])
    new_paths = set(new["paths"])
    print("旧镜像路径数:", len(old_paths), " 新镜像路径数:", len(new_paths))
    print("新增路径:", sorted(new_paths - old_paths))
    print("删除路径:", sorted(old_paths - new_paths))
    print("-" * 70)
    changed = 0
    for path in sorted(old_paths & new_paths):
        methods_old = set(old["paths"][path])
        methods_new = set(new["paths"][path])
        if methods_old != methods_new:
            print(f"[方法集变化] {path}: {sorted(methods_old)} -> {sorted(methods_new)}")
            changed += 1
        for method in sorted(methods_old & methods_new):
            a = sig(old, path, method)
            b = sig(new, path, method)
            if a["params"] != b["params"] or a["body_ref"] != b["body_ref"]:
                changed += 1
                print(f"[契约变化] {method.upper()} {path}")
                if a["params"] != b["params"]:
                    print(f"    params: {a['params']} -> {b['params']}")
                if a["body_ref"] != b["body_ref"]:
                    print(f"    body: {a['body_ref']} -> {b['body_ref']}")
                if a["summary"] != b["summary"]:
                    print(f"    summary: {a['summary']!r} -> {b['summary']!r}")
    print("-" * 70)
    print("契约变化总数:", changed)
    with open("openapi_diff_result.json", "w", encoding="utf-8") as fh:
        json.dump(
            {
                "old_paths": len(old_paths),
                "new_paths": len(new_paths),
                "added": sorted(new_paths - old_paths),
                "removed": sorted(old_paths - new_paths),
                "changed_count": changed,
            },
            fh,
            ensure_ascii=False,
            indent=2,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
