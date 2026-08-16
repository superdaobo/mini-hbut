# `src-tauri/src/main.rs` 后端应用挂载入口解析

## 1. 文件概览

`src-tauri/src/main.rs` 是 Rust 后端应用与操作系统的连接源点。
如同所有传统应用的入口函数一样，这里仅负责一个极其纯粹的操作——调用业务的运行时初始化。

### 1.1 核心职责与功能
1. **隐藏控制台窗口**: 利用宏规避在 Windows 平台下的丑陋黑框。
2. **挂载启动点**: 启动底层的 `lib.rs` 的引擎，向操作系统注册进程。

---

## 2. 逻辑架构展示

```mermaid
flowchart LR
    classDef sys fill:#2c3e50,stroke:#34495e,stroke-width:2px,color:#fff;
    classDef cargo fill:#e67e22,stroke:#d35400,stroke-width:2px,color:#fff;

    OS([用户点击桌面/移动端程序图标]):::sys
    
    OS --> CfgMacro{Windows编译模式探针}
    
    CfgMacro -->|debug_assertions 调试态| WinShow[唤起控制台窗口 \n 展示 log 日志]:::cargo
    CfgMacro -->|not(debug_assertions) 正式态| WinHide[后台静默启动 \n 脱离 Subsystem 窗口绑定]:::cargo
    
    WinShow & WinHide --> Main[调用 main() 主生命周期]
    Main --> Lib[托管给 hbut_helper_lib::run() 激活 Tauri]
```

### 2.1 架构深度解读

#### a. 针对 Windows 的视觉优化特征属性 (`#![cfg_attr...]`)
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
```
这是一句非常经典且常见的 Tauri Rust 宏应用。
如果不在源文件开头加上这一句话，那么当打包出的 `.exe` 程序在普通大学生的电脑上双击运行时，必定会先闪过或一直驻留一个黑色的控制台终端（Console GUI），随后才弹出精美的 Tauri Vue 界面。这给普通用户的困扰和使用体验是毁灭性的。

加入了宏指令之后：
- 并且如果当前**不是处于局部测试环境** `not(debug_assertions)`（即打包为 Release），则通过 `windows_subsystem = "windows"` 指令，让底层的 MSVC 链接器在链接阶段放弃向控制台子系统注册，实现全窗口级别沉浸式静默拉起应用。

### 3. 应用定位

虽然文件只有短短几行，但它遵循了 Tauri 2.x 的最新指导规范：尽量把所有真正的业务放置到 `lib.rs` 的库层级。这是为了解决在打包为移动端（如生成 iOS 静态库跨组件拉起或者是 Android `jni` 调用时）主函数的复用隔离问题。这让同一份代码具备了跨越系统级底层的能力。