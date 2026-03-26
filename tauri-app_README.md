# `tauri-app` 核心工程域全局架构文档 

## 1. 定位与全局职能

`tauri-app` 是 **Mini-HBUT (湖北工业大学教务助手)** 的中枢神经与最终形态承载体。它并不只是一个单纯的“前端页面”，而是一个具备跨物理操作系统部署能力的**聚合工程（Monorepo-like Hybrid Architecture）**。

其定位可以概括为以下三点：
1. **多端封壳枢纽**：负责将统一的 Vue 3 前端业务逻辑打包分发。通过 Tauri 打包为 Windows / macOS 可执行程序，通过 Capacitor 同步至底层 Android / iOS 原生包。
2. **底层权限与系统桥接**：突破浏览器的安全沙盒与同源策略（CORS），向底层索要原生的文件系统访问权限（持久化存储密码等配置）和网络发包权限。
3. **混合环境生命周期管理**：包含了自研的 OTA（空中热更新）机制脚本，管理多端的应用启动、更新、崩溃重试与进程间通信（IPC）。

## 2. 工程物理分布与内部文件详细介绍

`tauri-app` 的根目录承载了所有跨端路由与宏观的声明文件，以下是根目录下所有的子文件夹及核心文件的全局分类与深入介绍：

### 2.1 核心配置与基建点 (Infrastructure)
*这些文件构成了多端编译与约束的底层秩序。每个文件均配备了独立的详细 `.md` 解析文档在旁，请交叉参阅。*

- **`package.json`**：宏观的包管家。定义了诸如 `dev`, `build:hot-bundle`, `cap:sync` 繁杂的脚本管道，混合引入了 `@capacitor` 和 `@tauri-apps` 的原生能力桥接库生态。
- **`vite.config.ts`**：执行具体编译的前线指挥部。注入了极速开发通道设置，拦截并配置了关键代理 `/bridge`，并使用 alias 重置了 Axios 路由。
- **`tsconfig.json` & `tsconfig.node.json`**：严格的 TypeScript 管控雷达，拒绝在前端层产生 ANY 推断，且剥离真实的编译工作交由 ESbuild；分离前端与 Node 配置逻辑避免污染。
- **`capacitor.config.ts`**：专门服务于移动端 Android 和 iOS 的中转信标，硬编码了 `com.hbut.mini` 并用假代理结构规避了 HTTPS mixed-content 卡扣。
- **`index.html`**：HTML5 舞台画板，它用内联 CSS 和 viewport 设置强力截断了移动端上的用户原生级反馈（禁长按提取，禁橡皮筋滑动）。

### 2.2 构建与部署引擎 (Sub-directories: Scripts & Dist)
- **`scripts/` 文件夹**：
  - *定位*：放置所有与前端页面“运行态”无关，纯为“编译部署态”服务的外部辅助 Node.js 流水线。
  - *内含*：包括 `build_hot_bundle.mjs` (热更构建脚本)、`prepare_dist.mjs` (预清理钩子)、等。这些文件的逻辑负责自动化将前端打成的包再次高度压缩供热修复投递。
- **`dist/` & `dist-hot/` 文件夹**：
  - 由 Vite 成功吐出的最终静态资源终点站，也是交接给 Tauri 或 Capacitor 的核心物料库。这些目录均会被 git 忽略。

### 2.3 前后端核心代码域 (Sub-directories: Source layers)
- **`src/` 文件夹 (前端业务与 UI)**：
  - *定位*：所有跨平台呈现的图形用户界面原点。包括 Vue 组件、状态管理 Store (Pinia)、教务API请求接口分发中心（Axios Adapter 实际执行域）及前端路由系统。
- **`src-tauri/` 文件夹 (后端系统与 IPC)**：
  - *定位*：由 Rust 编写的高性能守护层（Tauri Backend）。
  - *内含*：含主程序 `main.rs` 以及相关的 Cargo 底座。它直接响应来自 `src/` 界面的原生方法调用（如操作系统通知、硬件级常驻后台要求等），具备极高执行特权。

### 2.4 其他特殊系统外壳域 (Sub-directories: OS Native shells)
- **`android/`与`ios/` 文件夹**：
  - 由 Capacitor 在执行初始化时基于 `dist/` 吐出的 Android Studio 极地源码环境与 Xcode iOS 原生构建结构。由于依赖重型平台，它通过构建时动态映射以保原生体验。
- **`design-system/`**：内部预留或可能封装的可复用组件设计系统抽离层，服务于全局的色彩定义与 CSS 原子类维护。

## 3. 架构全局逻辑原理

`tauri-app` 的成功运转建立在**代码的严格解耦**之上。
1. **开发者视角**：开发人员在 `src/` 内部开发，对外部的容器环境“看似”是不知情的，他们只调用暴露出的适配器或封装出来的 SDK 接口。
2. **打包视角**：当触发 `npm run build`，Vite 高速启动，结合 `vite.config.ts` 中的参数将 TS/Vue 编译成 JS 字符串。
3. **分发视角**：此时这个库发生分叉，Tauri 管线读取生成的 `dist` 将其置入一个很小的本机渲染引擎；而 Capacitor 调用 Java / Swift 原生模块封装将之推送到了手机端。
4. **特殊机制视角**：针对教务系统的跨域网络墙或特定图形验证码系统，本目录的基建依靠重写的网络 Adapter 以及可能并存的 `.tmp_captcha_results.json` 本地进程共享桥接进行了渗透式通信，保证应用体验上与官网的阻尼感脱离，达成本地无感自动请求。

## 4. 全局跨端打包与运行时架构图

下方的 Mermaid 架构图阐述了 `tauri-app` 的各级目录是如何互锁连接，最终演变至操作系统的生命周期中的：

```mermaid
flowchart TB
    subgraph TA[tauri-app 工程根域]
        
        direction TB
        subgraph config[平台与基建配置中心]
            pkg(package.json) -.-> vite(vite.config.ts)
            vite -.-> ts(tsconfig.json)
            capc(capacitor.config.ts) -.-> pkg
        end

        subgraph S_SRC[src/ (前端表现层)]
            vue(Vue3 Components UI)
            store(Pinia State)
            adapter(Axios IPC/Bridge Adapter)
            vue --> store
            store --> adapter
        end

        subgraph S_SCRIPT[scripts/ (编译与生命周期管控)]
            hot(热更封包逻辑)
            prepare(自动化构建挂载前置清理)
        end

        subgraph S_TAURI[src-tauri/ (Tauri/Rust 引擎层)]
            rust(main.rs & IPC Commands)
            cargo(Cargo.toml 依赖)
        end

    end

    %% 编译动作流水流
    config ==>|npm run build | DIST[dist/ 统一静态端资产池]
    
    %% 多环境降维转化
    DIST == "Tauri 打包链" ==> T_EXE[Windows / macOS App]
    DIST == "npx cap sync" ==> S_ANDROID[android/ 原生包]
    DIST == "npx cap sync" ==> S_IOS[ios/ 原生包]

    %% 运行时通信反馈环
    T_EXE <-. IPC双向通道 (读写原生 / HTTP网络) .-> S_TAURI
    
    %% 特殊更新流注水
    S_SCRIPT -.->|提取异变| HOT_ZIP[OTA更新包云端下发]
    HOT_ZIP -.->|动态替换| DIST

    classDef srcLayer fill:#f39c12,stroke:#c0392b,stroke-width:2px;
    classDef tauriLayer fill:#000000,stroke:#2980b9,color:#fff,stroke-width:2px;
    classDef sysLayer fill:#2c3e50,stroke:#8e44ad,color:#fff,stroke-width:2px;

    class S_SRC srcLayer;
    class S_TAURI,T_EXE tauriLayer;
    class S_ANDROID,S_IOS sysLayer;
```

*(End of document. 这份高维汇总为您剖开了 tauri-app 混合项目的骨架，供架构审阅与下切深入使用。)*