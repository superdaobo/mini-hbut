# 全平台安装包 / 前端资源体积基线与门禁

## 目标

- **全平台同等关注**（Win / macOS / Linux / Android / iOS）。
- **全部本地资源**（禁止为瘦身引入 CDN）。
- 可复现测量 + CI/本地门禁，防止相对基线异常膨胀。

## 1. 前端打入包的可跟踪资源（本地脚本）

```bash
node scripts/report_release_asset_sizes.mjs
node scripts/report_release_asset_sizes.mjs --out size-report.json
node scripts/report_release_asset_sizes.mjs --baseline size-before.json --out size-after.json
```

跟踪文件见脚本内 `TRACKED` 列表（splash 图标、favicon、app-icon、字体子集等）。

**软门禁（脚本内建）**：相对 baseline `totalBytes` 增长 **> 5%** 时 exit 1。

### 基线快照（main 合入 #269 后补丁前 → 本轮后）

| 资源 | 之前 | 之后 |
|------|------|------|
| `public/splash/app_icon.png` | ~388.5 KB | ~91.4 KB |
| `public/splash/app_icon.webp` | ~54 KB | ~34 KB |
| `public/favicon.svg` | ~358 KB（内嵌 1024 PNG base64） | ~42 KB（256 PNG） |
| `src/assets/app-icon.svg` | 与 favicon 重复 ~358 KB | 与 favicon 同 ~42 KB |
| `public/fonts/material-symbols-outlined.subset.woff2` | ~311 KB | 重建子集后仍约 311–312 KB（见下） |

字体：`node scripts/build_font_subset.mjs` 从全量 Material Symbols 按源码引用重建子集；当前引用约 168 icons 时子集约 **311 KB**（相对全量约 3.8 MB 已 92% 压缩）。进一步下降需减少图标种类。

## 2. 各平台发布物体积（GitHub Release）

对 tag（示例 v1.4.2 / v1.4.3）：

```bash
gh release view v1.4.2 --json assets --jq '.assets[] | {name,size}'
gh release view v1.4.3 --json assets --jq '.assets[] | {name,size}'
```

历史对比（调研记录）：

| 产物 | v1.4.2 | v1.4.3 | Δ |
|------|--------|--------|---|
| arm64.apk | 24.6 MB | 25.0 MB | +316 KB |
| iOS.ipa | 18.1 MB | 18.5 MB | +405 KB |
| universal.dmg | 15.4 MB | 16.2 MB | +816 KB |
| x64-setup.exe | 6.3 MB | 6.4 MB | +39 KB |

## 3. CI / 本地策略

| 层级 | 策略 |
|------|------|
| PR 本地/CI 前端 | 对 `TRACKED` 资源跑 `report_release_asset_sizes.mjs`；可选与上一 release 基线 JSON 比较，**>5% fail** |
| Release | 发布后记录各平台 asset size 到 release notes；相对上一 tag **APK/IPA 增长 >3%** 需说明原因 |
| 告警 vs 失败 | 开发分支：告警日志；`main` release 工作流：超阈值失败（配置 `SIZE_GATE_STRICT=1`） |

可选 CI 片段：

```yaml
- name: Frontend asset size gate
  run: node scripts/report_release_asset_sizes.mjs --baseline docs/size-baseline.json
```

将当前 `node scripts/report_release_asset_sizes.mjs --out docs/size-baseline.json` 提交为基线。

## 4. 不在此门禁内

- `node_modules` / `target` / 未打入安装包的 `website/` 构建缓存。
- 腾讯地图 SDK 运行时下载（非本仓库静态资源）。
