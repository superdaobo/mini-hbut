# Material Symbols 子集字体：生成流程与产物归属（#973）

## 背景与决策

图标以 ligature 文本渲染（`<span class="material-symbols-outlined">school</span>`），仓库随包一份
「按源码引用裁剪」的子集字体。**生成模式采用「提交产物 + 门禁校验」**（改动最小、可复现构建）：

- 产物（woff2）由开发者本机生成后提交入库，`npm run build` 不依赖 Python 环境；
- 漂移由契约测试拦下：`apps/client/src/utils/icon_font_subset_contract.spec.ts`
  （源码扫描结果 ⊆ 字体可渲染集合，缺字形即红，`npm run test:ci` 可观察）。

## 唯一生成入口（不要手写/手裁字体）

```bash
cd apps/client
npm run font:subset   # 重新扫描源码并生成子集 + manifest（需要 Python + fonttools + brotli）
npm run font:check    # 只校验「源码用到的图标名 ⊆ 字体可渲染名」，缺失则退出码 1（CI 可直接调用）
```

依赖：`pip install fonttools brotli`（解释器优先取 `MINI_HBUT_PYTHON`，其次 `python3` / `python` / `py -3.13`）。

## 产物归属

| 文件 | 位置 | 说明 |
|---|---|---|
| 子集字体 | `apps/client/public/fonts/material-symbols-outlined.subset.woff2` | 运行时资源，随包发布 |
| 图标 CSS | `apps/client/public/fonts/material-symbols-outlined.css` | 运行时资源，随包发布 |
| glyph-manifest.json | `apps/client/scripts/fonts/glyph-manifest.json` | **开发/审计元数据**（生成器与契约测试读取，运行时零消费者），放在 `public/` 之外 —— 不被 Vite 复制进 `dist`，**不随安装包发布**（#973） |

## 生成时机（必须遵守）

1. **源码新增/删除任何图标名之后**（`.vue` / `.html` / `.ts` 里的 ligature 名或 `iconMap` 值）；
2. **release 前必须重跑一次**（`npm run font:subset && npm run font:check`），
   并把更新后的 woff2 与 manifest 一起提交 —— 发布流程的 `check:release` 门禁不生成字体，
   漂移只能靠这条纪律 + 契约测试兜底；
3. `--manifest-only` 模式仅在字体字节不变、只补 manifest 时使用（罕见）。

## 变体轴（FILL / wght / GRAD / opsz）—— #974

源字体是 Material Symbols 可变字体。子集化时**必须保留变体轴相关表**：
`fvar`（轴定义）+ `gvar`（字形轮廓变化）+ `avar`（轴映射）；
`STAT`（样式名元数据）与 `MVAR`（逐字形度量变化，对图标排版无影响）允许丢弃。
`drop_tables` 只列 `DSIG` / `STAT` / `MVAR` —— 若把 `fvar`/`gvar`/`avar` 丢弃，
CSS 的 `font-variation-settings: 'FILL' 1`（实心图标，全仓 36 处）会全部退化为 outline。
`font_subset_tools.py` 的 `cmd_subset` 在产物回读时校验 `fvar` 存在，缺失即退出码 1。

**非 FILL 轴的 pin 决策**：CSS 只用 `FILL` 轴切换实心/空心，其余三轴（wght 400 / GRAD 0 /
opsz 24）声明值与轴默认值一致。生成流程在子集化**之后**用 `fontTools.varLib.instancer`
把这三轴钉死为默认值（先子集后 pin 的顺序不可反 —— 先 pin 会把 FILL 轴 variation
alternates 内联进 GSUB，subsetter 闭包会引用到不存在的 `*.fill` 字形）。
全量保留四轴时 gvar 会把子集撑到 ~3.8MB；pin 轴后产物只含 FILL 轴，manifest 的
`variationAxes` 字段（契约测试断言）记录实际保留的轴。

**实测体积（fonttools 4.64.0，2026-10）**：

| 版本 | 大小 | 表集合 |
|---|---|---|
| 旧子集（丢全部变体轴） | 320,444 B | 无 fvar/gvar/avar/STAT/MVAR |
| 新子集（保留 FILL 轴） | 393,420 B（+71KB / +22.8%） | 含 fvar/gvar/avar（仅 FILL 0..1 轴），STAT/MVAR 丢弃 |
| 源字体（全量 4 轴） | 3,964,532 B | 对照 |
