# Mini-HBUT 重构迁移方案（Tauri 桌面 + Capacitor 移动）

## 1. 目标

- **桌面端**：继续使用 Tauri，保持当前能力与发布链路稳定。  
- **移动端**：新增 Capacitor 外壳，逐步承接 iOS/Android 深度能力。  
- **业务层**：统一前端代码，避免双端重复开发。

## 2. 当前已落地

1. 已新增 `capacitor.config.ts`，并对齐 `appId=com.hbut.mini`。  
2. 已补充 npm 脚本：`cap:sync`、`cap:run:android`、`cap:open:*`。  
3. 已新增 `src/platform` 桥接层（runtime + adapters + types）。  
4. 已将 `external_link.ts` 改为走桥接层，去除页面对 Tauri shell 的硬耦合。

## 3. 分阶段迁移路线

### 阶段 A（当前）

- 建立桥接抽象并开始替换高频调用点。  
- 目标：桌面行为不变、移动具备最小可运行骨架。

### 阶段 B

- 通知模块改造到平台桥接（权限/本地通知/通道策略）。  
- 文件分享与下载改造到平台桥接（Tauri/Capacitor 双实现）。

### 阶段 C

- 后台能力（保活、息屏策略）按平台分别实现。  
- 设置项落到统一 schema，并按平台动态显示能力。

### 阶段 D

- 完成移动端构建与回归测试矩阵。  
- CI 增加 Capacitor sync/build 校验任务。

## 4. 代码规范要求

1. 页面层不得直接调用 `@tauri-apps/*` 或 `@capacitor/*`。  
2. 新能力必须先定义到 `src/platform/types.ts`。  
3. 适配器内需要中文注释说明平台差异和兜底行为。  
4. 迁移中保持“行为兼容优先”，再做性能优化。

