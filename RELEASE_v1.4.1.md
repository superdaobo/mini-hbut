# Mini-HBUT v1.4.1 更新说明

发布日期：2026-05-27

---

## 🎯 新功能

### 📊 服务统计页面

- **我的**页面新增「服务统计」入口，所有登录用户可查看 OCR 服务运行状态
- 展示当前总览：OCR 处理次数、课表上传数、给分查询数、服务运行时长、云端同步总记录、最新版本用户数
- 近 7 天趋势折线图（OCR、课表上传、给分查询、云同步记录、最新版本人数）
- 数据直接读取 `mini-hbut-ocr-service.hf.space/health`，每分钟自动刷新
- 显示服务启动时间、版本号等基础信息
- 数值千分位格式化，运行时长人性化展示（天/小时/分钟）

### ☁️ 云端同步增强

- **自动上传负载扩展**：登录后自动上传的数据新增考试安排、通知快照、成绩课程标识、课表课程标识、客户端版本号与平台信息
- **智能重传机制**：本地检测到关键数据变化或版本升级时，立即触发全量自动重传
- **数据去重**：引入稳定序列化（stableStringify）+ FNV-1a hash 计算，仅在数据实际变化时才触发上传
- **自动上传元数据追踪**：记录上次上传的 payload hash，避免重复上传相同数据
- **客户端快照**：上传时附带客户端版本号、平台信息、运行时环境
- **HF 私有桶双保险**：数据先存储到 HuggingFace 私有桶再入数据库，双重备份
- **同步 schema 版本升级**：v3 → v4

### 🔗 湖工五子棋在线对战增强

- **HF Relay 策略**：新增基于 HuggingFace Spaces 的中继策略（`hf-relay`），在 P2P 直连不可用时的兜底方案
- **匹配大厅优化**：引入活跃超时机制（30 秒），自动清理离线玩家
- **在线人数统计**：仅统计活跃玩家，更准确反映在线状态
- **消息时间戳**：所有大厅消息增加 `sentAt` 字段，支持消息时序判断
- **待匹配人数**：仅统计已排队且活跃的玩家

### 🎨 空教室页面优化

- **智能当前周推断**：优先使用课表缓存的 `current_week`，回退到根据开学日期自动计算
- 从 `hbu_schedule_meta` 读取学期元数据，首次进入时自动选中当前周
- 快照恢复时也应用智能周推断

---

## 🛠️ 优化与修复

### Android 端

- **桌面图标更新**：所有密度的启动图标（mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi）替换为新版高清图标，自适应图标前景层分辨率提升
- **通知图标**：新增 `ic_stat_mini_hbut.xml` 通知栏图标资源
- **网络安全配置**：`localhost`、`127.0.0.1`、`10.0.2.2` 域名配置添加 `includeSubdomains="true"`，确保子域名也能走明文流量
- **图标背景色**：`ic_launcher_background.xml` 颜色值修正
- **后台服务**：`BackgroundFetchHeadlessTask` 和 `KeepAliveForegroundService` 微小调整

### Capacitor 配置

- **本地通知**：新增 `presentationOptions: ['badge', 'sound', 'alert']`，确保 Capacitor 本地通知在前台也能弹出横幅、播放声音、更新角标

### 更新弹窗

- **版本信息布局调整**：显示顺序从「新版本 → 当前」改为「当前 → 新版本」，更符合升级语义
- **按钮比例优化**：「跳过此版本」宽 34%，「立即更新」宽 66%，视觉更协调
- **下载源扩展**：新增 `cdn.gh-proxy.org` 代理下载源（代理下载 4）
- **代理 URL 更新**：代理 2 切换为 `v4.gh-proxy.org`，代理 3 切换为 `gh-proxy.org`
- **CDN 清单兼容**：`normalizeCdnManifestAsRelease` 导出为公共方法，支持从 release notes 中提取版本号校验

### Tauri Windows 兼容

- 修复 Windows 平台编译：`get_notification_permission_native` 和 `request_notification_permission_native` 添加 `#[cfg]` 条件编译，Windows 下直接返回 `granted`
- `map_notification_permission_state` 仅非 Windows 平台编译
- `tauri_plugin_notification::NotificationExt` 导入添加 `#[cfg(not(target_os = "windows"))]`

### 游戏模块

- **各游戏排名工具更新**：`game_rank.js` 统一优化（json_2048 / jump_out_hbut / hecheng_hugongda / hbut_gomoku）
- **合成湖工大**：App.vue 微小修复

---

## 🏗️ 工程改进

- **新增测试合约**：
  - `service_stats_view_contract.spec.ts`：服务统计视图合约测试
  - `cloud_sync_payload_contract.spec.ts`：云端同步负载合约测试
  - `android_launcher_icon_contract.spec.ts`：Android 启动图标合约测试（含密度尺寸校验）
  - `android_network_security_contract.spec.ts`：网络安全配置测试
  - `notification_delivery_contract.spec.ts`：通知投递合约测试
  - `ranking_view_contract.spec.ts`：排行榜视图合约测试
  - `ClassroomView.spec.ts`：空教室视图测试（+37 行）
  - `Dashboard.spec.ts`：首页测试（+15 行）
  - `website_game_modules_contract.spec.ts`：游戏模块合约测试扩展（+43 行）
  - `updater_download_sources.spec.ts`：下载源测试扩展（+90 行）
- **Gomoku 在线对战测试**：`online.test.js` 新增 205 行测试用例
- **构建脚本增强**：
  - `build_website_modules.mjs`：+50 行优化
  - `build_release_manifests.mjs`：+18 行调整
  - `fix_android_adaptive_icons.py`：+183 行重写
- **清理**：
  - 删除 `.playwright-mcp/` 下 50+ 个过期录制文件
  - 删除 `data/debug-captures/theme-audit/` 下 9 个过期审计报告
  - 删除 `tmp-live-home.js`（4621 行调试脚本）
- **goal-7**：服务统计扩展的完整策划文档（input/plan/tasks）

---

## 📦 文件变更统计

- 214 个文件变更
- +4,610 行新增 / -14,561 行删除（主要为清理过期文件）
- 核心源码（src/、src-tauri/src/、website/modules-src/）：58 个文件，+2,566 行 / -184 行
