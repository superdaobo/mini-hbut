// HbutTlsPolicy 单测（#718）：校内域判定的正反例 + 放行注入只命中校内连接。
// 域判定是纯函数；放行注入通过 openConnection 构造本地连接对象验证（不发网络请求）。

package com.hbut.mini.background

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.HttpURLConnection
import java.net.URL
import javax.net.ssl.HttpsURLConnection

class HbutTlsPolicyTest {

    // ---- 正例：校内根域与子域 ----

    @Test
    fun `root domain matches`() {
        assertTrue(HbutTlsPolicy.isHbutHost("hbut.edu.cn"))
    }

    @Test
    fun `subdomains match`() {
        assertTrue(HbutTlsPolicy.isHbutHost("jwxt.hbut.edu.cn"))
        assertTrue(HbutTlsPolicy.isHbutHost("lib.hbut.edu.cn"))
        assertTrue(HbutTlsPolicy.isHbutHost("a.b.hbut.edu.cn"))
    }

    @Test
    fun `case whitespace and trailing dot are normalized`() {
        assertTrue(HbutTlsPolicy.isHbutHost("JWXT.HBUT.EDU.CN"))
        assertTrue(HbutTlsPolicy.isHbutHost(" jwxt.hbut.edu.cn "))
        assertTrue(HbutTlsPolicy.isHbutHost("jwxt.hbut.edu.cn."))
    }

    // ---- 反例：外部域维持严格校验 ----

    @Test
    fun `external chaoxing domains rejected`() {
        assertFalse(HbutTlsPolicy.isHbutHost("notice.chaoxing.com"))
        assertFalse(HbutTlsPolicy.isHbutHost("i.chaoxing.com"))
        assertFalse(HbutTlsPolicy.isHbutHost("hbut.jw.chaoxing.com"))
    }

    @Test
    fun `suffix confusion attacks rejected`() {
        assertFalse(HbutTlsPolicy.isHbutHost("hbut.edu.cn.evil.com"))
        assertFalse(HbutTlsPolicy.isHbutHost("evil-hbut.edu.cn.example.com"))
        assertFalse(HbutTlsPolicy.isHbutHost("fake-hbut.edu.cn"))
        assertFalse(HbutTlsPolicy.isHbutHost("hbut.edu.cnx"))
    }

    @Test
    fun `empty null and unrelated hosts rejected`() {
        assertFalse(HbutTlsPolicy.isHbutHost(null))
        assertFalse(HbutTlsPolicy.isHbutHost(""))
        assertFalse(HbutTlsPolicy.isHbutHost("   "))
        assertFalse(HbutTlsPolicy.isHbutHost("localhost"))
    }

    // ---- 放行注入：openConnection 仅构造对象不发起请求，属性读写均为本地操作 ----

    private fun newConnection(url: String): HttpsURLConnection =
        URL(url).openConnection() as HttpsURLConnection

    @Test
    fun `trust-all is injected into hbut connections only`() {
        val internalConn: HttpURLConnection = newConnection("https://jwxt.hbut.edu.cn/admin")
        try {
            HbutTlsPolicy.applyIfHbutHost(internalConn)
            assertSame(
                "校内域连接必须注入信任所有证书的 socketFactory",
                HbutTlsPolicy.trustAllSslSocketFactory,
                internalConn.sslSocketFactory,
            )
            assertSame(
                "校内域连接必须注入恒真 hostnameVerifier",
                HbutTlsPolicy.trustAllHostnameVerifier,
                internalConn.hostnameVerifier,
            )
        } finally {
            internalConn.disconnect()
        }

        val externalConn: HttpURLConnection = newConnection("https://notice.chaoxing.com/apis")
        try {
            HbutTlsPolicy.applyIfHbutHost(externalConn)
            assertNotSame(
                "外部域连接不得触碰（保持平台默认校验器）",
                HbutTlsPolicy.trustAllHostnameVerifier,
                externalConn.hostnameVerifier,
            )
            assertNotSame(
                "外部域连接不得触碰（保持平台默认 socketFactory）",
                HbutTlsPolicy.trustAllSslSocketFactory,
                externalConn.sslSocketFactory,
            )
        } finally {
            externalConn.disconnect()
        }
    }

    @Test
    fun `decision is derived from url host`() {
        // applyIfHbutHost 以 connection.url.host 为决策输入（与 fetcher 现场一致）
        assertTrue(HbutTlsPolicy.isHbutHost(URL("https://jwxt.hbut.edu.cn/admin").host))
        assertFalse(HbutTlsPolicy.isHbutHost(URL("https://notice.chaoxing.com/apis").host))
    }
}
