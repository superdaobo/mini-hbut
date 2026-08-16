# Mini-HBUT 桌面/移动端应用

<p align="center">
  <img src="apps/client/src-tauri/icons/icon.png" width="128" height="128" alt="Mini-HBUT Logo">
</p>

<p align="center">
  <b>湖北工业大学教务助手</b><br>
  基于 Tauri + Capacitor + Vue 3 的跨平台客户端应用
</p>

<p align="center">
  <a href="https://github.com/superdaobo/mini-hbut/releases">
    <img src="https://img.shields.io/github/v/release/superdaobo/mini-hbut?style=flat-square" alt="Latest Release">
  </a>
  <a href="https://github.com/superdaobo/mini-hbut/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/superdaobo/mini-hbut/ci.yml?branch=main&style=flat-square" alt="Build Status">
  </a>
  <a href="#license">
    <img src="https://img.shields.io/badge/license-GPL%20v3-blue?style=flat-square" alt="License">
  </a>
</p>

<p align="center">
  <a href="https://hbut.6661111.xyz">官网</a> ·
  <a href="https://hbut.6661111.xyz/docs">文档</a> ·
  <a href="https://github.com/superdaobo/mini-hbut/releases">下载</a> ·
  <a href="https://docs.qq.com/sheet/DQkdvWHJxQ3RwWlB4?tab=BB08J2">问题反馈</a>
</p>

## ✨ 功能特性

### 🎓 教务核心

- 📊 **成绩查询**：学期成绩、GPA、变更检测与缓存读取
- 📅 **课表查询**：当前周/全学期课表，支持静默刷新
- 📝 **考试安排**：考试列表 + 次日考试提醒
- 🏫 **空教室查询**：按时间段筛选可用教室
- 📈 **排名查询**：班级/专业/年级排名
- 🎯 **学业进度**：培养方案完成进度、学分统计
- 📆 **校历**：学期周次与校历信息
- ✨ **智慧迎新**：只读展示迎新信息，无需登录即可浏览

### 🏕️ 校园生活与资源

- 🔋 **电费查询**：宿舍房间缓存 + 余额实时请求
- 💳 **交易记录**：一码通流水查询与筛选
- 📚 **图书查询**：馆藏检索、详情、借阅状态
- 🗺️ **校园地图**：远程拉取 + 本地缓存
- 📁 **资料分享**：WebDAV 浏览、预览、下载、分享
- 🧾 **导出中心**：多模块导出 JSON / 图片 / 课表 ICS
- 🤖 **AI 校园助手**：多模型接入（DeepSeek / Qwen / Gemini / GLM），流式回复与公式渲染
- 🎮 **扩展模块与小游戏**：模块中心、超星签到、在线学习与多款内置小游戏
- ☁️ **云同步**：端到端加密（Cloudflare Workers + KV），设置与学业数据跨设备恢复

### 🔔 通知与后台任务

- 🤫 **后台静默检查**：课表刷新、成绩变更、考试提醒、电费监控
- ⚡ **电费通知**：低于 10 度自动提醒，按房间缓存实时检查
- 🚫 **通知去重**：启动即时检查与签名去重，避免重复推送
- 📱 **Capacitor 后台任务**：`startOnBoot` + `stopOnTerminate=false` + `enableHeadless`
- 🤖 **Android 增强调度**：额外周期任务，提高被系统回收后触发机会

### ⚙️ 设置中心与体验优化

- 🧭 **远程/仅本地模式切换**：支持禁用远程覆盖
- 🌐 **本地服务地址配置**：OCR、临时上传服务器
- 🧪 **功能测速**：OCR/上传/门户/教务/超星/一码通/图书馆延迟检测
- 🧩 **模块参数自动应用**：超时、重试、并发线程等改动自动保存并生效
- 🔒 **固定模块目标地址**：内置默认地址，不在前端开放编辑

### 🔤 字体与运行时 CDN 缓存

- 🎨 **字体系统**：默认/黑体/宋体/楷体/仿宋/得意黑
- 🚀 **字体 CDN 线路切换**：自动（jsDelivr → unpkg）/ jsDelivr / unpkg
- 📦 **预缓存字体（含得意黑）**：可视化下载流程与失败重试
- 💾 **字体持久化**：每次启动自动恢复上次选择
- 🪶 **减小安装包体**：`pdf.js`、`xgplayer`、`katex`、`marked-katex` 首次使用按需下载并缓存

## 📱 支持平台

| 平台 | 技术栈 | 状态 |
|------|--------|------|
| Windows | Tauri | ✅ |
| macOS | Tauri | ✅ |
| Linux | Tauri | ✅ |
| Android | Tauri Mobile | ✅ |
| iOS | Tauri Mobile | ✅（App Store 上架） |

## 📥 下载安装

### 方式一：GitHub Release（推荐）

访问 [Releases 页面](https://github.com/superdaobo/mini-hbut/releases) 下载最新版本。

### 方式二：官网下载（国内 EdgeOne CDN 加速）

访问 [https://hbut.6661111.xyz/releases](https://hbut.6661111.xyz/releases) 下载最新版本。官网通过 `stable-latest.json` manifest 自动指向最新安装包，支持 EdgeOne CDN → GitHub 代理 → 直连多线路回退。

## 🧱 项目结构

```text
tauri-app/
├── apps/client/              # 客户端应用（Vue 前端 + Tauri/Capacitor 双栈，自含构建配置）
│   ├── src/                  #   Vue 前端
│   │   ├── components/       #   业务页面与设置页
│   │   ├── navigation/       #   主导航常量（从 App.vue 抽离）
│   │   ├── utils/            #   通知/缓存/CDN/字体/配置
│   │   └── platform/         #   web/tauri/capacitor 桥接
│   ├── src-tauri/            #   Rust Core（Tauri）
│   ├── android/              #   Capacitor Android 工程
│   ├── ios/                  #   Capacitor iOS 工程
│   ├── packages/             #   Capacitor 插件（今日课程 Widget 等）
│   ├── public/               #   静态资源
│   ├── scripts/              #   客户端构建/发布脚本（含 ci/ 子目录）
│   ├── index.html            #   HTML 入口
│   ├── capacitor.config.ts   #   Capacitor 配置
│   ├── package.json          #   客户端依赖与脚本
│   └── remote_config.json    #   远程配置
├── website/                  # 官网（Next.js 15，文档与下载站）
├── identity-platform/        # OIDC 身份平台（Core + Auth 接力页 + Developer Portal）
├── cloudflare/               # Cloudflare Workers（云同步等）
├── docs/                     # 项目文档与 Issue 档案
├── scripts/                  # 仓库级治理与发布脚本（check_all、build_website_modules 等）
├── tools/                    # 辅助工具脚本
├── release.py                # 发布脚本
└── edgeone.json              # EdgeOne 站点配置
```

> 客户端（Vue/Tauri/Capacitor）全部源码与构建配置位于 `apps/client/`；仓库根目录只保留仓库级治理（`scripts/`、`docs/`、`.github/` 等）与独立项目（`website/`、`identity-platform/`、`cloudflare/` 等）。客户端相关命令请先 `cd apps/client` 再执行。

### 双栈发布边界（Tauri + Capacitor）

| 平台 | 运行时 | 本地构建 | CI 工作流 |
|------|--------|----------|-----------|
| Windows / macOS / Linux | Tauri 2 | `cd apps/client && npm run tauri build` | `dev-build.yml` / `release.yml` |
| Android / iOS | Tauri 2 Mobile | `cd apps/client && npm run tauri android build` / `tauri ios` | `dev-build.yml` / `release.yml` |

- 桌面与移动共享 `apps/client/src/` 前端与 `apps/client/src-tauri/` Rust 逻辑（移动端通过 Capacitor 插件桥接）。
- **勿提交** `apps/client/android/app/build/`、`apps/client/ios/Pods/` 等原生构建产物（已写入 `.gitignore`）。
- 安全与贡献流程见 [SECURITY.md](./SECURITY.md)、[CONTRIBUTING.md](./CONTRIBUTING.md)。

## 💻 本地开发

### 环境要求

- Node.js 20+（见 `.nvmrc`）
- Rust stable（Tauri 开发需要）
- Android Studio（Android 构建需要）
- Xcode（iOS 构建需要）

### 安装依赖

```bash
cd apps/client
npm ci
```

### 常用命令（均在 `apps/client/` 目录下执行）

```bash
# 前端开发/构建
npm run dev
npm run build

# Tauri
npm run tauri dev
npm run tauri build

# Capacitor
npm run cap:sync
npm run cap:run:android
npm run cap:open:android
npm run cap:open:ios
```

## 🔌 本地 HTTP Bridge

默认地址：`http://127.0.0.1:4399`

- 支持登录、成绩、课表、考试、电费、图书、资料分享等接口
- 支持对外自动化集成（如 NoneBot）

## 🚀 发布脚本（支持 major / minor / patch）

```bash
python release.py          # 默认 patch：1.2.3 -> 1.2.4
python release.py minor    # minor：1.2.3 -> 1.3.0
python release.py major    # major：1.2.3 -> 2.0.0
```

> 发布脚本默认推送 `origin/main` 并重建对应 tag，不处理归档分支。详细用法与发布说明见 [`release.md`](./release.md)。

## 📲 今日课程桌面小组件（Widget）

在 Android / iOS 桌面添加「今日课程」小组件，无需打开 App 即可查看当天课表。采用原生 Widget + 自研 Capacitor 插件 `@mini-hbut/capacitor-plugin-mini-hbut-widget`：Android 用 `AppWidgetProvider` + `RemoteViews` + WorkManager 周期刷新，iOS 用 WidgetKit + `TimelineProvider`，数据经 SharedPreferences / App Group UserDefaults 共享快照。

安装：在 `apps/client/` 下执行 `npm ci` → `npm run build` → `npx cap sync`。App Group（iOS）与 Receiver 注册（Android）等配置详见 [`apps/client/packages/capacitor-plugin-mini-hbut-widget/README.md`](apps/client/packages/capacitor-plugin-mini-hbut-widget/README.md)。

## 🔐 Identity / OIDC 开发者平台

Mini-HBUT Identity 是基于 OIDC 的开发者身份平台：第三方网站 / 服务端 / 原生客户端可通过标准 Authorization Code + PKCE 接入，用户在 Mini-HBUT App 内确认授权（App Approval），授权码由平台直接返回第三方回调，学校密码与会话不会经手第三方。

- **Canonical issuer**：`https://id.xn--vhq74jc2fzpchter27a.com`（Discovery：`/.well-known/openid-configuration`）
- **Developer Portal**：[https://developer.xn--vhq74jc2fzpchter27a.com](https://developer.xn--vhq74jc2fzpchter27a.com)（应用创建、审核、Redirect URI 与凭据管理）
- **接入文档**：[https://hbut.6661111.xyz/docs/identity-oidc](https://hbut.6661111.xyz/docs/identity-oidc)（唯一正式开发者文档入口）
- **源码**：`identity-platform/`（OIDC Core + Auth 接力页 + Developer Portal）

> ⚠️ Mini-HBUT 是第三方学生开发工具，**不是**湖北工业大学官方统一身份认证服务；学校身份验证来源为 `mini_hbut_app`（App 内本地学校登录状态），请勿用于要求官方强实名的场景。

---

## 📄 License

[GNU General Public License v3.0](LICENSE)

本软件为自由软件，您可以依据 GNU GPL v3 协议自由使用、修改和分发。修改后的版本必须以相同协议开源。
