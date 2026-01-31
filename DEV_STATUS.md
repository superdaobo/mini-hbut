# 开发状态记录（2026-01-31）

## ✅ 已实现功能

### 客户端（Tauri + Vue）
- 首页/成绩/课表/考试/排名/校历/学业进度/培养方案/个人中心等基础页面。
- 交易记录页面：缓存优先、月份筛选、金额统计与空态提示（含字段兼容解析）。
- AI 对话页面：
  - 外层固定滚动，内层可滚动。
  - 头像贴边显示。
  - SSE 返回自动解析为正文。
  - Markdown 渲染 + LaTeX 公式渲染。
  - 历史记录本地保存。
  - 模型列表支持远程配置覆盖。
- 远程配置：公告、强制更新、OCR 入口、AI 模型列表、管理员列表。
- 自动更新检查与提示。

### 后端（Rust）
- One Code 与电费 SSO 逻辑。
- 交易记录查询与本地缓存。
- AI 初始化：支持模板 entry URL、缓存 entry URL、accessToken 兜底。
- 会话恢复：从数据库恢复 cookies/密码/电费 token。
- CAS 登录字段对齐（passwordText/cllt/dllt）与验证码 OCR 自动识别。

### 工具
- AI 模型爬虫脚本：从官网接口解析模型并写入配置。
- 缓存测试脚本：验证 One Code 与交易记录接口（无需明文密码）。


## ❌ 仍未完全实现/待验证

- AI 初始化在“仅缓存登录”场景的稳定性：
  - 若无 entry URL 模板或缓存，仍可能出现 token 解析失败。
- 交易记录接口在不同账户/学期数据结构差异下的完备兼容性（需更多样本验证）。
- Tauri dev 启动失败问题（本地环境/依赖/端口占用需排查）。

## ✅ 已验证（2026-01-31）
- `tauri-app/test_login.py` 使用测试账号完成 CAS 登录、One Code token 获取、交易记录查询、教务访问与 AI 初始化检查。


## 🔧 下一步思路

1. **增强 AI 初始化稳定性**
   - 通过远程配置下发 `ai_entry_url_template`（不含真实 token，只需模板参数）。
   - 启动时缓存最新 entry URL 到 `ai_entry_url_cache.json`，避免重复抓包依赖。

2. **完善交易记录解析**
   - 根据真实接口响应补齐字段映射（如 `tradeTime`/`amount`/`merchant` 等）。
   - 为空记录/字段缺失增加更清晰的 UI 提示。

3. **缓存登录链路联调**
   - 使用 `tools/test_cached_onecode.py` 验证缓存 token 是否可直接访问 One Code。
   - 若失败，增加“缓存失效自动重登”流程。

4. **运行稳定性**
   - 排查 `npm run tauri dev` 失败原因（依赖、权限、端口、环境变量）。
   - 增加诊断日志与一键收集脚本。


## 📌 相关文件索引

- AI 视图：tauri-app/src/components/AiChatView.vue
- 交易记录：tauri-app/src/components/TransactionHistory.vue
- AI 初始化：tauri-app/src-tauri/src/http_client.rs
- 远程配置：tauri-app/src/utils/remote_config.js
- 配置示例：tauri-app/public/remote_config.sample.json
- AI 模型爬虫：tauri-app/tools/scrape_ai_models.py
- 缓存测试脚本：tauri-app/tools/test_cached_onecode.py
