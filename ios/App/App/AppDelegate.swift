import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // 注册 WKWebView 进程终止恢复，防止后台切回后黑屏
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.installWebViewCrashRecovery()
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // 回到前台时检测 WebView 是否黑屏，触发恢复
        nudgeWebViewIfNeeded()
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - WebView 黑屏恢复

    /// 获取 Capacitor 管理的 WKWebView
    private func findCapacitorWebView() -> WKWebView? {
        guard let rootVC = window?.rootViewController else { return nil }
        if let bridge = (rootVC as? CAPBridgeViewController) {
            return bridge.webView
        }
        // 递归查找子控制器
        for child in rootVC.children {
            if let bridgeVC = child as? CAPBridgeViewController {
                return bridgeVC.webView
            }
        }
        return nil
    }

    /// 注册 WKWebView 渲染进程终止回调
    private func installWebViewCrashRecovery() {
        guard let webView = findCapacitorWebView() else { return }
        webView.navigationDelegate = WebViewRecoveryDelegate.shared
    }

    /// 回到前台时，检测 WebView 内容是否丢失
    private func nudgeWebViewIfNeeded() {
        guard let webView = findCapacitorWebView() else { return }
        webView.evaluateJavaScript("document.body?.innerHTML?.length || 0") { result, error in
            let contentLength = result as? Int ?? 0
            if error != nil || contentLength == 0 {
                // WebView 内容丢失，触发重载
                DispatchQueue.main.async {
                    webView.reload()
                }
            }
        }
    }
}

/// WKNavigationDelegate：监听渲染进程被系统终止后自动 reload
class WebViewRecoveryDelegate: NSObject, WKNavigationDelegate {
    static let shared = WebViewRecoveryDelegate()
    private var originalDelegate: WKNavigationDelegate?

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // 渲染进程被系统杀死，自动重载
        DispatchQueue.main.async {
            webView.reload()
        }
    }

    // 将其他导航事件转发给 Capacitor 原始 delegate
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        originalDelegate?.webView?(webView, didFinish: navigation)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        originalDelegate?.webView?(webView, didFail: navigation, withError: error)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let delegate = originalDelegate,
           delegate.responds(to: #selector(WKNavigationDelegate.webView(_:decidePolicyFor:decisionHandler:) as (WKNavigationDelegate) -> (WKWebView, WKNavigationAction, @escaping (WKNavigationActionPolicy) -> Void) -> Void)) {
            delegate.webView?(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
        } else {
            decisionHandler(.allow)
        }
    }
}
