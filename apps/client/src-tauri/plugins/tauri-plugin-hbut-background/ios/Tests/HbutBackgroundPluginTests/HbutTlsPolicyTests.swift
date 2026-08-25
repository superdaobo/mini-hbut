// HbutTlsPolicy 单测（#718）：校内域判定正反例 + 挑战代理对外部 host 回落默认处理。
// 域判定为纯函数；挑战代理测试用构造的 URLAuthenticationChallenge 验证外部域分支。

import XCTest
@testable import HbutBackgroundPlugin

final class HbutTlsPolicyTests: XCTestCase {

    // MARK: - 域判定正例：校内根域与子域

    func testRootDomainIsHbut() {
        XCTAssertTrue(HbutTlsPolicy.isHbutHost("hbut.edu.cn"))
    }

    func testSubdomainsAreHbut() {
        XCTAssertTrue(HbutTlsPolicy.isHbutHost("jwxt.hbut.edu.cn"))
        XCTAssertTrue(HbutTlsPolicy.isHbutHost("lib.hbut.edu.cn"))
        XCTAssertTrue(HbutTlsPolicy.isHbutHost("a.b.hbut.edu.cn"))
    }

    func testCaseWhitespaceAndTrailingDotAreNormalized() {
        XCTAssertTrue(HbutTlsPolicy.isHbutHost("JWXT.HBUT.EDU.CN"))
        XCTAssertTrue(HbutTlsPolicy.isHbutHost(" jwxt.hbut.edu.cn "))
        XCTAssertTrue(HbutTlsPolicy.isHbutHost("jwxt.hbut.edu.cn."))
    }

    // MARK: - 域判定反例：外部域与后缀混淆

    func testExternalDomainsAreRejected() {
        XCTAssertFalse(HbutTlsPolicy.isHbutHost("notice.chaoxing.com"))
        XCTAssertFalse(HbutTlsPolicy.isHbutHost("i.chaoxing.com"))
        XCTAssertFalse(HbutTlsPolicy.isHbutHost("hbut.jw.chaoxing.com"))
    }

    func testSuffixConfusionAttacksAreRejected() {
        XCTAssertFalse(HbutTlsPolicy.isHbutHost("hbut.edu.cn.evil.com"))
        XCTAssertFalse(HbutTlsPolicy.isHbutHost("evil-hbut.edu.cn.example.com"))
        XCTAssertFalse(HbutTlsPolicy.isHbutHost("fake-hbut.edu.cn"))
        XCTAssertFalse(HbutTlsPolicy.isHbutHost("hbut.edu.cnx"))
    }

    func testEmptyOrNilAreRejected() {
        XCTAssertFalse(HbutTlsPolicy.isHbutHost(nil))
        XCTAssertFalse(HbutTlsPolicy.isHbutHost(""))
        XCTAssertFalse(HbutTlsPolicy.isHbutHost("   "))
        XCTAssertFalse(HbutTlsPolicy.isHbutHost("localhost"))
    }

    // MARK: - 挑战代理：非校内 host 回落系统默认处理（不构造真实 SecTrust，
    // 仅覆盖 serverTrust 解包失败/域名不命中时的 performDefaultHandling 分支）

    private func makeTrustChallenge(host: String) -> URLAuthenticationChallenge {
        let space = URLProtectionSpace(
            host: host,
            port: 443,
            protocol: "https",
            realm: nil,
            authenticationMethod: NSURLAuthenticationMethodServerTrust as String
        )
        return URLAuthenticationChallenge(
            protectionSpace: space,
            proposedCredential: nil,
            previousFailureCount: 0,
            proposedResponse: nil,
            error: nil
        )
    }

    func testDelegatePerformsDefaultHandlingForExternalHost() {
        let delegate = HbutTrustChallengeDelegate()
        var received: (URLSession.AuthChallengeDisposition, URLCredential?)?
        delegate.urlSession(
            URLSession(configuration: .ephemeral),
            didReceive: makeTrustChallenge(host: "notice.chaoxing.com")
        ) { disposition, credential in
            received = (disposition, credential)
        }
        guard let (disposition, credential) = received else {
            XCTFail("挑战处理必须同步回调 completion")
            return
        }
        guard case .performDefaultHandling = disposition else {
            XCTFail("外部 host 应回落系统默认处理，实际得到 \(disposition)")
            return
        }
        XCTAssertNil(credential, "回落默认处理时不得提供凭据")
    }

    func testDelegatePerformsDefaultHandlingWhenTrustUnavailable() {
        // 测试环境无法伪造合法 SecTrust：protectionSpace.serverTrust 为 nil，
        // 应安全解包失败并回落系统默认处理（不得强解包崩溃）
        let delegate = HbutTrustChallengeDelegate()
        var received: (URLSession.AuthChallengeDisposition, URLCredential?)?
        delegate.urlSession(
            URLSession(configuration: .ephemeral),
            didReceive: makeTrustChallenge(host: "jwxt.hbut.edu.cn")
        ) { disposition, credential in
            received = (disposition, credential)
        }
        guard let (disposition, credential) = received else {
            XCTFail("挑战处理必须同步回调 completion")
            return
        }
        guard case .performDefaultHandling = disposition else {
            XCTFail("trust 不可用时应回落系统默认处理，实际得到 \(disposition)")
            return
        }
        XCTAssertNil(credential)
    }
}
