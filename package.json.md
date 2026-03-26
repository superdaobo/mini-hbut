# `package.json` 深度解析文档

## 1. 定位与核心功能

`package.json` 是本工程（`mini-hbut`）的根基描述文件，它不仅承担着常规 Node.js / 前端 Web 项目的依赖管理工作，更暴露出了本项目极为特殊的**“多端同构混合架构”**（Hybrid Architecture）。该工程的最终产物既可以作为桌面端原生应用运行（基于 Tauri），也可以作为移动端原生应用运行（基于 Capacitor 封装的 Android / iOS 包）。

从文件内容中，我们可以清晰地界定其核心功能：
- **项目元数据挂载**：版本号 `1.2.7`，项目名称 `mini-hbut`，声明采用 `GPL-3.0-or-later` 许可证，同时标记 `"type": "module"`，使得工程底层支持 ESModule 原生解析。
- **构建流控制中枢**：定义了详尽的 `scripts` 脚本集合，从开发调试（`dev`）、生产编译（`build`），一直延伸到底层的热更新构建（`build:hot-bundle`）以及各类系统级接口网络共享的测试脚本。
- **多引擎依赖管理**：通过 `dependencies` 字段，我们能看出工程同时挂载了 Capacitor 的底层依赖插件群（涉及原生通知、偏好设置、文件系统等）与 Tauri 的底层依赖插件群（涉及终端命令、文件上传、桌面常亮等），并结合了 Vue 3、Pinia 全家桶作为统一的响应式视图层。

## 2. 逻辑原理与架构关联

### 2.1 独创的“双轨引擎”设计
传统框架常选择单一的封装容器（要么是 Cordova/Capacitor 做移动端，要么是 Electron/Tauri 做桌面端）。然而本工程的 `package.json` 展现出了一种兼顾两者的解法。在纯前端（Vue 3 + Vite）代码编写完毕后，编译链产生一个公共产物（`dist`），并分别通过两种路径挂载：
- **桌面端路径**：调用 `@tauri-apps/cli` 将静态资源打包至 Rust 二进制内核中，使用 Webview2 / WebKit 渲染。
- **移动端路径**：调用 `@capacitor/cli` 进行 `npx cap sync`，将静态资源桥接至 Android 的 WebView 组件，借助 JS Bridge 唤起底层安卓 API。

### 2.2 视图层与状态中心
框架主体使用 `vue` (^3.4.0) 和 `vue-router` 处理单页面挂载与路由切换，配合 `pinia` 建立高可用的统一状态管理。在此之上引入了 `marked`、`dompurify` 用以渲染被净化的 Markdown / 文本（通常用于呈现带样式的教务通知、AI 对话流）。

## 3. 代码级深度拆解

### 3.1 `scripts` 节点解析
该区域被划分为几个清晰的战区：
- **标准 Web 周期**：`dev`, `build`, `preview` 将纯净构建流程交由 Vite 接管。由于是 ES 架构，这三者直接驱动内置的 Rollup 和 Esbuild 进行 AST 转换。
- **预处理指令 (pre hooks)**：`"prebuild": "node scripts/prepare_dist.mjs"` 等钩子。NPM 系统在执行对应的 `npm run build` 前，会自动拦截并优先运行 `prebuild`。这是为了在产物打包前自动清理旧目录、注入特定环境变量或锁定构建状态。
- **特殊构建栈**：`"build:hot-bundle": "node scripts/build_hot_bundle.mjs"`，这暗示项目在原生包之外，还存在一套绕过应用商店审核的**热更新机制**！它将前端代码打包成 bundle 供 Tauri 或其他机制直接空中热替换（OTA）。
- **Capacitor 特有指令**：`"cap:sync"`, `"cap:run:android"`, `"cap:open:android"` 等，用于在完成 Web 编译后，调用 Native 环境 SDK 进行代码拷贝映射或真机调试。

### 3.2 `dependencies` 节点精讲
依赖分布可以归类为以下核心矩阵：
1. **Capacitor Native Plugins (移动端基石)**：
   - `@capacitor/core`, `android`, `ios`：内核层驱动。
   - `filesystem`, `preferences`, `local-notifications`：分别负责提供对于原生文件系统的读写、键值对存储（替代 localStorage 以解耦 WebView 限制）、本地定时推送。
2. **Tauri Native Plugins (桌面端基石)**：
   - `@tauri-apps/api`, `plugin-shell`, `plugin-fs`：对应 Tauri 的 IPC (Inter-Process Communication)，使得浏览器层可以通过命令模式召唤操作系统的终端，并具备独立读写物理硬盘的系统级权限。
3. **第三方增强及工具库**：
   - `@microsoft/fetch-event-source`：由于涉及到接入大语言模型（如深度的教学AI问答助手），该包提供了坚固的 SSE (Server-Sent Events) 连接。
   - `html2canvas`, `qrcode`：可能用于成绩单截图生成、一码通绑定或页面分享。功能实现直接利用前端 Canvas 合成。

## 4. 架构中的工程化挑战

将 Capacitor 与 Tauri 混排在一个 `package.json` 内绝非无缝之举，它会带来显著的命名空间与环境判断压力。在这套包管控体制下，工程内部代码必然需要实现一套统一的 API Adapter （下文的 Vite 配置能佐证此点：别名注入或跨环境封装）。开发者在不同设备上必须对执行哪个指令极其清晰——这也是为了保证开发者无需维护两套互相分裂的代码库而作出的设计妥协与创新。

## 5. 项目工程流与包依赖架构时序图

下面我们使用 Mermaid 图表，将 `package.json` 中的生命周期指令及依赖引擎挂载路径转换为可直观阅读的架构时序流签：

```mermaid
graph TD
    A[package.json npm scripts] --> B(Standard Web Scripts)
    A --> C(Tests & Custom Hooks)
    A --> D(Native Packaging Scripts)

    %% 分支详情
    B --> B1[npm run dev <br/> Vite Hot Reload Server]
    B --> B2[npm run build <br/> Vite ESBuild & Rollup]
    
    %% 前置处理
    B2 -.触发自动钩子.-> B3((prebuild: prepare_dist.mjs))

    %% 构建产物与原生分发
    B2 --> DIST[dist/ <br/> Web Static Files]

    DIST -->|npx cap sync| E1[Capacitor Core]
    DIST -->|tauri dev/build| E2[Tauri IPC Core]
    
    %% 依赖映射
    E1 --> P1(@capacitor/android)
    E1 --> P2(@capacitor/ios)
    E1 --> P3(Native Plugins: filesystem, notif)

    E2 --> T1(@tauri-apps/api)
    E2 --> T2(Tauri Plugins: shell, fs, keep-screen-on)

    %% 特殊更新流
    C --> H1[build:hot-bundle <br/> build_hot_bundle.mjs]
    H1 --> HOT[OTA Hot Update ZIP]
    HOT -.网络下发.-> E1
    HOT -.网络下发.-> E2

    classDef core fill:#2d3436,stroke:#3b5998,stroke-width:2px,color:#fff;
    classDef web fill:#f0932b,stroke:#e58e26,stroke-width:2px,color:#fff;
    classDef mobile fill:#27ae60,stroke:#e1b12c,stroke-width:2px,color:#fff;
    classDef desktop fill:#0652DD,stroke:#12cbc4,stroke-width:2px,color:#fff;

    class A core;
    class B,B1,B2,B3 web;
    class E1,P1,P2,P3 mobile;
    class E2,T1,T2 desktop;
    class H1,HOT core;
```

*(End of document. 此文档阐明了为何在目录中会混杂多套构建命令以及该应用生态的核心护城河。)*
