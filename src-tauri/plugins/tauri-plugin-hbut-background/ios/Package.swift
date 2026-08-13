// swift-tools-version:5.9
// SPM 包：Windows 无法本地构建，macOS 上 `swift build` / `swift test` 验证；
// #613 接入 BGAppRefresh 时作为插件 iOS 侧源码载体。

import PackageDescription

let package = Package(
    name: "HbutBackgroundPlugin",
    platforms: [
        .iOS(.v13)
    ],
    products: [
        .library(name: "HbutBackgroundPlugin", targets: ["HbutBackgroundPlugin"])
    ],
    targets: [
        .target(name: "HbutBackgroundPlugin"),
        // 契约测试读取插件根 contract-fixtures/（三端共享单一事实源）
        .testTarget(
            name: "HbutBackgroundPluginTests",
            dependencies: ["HbutBackgroundPlugin"],
            path: "Tests/HbutBackgroundPluginTests",
            resources: []
        )
    ]
)
