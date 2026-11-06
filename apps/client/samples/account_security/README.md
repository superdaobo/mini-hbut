# 样例模块：账号安全概览（#1169 T08）

一个**真实只读**的第一方模块，用来证明「页面与解析可单独更新，不用发安装包」。

## 它做什么

展示当前账号的：

1. **在线设备**（能力 `school.portal_client_ip`）
2. **最近登录记录**（能力 `school.portal_page_view`）

两个接口都是应用现有代码在用的只读 GET（`http_client/academic/student_info.rs` 的
`USER_ONLINE_URL` / `USER_LOGS_URL`），由 Rust 受控请求内核代为发起。

## 为什么它安全

| 约束 | 实现 |
|---|---|
| 模块不持有会话 | 只有 `hbu-module-fetch` 消息 → 宿主 → Rust；Cookie 留在 Rust 的 `Jar` |
| 模块不能指定 URL/头 | 能力登记表写死 host/path/method；模块只能给 `t` 这个参数值 |
| 未验签不可用 | 清单签名失败 → 实例 `trusted=false` → 请求被 `MODULE_NOT_TRUSTED` 拦下 |
| 环境受限 | 本机内容走 4398 独立 origin + `sandbox`；CSP 只允许同源脚本 |

## 文件

```
index.html   页面骨架（无内联脚本，避免 CSP 例外）
main.js      消息往返 + 渲染（只看形状，不猜业务）
parse.js     纯函数解析层 —— 单独可测、单独可换
style.css    样式（无外部字体/图片依赖）
```

## 构建与签名

```bash
cd apps/client
node scripts/build_sample_module.mjs            # 默认 1.0.0 / release_seq=1
node scripts/build_sample_module.mjs --version 1.0.1 --release-seq 2
```

产物在 `dist-modules/account_security-<version>/`：

- `bundle.zip`（平台自带压缩打包，不引入新依赖）
- `manifest.json`（与 Rust 逐字节一致的规范化字节 + Ed25519 签名）
- `canonical.txt`（签名输入，排障用）

> 默认用**测试 seed**（`dev-test-1`，仅 debug 构建被信任）。真实发布必须 `--key-file`
> 指向仓库外的私钥；mock 私钥进仓库会被 `scripts/check_module_signing_material.mjs` 拦下。

## 产物已被运行期验签覆盖

`src-tauri/src/modules/testdata/sample_module/` 里存了这份产物，Rust 单测
`sample_module_artifact_tests` 会断言：

1. 清单的规范化字节与 `canonical.txt` **逐字节一致**；
2. 签名能被内置信任根验证；
3. 清单里确实声明了 `school.portal_client_ip` / `school.portal_page_view` 两个能力。

也就是说：**发布流水线产出的东西，运行期真的认**（不是只认单测自己构造的数据）。

## 单独更新怎么走

改 `parse.js`（或 `main.js`）→ 重新 `build_sample_module`（`--release-seq` +1）→ 上传
`bundle.zip` + `manifest.json` 到 CDN → 客户端下次打开即用。**不动 Rust、不动宿主、不重新安装 App。**

## 还没做的

- 真机取数（需要登录态）：解析层与协议层都有测试，但真实接口字段仍需一次实测确认；
- 课表/成绩类接口（POST）尚未登记进能力表 —— 需要先把表单参数核对清楚再写进 `CAPABILITIES`。
