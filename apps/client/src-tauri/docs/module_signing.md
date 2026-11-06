# 模块发布签名：用法、策略与密钥边界（#1166 T05）

> 2026-11-02。实现：`modules/module_manifest.rs`（Rust 验签）+ `scripts/sign_module_manifest.mjs`（签名工具）。
> 契约：`docs/architecture/contracts/module-and-auth-contracts.md` §2（清单字段与签名覆盖范围）。

## 一、签署一个模块

```bash
cd apps/client

node scripts/sign_module_manifest.mjs \
  --bundle <模块包.zip> \
  --out   <输出目录>/manifest.json \
  --module-id demo --version 1.0.0 --release-seq 1 --channel main \
  --name "示例模块" --entry index.html \
  --permissions school.schedule \
  --key-file <私钥文件>
```

- `--release-seq` 必须**单调递增**（防回放靠它）；同一模块重复发布要 +1。
- `--permissions` 逗号分隔，脚本会排序后写入规范化字节（与 Rust 一致）。
- `--test-seed`：使用固定测试 seed（**只用于测试/本地**）；真实发布必须用 `--key-file`。
- `--print-canonical`：打印规范化字节，便于排查「签出来的东西 Rust 不认」。

产物 `manifest.json` 放到模块包同一目录（`module_center` 会按 `{cdn}/{channel}/{id}/manifest.json` 取）。

## 二、签名覆盖范围（关键）

签名覆盖**除 `signature` 外、结构体声明过的全部字段**的规范化字节：

- 键**字典序**、无空白、UTF-8（Rust 用 `serde_json` 的 BTreeMap + `to_vec`；Node 用 `canonicalJson`）；
- 参与签名的字段（**15 个**）：`module_id / version / release_seq / channel / module_name /
  entry_path / package_sha256 / min_compatible_version / compat{host_min,bridge_protocol} /
  permissions[] / publisher_key_id / package_url / package_size / open_url / schema_version`。

> ⚠️ **2026-11-06 变更（安全修正）**：`package_url` / `package_size` / `open_url` / `schema_version`
> 此前**不在**结构体里，因而属于「不参与签名的扩展字段」——攻击者若能改写清单（镜像/中间人，
> 或落到 CDN 的写权限），就能把模块的**下载地址**与**嵌入地址**改到别处而不破坏签名
> （包体仍受 `package_sha256` 约束，但嵌入地址完全不受约束）。现在它们进入结构体 →
> 进入规范化字节 → 进入签名覆盖。
>
> **迁移影响**：本变更改变了规范化形态，按旧形态签名的清单会验签失败。模块 CDN 尚未发布
> 正式模块，因此只需重新签发样例模块（`node scripts/build_sample_module.mjs`）与
> 跨语言夹具（见下）。回归测试：`tampering_distribution_fields_breaks_signature`。
>
> 仍然**不参与签名**的字段（仅展示用，运行期不据其做安全决策）：`published_at` / `release_notes` /
> `package_urls`（由 `package_url` 派生）。

**跨语言一致性由测试锁定**：`module_manifest.rs` 的 `cross_language_tests` 直接消费
`src-tauri/src/modules/testdata/node_signed_manifest.json`（由签名脚本生成），断言
Rust 规范化字节与 Node 逐字节相同、且签名能被内置信任根验证。任何一侧改了格式，测试立刻红。
夹具的再生成命令见该测试上方的文档注释（**必须用 `--print-canonical` 且只把 stdout 重定向到
`node_canonical.txt`**，脚本在该模式下把日志写到 stderr）。

## 三、签名策略（当前）

| 构建 | 缺签名/错签名/未知 key | 结果 |
|---|---|---|
| **Release** | 拒绝安装 | 返回 `MODULE_SIGNATURE_*` / `MODULE_PUBLISHER_KEY_UNKNOWN`，模块不可用 |
| **Debug** | 允许安装但 `trusted=false` | 模块能加载，但**拿不到任何敏感能力**（受控请求按 `trusted` 拒绝） |
| 任意 | 显式 `HBUT_MODULE_SIGNATURE_POLICY=enforce` | 与 Release 相同（便于本地复现生产行为） |

> 为什么 debug 放宽：在 T08 产出已签名包之前，旧模块（含 11 个游戏）都还没有签名；若 debug 也硬拒，
> 开发期会把「模块加载」整体打断。放宽的只是**安装**，不是**授权** —— `trusted=false` 的模块在
> 受控请求层被拒（T06）。

## 四、防回放

- Rust 在 `{app_cache_dir}/more_modules/.release-seq.json` 记录每个 `channel:module_id` 已见的
  最大 `release_seq`；新包序号更小 → `MODULE_RELEASE_REPLAY`。
- **同 sha256 的幂等重试**（重复 prepare、缓存命中）不算回放。
- 受控回退通过「重新发布一个更高 `release_seq`、内容为旧版」的包实现，而不是接受旧清单。

## 四·补 缓存 / 离线 / 回退的同一信任要求

| 场景 | 行为 | 证据 |
|---|---|---|
| 冷缓存 | 先验签再下载；摘要必须等于清单声明 | `prepare_module_bundle` 顺序：`parse_and_verify_manifest` → 下载 → 比对 |
| 缓存命中 | 复用缓存，但要求「缓存里的签名 == 当前清单签名」且摘要/最小版本/入口一致 | `resolve_cached_entry_path` + 签名比对分支；单测 `cached_entry_requires_matching_sha_and_metadata` |
| 缓存元数据不一致 | 视为缓存失效：删目录重新下载（不会「用旧包凑合」） | `prepare_module_bundle` 的 `fs::remove_dir_all` 分支 |
| **同版本重新发布**（新 `release_seq`/新 `package_sha256`） | 旧缓存签名与当前清单不一致 → **丢弃缓存并重新下载**（不再直接报错） | 2026-11-06 真机修正；`eprintln!("[T05] 模块缓存失效…")` |
| 解包后内容被改动 | 缓存命中时重算 `bundle.zip` 的 sha256 与清单比对，不一致 → 丢弃缓存并重新下载 | `cached_bundle_integrity_ok` |
| 离线 | 无缓存且无法下载 → 报错；有缓存则命中路径同样要过签名比对 | 同上 |
| 降级（未签名） | `trusted=false`：允许安装但不授予敏感能力（能力层由 T06 拒绝） | `ModuleBundlePrepareResult.trusted` |
| 回退到旧版 | **只接受更高 `release_seq` 的包**；受控回退 = 用旧内容重新发布更高序号 | `ensure_release_seq` + `MODULE_RELEASE_REPLAY` |

## 五、密钥边界（必须遵守）

1. **真实发布私钥不进仓库**，只在受控签名环境使用；CI 用 `scripts/check_module_signing_material.mjs`
   强制检查（`test-frontend` job 已接入）：
   - 任何 PEM 私钥块只允许在 `**/testdata/**`、`**/fixtures/**`；
   - 07 重复拼成的测试 seed 只允许出现在签名脚本与两个 Rust 单测文件；
   - 形如 `module_signing_key*` 的非测试密钥文件直接判失败。
2. **测试密钥 `dev-test-1` 只在 debug 构建被信任**（`TrustedKey.debug_only`），release 构建中
   `trusted_key()` 会直接返回 `None` ⇒ 用测试私钥签出的包在正式版**装不上**。这是刻意的：
   测试密钥泄漏也不会变成生产后门。
3. 密钥轮换/撤销属于 T15（退役与运维）范围，本阶段只登记：清单的 `publisher_key_id` 已为轮换预留。

## 六、本地自检

```bash
cd apps/client
node scripts/check_module_signing_material.mjs --root .          # 密钥边界守卫
node -e "console.log(require('fs').readFileSync('src-tauri/src/modules/testdata/node_canonical.txt','utf8'))"
cd src-tauri && cargo test --lib module_manifest                # 验签 + 跨语言一致性（默认 features 可跑）
cargo test --lib t05_signature_and_unpack                       # 解包边界
```
