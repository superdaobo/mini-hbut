// swift-tools-version:5.9
// SPM 包：Windows 无法本地构建，macOS 上 `swift build` / `swift test` 验证；
// #613 已接入 BGAppRefresh（BackgroundTasks 需 macOS 13+/iOS 13+）。

import PackageDescription

let package = Package(
    // 必须与 Rust crate package.name 一致：tauri_plugin::Builder::ios_path 最终通过
    // swift-rs 以该名字构建并让 rustc 链接同名 static library。
    name: "tauri-plugin-hbut-background",
    platforms: [
        .iOS(.v13),
        .macOS(.v13) // 本包主要面向 iOS；macOS 平台用于在 Mac 上运行 swift test 验证
    ],
    products: [
        .library(
            name: "tauri-plugin-hbut-background",
            type: .static,
            targets: ["HbutBackgroundPlugin"]
        )
    ],
    targets: [
        .target(name: "HbutBackgroundPlugin"),
        // 契约测试读取插件根 contract-fixtures/（三端共享单一事实源）；
        // grades fixture 共享优先、本地回退（#612 冻结前用 ios/Tests/.../Fixtures 独立版）
        .testTarget(
            name: "HbutBackgroundPluginTests",
            dependencies: ["HbutBackgroundPlugin"],
            path: "Tests/HbutBackgroundPluginTests",
            resources: []
        )
    ]
)
