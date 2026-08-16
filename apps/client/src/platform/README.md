# 平台桥接层（Tauri / Capacitor）

## 目标

将前端业务代码与平台实现解耦，避免页面直接调用 Tauri 或 Capacitor API。  
迁移完成后，页面只依赖 `src/platform/index.ts` 暴露的统一接口。

## 目录说明

- `types.ts`：桥接接口和类型定义。
- `runtime.ts`：运行时识别（tauri / capacitor / web）。
- `index.ts`：统一导出入口。
- `adapters/tauri.ts`：桌面端与现有 Tauri 行为兼容实现。
- `adapters/capacitor.ts`：移动端 Capacitor 实现（逐步补齐）。
- `adapters/web.ts`：纯 Web 兜底实现。

## 迁移规则

1. 页面和工具层禁止直接写 `@tauri-apps/*` 调用。  
2. 新增跨平台能力先加到 `types.ts`，再分别补适配器。  
3. 旧逻辑迁移时，先保证行为一致，再做性能优化。

