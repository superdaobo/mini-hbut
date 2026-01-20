# Mini-HBUT 桌面/移动端应用

基于 Tauri 2.0 的湖北工业大学教务助手客户端应用。

##  支持平台

-  Windows (MSI / EXE)
-  macOS (DMG)
-  Android (APK)

##  自动构建

项目使用 GitHub Actions 自动构建。当推送带 `v` 前缀的标签时，会自动触发多平台构建。

###  首次设置 GitHub Actions 权限（必须！）

**报 403 错误就是这个原因！**

1. 进入 GitHub 仓库页面: https://github.com/superdaobo/mini-hbut
2. 点击 **Settings**  **Actions**  **General**
3. 滚动到 **Workflow permissions** 部分
4. 选择 ** Read and write permissions**
5. 勾选 ** Allow GitHub Actions to create and approve pull requests**
6. 点击 **Save**

### 发布新版本

```bash
cd tauri-app
python release.py              # 递增 patch 版本 (1.0.0  1.0.1)
python release.py minor        # 递增 minor 版本 (1.0.0  1.1.0)
python release.py major        # 递增 major 版本 (1.0.0  2.0.0)
```

或者手动创建标签：

```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

### 查看构建状态

- 构建进度：https://github.com/superdaobo/mini-hbut/actions
- 发布页面：https://github.com/superdaobo/mini-hbut/releases

##  本地开发

### 环境要求

- Node.js 18+
- Rust (最新稳定版)
- Android SDK + NDK (仅 Android 构建需要)

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
# Windows
npm run tauri build

# Android
npm run tauri android build -- --apk
```

##  项目结构

```
tauri-app/
 src/                    # Vue 前端源码
    components/         # Vue 组件
    utils/              # 工具函数
    App.vue             # 主应用
 src-tauri/              # Rust 后端源码
    src/                # Rust 源文件
    icons/              # 应用图标
    tauri.conf.json     # Tauri 配置
 release.py              # 版本发布脚本
 generate_icons.py       # 图标生成脚本
```

##  版本更新机制

应用内置自动更新检测功能：

1. 启动时自动检查 GitHub Release 最新版本
2. 发现新版本时弹窗提示用户
3. 点击下载通过 jsDelivr CDN 加速下载

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
