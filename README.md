# Mini-HBUT 桌面/移动端应用

<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="Mini-HBUT Logo">
</p>

<p align="center">
  <b>湖北工业大学教务助手</b><br>
  基于 Tauri 2.0 + Vue 3 的跨平台客户端应用
</p>

<p align="center">
  <a href="https://github.com/superdaobo/mini-hbut/releases">
    <img src="https://img.shields.io/github/v/release/superdaobo/mini-hbut?style=flat-square" alt="Latest Release">
  </a>
  <a href="https://github.com/superdaobo/mini-hbut/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/superdaobo/mini-hbut/build.yml?style=flat-square" alt="Build Status">
  </a>
  <a href="https://github.com/superdaobo/mini-hbut/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/superdaobo/mini-hbut?style=flat-square" alt="License">
  </a>
</p>

## ✨ 功能特性

- 📊 **成绩查询** - 查看各学期成绩、GPA计算、成绩趋势分析
- 📅 **课表查询** - 当前周课表、学期全部课表
- 🏫 **空教室查询** - 按时间段查询可用教室
- 📝 **考试安排** - 查看即将到来的考试信息
- 🎯 **学业进度** - 培养方案完成进度、学分统计
- 🔋 **电费查询** - 宿舍电费余额实时查询
- 📈 **排名查询** - 班级/专业/年级排名
- 📆 **校历** - 当前学期校历、周次信息
- 🔔 **自动更新** - 检测新版本，一键下载更新

## 📱 支持平台

| 平台 | 格式 | 状态 |
|------|------|------|
| Windows | MSI / EXE | ✅ |
| macOS | DMG | ✅ |
| Android | APK | ✅ |
| iOS | - | 🚧 计划中 |
| Linux | AppImage | 🚧 计划中 |

## 📥 下载安装

### 方式一：GitHub Release（推荐）
访问 [Releases 页面](https://github.com/superdaobo/mini-hbut/releases) 下载最新版本。

### 方式二：jsDelivr CDN（国内加速）
```
https://cdn.jsdelivr.net/gh/superdaobo/mini-hbut@latest/releases/
```

## 🔧 自动构建

项目使用 GitHub Actions 自动构建。当推送带 `v` 前缀的标签时，会自动触发多平台构建。

### ⚠️ 首次设置 GitHub Actions 权限

**报 403 错误就是这个原因！**

1. 进入 GitHub 仓库页面: https://github.com/superdaobo/mini-hbut
2. 点击 **Settings** → **Actions** → **General**
3. 滚动到 **Workflow permissions** 部分
4. 选择 **Read and write permissions**
5. 勾选 **Allow GitHub Actions to create and approve pull requests**
6. 点击 **Save**

### 🚀 发布新版本

使用自动发布脚本：

```bash
cd tauri-app
python release.py              # 递增 patch 版本 (1.0.0 → 1.0.1)
python release.py minor        # 递增 minor 版本 (1.0.0 → 1.1.0)
python release.py major        # 递增 major 版本 (1.0.0 → 2.0.0)
python release.py --no-confirm # 跳过确认直接发布
```

或者手动创建标签：

```bash
git tag -a v1.0.1 -m "Release v1.0.1"
git push origin v1.0.1
```

### 📊 查看构建状态

- 🔨 构建进度：https://github.com/superdaobo/mini-hbut/actions
- 📦 发布页面：https://github.com/superdaobo/mini-hbut/releases

## 💻 本地开发

### 环境要求

- **Node.js** 18+ ([下载](https://nodejs.org/))
- **Rust** 最新稳定版 ([安装](https://rustup.rs/))
- **Android SDK + NDK** (仅 Android 构建需要)

### 安装依赖

```bash
cd tauri-app
npm install
```

### 运行开发模式

```bash
npm run tauri dev
```

### 构建生产版本

```bash
# Windows / macOS
npm run tauri build

# Android APK
npm run tauri android build -- --apk
```

## 📁 项目结构

```
tauri-app/
├── src/                      # 📱 Vue 前端源码
│   ├── components/           # Vue 组件 (页面)
│   ├── utils/                # 工具函数 (API/加密)
│   ├── assets/               # 静态资源
│   ├── styles/               # 全局样式
│   ├── App.vue               # 主应用入口
│   └── main.ts               # 入口文件
├── src-tauri/                # 🦀 Rust 后端源码
│   ├── src/                  # Rust 源文件
│   │   ├── modules/          # 功能模块
│   │   ├── http_client.rs    # HTTP 客户端
│   │   ├── parser.rs         # HTML 解析器
│   │   ├── db.rs             # SQLite 数据库
│   │   └── lib.rs            # Tauri 命令
│   ├── icons/                # 应用图标
│   └── tauri.conf.json       # Tauri 配置
├── release.py                # 🚀 版本发布脚本
├── generate_icons.py         # 🎨 图标生成脚本
└── package.json              # Node.js 配置
```

## 🔄 版本更新机制

应用内置自动更新检测功能：

1. ⏰ 启动时自动检查 GitHub Release 最新版本
2. 📢 发现新版本时弹窗提示用户
3. 🚀 点击下载通过 jsDelivr CDN 加速下载

### 更新检测源

1. **主要源**：jsDelivr CDN（国内友好）
2. **备用源**：GitHub API

## 📰 远程配置与公告系统

前端支持从远程 JSON 拉取公告、强制更新最低版本、OCR 入口等配置。

### 配置示例

参考文件：[tauri-app/public/remote_config.sample.json](public/remote_config.sample.json)

### 公告功能说明

- **置顶公告**：显示在首页公告区，支持图片 + 标题 + 详情
- **滚动公告**：显示在首页顶部滚动条
- **确认公告**：用户首次确认后不再弹出
- **强制更新**：低于最低版本会提示更新并阻止继续使用

## 🎯 学期/周次计算规则

应用根据当前日期自动计算学期和周次：

| 月份 | 学期 |
|------|------|
| 9-12 月 | 当年第一学期 |
| 1 月 - 2月14日 | 上一年第一学期（寒假） |
| 2月15日 - 8月 | 上一年第二学期 |

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目仅供学习交流使用，请勿用于商业用途。

## 🙏 致谢

- [Tauri](https://tauri.app/) - 跨平台应用框架
- [Vue.js](https://vuejs.org/) - 前端框架
- [Vant](https://vant-ui.github.io/) - 移动端 UI 组件库

##  常见问题

### Q: GitHub Actions 报 403 错误？

A: 需要配置仓库的 Workflow 权限为 "Read and write permissions"。详见上方「首次设置」部分。

### Q: Android 构建失败？

A: 确保 GitHub Actions runner 有正确的 Android SDK 和 NDK。工作流会自动安装 NDK 27.0.11718014。

### Q: macOS 构建的 DMG 无法打开？

A: 未签名的应用需要在「系统偏好设置」「安全性与隐私」中允许打开。

##  许可证

MIT License

##  维护者

- superdaobo
