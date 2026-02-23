#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Repair common mojibake in source files.

Typical case:
  UTF-8 Chinese text was mis-decoded as GBK/GB18030, resulting in strings like
  "璋冭瘯", "鍙傛暟", "鐧诲綍", etc.

Usage:
  python tools/fix_mojibake.py --dry-run
  python tools/fix_mojibake.py --apply
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Iterable, Tuple


ROOT = Path(__file__).resolve().parents[1]
TARGET_DIRS = [ROOT / "src", ROOT / "src-tauri" / "src"]
TARGET_EXTS = {".rs", ".ts", ".js", ".vue", ".tsx", ".md", ".json"}

# These characters/tokens are strong signals of UTF8->GBK mojibake in this repo.
SUSPECT_TOKENS = (
    "璋冭瘯",
    "鍙傛暟",
    "鐧诲綍",
    "鍝嶅簲",
    "浼氳瘽",
    "璇锋眰",
    "瑙ｆ瀽",
    "涓婁紶",
    "瀵煎嚭",
    "鎴愬姛",
    "澶辫触",
    "閿欒",
    "鏍″巻",
    "瀛︽湡",
    "瀛︾敓",
    "璇剧▼",
    "缂撳瓨",
    "鏁版嵁",
    "閾炬帴",
    "鑰冭瘯",
    "鎺掑悕",
    "鏉冮檺",
    "鍒濆鍖栨暟鎹簱澶辫触",
    "鑾峰彇",
)

# Additional suspicious single chars seen in mojibake blocks in this project.
SUSPECT_CHARS = set("璋鍙鐧鍝浼璇瑙涓瀵鎴澶閿鏍瀛缂閾鑰鎺鑾聹聬")

# Top frequent Chinese chars (trimmed set) for a lightweight language-likeness score.
COMMON_CJK = set(
    "的一是在不了有人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动"
    "同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高"
    "自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政"
    "四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道"
    "命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展果料象员革位入"
    "常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根"
    "论运农指几九区强放决西被干做必战先回则任取据处理世车系"
)

# CJK segment matcher.
CJK_SEGMENT_RE = re.compile(r"[\u3400-\u9fff\u3000-\u303f\uff00-\uffef\ue000-\uf8ff]{2,}")


def iter_target_files() -> Iterable[Path]:
    for base in TARGET_DIRS:
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if p.is_file() and p.suffix.lower() in TARGET_EXTS:
                yield p


def count_suspect_markers(text: str) -> int:
    score = 0
    for token in SUSPECT_TOKENS:
        score += text.count(token) * 3
    score += sum(1 for ch in text if ch in SUSPECT_CHARS)
    return score


def looks_suspect(text: str) -> bool:
    if any(token in text for token in SUSPECT_TOKENS):
        return True
    return sum(1 for ch in text if ch in SUSPECT_CHARS) >= 2


def contains_cjk(text: str) -> bool:
    return any("\u3400" <= ch <= "\u9fff" for ch in text)


def count_private_use(text: str) -> int:
    return sum(1 for ch in text if "\ue000" <= ch <= "\uf8ff")


def common_cjk_ratio(text: str) -> float:
    cjk_chars = [ch for ch in text if "\u3400" <= ch <= "\u9fff"]
    if not cjk_chars:
        return 0.0
    hit = sum(1 for ch in cjk_chars if ch in COMMON_CJK)
    return hit / len(cjk_chars)


def try_reverse_utf8_gbk(segment: str) -> str:
    """
    Reverse UTF-8 -> GBK mojibake by:
      mojibake_text.encode(gb18030).decode(utf-8)
    """
    try:
        fixed = segment.encode("gb18030").decode("utf-8", errors="ignore")
    except Exception:
        return segment
    return fixed


def try_second_pass_latin1_utf8(text: str) -> str:
    """
    Handle deeper mojibake chain:
      mojibake.encode(gbk)->decode(utf8) gives byte-like latin1 text,
      then latin1->utf8 restores Chinese.
    """
    try:
        fixed = text.encode("latin1", errors="ignore").decode("utf-8", errors="ignore")
    except Exception:
        return text
    return fixed


def should_accept(original: str, fixed: str) -> bool:
    if fixed == original:
        return False
    if not fixed.strip():
        return False
    if not contains_cjk(fixed):
        return False

    # Must improve suspiciousness score or language-likeness.
    o = count_suspect_markers(original)
    n = count_suspect_markers(fixed)
    o_private = count_private_use(original)
    n_private = count_private_use(fixed)
    o_ratio = common_cjk_ratio(original)
    n_ratio = common_cjk_ratio(fixed)

    improved = False
    if n < o:
        improved = True
    if n_private < o_private:
        improved = True
    if n_ratio >= o_ratio + 0.12:
        improved = True
    if o_private > 0 and n_private == 0:
        improved = True
    if not improved:
        return False

    # Avoid introducing replacement marks.
    if "\ufffd" in fixed:
        return False
    return True


def fix_text(text: str) -> Tuple[str, int]:
    changes = 0

    def replace_segment(m: re.Match[str]) -> str:
        nonlocal changes
        seg = m.group(0)
        candidate1 = try_reverse_utf8_gbk(seg)
        candidate2 = try_second_pass_latin1_utf8(candidate1)
        candidate3 = try_reverse_utf8_gbk(candidate2)

        for cand in (candidate1, candidate2, candidate3):
            if should_accept(seg, cand):
                changes += 1
                return cand
        return seg

    new_text = CJK_SEGMENT_RE.sub(replace_segment, text)
    return new_text, changes


def process_file(path: Path, apply: bool) -> Tuple[int, bool]:
    raw = path.read_text(encoding="utf-8", errors="replace")
    fixed, changes = fix_text(raw)
    touched = changes > 0 and fixed != raw
    if touched and apply:
        path.write_text(fixed, encoding="utf-8", newline="")
    return changes, touched


def main() -> int:
    parser = argparse.ArgumentParser(description="Repair mojibake in source files")
    parser.add_argument("--apply", action="store_true", help="write changes")
    parser.add_argument("--dry-run", action="store_true", help="scan only")
    args = parser.parse_args()

    apply = args.apply and not args.dry_run
    mode = "APPLY" if apply else "DRY-RUN"

    scanned = 0
    changed_files = 0
    changed_segments = 0
    details: list[tuple[Path, int]] = []

    for fp in iter_target_files():
        scanned += 1
        seg_changes, touched = process_file(fp, apply=apply)
        if touched:
            changed_files += 1
            changed_segments += seg_changes
            details.append((fp, seg_changes))

    print(f"[{mode}] scanned files: {scanned}")
    print(f"[{mode}] changed files: {changed_files}")
    print(f"[{mode}] changed segments: {changed_segments}")
    for fp, n in details:
        print(f"  - {fp.relative_to(ROOT)} ({n})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
