# Mini-HBUT v1.4.8 更新说明

发布日期：2026-09-01

---

## ✨ 版本概览

相对 [v1.4.7](https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.7)，本版本聚焦账户切换、课表学期体验和教务查询显示细节，并同步收紧发布前的安全依赖与工程质量门禁。

本版本主要完成：

1. **多账号并存与一键切换**：支持多个教务账号安全保存、快速切换和切换后的全量数据刷新，减少重复登录和手动清理缓存的成本
2. **课表与学期切换体验改进**：课表划分线调整为更清晰的稀疏虚线，行距保持对齐；学期切换改为按开学日期驱动，提前进入新学期时不再错误回跳
3. **空教室查询显示优化**：将查询结果中的楼栋显示名映射为更易读的“一教/二教”等名称，同时保留教务系统原始值用于数据处理
4. **通知与缓存稳定性保持**：延续 v1.4.7 的通知去重、课表预取和多端同步能力，新增的账号切换流程会触发完整刷新，避免旧账号数据残留
5. **安全与工程治理**：升级存在安全公告的 `h2` 依赖，完成 Axios 路由和通知检查模块拆分，并通过严格文件规模门禁

完整对比：[v1.4.7...v1.4.8](https://github.com/superdaobo/mini-hbut/compare/v1.4.7...v1.4.8)

---

## 🎯 修复与体验改进

### 👤 多账号切换与会话

- 新增多账号并存能力：已保存账号可以在应用内直接切换，不必重复输入凭据（[#755](https://github.com/superdaobo/mini-hbut/issues/755)、[#756](https://github.com/superdaobo/mini-hbut/pull/756)）
- 切换账号后自动刷新当前账号相关数据，降低成绩、课表、考试等页面继续显示旧账号内容的风险
- 账号凭据继续交由系统 keyring 管理，不在前端明文保存敏感凭据

### 🗓️ 课表与学期

- 课表划分线改为稀疏虚线，减少视觉干扰，同时保持网格行距和课程定位稳定（[#749](https://github.com/superdaobo/mini-hbut/issues/749)、[#752](https://github.com/superdaobo/mini-hbut/pull/752)）
- 学期切换依据开学日期驱动，提前进入新学期时不再自动回跳到旧学期（[#750](https://github.com/superdaobo/mini-hbut/issues/750)、[#751](https://github.com/superdaobo/mini-hbut/pull/751)）

### 🏫 教务查询

- 空教室查询结果使用“一教/二教”等友好楼栋名称，教务系统原始 `jxlmc` 值仍被保留（[#753](https://github.com/superdaobo/mini-hbut/issues/753)、[#754](https://github.com/superdaobo/mini-hbut/pull/754)）

---

## 🛡️ 安全与稳定性

- 将 Rust 依赖 `h2` 从 `0.4.14` 升级至 `0.4.16`，修复空 DATA 帧相关安全公告影响的依赖版本
- 账号切换过程复用 keyring 和会话边界，切换后执行全量刷新，避免跨账号数据串联
- 保持学校消息、学习通通知、成绩和考试提醒的去重语义不变

---

## 🏗️ 工程治理与 CI

- 拆分 Axios 校园码路由与通知中心电费检查逻辑，消除超大源文件并清空 God-file 债务
- 发布候选继续执行类型检查、前端测试、Rust 测试、依赖审计、CodeQL、Release Readiness 和多平台构建
- Release notes 由仓库内版本文件提供，正式 Release 使用本文件作为发布说明

---

## 📦 版本信息

- 版本号：**1.4.8**
- 标签：[`v1.4.8`](https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.8)
- 上一版本：[`v1.4.7`](https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.7)
- 完整变更：[`v1.4.7...v1.4.8`](https://github.com/superdaobo/mini-hbut/compare/v1.4.7...v1.4.8)

---

## 🔗 本版本重点关联

| 类型 | 编号 | 说明 |
|------|------|------|
| Issue | [#755](https://github.com/superdaobo/mini-hbut/issues/755) | 多账号一键切换需求 |
| PR | [#756](https://github.com/superdaobo/mini-hbut/pull/756) | 多账号并存、keyring 凭据与全量自动刷新 |
| Issue | [#749](https://github.com/superdaobo/mini-hbut/issues/749) | 课表划分线与行距体验 |
| Issue | [#750](https://github.com/superdaobo/mini-hbut/issues/750) | 学期切换按开学日期驱动 |
| PR | [#751](https://github.com/superdaobo/mini-hbut/pull/751) | 课表行距对齐与学期切换修复 |
| PR | [#752](https://github.com/superdaobo/mini-hbut/pull/752) | 课表划分线改为稀疏虚线 |
| Issue | [#753](https://github.com/superdaobo/mini-hbut/issues/753) | 空教室楼栋显示名优化 |
| PR | [#754](https://github.com/superdaobo/mini-hbut/pull/754) | 空教室楼栋名称映射 |
