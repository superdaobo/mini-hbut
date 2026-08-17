// BusinessChecksWorker —— #615 新增业务周期/一次性检查 Worker（考试变化 + 学校消息）。
//
// 与 #612 GradesCheckWorker 并存：成绩由原 Worker 负责，本 Worker 负责
// exams/school 两个 check unit，按顺序执行，每 unit 独立 lastResult：
// - 考试请求失败不阻止学校消息检查（#615 失败隔离验收）；
// - 学校消息 provider 不可用 -> Unsupported（成功结束，诚实标记，不阻塞其他 unit）；
// - 单次任务总预算（BusinessChecksPolicy.TASK_BUDGET_MS）：超过预算时剩余 unit
//   安全跳过（不无限延长）；
// - 最小冷却（FEATURE_COOLDOWN_MS）：同 unit 冷却窗口内跳过请求。
//
// result/retry 决策：
// - 功能关闭/context 缺失/全部 unit no-op -> Result.success()；
// - 任一 unit 网络错误且无任何 unit 成功 -> Result.retry()（带退避）；
// - 其余 -> Result.success()（auth/parse/unsupported/cooldown 均不无限 retry）。

package com.hbut.mini.background

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/** #615 业务检查 Worker（周期与 runNow 共用同一业务核心）。 */
class BusinessChecksWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val store = BackgroundStore(File(applicationContext.filesDir, "background"))
        val runtime = BusinessRuntimeStore(store.dir())
        val config = store.loadConfig()

        // 1. 调度自愈：enable/disable/interval 变更最终与 WorkManager 状态对齐（唯一 work 名幂等）
        try {
            BusinessChecksScheduler.syncFromConfig(applicationContext, config)
        } catch (e: Exception) {
            // 调度同步失败不阻断本次检查
        }

        // 2. 功能关闭 -> 立即 success（不联网、不执行业务）
        if (!config.enabled) {
            return@withContext Result.success()
        }

        // 3. context 缺失 -> 安全停止（等待 App 恢复后 syncContext；不做交互式登录）
        val context = store.loadContext()
        if (context == null || context.scope.isBlank()) {
            return@withContext Result.success()
        }

        // 4. 顺序执行 exams / school 两个 check unit（每 unit 独立失败隔离 + 冷却 + 预算）
        val budgetDeadline = System.currentTimeMillis() + BusinessChecksPolicy.TASK_BUDGET_MS
        var anySucceeded = false
        var anyNetworkError = false

        // 4.1 考试安排变化（预算内执行；失败不阻止学校消息）
        if (BudgetGate.canRun(budgetDeadline, BudgetGate.MIN_UNIT_BUDGET_MS)) {
            val fetcher = ExamsHttpFetcher(File(applicationContext.filesDir, "hbut_cookie_snapshot.json"))
            val notifier = BusinessNotificationSender(applicationContext)
            val outcome = try {
                ExamsCheckCore.runCheck(
                    store, runtime, fetcher, notifier,
                    cooldownMs = BusinessChecksPolicy.FEATURE_COOLDOWN_MS,
                )
            } catch (e: Exception) {
                ExamsCheckOutcome.NetworkError("Worker 考试检查异常: ${e.message}")
            }
            when (outcome) {
                is ExamsCheckOutcome.Baselined,
                is ExamsCheckOutcome.Unchanged,
                is ExamsCheckOutcome.Deduplicated,
                is ExamsCheckOutcome.Changed,
                is ExamsCheckOutcome.Cooldown,
                is ExamsCheckOutcome.NoOp,
                is ExamsCheckOutcome.ParseError,
                is ExamsCheckOutcome.AuthExpired,
                -> anySucceeded = true // 业务正常完成（含 auth/parse：语义可解释，不 retry）
                is ExamsCheckOutcome.NetworkError -> anyNetworkError = true
            }
        }

        // 4.2 学校消息（预算内执行；provider 不可用 -> Unsupported，不算失败）
        if (BudgetGate.canRun(budgetDeadline, BudgetGate.MIN_UNIT_BUDGET_MS)) {
            val fetcher = SchoolInboxHttpFetcher(
                File(applicationContext.filesDir, "hbut_cookie_snapshot.json"),
                File(applicationContext.filesDir, "hbut_notice_cookie_snapshot.json"),
            )
            val notifier = BusinessNotificationSender(applicationContext)
            val outcome = try {
                SchoolInboxCheckCore.runCheck(
                    store, runtime, fetcher, notifier,
                    cooldownMs = BusinessChecksPolicy.FEATURE_COOLDOWN_MS,
                )
            } catch (e: Exception) {
                SchoolInboxCheckOutcome.NetworkError("Worker 学校消息检查异常: ${e.message}")
            }
            when (outcome) {
                is SchoolInboxCheckOutcome.Baselined,
                is SchoolInboxCheckOutcome.NoNewMessages,
                is SchoolInboxCheckOutcome.Changed,
                is SchoolInboxCheckOutcome.Cooldown,
                is SchoolInboxCheckOutcome.NoOp,
                is SchoolInboxCheckOutcome.Unsupported,
                is SchoolInboxCheckOutcome.ParseError,
                is SchoolInboxCheckOutcome.AuthExpired,
                -> anySucceeded = true
                is SchoolInboxCheckOutcome.NetworkError -> anyNetworkError = true
            }
        }

        // 5. result/retry 映射：全部失败且含网络错误 -> retry（带退避）；其余 success
        if (!anySucceeded && anyNetworkError) Result.retry() else Result.success()
    }
}
