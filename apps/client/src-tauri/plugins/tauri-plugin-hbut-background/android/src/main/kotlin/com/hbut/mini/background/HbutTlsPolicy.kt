// HbutTlsPolicy —— 移动后台原生层「校内域 TLS 放行」策略（#718，父 epic #716）。
//
// 问题背景：WorkManager 后台任务的 HttpURLConnection 走系统默认严格证书校验，
// 教务站（jwxt.hbut.edu.cn）证书过期/更换时后台任务直接 IOException 静默失败。
//
// 产品决策：对 hbut.edu.cn 及其子域无条件放行证书校验异常（无需开关）；
// 外部域（chaoxing.com 等）完全不触碰，维持平台默认严格校验。
//
// 安全权衡（留档说明）：
// - 放行即接受风险：校园网内的中间人可伪造教务响应（响应中含会话数据）；
//   换取的是学校证书运维疏漏不再打断「后台成绩/考试/通知提醒」核心功能；
// - 域判定采用严格后缀匹配（等于 hbut.edu.cn 或以 ".hbut.edu.cn" 结尾），
//   杜绝 hbut.edu.cn.evil.com、fake-hbut.edu.cn 这类后缀混淆绕过；
// - 无 App 进程内存状态依赖：SSLContext 惰性单例 + 双检锁线程安全，
//   WorkManager 即使在独立进程中执行 Worker 也同样生效；不落盘、不打日志。
// 本文件仅依赖 java.net + javax.net.ssl（JVM 单测工程可编译可测）。

package com.hbut.mini.background

import java.net.HttpURLConnection
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.X509TrustManager

/** 校内域 TLS 放行策略（静态工具，无进程状态依赖）。 */
object HbutTlsPolicy {

    /** 校内根域。 */
    const val HBUT_ROOT_DOMAIN: String = "hbut.edu.cn"

    /** 子域严格后缀（带前置点；必须与 HBUT_ROOT_DOMAIN 保持一致）。 */
    private const val HBUT_DOMAIN_SUFFIX: String = ".hbut.edu.cn"

    /**
     * host 是否为 hbut.edu.cn 及其任意层级子域（严格后缀匹配，纯函数可单测）。
     * 正例：hbut.edu.cn / jwxt.hbut.edu.cn / a.b.hbut.edu.cn
     * 反例：notice.chaoxing.com / hbut.edu.cn.evil.com / fake-hbut.edu.cn
     */
    fun isHbutHost(host: String?): Boolean {
        if (host.isNullOrBlank()) return false
        // 归一化：去首尾空白、容忍 FQDN 尾点、统一小写（DNS 大小写不敏感）
        val normalized = host.trim().trimEnd('.').lowercase()
        return normalized == HBUT_ROOT_DOMAIN || normalized.endsWith(HBUT_DOMAIN_SUFFIX)
    }

    /** 信任所有证书的 TrustManager（check 全空；仅注入到校内域连接）。 */
    private val trustAllManager: X509TrustManager = object : X509TrustManager {
        override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) = Unit

        override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) = Unit

        override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    }

    /** 恒真主机名校验器（仅注入到校内域连接）。 */
    val trustAllHostnameVerifier: HostnameVerifier = HostnameVerifier { _, _ -> true }

    private val contextLock = Any()

    @Volatile
    private var cachedContext: SSLContext? = null

    /** 信任所有证书的 SSLContext 的 socketFactory（双检锁惰性单例；独立进程各自初始化一次）。 */
    val trustAllSslSocketFactory: SSLSocketFactory
        get() {
            cachedContext?.let { return it.socketFactory }
            synchronized(contextLock) {
                cachedContext?.let { return it.socketFactory }
                val context = SSLContext.getInstance("TLS")
                context.init(null, arrayOf(trustAllManager), SecureRandom())
                cachedContext = context
                return context.socketFactory
            }
        }

    /**
     * 若连接目标为校内域则注入「信任所有证书 + 恒真主机名」；
     * 外部域不做任何改动（维持平台默认严格校验）。
     */
    fun applyIfHbutHost(connection: HttpURLConnection) {
        if (!isHbutHost(connection.url.host)) return
        // 纯 http 目标不存在 TLS 放行语义，静默跳过（现有调用点均为 https）
        val https = connection as? HttpsURLConnection ?: return
        https.sslSocketFactory = trustAllSslSocketFactory
        https.hostnameVerifier = trustAllHostnameVerifier
    }
}
