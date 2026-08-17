# iOS Widget Extension 手动配置指南

由于 Xcode 项目文件 (`.pbxproj`) 无法通过脚本可靠修改，需要在 Xcode 中手动添加 Widget Extension Target。

## 步骤

### 1. 打开 Xcode 项目

```bash
npx cap open ios
```

### 2. 添加 Widget Extension Target

1. 在 Xcode 中，选择 **File → New → Target...**
2. 选择 **Widget Extension**
3. 配置：
   - **Product Name**: `MiniHbutTodayWidget`
   - **Bundle Identifier**: `com.hbut.mini.widget`
   - **Language**: Swift
   - **Include Configuration App Intent**: 不勾选
   - **Embed in Application**: App
4. 点击 **Finish**

### 3. 删除 Xcode 自动生成的文件

Xcode 会自动生成一些模板文件，删除它们并使用我们已有的文件：

1. 删除 Xcode 生成的 `MiniHbutTodayWidget/` 目录下的所有 `.swift` 文件
2. 将 `ios/App/MiniHbutTodayWidget/` 下的以下文件拖入 Xcode 项目：
   - `MiniHbutTodayWidgetBundle.swift`
   - `TodayCoursesWidget.swift`
   - `TodayCoursesProvider.swift`
   - `TodayCoursesEntryView.swift`
   - `WidgetDataStore.swift`
   - `Info.plist`

### 4. 配置 App Group

1. 选择主 App Target → **Signing & Capabilities** → **+ Capability** → **App Groups**
2. 添加 Group: `group.com.hbut.mini`
3. 选择 Widget Extension Target → 同样添加 `group.com.hbut.mini`

### 5. 配置 Deployment Target

1. 选择 Widget Extension Target → **General** → **Minimum Deployments**
2. 设置 iOS 版本为 **14.0**

### 6. 添加 WidgetKit Framework

1. 选择 Widget Extension Target → **General** → **Frameworks and Libraries**
2. 确认 `WidgetKit.framework` 和 `SwiftUI.framework` 已添加

### 7. 配置 Entitlements

确认以下文件存在且内容正确：
- `ios/App/App/App.entitlements` — 包含 `group.com.hbut.mini`
- `ios/App/MiniHbutTodayWidget/MiniHbutTodayWidget.entitlements` — 包含 `group.com.hbut.mini`

### 8. 构建验证

1. 选择 **Product → Build** (⌘B)
2. 确认无编译错误
3. 在模拟器或真机上运行，长按桌面 → 添加小组件 → 搜索 "Mini-HBUT"

## 常见问题

**Q: Widget 不出现在小组件列表中？**
- 确认 Widget Extension Target 的 Bundle ID 是 `com.hbut.mini.widget`
- 确认 Info.plist 中 `NSExtensionPointIdentifier` 为 `com.apple.widgetkit-extension`
- 确认 Deployment Target ≤ 设备 iOS 版本

**Q: Widget 显示 "请先登录" 但已经登录？**
- 确认两个 Target 都配置了相同的 App Group
- 确认 Provisioning Profile 包含 App Groups capability
