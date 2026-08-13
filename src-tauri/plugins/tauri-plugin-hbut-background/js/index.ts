// tauri-plugin-hbut-background guest-js 封装（#611）。
//
// 前端调用：`invoke('plugin:hbut-background|bg_get_state')`（Tauri 2 插件 IPC 命名）。
// 本文件独立于 src/platform/（#609 独占其契约定义）；#614 集成时按需迁移/引用。
// 安全约束（#608 红线 2）：本封装只传递非敏感控制信息；任何认证材料不得经由此处。

import { invoke } from "@tauri-apps/api/core";

// ---- 类型（与 Rust dto.rs / Kotlin / Swift 契约一致） ----

/** 数据 schema 版本（Rust BG_SCHEMA_VERSION）。 */
export const BG_SCHEMA_VERSION = 1;

export type BackgroundPlatform = "desktop" | "android" | "ios" | "web";
export type BackgroundSource = "none" | "rust" | "android" | "ios";

export interface BackgroundConfig {
  schema: number;
  enabled: boolean;
  intervalMinutes?: number | null;
  business: string[];
  scope?: string | null;
}

export interface BackgroundContext {
  schema: number;
  scope: string;
  business: string[];
  updatedAt: string;
}

export interface BackgroundCheckState {
  schema: number;
  platform: BackgroundPlatform;
  source: BackgroundSource;
  enabled: boolean;
  configured: boolean;
  scope?: string | null;
  lastRunAt?: string | null;
  lastRunOk?: boolean | null;
  pendingEvents: number;
  error?: string | null;
}

export interface BackgroundEvent {
  schema: number;
  id: string;
  source: BackgroundSource;
  kind: string;
  scope?: string | null;
  occurredAt: string;
  payload: unknown;
}

export interface ConsumeEventsResult {
  schema: number;
  events: BackgroundEvent[];
  remaining: number;
}

export interface ClearContextResult {
  schema: number;
  cleared: boolean;
  removedEvents: number;
}

export interface RunNowRequest {
  scope?: string | null;
  forceSynthetic?: boolean | null;
}

// ---- 7 个固定跨端 API ----

/** configure：保存用户选择，并在支持的平台更新系统调度。 */
export function configure(config: BackgroundConfig): Promise<BackgroundConfig> {
  return invoke("plugin:hbut-background|bg_configure", { config });
}

/** disable：关闭系统调度；keepDiagnostics 为 true 时保留诊断状态。 */
export function disable(keepDiagnostics?: boolean): Promise<BackgroundCheckState> {
  return invoke("plugin:hbut-background|bg_disable", { keepDiagnostics });
}

/** syncContext：更新后台执行最小上下文（仅非敏感控制信息）。 */
export function syncContext(context: BackgroundContext): Promise<BackgroundContext> {
  return invoke("plugin:hbut-background|bg_sync_context", { context });
}

/** getState：返回统一后台检查状态（真实 platform/source）。 */
export function getState(): Promise<BackgroundCheckState> {
  return invoke("plugin:hbut-background|bg_get_state");
}

/** runNow：开发/调试一次性执行入口（JS->Rust->native->state/event->JS 闭环）。 */
export function runNow(request?: RunNowRequest): Promise<BackgroundCheckState> {
  return invoke("plugin:hbut-background|bg_run_now", { request: request ?? null });
}

/** consumeEvents：ack 语义。ids 非空时只删除匹配 id 的事件（精确 ack，
 *  前端在完整同步成功后调用）；缺省保持 #611 固定语义（limit FIFO drain）。 */
export function consumeEvents(limit?: number, ids?: string[]): Promise<ConsumeEventsResult> {
  return invoke("plugin:hbut-background|bg_consume_events", {
    limit: limit ?? null,
    ids: ids && ids.length > 0 ? ids : null,
  });
}

/** peekEvents：只读 event inbox，不删除任何条目（#614：同步成功后再 ack 的前提）。 */
export function peekEvents(limit?: number): Promise<ConsumeEventsResult> {
  return invoke("plugin:hbut-background|bg_peek_events", { limit: limit ?? null });
}

/** clearContext：账号退出/切换时清理对应后台上下文、状态与事件。 */
export function clearContext(scope?: string): Promise<ClearContextResult> {
  return invoke("plugin:hbut-background|bg_clear_context", { scope: scope ?? null });
}
