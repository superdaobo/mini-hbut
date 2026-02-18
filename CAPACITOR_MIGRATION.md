# Mini-HBUT 重构迁移方案（Tauri 桌面 + Capacitor 移动）

## 1. 目标

- **桌面端**：继续使用 Tauri，保持当前能力与发布链路稳定。  
- **移动端**：新增 Capacitor 外壳，逐步承接 iOS/Android 深度能力。  
- **业务层**：统一前端代码，避免双端重复开发。

## 2. 当前已落地（已完成 A~D）

1. 已新增 `capacitor.config.ts`，并对齐 `appId=com.hbut.mini`。  
2. 已补充 npm 脚本：`cap:sync`、`cap:run:android`、`cap:open:*`。  
3. 已新增 `src/platform` 桥接层（runtime + adapters + types + native helpers）。  
4. 已将外链、通知、版本获取、应用退出、文件路径转换、文件读取统一收口到桥接层。  
5. 页面与工具层已迁移核心调用点，不再散落硬编码 Tauri API。  
6. 已完成桌面与移动构建链路验证（`npm run build`、`npm run cap:sync`、`npm run tauri build -- --bundles nsis`）。

## 3. 分阶段迁移路线

### 阶段 A（已完成）

- 建立桥接抽象并替换高频调用点。  
- 结果：桌面行为保持不变，移动端具备统一入口骨架。

### 阶段 B（已完成）

- 通知模块改造到平台桥接（权限/本地通知/通道策略）。  
- 外链/分享下载链路改造到平台桥接（Tauri/Capacitor/Web 三实现）。

### 阶段 C（已完成）

- 后台能力（保活、息屏策略）按平台适配并保留兜底。  
- 运行时能力判断集中在 `runtime.ts`，避免页面层平台分叉。

### 阶段 D（已完成）

- 完成移动端构建链路验证（Capacitor 同步）。  
- 完成桌面构建回归验证（Tauri NSIS 打包）。  
- 后续在 CI 中继续补充 Android/iOS 原生构建矩阵（当前先保证本地可验证链路可用）。

## 4. 代码规范要求

1. 页面层不得直接调用 `@tauri-apps/*` 或 `@capacitor/*`。  
2. 新能力必须先定义到 `src/platform/types.ts`。  
3. 适配器内需要中文注释说明平台差异和兜底行为。  
4. 迁移中保持“行为兼容优先”，再做性能优化。
