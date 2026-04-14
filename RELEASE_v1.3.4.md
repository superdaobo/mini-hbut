# 🚀 Mini-HBUT v1.3.4 发布说明

> 对比版本：`v1.3.3` → `v1.3.4`  
> 对比范围：`v1.3.3..v1.3.4`  
> 发布日期：2026-04-14

## ✨ 新功能

- 🎓 **新增在线学习模块（学习通 + 雨课堂）**
  - 新增后端模块：`src-tauri/src/modules/online_learning.rs`
  - 新增前端页面：
    - `src/components/OnlineLearningChaoxingView.vue`
    - `src/components/OnlineLearningYuketangView.vue`
  - 新增自动学习能力：`src/utils/auto_learning.js`

- 🧭 **新增“更多”页面与入口整合**
  - 新增 `src/components/MoreView.vue`
  - `App.vue` / `MeView.vue` / `Dashboard.vue` 联动调整，统一导航体验

- 🔐 **新增每日访问密钥机制**
  - 新增 `src/utils/daily_access_key.js`
  - 新增 `generate_daily_access_key.py`
  - 配置补充：`remote_config.json` 与 `public/remote_config.json`

- ⚡ **电费双计费（照明+空调）能力增强**
  - 电费页支持双通道聚合展示：`src/components/ElectricityView.vue`
  - 通知中心支持双计费告警逻辑：`src/utils/notify_center.js`
  - 通知页双行展示照明/空调电量：`src/components/NotificationView.vue`

## 🐛 修复与优化

- ✅ 修复空调查询使用错误房间映射值的问题
- ✅ 优化通知页电费展示，减少冗余信息并提升可读性
- ✅ `ScheduleView.vue`、`axios_adapter.js`、`remote_config.js` 等模块稳定性增强
- ✅ Rust 侧 `session/auth/academic/http_server/lib` 链路优化，提升请求可靠性

## 🛡️ 安全与工程治理

- 🔒 新增敏感信息提交防护：
  - `.githooks/pre-commit`
  - `.githooks/pre-push`
  - `scripts/guard_sensitive_uploads.mjs`
- 🚫 `.gitignore` 增加高风险脚本与本地清理目录屏蔽规则
- 🧪 新增辅助脚本：`scripts/check_db.py`、`scripts/read_cookies.py`

## 🧱 后端（Tauri/Rust）升级

- `src-tauri/src/db.rs`：数据库能力扩展
- `src-tauri/src/http_client/*`：认证、会话、学业数据链路增强
- `src-tauri/src/http_server.rs`：接口侧功能扩展
- `src-tauri/src/lib.rs`：命令与核心流程扩展
- `src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`：版本同步到 `1.3.4`

## 📦 变更规模

本次共变更 **38 个文件**，统计为 **10,716 行新增 / 239 行删除**。

## 🔗 相关链接

- Compare: https://github.com/superdaobo/mini-hbut/compare/v1.3.3...v1.3.4
- Releases: https://github.com/superdaobo/mini-hbut/releases/tag/v1.3.4

---

### 📌 升级建议

- 拉取后建议执行一次完整构建与关键路径回归（登录、课表、电费、在线学习）。
- 若团队启用了 git hooks 管理，请同步本地 hooks 安装策略，确保敏感信息拦截生效。
