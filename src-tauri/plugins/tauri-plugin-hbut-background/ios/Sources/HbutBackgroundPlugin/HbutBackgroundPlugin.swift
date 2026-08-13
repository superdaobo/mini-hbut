// Swift 插件入口：iOS native 承载骨架（#613 接入 BGAppRefresh 前，只提供与 Rust/Kotlin
// 同构的状态与存储能力；runNow 返回平台真实 synthetic 摘要，不伪造 ready）。
//
// 注意：Rust 侧 mobile.rs 的 ios 分支在 #613 之前直接返回 synthetic（不经 FFI）；
// 本文件为 Swift 端同构实现，供 #613 接入时挂接 BGTask 并复用。

import Foundation

/// iOS 插件骨架入口。
public enum HbutBackgroundPlugin {

    /// runNow：开发/调试一次性执行入口；返回 RunSummary JSON 字符串（与 Kotlin 桥格式一致）。
    public static func runNow(storeDir: URL, scope: String?, forceSynthetic: Bool) -> String {
        do {
            let store = try BackgroundStore(dir: storeDir)
            let state = store.loadState()
                ?? BackgroundCheckState.initial(platform: .ios, source: .ios)
            let updated = BackgroundCheckState(
                platform: .ios,
                source: .ios,
                enabled: store.loadConfig().enabled,
                configured: true,
                scope: scope ?? state.scope,
                lastRunAt: nowRfc3339(),
                lastRunOk: true,
                pendingEvents: store.loadEvents().count
            )
            try store.saveState(updated)
            if forceSynthetic {
                return try encode(RunSummary.synthetic("开发态强制 synthetic 运行（iOS native）"))
            }
            // 骨架阶段无真实业务：#613 接入 BGAppRefresh 真实成绩检查。
            return try encode(
                RunSummary.synthetic("iOS native 执行成功（骨架 synthetic，真实业务由 #613 接入）")
            )
        } catch {
            return (try? encode(RunSummary.failed("Swift runNow 失败: \(error.localizedDescription)")))
                ?? #"{"ok":false,"synthetic":false,"eventsProduced":0,"message":"Swift runNow 失败"}"#
        }
    }

    /// getStateJson：返回统一状态 JSON（真实 iOS 平台/来源）。
    public static func getStateJson(storeDir: URL) -> String {
        do {
            let store = try BackgroundStore(dir: storeDir)
            let base = store.loadState()
                ?? BackgroundCheckState.initial(platform: .ios, source: .ios)
            let state = BackgroundCheckState(
                platform: .ios,
                source: .ios,
                enabled: store.loadConfig().enabled,
                configured: true,
                scope: base.scope ?? store.loadContext()?.scope,
                lastRunAt: base.lastRunAt,
                lastRunOk: base.lastRunOk,
                pendingEvents: store.loadEvents().count,
                error: base.error
            )
            return try encode(state)
        } catch {
            return (try? encode(BackgroundCheckState(platform: .ios, source: .ios, error: "getState 失败: \(error.localizedDescription)")))
                ?? #"{"schema":1,"platform":"ios","source":"ios","enabled":false,"configured":false,"scope":null,"lastRunAt":null,"lastRunOk":null,"pendingEvents":0,"error":"getState 失败"}"#
        }
    }

    /// clearContext：按 scope 清理（账号切换/退出）。
    public static func clearContext(storeDir: URL, scope: String?) -> String {
        do {
            let store = try BackgroundStore(dir: storeDir)
            let target = scope ?? store.loadState()?.scope ?? store.loadContext()?.scope
            guard let target = target else {
                return #"{"schema":1,"cleared":false,"removedEvents":0}"#
            }
            let (cleared, removed) = try store.clearScope(target)
            return try encode(["schema": 1, "cleared": cleared, "removedEvents": removed])
        } catch {
            return (try? encode(RunSummary.failed("Swift clearContext 失败: \(error.localizedDescription)")))
                ?? #"{"ok":false,"synthetic":false,"eventsProduced":0,"message":"Swift clearContext 失败"}"#
        }
    }

    private static func encode<T: Encodable>(_ value: T) throws -> String {
        let data = try JSONEncoder().encode(value)
        guard let text = String(data: data, encoding: .utf8) else {
            throw StoreError.write("JSON 编码结果非 UTF-8")
        }
        return text
    }

    /// RFC3339 简化格式（秒级 UTC，与 Rust now_rfc3339 语义一致）。
    public static func nowRfc3339() -> String {
        "\(Int(Date().timeIntervalSince1970))Z"
    }
}
