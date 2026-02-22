# Mini-HBUT（桌面 + 移动端）

湖北工业大学教务助手，支持 Tauri（桌面）与 Capacitor（Android/iOS）双壳运行。

- 官网：`https://hbut.6661111.xyz`
- 文档：`https://hbut.6661111.xyz/docs`
- Release：`https://github.com/superdaobo/mini-hbut/releases`

## 平台支持

- Windows（Tauri）
- macOS（Tauri）
- Linux（Tauri）
- Android（Capacitor）
- iOS（Capacitor）

## 功能总览

### 教务与校园业务

- 成绩查询（学期成绩、缓存读取、变更检测）
- 课表查询（当前周/全学期、静默刷新）
- 考试安排（列表展示、近期提醒）
- 空教室查询
- 排名查询
- 学业进度
- 校历
- 电费查询（宿舍房间选择、余额实时请求）
- 一码通交易记录
- 图书查询
- 校园地图（远程拉取 + 本地缓存）
- 资料分享（WebDAV 目录、预览、下载、分享）
- 导出中心（JSON/图片/课表 ICS）

### 通知与后台检查

- 通知中心支持后台检查以下项目：
  - 课表静默刷新
  - 新成绩变更检测
  - 考试列表与次日考试提醒
  - 电费余额监控（低于 10 度触发通知）
- 电费通知使用电费模块中用户已选房间缓存作为查询参数。
- 每次启动会执行一次即时检查，并做签名去重，避免重复提醒。
- 移动端后台任务（Capacitor）：
  - `minimumFetchInterval = 15` 分钟
  - `stopOnTerminate = false`
  - `startOnBoot = true`
  - `enableHeadless = true`
- Android 额外注册周期任务，提升被系统回收后的触发机会。

### 设置中心（新布局）

- 后端配置模式：
  - 远程配置（含本地兜底）
  - 仅本地配置（禁用远程覆盖）
- 本地服务地址可配置：
  - OCR 服务地址
  - 临时文件上传服务地址
- 模块参数可配置并自动保存、自动应用：
  - 通知请求超时
  - 测速超时
  - 电费/空教室重试次数
  - 重试间隔
  - 移动端/桌面端预览线程与下载线程
- 功能测速面板（颜色区分延迟等级）：
  - OCR 服务器
  - 临时上传服务器
  - 新融合门户
  - 教务系统（`https://jwxt.hbut.edu.cn/admin`）
  - 超星渠道（`https://hbut.jw.chaoxing.com/admin`）
  - 一码通
  - 图书馆
- 模块目标地址固定为内置默认值，不在前端开放编辑。

### 字体系统（移动端修复）

- 可选字体：
  - 默认
  - 黑体
  - 宋体
  - 楷体
  - 仿宋
  - 得意黑
- 字体 CDN 线路：
  - 自动（优先 jsDelivr，失败回退 unpkg）
  - jsDelivr
  - unpkg
- 支持“预缓存云端字体（含得意黑）”，并显示分步进度。
- 若本地无得意黑，会弹出可见下载流程（含失败重试）。
- 字体选择与 CDN 线路持久化保存，重启后自动恢复上次选择。

### 运行时 CDN 资源缓存（减小安装包）

以下资源改为首次使用时从 CDN 加载并写入缓存，不打入本地包体：

- `pdf.js` / `pdf.worker.js`
- `xgplayer`（JS + CSS）
- `katex`（JS + CSS）
- `marked-katex-extension`

CDN 来源包含 `jsDelivr` 与 `unpkg`，失败自动回退。

## 项目架构

```
tauri-app/
├─ src/                        # Vue 前端
│  ├─ components/              # 业务页面与设置页
│  ├─ utils/                   # 通知中心/字体/CDN/缓存/配置
│  └─ platform/                # web/tauri/capacitor 桥接
├─ src-tauri/                  # Rust Core（Tauri）
├─ android/                    # Capacitor Android 工程
├─ ios/                        # Capacitor iOS 工程
└─ capacitor.config.ts         # Capacitor 配置
```

## 本地开发

### 环境

- Node.js 18+
- Rust stable（Tauri 开发需要）
- Android Studio（Android 构建需要）
- Xcode（iOS 构建需要）

### 安装依赖

```bash
npm install
```

### 前端开发

```bash
npm run dev
```

### 前端构建

```bash
npm run build
```

### Tauri 开发/构建

```bash
npm run tauri dev
npm run tauri build
```

### Capacitor 同步与运行

```bash
npm run cap:sync
npm run cap:run:android
npm run cap:open:android
npm run cap:open:ios
```

## 关键配置说明

### 远程配置

- 运行时可下发：
  - 公告、通知内容
  - OCR 地址
  - 临时文件上传地址
  - 资料分享相关配置
  - 版本更新策略
- 前端支持“仅本地配置”开关，开启后不再接受远程覆盖。

### 本地缓存

- 业务数据采用本地缓存与失效策略，提升离线可读性。
- 通知去重签名与电费通知状态持久化存储，避免重复触发。

## 本地 HTTP Bridge

默认地址：`http://127.0.0.1:4399`

- 支持登录、成绩、课表、考试、电费、图书、资料分享等接口。
- 对外集成（如 NoneBot）可通过该地址完成统一调用。

## 版本发布

- 正式发布：`python release.py`
- 开发推送：`python release_dev.py`

> 详细发布策略与分支说明请查看仓库脚本注释和工作流配置。
