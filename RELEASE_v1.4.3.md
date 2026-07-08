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

## 📦 版本信息

- 上一版本：[v1.4.2](https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.2)
- 完整变更：[v1.4.2...v1.4.3](https://github.com/superdaobo/mini-hbut/compare/v1.4.2...v1.4.3)
---

## 📋 完整 PR 列表（v1.4.2 → v1.4.3）

- #10 [fix(towergo): 修复小塔出行模块系统性缺陷（接口全500+校区识别+扫描效率+前端体验）](https://github.com/superdaobo/mini-hbut/pull/10)
- #22 [[我的/教务] 学校官网内嵌、消息推送与消息浏览](https://github.com/superdaobo/mini-hbut/pull/22)
- #27 [fix(me): 暗色模式功能网格图标深色底并保留彩色](https://github.com/superdaobo/mini-hbut/pull/27)
- #28 [feat(school-inbox): 首页学校消息浏览与详情体验修复](https://github.com/superdaobo/mini-hbut/pull/28)
- #30 [fix(tauri): Webview::close 限 desktop，修复 Android/iOS 编译 E0599](https://github.com/superdaobo/mini-hbut/pull/30)
- #31 [fix(tauri): Webview::close 限 desktop，修复 Android/iOS 编译 E0599](https://github.com/superdaobo/mini-hbut/pull/31)
- #33 [fix(school-website): iframe 改用 absolute 撑满，修复 iOS 仅显示顶部一小块](https://github.com/superdaobo/mini-hbut/pull/33)
- #34 [fix(school-website): iframe 改用 absolute 撑满，修复 iOS 仅显示顶部一小块](https://github.com/superdaobo/mini-hbut/pull/34)
- #36 [fix(ci): iOS 构建固定 Xcode 16.4，规避 macos-latest 默认升到 26.5](https://github.com/superdaobo/mini-hbut/pull/36)
- #37 [fix(ci): iOS 构建固定 Xcode 16.4，规避 macos-latest 默认升到 26.5](https://github.com/superdaobo/mini-hbut/pull/37)
- #39 [chore(deps-dev): bump autoprefixer from 10.4.23 to 10.5.2 in /website](https://github.com/superdaobo/mini-hbut/pull/39)
- #40 [chore(deps): bump @radix-ui/react-context-menu from 2.2.16 to 2.3.1 in /website](https://github.com/superdaobo/mini-hbut/pull/40)
- #41 [chore(deps): bump @radix-ui/react-menubar from 1.1.16 to 1.1.18 in /website](https://github.com/superdaobo/mini-hbut/pull/41)
- #42 [chore(deps): bump react-router-dom from 7.13.0 to 7.18.0 in /website](https://github.com/superdaobo/mini-hbut/pull/42)
- #45 [chore(deps): bump serde_json from 1.0.149 to 1.0.150 in /src-tauri](https://github.com/superdaobo/mini-hbut/pull/45)
- #56 [chore(deps): bump dashmap from 6.1.0 to 6.2.1 in /src-tauri](https://github.com/superdaobo/mini-hbut/pull/56)
- #60 [chore(deps): bump fflate from 0.8.2 to 0.8.3](https://github.com/superdaobo/mini-hbut/pull/60)
- #73 [feat(enterprise): Epic #62 安全·CI·架构·性能基线](https://github.com/superdaobo/mini-hbut/pull/73)
- #79 [chore(deps): bump tempfile from 3.24.0 to 3.25.0 in /src-tauri](https://github.com/superdaobo/mini-hbut/pull/79)
- #80 [chore(deps): bump tauri-plugin-shell from 2.3.4 to 2.3.5 in /src-tauri](https://github.com/superdaobo/mini-hbut/pull/80)
- #81 [chore(deps): bump tauri-plugin-fs from 2.4.5 to 2.5.1 in /src-tauri](https://github.com/superdaobo/mini-hbut/pull/81)
- #82 [chore(deps): bump tokio from 1.49.0 to 1.50.0 in /src-tauri](https://github.com/superdaobo/mini-hbut/pull/82)
- #83 [chore(deps): bump chrono from 0.4.43 to 0.4.45 in /src-tauri](https://github.com/superdaobo/mini-hbut/pull/83)
- #84 [chore(deps): bump rand from 0.8.5 to 0.8.6 in /src-tauri](https://github.com/superdaobo/mini-hbut/pull/84)
- #98 [fix(ui): dark mode for quick entry, update dialog, and opensource modal](https://github.com/superdaobo/mini-hbut/pull/98)
- #100 [fix(ui): 课表工具侧栏暗色模式适配 (#99)](https://github.com/superdaobo/mini-hbut/pull/100)
- #101 [chore: merge dev into main (dark mode #98, schedule drawer #100)](https://github.com/superdaobo/mini-hbut/pull/101)
- #102 [chore(deps-dev): bump postcss from 8.5.6 to 8.5.16 in /website](https://github.com/superdaobo/mini-hbut/pull/102)
- #103 [chore(deps): bump @fortawesome/fontawesome-free from 7.2.0 to 7.3.0](https://github.com/superdaobo/mini-hbut/pull/103)
- #104 [chore(deps): bump react-hook-form from 7.70.0 to 7.80.0 in /website](https://github.com/superdaobo/mini-hbut/pull/104)
- #105 [chore(deps): bump marked from 12.0.2 to 18.0.5](https://github.com/superdaobo/mini-hbut/pull/105)
- #106 [chore(deps): bump @radix-ui/react-slider from 1.3.6 to 1.4.1 in /website](https://github.com/superdaobo/mini-hbut/pull/106)
- #107 [chore(deps-dev): bump @vitest/coverage-v8 from 1.6.1 to 4.1.9](https://github.com/superdaobo/mini-hbut/pull/107)
- #108 [chore(deps): bump tempfile from 3.25.0 to 3.27.0 in /src-tauri](https://github.com/superdaobo/mini-hbut/pull/108)
- #109 [chore(deps): bump pinia from 2.3.1 to 3.0.4](https://github.com/superdaobo/mini-hbut/pull/109)
- #110 [chore(deps-dev): bump fast-check from 3.23.2 to 4.8.0](https://github.com/superdaobo/mini-hbut/pull/110)
- #115 [fix(android): 小组件刷新、深链跳转与 UI 优化 (#111)](https://github.com/superdaobo/mini-hbut/pull/115)
- #122 [feat(security,perf): 凭据安全、登录加速与缓存 SWR 统一](https://github.com/superdaobo/mini-hbut/pull/122)
- #123 [chore(ci): CodeQL 安全扫描与 DevSecOps 文档](https://github.com/superdaobo/mini-hbut/pull/123)
- #124 [chore(deps-dev): bump vite from 7.3.0 to 7.3.5 in /website](https://github.com/superdaobo/mini-hbut/pull/124)
- #125 [chore(deps-dev): bump js-yaml from 4.1.1 to 4.3.0 in /website](https://github.com/superdaobo/mini-hbut/pull/125)
- #126 [chore(deps-dev): bump @babel/plugin-transform-modules-systemjs from 7.28.5 to 7.29.7 in /website](https://github.com/superdaobo/mini-hbut/pull/126)
- #127 [chore(deps): bump lodash from 4.17.21 to 4.18.1 in /website](https://github.com/superdaobo/mini-hbut/pull/127)
- #128 [chore(deps-dev): bump flatted from 3.3.3 to 3.4.2 in /website](https://github.com/superdaobo/mini-hbut/pull/128)
- #129 [chore(deps): bump picomatch and tailwindcss in /website](https://github.com/superdaobo/mini-hbut/pull/129)
- #130 [chore(deps): bump form-data from 4.0.5 to 4.0.6 in /website/modules-src/jump_out_hbut/project](https://github.com/superdaobo/mini-hbut/pull/130)
- #131 [chore(deps): bump rollup from 4.55.1 to 4.62.2 in /website](https://github.com/superdaobo/mini-hbut/pull/131)
- #132 [chore(deps-dev): bump vite, @vitejs/plugin-vue and vitest in /website/modules-src/jump_out_hbut/project](https://github.com/superdaobo/mini-hbut/pull/132)
- #133 [chore(deps): bump minimatch, eslint and typescript-eslint in /website](https://github.com/superdaobo/mini-hbut/pull/133)
- #139 [chore(deps-dev): bump js-cookie from 3.0.5 to 3.0.8 in /website/modules-src/jump_out_hbut/project](https://github.com/superdaobo/mini-hbut/pull/139)
- #140 [chore(deps): bump rollup from 4.57.1 to 4.62.2 in /website/modules-src/hugongda_escape/project](https://github.com/superdaobo/mini-hbut/pull/140)
- #142 [chore(deps): bump postcss from 8.5.6 to 8.5.16 in /website/modules-src/hugongda_escape/project](https://github.com/superdaobo/mini-hbut/pull/142)
- #143 [chore(deps): bump esbuild, @vitejs/plugin-vue and vite in /website/modules-src/hugongda_escape/project](https://github.com/superdaobo/mini-hbut/pull/143)
- #144 [chore(deps): bump postcss from 8.5.6 to 8.5.16 in /website/modules-src/hecheng_hugongda/project](https://github.com/superdaobo/mini-hbut/pull/144)
- #145 [fix(ci): 将 website-pages 部署到分支根目录以修复 Pages 404](https://github.com/superdaobo/mini-hbut/pull/145)
- #146 [chore(deps-dev): bump vite and @vitejs/plugin-vue in /website/modules-src/hecheng_hugongda/project](https://github.com/superdaobo/mini-hbut/pull/146)
- #147 [chore(deps): bump rollup from 4.56.0 to 4.62.2 in /website/modules-src/hecheng_hugongda/project](https://github.com/superdaobo/mini-hbut/pull/147)
- #148 [chore(deps-dev): bump vite from 5.4.21 to 6.4.3 in /website/modules-src/hbut_miner/project](https://github.com/superdaobo/mini-hbut/pull/148)
- #150 [fix(ci): 修复 Website Modules Deploy 与 Pages 根目录部署](https://github.com/superdaobo/mini-hbut/pull/150)
- #151 [fix(website): 升级 eslint-plugin-react-hooks 以兼容 eslint 10](https://github.com/superdaobo/mini-hbut/pull/151)
- #153 [fix(website): 固定 tailwindcss v3 以修复 PostCSS 构建失败](https://github.com/superdaobo/mini-hbut/pull/153)
- #154 [feat(website): 3D interactive product homepage with Next.js migration](https://github.com/superdaobo/mini-hbut/pull/154)
- #155 [fix(ci): 补齐 lockfile 中 @emnapi 依赖以修复 npm ci](https://github.com/superdaobo/mini-hbut/pull/155)
- #156 [chore(deps-dev): bump vite from 5.4.21 to 6.4.3 in /website/modules-src/hbut_memory_match/project](https://github.com/superdaobo/mini-hbut/pull/156)
- #162 [feat(campus-map): 腾讯地图重构，支持 POI 搜索与步行导航](https://github.com/superdaobo/mini-hbut/pull/162)
- #164 [fix(me): 修复未登录登录表单整体右偏](https://github.com/superdaobo/mini-hbut/pull/164)
- #165 [ci: add manual TestFlight upload workflow](https://github.com/superdaobo/mini-hbut/pull/165)
- #166 [chore(deps): bump esbuild and vite in /website/modules-src/hbut_monopoly/project](https://github.com/superdaobo/mini-hbut/pull/166)
- #173 [feat(branding): 全平台与应用内统一更换 Mini-HBUT 应用图标](https://github.com/superdaobo/mini-hbut/pull/173)
- #175 [chore(deps-dev): bump @tauri-apps/cli from 2.11.3 to 2.11.4](https://github.com/superdaobo/mini-hbut/pull/175)
- #176 [chore(deps-dev): bump @emnapi/core from 1.11.1 to 1.11.2](https://github.com/superdaobo/mini-hbut/pull/176)
- #177 [chore(deps-dev): bump material-symbols from 0.44.8 to 0.45.5](https://github.com/superdaobo/mini-hbut/pull/177)
- #178 [chore(deps-dev): bump @types/node from 24.10.4 to 24.13.2 in /website](https://github.com/superdaobo/mini-hbut/pull/178)
- #179 [chore(deps): bump tauri from 2.11.3 to 2.11.5 in /src-tauri](https://github.com/superdaobo/mini-hbut/pull/179)
- #180 [chore(deps): bump @radix-ui/react-dropdown-menu from 2.1.16 to 2.1.19 in /website](https://github.com/superdaobo/mini-hbut/pull/180)
- #181 [chore(deps-dev): bump @vitejs/plugin-vue from 5.2.4 to 6.0.7](https://github.com/superdaobo/mini-hbut/pull/181)
- #182 [chore(deps): bump react-day-picker from 9.13.0 to 9.14.0 in /website](https://github.com/superdaobo/mini-hbut/pull/182)
- #183 [chore(deps-dev): bump vitest from 4.1.9 to 4.1.10](https://github.com/superdaobo/mini-hbut/pull/183)
- #184 [chore(deps): bump html-escape from 0.2.13 to 0.2.14 in /src-tauri](https://github.com/superdaobo/mini-hbut/pull/184)
- #185 [feat(usage-stats): track local module usage and sync to server](https://github.com/superdaobo/mini-hbut/pull/185)
- #186 [chore(deps): bump esbuild and vite in /website/modules-src/hbut_gomoku/project](https://github.com/superdaobo/mini-hbut/pull/186)
- #188 [chore(deps): bump esbuild and vite in /website/modules-src/hbut_2048/project](https://github.com/superdaobo/mini-hbut/pull/188)
- #189 [chore(deps-dev): bump vite from 5.4.21 to 6.4.3 in /website/modules-src/clumsy_bird_hbut/project](https://github.com/superdaobo/mini-hbut/pull/189)
- #190 [chore(deps): bump esbuild and vite in /website/modules-src/clumsy_bird_hbut/project](https://github.com/superdaobo/mini-hbut/pull/190)
- #191 [chore(deps): bump rustls-webpki from 0.103.9 to 0.103.13 in /src-tauri](https://github.com/superdaobo/mini-hbut/pull/191)
- #192 [chore(deps): bump quinn-proto from 0.11.13 to 0.11.16 in /src-tauri](https://github.com/superdaobo/mini-hbut/pull/192)
- #193 [chore(deps): bump jsonwebtoken from 9.3.1 to 10.3.0 in /src-tauri](https://github.com/superdaobo/mini-hbut/pull/193)
- #194 [chore(deps): bump bytes from 1.11.0 to 1.12.0 in /src-tauri](https://github.com/superdaobo/mini-hbut/pull/194)
- #195 [chore(deps): bump time from 0.3.46 to 0.3.53 in /src-tauri](https://github.com/superdaobo/mini-hbut/pull/195)
- #197 [fix(windows): refresh Tauri taskbar icon resource](https://github.com/superdaobo/mini-hbut/pull/197)
- #198 [chore(deps): bump dompurify from 3.3.1 to 3.4.11](https://github.com/superdaobo/mini-hbut/pull/198)
- #203 [fix(ui/notify): Mini-HBUT 顶栏改名与重登学校消息去重](https://github.com/superdaobo/mini-hbut/pull/203)
- #204 [feat(me): 学校官网与快捷链接需登录后才显示](https://github.com/superdaobo/mini-hbut/pull/204)
- #206 [fix(icons): 桌面/任务栏图标统一使用 official_badge 高分辨率源图](https://github.com/superdaobo/mini-hbut/pull/206)
- #207 [fix(ci): dispatch Dev Build after main-to-dev sync push](https://github.com/superdaobo/mini-hbut/pull/207)
- #209 [fix(website): 修复 GitHub Pages 空白页（basePath + .nojekyll）](https://github.com/superdaobo/mini-hbut/pull/209)
- #211 [chore: 清理根目录调试产物与过期文档](https://github.com/superdaobo/mini-hbut/pull/211)
- #213 [fix(notification): 修复近期消息成绩行在窄屏 Android 上横向溢出](https://github.com/superdaobo/mini-hbut/pull/213)
- #214 [chore: remove RELEASE_v1.4.*.md release notes](https://github.com/superdaobo/mini-hbut/pull/214)
- #215 [fix(docs): point README build badge to CI workflow on main](https://github.com/superdaobo/mini-hbut/pull/215)
- #218 [fix(campus-guide): 修复移动端校园导览 API 返回非 JSON 导致地图无法加载](https://github.com/superdaobo/mini-hbut/pull/218)
- #219 [chore(edgeone): add edgeone.json for custom domain build](https://github.com/superdaobo/mini-hbut/pull/219)
- #222 [fix(campus-guide): 修复步行导航路线崩溃与外部腾讯地图找不到终点](https://github.com/superdaobo/mini-hbut/pull/222)
- #224 [fix(ci): Dev Build macOS PEP 668 Pillow 安装失败](https://github.com/superdaobo/mini-hbut/pull/224)

## 📋 完整 Issue 列表（v1.4.2 → v1.4.3 期间关闭）

- #4 [[小塔出行] 代理增加上游响应可观测性](https://github.com/superdaobo/mini-hbut/issues/4)
- #5 [[小塔出行] 修复登录态缺失导致只读接口全 500](https://github.com/superdaobo/mini-hbut/issues/5)
- #6 [[小塔出行] 校区识别纠偏，避免偏移定位识别成非湖工大](https://github.com/superdaobo/mini-hbut/issues/6)
- #7 [[小塔出行] 优化全区扫描策略降低耗时](https://github.com/superdaobo/mini-hbut/issues/7)
- #8 [[小塔出行] 前端对齐项目设计体系重构](https://github.com/superdaobo/mini-hbut/issues/8)
- #9 [[小塔出行] 模块系统性修复（接口全500+校区识别+扫描效率+前端体验）](https://github.com/superdaobo/mini-hbut/issues/9)
- #11 [[个人信息] 修复民族等图标显示文字（字体子集漏收）](https://github.com/superdaobo/mini-hbut/issues/11)
- #12 [[个人信息] 修复进入即显示离线数据（缓存策略+粘滞标志）](https://github.com/superdaobo/mini-hbut/issues/12)
- #13 [[给分记录] 列表显示样本数并按样本数降序排序](https://github.com/superdaobo/mini-hbut/issues/13)
- #14 [[服务统计] 修复频繁读取失败（超时+重试+竞态保护）](https://github.com/superdaobo/mini-hbut/issues/14)
- #15 [[主题] 学业/课表/培养方案/校园地图 CSS 切合主题适配暗色](https://github.com/superdaobo/mini-hbut/issues/15)
- #16 [[多模块] 个人信息/给分记录/服务统计/主题适配 5 项修复](https://github.com/superdaobo/mini-hbut/issues/16)
- #18 [黑暗模式适配不完整：多页面文字/背景/图标对比度问题](https://github.com/superdaobo/mini-hbut/issues/18)
- #20 [[个人信息] 民族字段 diversity_3 图标显示为文字](https://github.com/superdaobo/mini-hbut/issues/20)
- #21 [[我的] 新增学校官网内嵌页与快捷链接子页面](https://github.com/superdaobo/mini-hbut/issues/21)
- #23 [[通知] 抓取教务/学习通消息中心并推送本地通知](https://github.com/superdaobo/mini-hbut/issues/23)
- #24 [[教务服务] 首页消息模块：浏览教务/学习通全部消息](https://github.com/superdaobo/mini-hbut/issues/24)
- #25 [[我的] 暗色模式功能网格图标背景泛白](https://github.com/superdaobo/mini-hbut/issues/25)
- #26 [[教务服务] 学校消息详情滚动错位与暗色模式卡片泛白](https://github.com/superdaobo/mini-hbut/issues/26)
- #29 [Dev Build 失败：Webview::close 在 Android/iOS 编译 E0599](https://github.com/superdaobo/mini-hbut/issues/29)
- #32 [iOS 上学校官网模块只显示顶部一小块，PC 正常](https://github.com/superdaobo/mini-hbut/issues/32)
- #35 [Dev/Release iOS 构建失败：macos-latest 默认 Xcode 升级到 26.5 导致 swiftCompatibility 库缺失](https://github.com/superdaobo/mini-hbut/issues/35)
- #62 [[工程] Mini-HBUT 企业化演进 Epic（安全·门禁·架构·性能）](https://github.com/superdaobo/mini-hbut/issues/62)
- #63 [[安全] 用户凭证本地存储不符合生产基线](https://github.com/superdaobo/mini-hbut/issues/63)
- #64 [[安全] HTTP 客户端关闭 TLS 证书校验](https://github.com/superdaobo/mini-hbut/issues/64)
- #65 [[安全] 本地 HTTP 桥敏感接口缺少鉴权保护](https://github.com/superdaobo/mini-hbut/issues/65)
- #66 [[CI] 质量门禁未闭环（守卫脚本与 lint/typecheck）](https://github.com/superdaobo/mini-hbut/issues/66)
- #67 [[工程] 补齐 SECURITY.md 与贡献规范文档](https://github.com/superdaobo/mini-hbut/issues/67)
- #68 [[后端] lib.rs 与 http_server 单体过重阻碍协作](https://github.com/superdaobo/mini-hbut/issues/68)
- #69 [[前端] App.vue 承担路由与全局状态导致维护瓶颈](https://github.com/superdaobo/mini-hbut/issues/69)
- #70 [[性能] SQLite 同步访问阻塞异步运行时](https://github.com/superdaobo/mini-hbut/issues/70)
- #71 [[性能] HbutClient 全局锁串行化网络操作](https://github.com/superdaobo/mini-hbut/issues/71)
- #72 [[工程] monorepo 与双移动栈边界不清晰](https://github.com/superdaobo/mini-hbut/issues/72)
- #88 [[Epic] 四项体验修复与 HF 给分每日同步](https://github.com/superdaobo/mini-hbut/issues/88)
- #89 [[Dashboard] 快捷入口暗色模式图标背景统一为黑色](https://github.com/superdaobo/mini-hbut/issues/89)
- #90 [[学校官网] Tauri 内部支持 news.hbut.edu.cn 子域浏览](https://github.com/superdaobo/mini-hbut/issues/90)
- #91 [[服务统计] 近七天趋势「最新版」X 轴标注版本号](https://github.com/superdaobo/mini-hbut/issues/91)
- #92 [[ocr-service] 给分记录每日自动重建 grade_distribution](https://github.com/superdaobo/mini-hbut/issues/92)
- #94 [[Dark Mode] 我的/首页暗色模式视觉修复（快捷入口·检查更新·开源协议）](https://github.com/superdaobo/mini-hbut/issues/94)
- #95 [[Dark Mode] 快捷入口编辑器与首页图标暗色适配](https://github.com/superdaobo/mini-hbut/issues/95)
- #96 [[Dark Mode] 检查更新弹窗暗色适配与 Material Symbols 图标](https://github.com/superdaobo/mini-hbut/issues/96)
- #97 [[Dark Mode] 开源协议弹窗暗色适配](https://github.com/superdaobo/mini-hbut/issues/97)
- #99 [[Dark Mode] 课表工具侧栏（步骤1–5）暗色适配：序号与按钮分色消失](https://github.com/superdaobo/mini-hbut/issues/99)
- #111 [[Android Widget] 桌面小组件刷新、跳转与视觉体验修复](https://github.com/superdaobo/mini-hbut/issues/111)
- #112 [[Android Widget] 小组件快照写入后无法及时刷新](https://github.com/superdaobo/mini-hbut/issues/112)
- #113 [[Android Widget] 点击小组件应跳转到对应功能页](https://github.com/superdaobo/mini-hbut/issues/113)
- #114 [[Android Widget] 三组件布局与空态视觉优化](https://github.com/superdaobo/mini-hbut/issues/114)
- #116 [[专项] Mini-HBUT 性能、安全与缓存稳定性优化](https://github.com/superdaobo/mini-hbut/issues/116)
- #117 [[Security] 凭据与敏感数据传输安全加固](https://github.com/superdaobo/mini-hbut/issues/117)
- #118 [[Auth] 登录链路体感速度优化](https://github.com/superdaobo/mini-hbut/issues/118)
- #119 [[Perf] 业务请求并发与响应延迟优化](https://github.com/superdaobo/mini-hbut/issues/119)
- #120 [[Cache] 前端缓存稳定性与一致性增强](https://github.com/superdaobo/mini-hbut/issues/120)
- #121 [[Refactor] 登录模块去重与调试日志治理](https://github.com/superdaobo/mini-hbut/issues/121)
- #134 [[Website] 3D 交互式产品首页 — 滚动运镜从手机外进入 App 内](https://github.com/superdaobo/mini-hbut/issues/134)
- #135 [[Website] Next.js 全站迁移与 3D 场景基础设施](https://github.com/superdaobo/mini-hbut/issues/135)
- #136 [[Website] 滚动运镜前半段 — 俯视手机到穿屏过渡](https://github.com/superdaobo/mini-hbut/issues/136)
- #137 [[Website] App 内部 3D 功能空间 — 课表/成绩/校园服务隧道](https://github.com/superdaobo/mini-hbut/issues/137)
- #138 [[Website] 最终定格 CTA、特效打磨与性能优化](https://github.com/superdaobo/mini-hbut/issues/138)
- #157 [[Campus Map] 校园地图重构：腾讯地图 + 建筑标点 + 步行导航](https://github.com/superdaobo/mini-hbut/issues/157)
- #158 [[Campus Map] 远程建筑 POI 数据模型与缓存仓库](https://github.com/superdaobo/mini-hbut/issues/158)
- #159 [[Campus Map] 抽取腾讯地图加载器与自定义样式](https://github.com/superdaobo/mini-hbut/issues/159)
- #160 [[Campus Map] 教学楼标点、搜索与详情面板](https://github.com/superdaobo/mini-hbut/issues/160)
- #161 [[Campus Map] 基于定位的步行路线规划与展示](https://github.com/superdaobo/mini-hbut/issues/161)
- #163 [[我的] 未登录登录表单整体向右偏移](https://github.com/superdaobo/mini-hbut/issues/163)
- #168 [[Branding] 全平台与应用内统一更换 Mini-HBUT 应用图标](https://github.com/superdaobo/mini-hbut/issues/168)
- #169 [[Branding] 全平台与应用内统一更换 Mini-HBUT 应用图标](https://github.com/superdaobo/mini-hbut/issues/169)
- #170 [[Branding] 全平台与应用内统一更换 Mini-HBUT 应用图标](https://github.com/superdaobo/mini-hbut/issues/170)
- #171 [[Branding] 全平台与应用内统一更换 Mini-HBUT 应用图标](https://github.com/superdaobo/mini-hbut/issues/171)
- #172 [[TestFlight] 增加全模块演示测试账号](https://github.com/superdaobo/mini-hbut/issues/172)
- #196 [[Windows] 修复 Tauri 任务栏图标未使用新图标](https://github.com/superdaobo/mini-hbut/issues/196)
- #201 [[UI/Notify] 主 Tab 顶栏改名为 Mini-HBUT，修复重登后学校消息重复推送](https://github.com/superdaobo/mini-hbut/issues/201)
- #202 [[Me] 学校官网与快捷链接需登录后才显示](https://github.com/superdaobo/mini-hbut/issues/202)
- #205 [[Icons] 桌面/任务栏图标应使用 official_badge 高分辨率源图](https://github.com/superdaobo/mini-hbut/issues/205)
- #208 [[Website] GitHub Pages 打开官网显示空白页](https://github.com/superdaobo/mini-hbut/issues/208)
- #210 [chore: 清理根目录调试产物与过期文档](https://github.com/superdaobo/mini-hbut/issues/210)
- #212 [[Notification] 近期消息成绩行在部分 Android 机型横向溢出](https://github.com/superdaobo/mini-hbut/issues/212)
- #217 [[Campus Guide] 移动端校园导览 API 返回非 JSON，地图无法加载](https://github.com/superdaobo/mini-hbut/issues/217)
- #221 [[Campus Guide] 步行导航路线崩溃 & 外部腾讯地图找不到终点](https://github.com/superdaobo/mini-hbut/issues/221)
- #223 [[CI] Dev Build macOS 因 PEP 668 无法 pip install Pillow 导致构建失败](https://github.com/superdaobo/mini-hbut/issues/223)
