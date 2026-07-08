# Mini-HBUT v1.4.3 更新说明

发布日期：2026-07-08

---

## 🎯 新功能

### 🗺️ 腾讯校园导览（完整重构）

- 新增腾讯校园导览模块，对齐微信小程序能力：手绘地图、POI 搜索、分类筛选、游览路线、语音讲解、收藏与打卡等
- 支持校内步行导航与外部地图调起（腾讯 / 高德 / 百度）
- 移动端通过 loopback Bridge 解析校园导览 API，修复地图无法加载问题（#217）

### 🗺️ 校园地图（腾讯底图）

- 校园地图模块重构为腾讯地图实现，支持 POI 搜索与步行导航

### 🌐 官网 3D 交互首页

- 官网迁移至 Next.js，新增 3D 交互产品首页与手机模型屏幕预览
- 修复 GitHub Pages 空白页、basePath 与构建链问题（#208）

### 📊 客户端使用统计

- 本地记录模块使用频次并同步至服务端，用于产品分析

### 🧪 TestFlight 演示账号

- 增加全模块演示测试账号 fixtures，便于 App Store 审核（#172）

---

## 🛠️ 优化与修复

### 校园导览

- 修复步行导航路线 polyline 解码崩溃（`reading '4'`）（#221）
- 修复外部腾讯地图「找不到终点」：URL 编码、referer 与终点坐标解析（#221）
- 修复移动端 API 返回非 JSON 导致地图无法加载（#217）

### 品牌与图标

- 全平台与应用内统一更换 Mini-HBUT 应用图标（#171）
- 桌面 / 任务栏图标改用 `official_badge` 高分辨率源图重生（#205、#196）
- 主 Tab 顶栏改名为 Mini-HBUT，修复重登后学校消息重复推送（#201）

### 通知与 UI

- 修复近期消息成绩行在窄屏 Android 上横向溢出（#212）
- 修复「我的」页学校官网与快捷链接需登录后才显示（#202）
- 深色模式适配：课表抽屉、快捷入口编辑器、更新弹窗等

### 会话与安全

- 加固凭证存储、加速登录流程、统一缓存 SWR 策略
- 修复手动登出后记住密码、自动登录与会话恢复问题

### Android / iOS

- 小组件刷新、深链导航与布局优化
- iOS 内嵌页 loopback Bridge 修复；TestFlight 构建号与图标合规修复
- 学校官网 iframe 在 iOS 上显示区域修复

### 其他

- 学校消息（School Inbox）模块：详情链接、标记已读、暗色模式
- 小塔出行、服务统计、快捷入口等多项体验修复
- 根目录调试产物与过期文档清理（#210）

---

## 🏗️ 工程改进

- Dev Build macOS 修复 PEP 668 导致 Pillow 安装失败（#223）
- 新增 CodeQL 扫描与 DevSecOps 文档
- CI：main 同步 dev 后自动触发 Dev Build；Release / Dev 工作流 Python 依赖改用 venv
- EdgeOne Pages 自定义域名构建配置（#219）
- 大量 Dependabot 依赖安全升级

---

## ✅ 已关闭 Issue

- #221 [Campus Guide] 步行导航路线崩溃 & 外部腾讯地图找不到终点
- #217 [Campus Guide] 移动端校园导览 API 返回非 JSON，地图无法加载
- #212 [Notification] 近期消息成绩行在部分 Android 机型横向溢出
- #208 [Website] GitHub Pages 打开官网显示空白页
- #205 [Icons] 桌面/任务栏图标应使用 official_badge 高分辨率源图
- #202 [Me] 学校官网与快捷链接需登录后才显示
- #201 [UI/Notify] 主 Tab 顶栏改名为 Mini-HBUT，修复重登后学校消息重复推送
- #196 [Windows] 修复 Tauri 任务栏图标未使用新图标
- #172 [TestFlight] 增加全模块演示测试账号
- #171 [Branding] 全平台与应用内统一更换 Mini-HBUT 应用图标
- #223 [CI] Dev Build macOS 因 PEP 668 无法 pip install Pillow 导致构建失败
- #210 chore: 清理根目录调试产物与过期文档

---

## 📦 版本信息

- 上一版本：[v1.4.2](https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.2)
- 完整变更：[v1.4.2...v1.4.3](https://github.com/superdaobo/mini-hbut/compare/v1.4.2...v1.4.3)
