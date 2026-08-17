// BusinessNotificationSender —— #615 新增业务（考试变化/学校消息）本地通知发送器。
//
// 行为（与 #612 GradesNotificationSender 同模式）：
// - 考试变化：title=考试安排有更新，body=提示进入 Mini-HBUT 查看，targetView=exams；
// - 学校消息：title=新学校消息，body=短标题（长度上限），targetView=school_inbox；
// - 独立通知 channel（hbut-exams-changed / hbut-school-message），与现有体系并存；
// - 通知权限关闭（API 33+ POST_NOTIFICATIONS 未授予）不抛异常、不导致 Worker 崩溃，
//   返回 false 由 core 标记 presented=false（不得把「没通知权限」误判为检查失败）；
// - 不把完整考试明细/消息正文写入通知。

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

/** #615 新增业务通知发送器（考试变化 + 学校消息双通道）。 */
class BusinessNotificationSender(private val context: Context) : ExamsNotifier, SchoolInboxNotifier {

    override fun notifyExamsChanged(scope: String, signature: String): Boolean {
        if (!hasNotificationPermission()) return false
        ensureChannel(context, EXAMS_CHANNEL_ID, "考试安排变化提醒")
        val builder = NotificationCompat.Builder(context, EXAMS_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_mini_hbut)
            .setContentTitle("考试安排有更新")
            .setContentText("检测到考试安排变化，请打开 Mini-HBUT 查看详情。")
            .setStyle(NotificationCompat.BigTextStyle().bigText("检测到考试安排变化，请打开 Mini-HBUT 查看详情。"))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
        return try {
            NotificationManagerCompat.from(context).notify(notificationId(signature, 1), builder.build())
            true
        } catch (e: Exception) {
            false
        }
    }

    override fun notifyNewMessage(scope: String, item: SchoolMessageItem): Boolean {
        if (!hasNotificationPermission()) return false
        ensureChannel(context, SCHOOL_CHANNEL_ID, "学校消息提醒")
        val title = item.title.take(SchoolInboxCheckCore.TITLE_CAP).ifEmpty { "新学校消息" }
        val builder = NotificationCompat.Builder(context, SCHOOL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_mini_hbut)
            .setContentTitle("新学校消息")
            .setContentText(title)
            .setStyle(NotificationCompat.BigTextStyle().bigText(title))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
        return try {
            NotificationManagerCompat.from(context).notify(notificationId(item.id, 2), builder.build())
            true
        } catch (e: Exception) {
            false
        }
    }

    /** 通知权限检查（API 33+）；未授予返回 false（业务仍成功，仅未展示）。 */
    private fun hasNotificationPermission(): Boolean {
        if (Build.VERSION.SDK_INT < 33) return true
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
    }

    /** 稳定通知 ID：由业务键派生（同一变化重复调度仍复用同一 ID，配合去重语义）。 */
    private fun notificationId(key: String, salt: Int): Int {
        return (key.hashCode() and 0x7fffffff + salt) % 100_000
    }

    private fun ensureChannel(context: Context, channelId: String, name: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel(channelId, name, NotificationManager.IMPORTANCE_DEFAULT))
    }

    companion object {
        /** 考试安排变化通知 channel（独立于成绩 hbut-grades-changed）。 */
        const val EXAMS_CHANNEL_ID: String = "hbut-exams-changed"

        /** 学校消息通知 channel。 */
        const val SCHOOL_CHANNEL_ID: String = "hbut-school-message"
    }
}
