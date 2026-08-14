// GradesNotificationSender —— 成绩变化本地通知发送器（#612）。
//
// 行为（#612 Notification 验收）：
// - title=成绩有更新，body=提示进入 Mini-HBUT 查看，targetView=grades；
// - 独立通知 channel（hbut-grades-changed），与现有 Mini-HBUT 通知体系并存；
// - 同一 event key/signature 只展示一次（去重由 GradesCheckCore 保证）；
// - 通知权限关闭（API 33+ POST_NOTIFICATIONS 未授予）不抛异常、不导致 Worker 崩溃，
//   返回 false 由 core 标记 presented=false（不得把「没通知权限」误判为检查失败）；
// - 不把完整成绩明细写入通知。

package com.hbut.mini.background

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.hbut.mini.R

/** 成绩变化通知发送器。 */
class GradesNotificationSender(private val context: Context) : GradesNotifier {

    override fun notifyGradeChanged(scope: String, signature: String): Boolean {
        // 1. 权限检查：未授予 -> 返回 false（检查本身成功，仅未展示通知）
        if (Build.VERSION.SDK_INT >= 33) {
            val granted = ContextCompat.checkSelfPermission(
                context, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) return false
        }
        // 2. 确保 channel 存在（幂等）
        ensureChannel(context)
        // 3. 发送通知（不携带成绩明细，只提示变化）
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_mini_hbut)
            .setContentTitle("成绩有更新")
            .setContentText("检测到成绩变化，请打开 Mini-HBUT 查看详情。")
            .setStyle(NotificationCompat.BigTextStyle().bigText("检测到成绩变化，请打开 Mini-HBUT 查看详情。"))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
        return try {
            val manager = NotificationManagerCompat.from(context)
            manager.notify(notificationId(signature), builder.build())
            true
        } catch (e: SecurityException) {
            // 系统级权限拒绝（极端情况）：不崩溃，按未展示处理
            false
        } catch (e: Exception) {
            false
        }
    }

    /** 稳定通知 ID：由 signature 派生（同一变化重复调度仍复用同一 ID，配合去重语义）。 */
    private fun notificationId(signature: String): Int {
        return (signature.hashCode() and 0x7fffffff) % 100_000
    }

    private fun ensureChannel(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            CHANNEL_ID,
            "成绩变化提醒",
            NotificationManager.IMPORTANCE_DEFAULT,
        )
        manager.createNotificationChannel(channel)
    }

    companion object {
        /** 成绩变化通知 channel（独立于旧 hbut-default）。 */
        const val CHANNEL_ID: String = "hbut-grades-changed"
    }
}
