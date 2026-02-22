# Mini-HBUT 桌面/移动端应用

<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="Mini-HBUT Logo">
</p>

<p align="center">
  <b>湖北工业大学教务助手</b><br>
  基于 Tauri + Capacitor + Vue 3 的跨平台客户端应用
</p>

<p align="center">
  <a href="https://github.com/superdaobo/mini-hbut/releases">
    <img src="https://img.shields.io/github/v/release/superdaobo/mini-hbut?style=flat-square" alt="Latest Release">
  </a>
  <a href="https://github.com/superdaobo/mini-hbut/actions/workflows/release.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/superdaobo/mini-hbut/release.yml?style=flat-square" alt="Build Status">
  </a>
  <a href="#license">
    <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License">
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

### 🏕️ 校园生活与资源

- 🔋 **电费查询**：宿舍房间缓存 + 余额实时请求
- 💳 **交易记录**：一码通流水查询与筛选
- 📚 **图书查询**：馆藏检索、详情、借阅状态
- 🗺️ **校园地图**：远程拉取 + 本地缓存
- 📁 **资料分享**：WebDAV 浏览、预览、下载、分享
- 🧾 **导出中心**：多模块导出 JSON / 图片 / 课表 ICS

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
| Android | Capacitor | ✅ |
| iOS | Capacitor | ✅（签名安装） |

## 📥 下载安装

### 方式一：GitHub Release（推荐）

访问 [Releases 页面](https://github.com/superdaobo/mini-hbut/releases) 下载最新版本。

### 方式二：jsDelivr CDN（国内加速）

```text
https://cdn.jsdelivr.net/gh/superdaobo/mini-hbut@latest/releases/
```

## 🧱 项目结构

```text
tauri-app/
├── src/                      # Vue 前端
│   ├── components/           # 业务页面与设置页
│   ├── utils/                # 通知/缓存/CDN/字体/配置
│   └── platform/             # web/tauri/capacitor 桥接
├── src-tauri/                # Rust Core（Tauri）
├── android/                  # Capacitor Android 工程
├── ios/                      # Capacitor iOS 工程
├── capacitor.config.ts       # Capacitor 配置
└── release.py                # 发布脚本
```

## 💻 本地开发

### 环境要求

- Node.js 18+
- Rust stable（Tauri 开发需要）
- Android Studio（Android 构建需要）
- Xcode（iOS 构建需要）

### 安装依赖

```bash
npm install
```

### 常用命令

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
# 默认 patch：1.2.3 -> 1.2.4
python release.py

# minor：1.2.3 -> 1.3.0
python release.py minor
python release.py --minor

# major：1.2.3 -> 2.0.0
python release.py major
python release.py --major

# 指定版本
python release.py --version 2.5.0

# 跳过确认
python release.py --minor -y
```

> 说明：发布脚本默认推送 `origin/main` 并重建对应 tag，不处理归档分支。

## 📄 License

MIT
