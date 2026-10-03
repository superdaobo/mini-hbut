#!/usr/bin/env python3
"""Material Symbols 子集工具的 Python 侧实现（供 build_font_subset.mjs 调用）。

两个子命令：
  dump-names  解析字体里「能渲染的 ligature 名」并导出 JSON（用于生成 glyph-manifest）
  subset      按给定图标名清单裁剪字体，并回读产物确认实际可渲染的 ligature

ligature 名的判定必须走 GSUB 而不是字形名：本仓库产出的 woff2 在 subset 后 post 表
降级为 3.0（无字形名），`getGlyphOrder()` 只能拿到 glyphNNNNN 之类的合成名；只有
GSUB 的 ligature 组件序列（经 cmap 反查成字符）才是「用户输入这个词能出图标」的权威依据。
"""

import argparse
import json
import sys

from fontTools.ttLib import TTFont

# 兜底字符：只保留下划线（图标名的连接符）。
#
# 注意：这里**不能**塞进完整 ASCII。subsetter 默认开启 layout closure，会保留所有
# 「用当前 cmap 字符能拼出来」的 ligature；一旦把 a-z0-9A-Z 全部放进 cmap，几乎全量
# 图标都会被判定为可达，子集就退化成了整份字体（实测 4268/4268 ligature，3.9MB）。
# 图标名本身携带的字符已足够，多余字符只会让裁剪失效。
DEFAULT_FALLBACK_CHARS = "_"


def _reverse_cmap(font):
    """字形名 → 字符。同一字形映射多个码点时优先保留可打印 ASCII。"""
    rev = {}
    for cp, glyph_name in (font.getBestCmap() or {}).items():
        if glyph_name not in rev or 32 <= cp < 127:
            rev[glyph_name] = chr(cp)
    return rev


def _walk_subtable(subtable, rev, out):
    """递归处理 lookup（含 Extension 类型 7）里的 ligature 替换。"""
    if subtable is None:
        return
    if hasattr(subtable, "ExtSubTable"):
        _walk_subtable(subtable.ExtSubTable, rev, out)
        return
    ligatures = getattr(subtable, "ligatures", None)
    if not ligatures:
        return
    for first, items in ligatures.items():
        for ligature in items:
            components = [first] + list(ligature.Component)
            text = "".join(rev.get(name, "") for name in components)
            if text:
                out[text] = ligature.LigGlyph


def ligature_name_map(font):
    """返回 {ligature 文本: 结果字形名}。"""
    out = {}
    gsub = font.get("GSUB")
    if gsub is None:
        return out
    rev = _reverse_cmap(font)
    lookup_list = gsub.table.LookupList
    if lookup_list is None:
        return out
    for lookup in lookup_list.Lookup:
        for subtable in lookup.SubTable:
            _walk_subtable(subtable, rev, out)
    return out


def _font_facts(path):
    font = TTFont(path)
    ligatures = ligature_name_map(font)
    return {
        "glyphCount": len(font.getGlyphOrder()),
        "cmapChars": "".join(sorted(chr(cp) for cp in (font.getBestCmap() or {}))),
        "ligatureNames": sorted(ligatures.keys()),
    }


def cmd_dump_names(args):
    facts = _font_facts(args.font)
    payload = {
        "fontFile": args.font,
        "glyphCount": facts["glyphCount"],
        "cmapChars": facts["cmapChars"],
        "ligatureNameCount": len(facts["ligatureNames"]),
        "ligatureNames": facts["ligatureNames"],
    }
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"[font-tools] dump-names: {len(facts['ligatureNames'])} ligature names from {args.font}")
    return 0


def cmd_subset(args):
    with open(args.names, encoding="utf-8") as handle:
        requested = json.load(handle)

    source = TTFont(args.source)
    available = ligature_name_map(source)
    kept = [name for name in requested if name in available]
    dropped = sorted(set(requested) - set(kept))

    # 延迟导入：只有真正要生成字体时才需要 subset / instancer 模块
    from fontTools.subset import Options, Subsetter
    from fontTools.varLib import instancer

    # 变体轴必须保留（#974）：`font-variation-settings: 'FILL' 1`（实心图标，全仓
    # .fill 类 19 处 + 内联 17 处）依赖 fvar（轴定义）+ gvar（字形轮廓变化）+
    # avar（轴映射，若存在）三者齐备才能生效 —— 此前显式 drop 导致全部实心声明
    # 退化为 outline。STAT（样式名元数据）与 MVAR（逐字形度量变化，对图标排版无
    # 影响）允许丢弃。产物回读时校验 fvar 存在，缺失即失败。
    options = Options()
    # liga/clig/calt：Material Symbols 用图标名连字渲染（缺了会显示英文 icon name）
    options.layout_features = ["rclt", "rlig", "liga", "clig", "calt", "dlig"]
    options.drop_tables = ["DSIG", "STAT", "MVAR"]
    options.notdef_outline = True
    options.name_IDs = [1, 2]
    options.name_legacy = True
    options.recalc_bounds = True
    options.recalc_timestamp = False
    # 不保留字形名（post 3.0）：与仓库现有产物形态一致，可省下约 30KB；
    # ligature 名的审计走 manifest（从 GSUB 解析），不依赖 post 表。
    options.glyph_names = False

    # 顺序刻意为「先子集化、后 pin 轴」：
    # 1) Subsetter 在**原始可变字体**上做 layout closure（rvrn / FeatureVariations
    #    尚未被改写），字形名与源字体一致 —— 先 instancer 会把 FILL 轴的 variation
    #    alternates（`*.fill` 字形名）内联进 GSUB，subsetter 闭包后引用到不存在于
    #    glyf 的字形（实测 KeyError 'readiness_score.fill'）；
    # 2) pin 轴放在子集之后：只对保留下来的少量字形做实例化，gvar 被裁剪到仅剩
    #    FILL 轴 —— 若保留全量 gvar，子集字体会从 ~320KB 暴涨到 ~3.8MB。
    subsetter = Subsetter(options=options)
    subsetter.populate(text="".join(kept) + DEFAULT_FALLBACK_CHARS)
    subsetter.subset(source)

    # #974：CSS 只用 `FILL` 轴切换实心/空心（基础类 'FILL' 0，.fill 类 'FILL' 1），
    # 其余三轴在 CSS 中的声明值（wght 400 / GRAD 0 / opsz 24）与轴默认值一致。
    # 把这三轴**钉死**为默认值，只保留 FILL 轴可变；被 pin 轴的 CSS 声明成为 no-op
    # （产物字体已无该轴），FILL 0/1 继续生效。
    instancer.instantiateVariableFont(
        source,
        {"wght": 400.0, "GRAD": 0, "opsz": 24},
        inplace=True,
    )

    source.flavor = "woff2"
    source.save(args.output)

    # 产物回读：变体轴护栏（#974）—— fvar 缺失意味着 font-variation-settings 全部失效，
    # 属于静默回归，这里直接失败而不是写出一个"看起来成功"的字体。
    produced_font = TTFont(args.output)
    if produced_font.get("fvar") is None:
        print(
            "[font-tools] ERROR: produced font has no `fvar` table — "
            "variation axes (FILL/wght/GRAD/opsz) would be dead. "
            "Check `drop_tables` in cmd_subset.",
            file=sys.stderr,
        )
        return 1

    produced = _font_facts(args.output)
    # 变体轴清单（#974）：写进 manifest 供契约测试断言（FILL 轴必须在场）
    produced_font_axes = []
    if produced_font.get("fvar") is not None:
        produced_font_axes = [
            {"tag": axis.axisTag, "min": axis.minValue, "default": axis.defaultValue, "max": axis.maxValue}
            for axis in produced_font["fvar"].axes
        ]
    manifest = {
        "schemaVersion": 1,
        "fontFile": args.output,
        "sourceFont": args.source,
        "requestedNameCount": len(requested),
        "missingFromSourceFont": dropped,
        # 键名与 dump-names 输出保持一致（build_font_subset.mjs 的 regenerate 按
        # `ligatureNames` 读取；旧键 `fontGlyphNames` 是一次不匹配的笔误，已统一）
        "ligatureNames": produced["ligatureNames"],
        "cmapChars": produced["cmapChars"],
        "glyphCount": produced["glyphCount"],
        "variationAxes": produced_font_axes,
    }
    with open(args.manifest, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(
        f"[font-tools] subset: requested={len(requested)} kept={len(kept)} "
        f"missing={len(dropped)} -> {produced['glyphCount']} glyphs, "
        f"{len(produced['ligatureNames'])} ligatures"
    )
    if dropped:
        preview = ", ".join(dropped[:20])
        print(f"[font-tools] not present in source font (ignored): {preview}", file=sys.stderr)
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="Material Symbols subset helper")
    sub = parser.add_subparsers(dest="command", required=True)

    dump = sub.add_parser("dump-names", help="export renderable ligature names from a font")
    dump.add_argument("--font", required=True)
    dump.add_argument("--output", required=True)
    dump.set_defaults(func=cmd_dump_names)

    subset = sub.add_parser("subset", help="subset a font to the given ligature names")
    subset.add_argument("--source", required=True)
    subset.add_argument("--output", required=True)
    subset.add_argument("--names", required=True, help="JSON array of ligature names")
    subset.add_argument("--manifest", required=True, help="where to write the glyph manifest")
    subset.set_defaults(func=cmd_subset)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
