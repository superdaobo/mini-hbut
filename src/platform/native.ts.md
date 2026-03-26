# `src/platform/native.ts` 原生容器桥接与环境自适应层解析

## 1. 文件概览

`src/platform/native.ts` 是整个前端 Vue 项目破界（跨平台）的核心容器桥接文件（Bridge Pattern）。在类似该项目的「三端共生」（Tauri 桌面端、Capacitor 移动端、Web 纯网页端）混合架构设计下，
该文件统一收束了与底层 OS 系统（如 Rust 或 iOS/Android 原生 SDK）直接交互的关键接口。

开发者基于此模块，彻底脱离了繁琐判断（如 "我是否在 APP 内？我现在是注入了什么插件？"），只需傻瓜式调用封装好的抽象 API。
所有跨平台能力，诸如触发设备关闭、唤起 Tauri 插件读取原生硬盘、拉取编译版本，皆从此源流出并发往各自底层驱动。

### 1.1 核心职责
1. **多重运行时鉴权 (Runtime Environment Sniffing)**: 利用 `detectRuntime()` 分辨目前是置身于 "tauri", "capacitor" 或是纯粹剥离的 "web"。
2. **命令泛用包装 (IPC Invoker Wrap)**: 包装 Tauri 专属的 `@tauri-apps/api/core` 中的 `invoke` 指令并打满 Debug 日志流追踪。
3. **退栈多态降级 (Polymorphic Fallbacks)**: 不同环境下的同一种意图，执行不同的退路方案（例如跨端关闭行为 `exitNativeApp`）。
4. **资源重定位网关 (Asset Translators)**: 利用 Tauri 资源协议映射将系统原始绝对路径 `/Users/xxx/file.png` 改写为前端 WebView 可容纳识别的本地代理挂载服务虚拟盘符路径。

---

## 2. 桥接通讯工作流视图

下面这份状态流向管桥图详细地拆解了当你从前端输入一个动作（例如：获取版本、调用指令）时，`native.ts` 是如何分发重定向的。

```mermaid
flowchart TD
    classDef main fill:#34495e,stroke:#2c3e50,stroke-width:2px,color:#fff;
    classDef tauri fill:#f39c12,stroke:#d35400,stroke-width:2px,color:#fff;
    classDef mobile fill:#27ae60,stroke:#1e8449,stroke-width:2px,color:#fff;
    classDef pwa fill:#2980b9,stroke:#1abc9c,stroke-width:2px,color:#fff;

    Client[Frontend Vue/Pinia]:::main
    NativeTS[native.ts 多态网关]:::main
    
    Client -->|1. invokeNative\n2. exitNativeApp\n3. getVersion| NativeTS

    NativeTS --> Check{detectRuntime}
    
    Check -->|'tauri'| EnvTauri[Desktop 容器]:::tauri
    Check -->|'capacitor'| EnvMobile[iOS/Android 容器]:::mobile
    Check -->|'web' / other| EnvWeb[Web/浏览器兜底]:::pwa
    
    EnvTauri --> TExit[Tauri: invoke('exit_app')]
    EnvTauri --> TInvoke[Tauri: @tauri-apps/core.invoke]
    EnvTauri --> TFile[Tauri: plugin-fs.readFile]

    EnvMobile --> CExit[Capacitor: App.exitApp()]
    EnvMobile --> CInvoke[Reject / Not Supported]
    
    EnvWeb --> WExit[Browser: window.close()]
    EnvWeb --> WInvoke[Reject / throw Error]
```

### 2.1 架构深度解读

本文件的核心目的就是把复杂的**多容器 API 面板磨平，成为前端一致对口的“黑盒”网关**。前端工程师调用时不关心实现。

#### a. 极其优雅的统一拦截与容错 (Exception & Log Trapping)
```typescript
export const invokeNative = async <T = unknown>(command: string, args?: InvokeArgs): Promise<T> => {
  if (!isTauriRuntime()) {
     // 用异常把“串门调用”阻挡在前端
     throw new Error(`当前运行时不支持 invoke: ${command}`)
  }
  const startedAt = Date.now()
  pushDebugLog('Native', `invoke 开始：${command}`, 'debug', args)
  // 此处 await dynamic import 是精髓 
}
```
作者在这里用了一招非常漂亮的 **"Dynamic Import (动态按需导入)"** (`const core = await import('@tauri-apps/api/core')`) 配合时间戳性能测量打卡。
为什么不用头部直接静态 `import`？因为如果是跑在 Capacitor 手机端或纯网页端，静态预装载 Tauri 相关依赖可能引发不可逆的解析构建错误。通过执行时懒引入，彻底隔离了异构跨平台间的代码污染。

#### b. 退出协议降级降维 (Graceful Exit Behavior)

```typescript
export const exitNativeApp = async () => {
  if (isTauriRuntime()) { return await invokeNative('exit_app') }
  if (isCapacitorRuntime()) { /* Capacitor App.exitApp() */ }
  window.close() // 最后兜底
}
```
这是一段极具代表性的多态代码。因为各个平台的退出机制安全级别要求不同。Tauri 走 Rust 后端强制杀掉所有子线程挂起的守护任务进行退出，Capacitor 是原生安卓系统强杀 Activity，而网页也给出了一个最无害的关闭标签的后手应对机制，防止各种环境卡死黑屏。

#### c. 二进制穿透直读与本地路径安全化 (Asset Conversion)
```typescript
export const toNativeFileSrc = async (filePath: string): Promise<string> => { ... }
export const readNativeBinaryFile = ... // plugin-fs
```
当系统要求使用下载和离线资源读取时（比如存放在用户硬盘 `C:\` 内由于同源策略浏览器拒载的照片），`toNativeFileSrc` 唤起了 Tauri 的安全协议映射（如虚拟挂名 `asset://localhost/C:/...`）伪装本地静态域，巧妙绕过了 WebKit 的跨域文件限制大坑（CORS & Local File restrictions）。同时配备的 `readNativeBinaryFile` 则负责真正地将硬盘内容打成 `Uint8Array` 的字节流给上层解析，满足深度开发需要。

---

## 3. 在项目中的战略地位

作为前端唯一且最高层级的权限下放文件，`src/platform/native.ts` 是这套混编项目中的“王冠”。它保护了前端业务逻辑(`Vue Components`, `Pinia Store`)始终如一，不需要任何 `if (isWindows)` 这些混杂且恶心的面条特判代码散落在页面中，真正展现了“Write Once, Run Everywhere”的优良解耦素养。