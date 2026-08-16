// GradesCheckWorker —— WorkManager 周期/一次性成绩检查 Worker（#612）。
//
// 生命周期与 result/retry 决策（#612 Worker 最小职责）：
// - 不依赖 WebView/JS interval，进程被系统拉起后独立完成一次最小成绩变化检测；
// - 功能关闭 / context 缺失 -> 立即 Result.success()（no-op，不联网）；
// - 无网/临时失败 -> Result.retry()（WorkManager 按 backoff 策略退避，不形成紧密循环）；
// - auth/会话过期、解析失败 -> Result.success()（不无限 retry；auth 等待 App 恢复后刷新，
//   解析失败不更新 baseline 不误报）；
// - 每次执行结束同步一次系统调度（自愈：enable/interval 变更最终生效，唯一 work 名不变）。

package com.hbut.mini.background

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/** 成绩检查 Worker（周期与 runNow 共用同一业务核心）。 */
class GradesCheckWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val store = BackgroundStore(File(applicationContext.filesDir, "background"))
        val runtime = BackgroundRuntimeStore(store.dir())
        val config = store.loadConfig()

        // 1. 调度自愈：enable/disable/interval 变更最终与 WorkManager 状态对齐（唯一 work 名幂等）
        try {
            GradesCheckScheduler.syncFromConfig(applicationContext, config)
        } catch (e: Exception) {
            // 调度同步失败不阻断本次检查
        }

        // 2. 功能关闭 -> 立即 success（不联网、不执行业务）
        if (!config.enabled || !config.business.contains("grades")) {
            return@withContext Result.success()
        }

        // 3. context 缺失 -> 安全停止（等待 App 恢复后 syncContext；不做交互式登录）
        val context = store.loadContext()
        if (context == null || context.scope.isBlank()) {
            return@withContext Result.success()
        }

        // 4. 执行核心检查（真实数据源 + 系统通知）
        val fetcher = GradesHttpFetcher(
            File(applicationContext.filesDir, "hbut_cookie_snapshot.json")
        )
        val notifier = GradesNotificationSender(applicationContext)
        val outcome = try {
            GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        } catch (e: Exception) {
            GradesCheckOutcome.NetworkError("Worker 执行异常: ${e.message}")
        }

        // 5. result/retry 映射（#612 网络与错误处理验收）
        when (outcome) {
            is GradesCheckOutcome.NoOp,
            is GradesCheckOutcome.Baselined,
            is GradesCheckOutcome.Unchanged,
            is GradesCheckOutcome.Deduplicated,
            is GradesCheckOutcome.Changed,
            is GradesCheckOutcome.ParseError,
            is GradesCheckOutcome.AuthExpired,
            -> Result.success()
            is GradesCheckOutcome.NetworkError -> Result.retry()
        }
    }
}
