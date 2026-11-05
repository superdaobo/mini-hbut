# 模块端到端验收手册（T08 / #1169）

> 2026-11-06。**能自动化的已自动化，需要 GUI/真机的列成可执行步骤**；未执行的一律标 `unverified`。

## 一、已自动化（CI 每次都会跑）

| 环节 | 覆盖方式 | 位置 |
|---|---|---|
| 清单规范化 + 签名 | Rust 跨语言回归（Node 签的清单 Rust 能验、字节一致） | `module_manifest::cross_language_tests` |
| **真实发布产物可被运行期验签** | Rust 读 `testdata/sample_module/`（由构建脚本产出）验证 | `module_manifest::sample_module_artifact_tests` |
| 打包 → 签名 → 校验 全链路 | Node 里造包、签名、跑 `verify_module_artifact.mjs`；篡改包/未知密钥必须被拒 | `src/utils/module_artifact_pipeline.spec.ts` |
| 解析层（正常/包装/空/失败/非 JSON/未知结构） | vitest | `src/utils/sample_module_parse.spec.ts` |
| 验签策略（缺签名/篡改/回放/解包边界/缓存完整性） | Rust 单测 | `module_manifest` / `t05_signature_and_unpack` |
| 受控请求准入（能力/参数/头/上限/并发/账号） | Rust 单测 + 前端协议契约 | `module_session_fetch` / `module_controlled_request.spec.ts` |
| 宿主接线（来源校验顺序、未验签本地拦截、实例生命周期） | 源码契约 | `module_fetch_wiring_contract.spec.ts` |
| 隔离（端口分离 / origin 不可信 / sandbox / CSP） | 源码契约 + Rust 单测 | `module_isolation_contract.spec.ts` |
| 远端嵌入白名单 / 协议版本 fail-closed（两侧） | 源码契约 | `module_t07_contract.spec.ts` / `module_t07_closeout_contract.spec.ts` |

## 二、必须人工执行（当前全部 `unverified`）

### A. 模块发现 → 打开 → 取数 → 关闭（Windows）

1. `cd apps/client && npm run tauri:dev`
2. 把样例产物挂到可访问位置：把 `dist-modules/account_security-1.0.0/{bundle.zip,manifest.json}` 上传到测试 CDN 路径（或本地静态服务器），确保 `manifest_url` 可访问。
3. 应用中心 → 找到「账号安全概览」→ 打开。
4. 期望：
   - 模块从 `http://127.0.0.1:4398/module_bundle/content/...` 加载（DevTools 里确认 origin）；
   - 两卡片显示「N 条」或「无记录」，**不是** `MODULE_NOT_TRUSTED`；
   - 控制台无 CSP 违规。
5. 关闭再打开一次（验证实例重建）；切换账号后再打开（验证 `MODULE_ACCOUNT_SWITCHED` 不会误报）。

### B. 只换模块包（证明「改解析不发安装包」）

1. 改 `samples/account_security/parse.js` 里任一列名映射；
2. `node scripts/build_sample_module.mjs --release-seq 2`；
3. 上传新包与清单 → 应用里重新打开模块；
4. 期望：界面变化生效，**App 未重装、Rust 未改**。

### C. 回退

1. 用 `--release-seq 3` 发布「旧内容」；
2. 把 `--release-seq 1` 的清单放回 CDN；
3. 期望：客户端拒绝（`MODULE_RELEASE_REPLAY`），模块仍可用（旧缓存或新包），不出现「版本倒退」。

### D. 11 个游戏回归

按 `goal-8/evidence/s7-games-regression.md` 的 25 条 checkbox 执行，重点：
- 握手（`hello`/`welcome`，协议版本 1）成功；
- Launch Ticket 能领到并能兑换；
- 尺寸上报生效（iframe 自适应高度）；
- 排行榜/成绩在 verified 与本地两种模式下表现正常。

### E. 四条负向隔离

按 `goal-8/evidence/s8-negative-test-recipe.md`：模块内 `fetch` 桥、`invoke('bridge_session_token')`、读 `parent.document`、remount 旧上下文发消息 —— 全部应失败。

## 三、发布前必跑

```bash
cd apps/client
node scripts/build_sample_module.mjs --release-seq <n>
node scripts/verify_module_artifact.mjs --dir dist-modules/account_security-<version> \
  --expect-capabilities school.profile_online,school.login_logs
```

`verify_module_artifact.mjs` 会校验：包/清单存在、sha256 一致、签名可被**内置信任根**验证、
`release_seq` 为正、`entry_path` 合法、能力已声明。**不通过就不要上传。**

## 四、结论口径

- 自动化部分全绿 ≠ T08 验收完成；
- 本文件第二节 A~E 未执行前，#1169 的「完整链路」「11 个游戏无回归」两条只能标 `unverified`。
