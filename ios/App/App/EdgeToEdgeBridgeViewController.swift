import UIKit
import Capacitor
import WebKit

class EdgeToEdgeBridgeViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        configureEdgeToEdgeContainer()
        super.viewDidLoad()
        configureEdgeToEdgeWebView(webView)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        configureEdgeToEdgeContainer()
        if let webView {
            configureEdgeToEdgeWebView(webView)
            webView.frame = view.bounds
        }
    }

    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        let webView = super.webView(with: frame, configuration: configuration)
        configureEdgeToEdgeWebView(webView)
        return webView
    }

    /// iOS 底部导航栏由前端吸收 safe area，原生层必须让 WKWebView 从首帧铺满整屏。
    private func configureEdgeToEdgeContainer() {
        edgesForExtendedLayout = [.top, .bottom]
        extendedLayoutIncludesOpaqueBars = true
        additionalSafeAreaInsets = .zero
        view.insetsLayoutMarginsFromSafeArea = false
        viewRespectsSystemMinimumLayoutMargins = false
    }

    private func configureEdgeToEdgeWebView(_ webView: WKWebView?) {
        guard let webView else { return }
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.contentInset = .zero
        webView.scrollView.scrollIndicatorInsets = .zero
        webView.scrollView.insetsLayoutMarginsFromSafeArea = false
    }
}
