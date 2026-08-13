// Rust ↔ Swift C FFI 桥（#614 收口 #613：Rust mobile.rs ios 分支真实接入 BGAppRefresh 业务）。
//
// 约定（与 Rust 侧 mobile.rs `mod ios` 的 extern "C" 声明一一对应）：
// - 所有函数返回 heap 分配的 UTF-8 JSON 字符串，Rust 侧用 hbut_bg_free_string 释放；
// - 入参为可空 C 字符串（nil 表示缺省）；布尔用 Int32（0/1），避免跨语言 bool ABI 歧义；
// - storeDir 由 Rust 传入（与 Kotlin context.filesDir/background 目录语义对齐），
//   保证 Rust 与 Swift 共享同一 events.json / config.json / context.json；
// - BGTask 场景（App 未被 Rust 进程唤醒）仍由 Swift 侧 BackgroundStoreFactory.defaultDir()
//   兜底（见 ios/INTEGRATION.md 的目录一致性说明）。
//
// 接入前置（必须，否则链接失败）：宿主 Xcode target 以 SPM 本地包方式加入本插件
// ios/ 目录（见 ios/INTEGRATION.md 第 5 节），@_cdecl 符号随 Swift 产物链接进 App。

import Foundation

// MARK: - C FFI 导出（@_cdecl 符号名与 Rust extern "C" 声明完全一致）

@_cdecl("hbut_bg_configure")
public func hbutBgConfigure(
    _ configJson: UnsafePointer<CChar>?,
    _ storeDir: UnsafePointer<CChar>?
) -> UnsafePointer<CChar> {
    let json = readCString(configJson) ?? ""
    let dir = makeStoreDir(storeDir)
    return copyCString(HbutBackgroundPlugin.configure(storeDir: dir, configJson: json))
}

@_cdecl("hbut_bg_disable")
public func hbutBgDisable(
    _ keepDiagnostics: Int32,
    _ storeDir: UnsafePointer<CChar>?
) -> UnsafePointer<CChar> {
    let dir = makeStoreDir(storeDir)
    return copyCString(HbutBackgroundPlugin.disable(storeDir: dir, keepDiagnostics: keepDiagnostics != 0))
}

@_cdecl("hbut_bg_sync_context")
public func hbutBgSyncContext(
    _ contextJson: UnsafePointer<CChar>?,
    _ storeDir: UnsafePointer<CChar>?
) -> UnsafePointer<CChar> {
    let json = readCString(contextJson) ?? ""
    let dir = makeStoreDir(storeDir)
    return copyCString(HbutBackgroundPlugin.syncContext(storeDir: dir, contextJson: json))
}

@_cdecl("hbut_bg_run_now")
public func hbutBgRunNow(
    _ scope: UnsafePointer<CChar>?,
    _ forceSynthetic: Int32,
    _ storeDir: UnsafePointer<CChar>?
) -> UnsafePointer<CChar> {
    let dir = makeStoreDir(storeDir)
    let scopeText = readCString(scope)
    return copyCString(
        HbutBackgroundPlugin.runNow(storeDir: dir, scope: scopeText, forceSynthetic: forceSynthetic != 0)
    )
}

@_cdecl("hbut_bg_clear_context")
public func hbutBgClearContext(
    _ scope: UnsafePointer<CChar>?,
    _ storeDir: UnsafePointer<CChar>?
) -> UnsafePointer<CChar> {
    let dir = makeStoreDir(storeDir)
    return copyCString(HbutBackgroundPlugin.clearContext(storeDir: dir, scope: readCString(scope)))
}

/// setSecureEnvelope：Rust 会话层把认证材料写入 Keychain（#608 红线 2：
/// JS 不得提交认证材料，只能由 Rust 安全边界直接调用本桥）。
@_cdecl("hbut_bg_set_secure_envelope")
public func hbutBgSetSecureEnvelope(
    _ envelopeJson: UnsafePointer<CChar>?,
    _ storeDir: UnsafePointer<CChar>?
) -> UnsafePointer<CChar> {
    let json = readCString(envelopeJson) ?? ""
    let dir = makeStoreDir(storeDir)
    return copyCString(HbutBackgroundPlugin.setSecureEnvelope(storeDir: dir, envelopeJson: json))
}

/// 释放 Rust 侧通过 copyCString 分配的堆内存（与 Rust hbut_bg_free_string 声明对应）。
@_cdecl("hbut_bg_free_string")
public func hbutBgFreeString(_ ptr: UnsafeMutablePointer<CChar>?) {
    ptr?.deallocate()
}

// MARK: - 工具

private func readCString(_ ptr: UnsafePointer<CChar>?) -> String? {
    guard let ptr = ptr else { return nil }
    return String(cString: ptr)
}

private func makeStoreDir(_ ptr: UnsafePointer<CChar>?) -> URL {
    guard let ptr = ptr, let text = readCString(ptr), !text.isEmpty else {
        // Rust 未传目录时回退默认目录（Application Support/background）。
        return BackgroundStoreFactory.defaultDir()
    }
    return URL(fileURLWithPath: text, isDirectory: true)
}

/// 复制为 heap 分配的 C 字符串（调用方必须用 hbut_bg_free_string 释放）。
private func copyCString(_ text: String) -> UnsafePointer<CChar> {
    let data = text.utf8CString
    let buffer = UnsafeMutablePointer<CChar>.allocate(capacity: data.count)
    data.withUnsafeBufferPointer { src in
        guard let base = src.baseAddress else { return }
        buffer.initialize(from: base, count: data.count)
    }
    return UnsafePointer(buffer)
}
