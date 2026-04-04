# Mini-HBUT v1.3.2 Release Notes

> **版本号**: 1.3.2  
> **发布日期**: 2026-04-02  
> **差异**: [v1.3.1...v1.3.2](https://github.com/superdaobo/mini-hbut/compare/v1.3.1...v1.3.2) (17 files, +789 −130)


## ✨ 新功能

### 启动页面设置
- 新增 **启动页面** 选项（首页 / 课表），位于设置 → 外观顶部
- 左右切换按钮样式，配置后下次启动直接进入所选页面
- 同步适配 `App.vue` 路由初始化与 `onMounted` 跳转逻辑

### 风格套装（原"快捷方案"升级）
- 移除了单独的 **图标风格** 和 **背景装饰** 选项，简化设置界面
- 快捷方案升级为完整"风格套装"——每套预设同时覆盖卡片样式、导航样式、信息密度、图标风格、背景装饰
- 新增 4 套风格套装：
  - **移动高效**：大按钮 · 紧凑间距 · 快速响应
  - **沉浸阅读**：柔和光效 · 舒适间距 · 细节丰富
  - **极简模式**：线条简洁 · 信息密集 · 零装饰
  - **经典布局**：均衡配色 · 标准密度 · 双色图标

### 移动端字体切换修复
- **Rust 端**：新增通用 `download_remote_font_payload` 命令，接受 URL 列表和缓存名，通过 `reqwest` 下载字体并返回 base64（含磁盘缓存策略）
- **前端**：新增 `loadRemoteFontInTauri()` 函数，非得意黑字体在 Tauri 环境下优先走原生下载通道，解决移动端 WebView `fetch()` 跨域限制导致的字体加载失败问题
- 失败时自动回退至 Web 加载路径

### 测试版自动发布（CI/CD）
- `dev-build.yml` 新增 `deploy-dev-release` job：
  - 自动创建/更新 `dev-latest` GitHub pre-release
  - 将构建产物复制到 website CDN 目录并生成 `manifest.json`
  - 编译 website 并部署到 `website-pages` 分支
- `release.yml` / `sync-website.yml` 同步适配 dev-latest 资产下载与 manifest 生成

### 下载页测试版区域
- 官网下载页新增 **测试版本** 折叠卡片
  - 从 CDN 拉取 `dev-latest.json` manifest
  - 展示各平台安装包（CDN 直链 + GitHub 备用链接）
  - 橙色主题标识，含版本警示说明


## 🐛 Bug 修复

### 公告弹窗层叠冲突
- 确认公告与详情弹窗共用 `z-index: 9997` 导致确认遮罩覆盖详情内容
- 修复：打开详情时隐藏确认公告遮罩，关闭详情后重新触发公告检查

### 教务维护横幅闪现
- 启动时立即显示"正在检测教务系统可用性"的维护横幅体验不佳
- 修复：启动时先清除维护状态，静默执行恢复尝试；仅当 6 秒后仍未恢复时才显示横幅
- `attemptOnlineRecovery()` 新增 `silent` 选项，静默模式下不触发 `markJwxtMaintenance()`

### 课表离线横幅过早显示
- 首次加载课表时，数据尚未返回就显示"离线数据"横幅
- 修复：新增 `initialFetchDone` 标志，`fetchSchedule` 完成后才允许横幅显示

### Android 图标染色异常
- 'AI 助手'图标 SVG 内嵌 `fill="#4C4C4C"` 在部分 Android WebView 上透出硬编码颜色
- 修复：将 `'ai'` 加入 `androidImgFallbackIconKeys`，使用 CSS mask 渲染

### 官网 SPA 路由 404
- 官网（EdgeOne Pages）刷新非根路径返回 404
- 修复：创建 `website/public/_redirects`（`/* /index.html 200`）


## 🔧 其他变更

### 课表学期提示 UI 重构
- 原全屏半透遮罩弹窗改为顶栏右侧小图标 + 轻量 popover
- 新增学期小标、红点提示、展开动画
- 移除 `semester-popup-mask` 及其全部样式，替换为 `semester-badge-*` 组件

### 远程配置更新
- 确认公告内容从"隐私协议更新"替换为"QQ 交流群邀请"

### 版本号更新
- `package.json` / `Cargo.toml` / `tauri.conf.json`: 1.3.1 → 1.3.2
- CI 权限: `dev-build.yml` 的 `contents` 从 `read` 提升为 `write`（用于创建 release）


## 📁 变更文件清单

| 文件 | 变更 |
|------|------|
| `.github/workflows/dev-build.yml` | +169 −1 |
| `.github/workflows/release.yml` | +48 |
| `.github/workflows/sync-website.yml` | +61 |
| `package.json` | 版本号 |
| `remote_config.json` | 公告内容 |
| `src-tauri/Cargo.toml` | 版本号 |
| `src-tauri/src/lib.rs` | +103 (字体下载命令) |
| `src-tauri/tauri.conf.json` | 版本号 |
| `src/App.vue` | +26 −10 |
| `src/components/ScheduleView.vue` | +111 −54 |
| `src/components/SettingsView.vue` | +85 −53 |
| `src/components/icons/ThemeModuleIcon.vue` | +2 −1 |
| `src/config/ui_settings.ts` | +1 |
| `src/utils/font_settings.ts` | +35 |
| `src/utils/ui_settings.ts` | +4 |
| `website/public/_redirects` | +1 (新建) |
| `website/src/pages/Releases.tsx` | +134 −3 |
