import { bridgePost, errorMessage, hasTauri, invoke, mockResponse, type JsonObject } from './bridge';
import { reconcileLocalReminders } from '../local_reminder_scheduler';

/**
 * 日程 CRUD 成功后触发本地提醒 reconcile（#839）。
 *
 * 与 post.ts 的 fireCustomCourseReconcile 同策略：不 await、失败静默——
 * 提醒登记失败绝不能影响日程本身的结果（add/update/delete 已成功）。
 * reconcile 内部会按稳定 event id diff：新增 → 补建，修改 → 旧取消 + 新建，
 * 删除 → 该日程不再出现在 expected，自动取消。
 */
const fireScheduleEventReconcile = (data: JsonObject) => {
  const sid = String(data?.student_id || data?.studentId || '').trim();
  if (!sid) return;
  void reconcileLocalReminders({ studentId: sid, reason: 'schedule-event-crud' }).catch(() => {});
};

/**
 * 处理个人日程（#835）端点；非日程端点返回 null。
 *
 * 从 post.ts 抽出，避免主分发文件继续膨胀（god-file 上限 1000 行，
 * 抽取前 post.ts 已 988 行）。四个分支的写法与既有 custom course 分支保持一致：
 * Tauri 运行时走 invoke（参数驼峰化），否则走本地 HTTP Bridge。
 */
export const handleScheduleEventPost = async (
  url: string,
  data: JsonObject
): Promise<unknown | null> => {
  if (url.includes('/v2/schedule/event/add')) {
    try {
      if (hasTauri) {
        const payload = await invoke('add_schedule_event', { req: data || {} });
        fireScheduleEventReconcile(data);
        return mockResponse(payload);
      }
      const res = await bridgePost('/schedule/event/add', data || {});
      if (res?.success && res?.data) {
        fireScheduleEventReconcile(data);
        return mockResponse({ success: true, ...res.data });
      }
      return mockResponse({ success: false, error: errorMessage(res.error) || '添加日程失败' });
    } catch (err) {
      return mockResponse({ success: false, error: errorMessage(err) });
    }
  }
  if (url.includes('/v2/schedule/event/list-range')) {
    try {
      if (hasTauri) {
        const payload = await invoke('list_schedule_events_range', {
          studentId: data?.student_id || data?.studentId || '',
          startDate: data?.start_date || data?.startDate || '',
          endDate: data?.end_date || data?.endDate || ''
        });
        return mockResponse(payload);
      }
      const res = await bridgePost('/schedule/event/list-range', data || {});
      if (res?.success && res?.data) {
        return mockResponse({ success: true, ...res.data });
      }
      return mockResponse({ success: false, error: errorMessage(res.error) || '获取日程失败' });
    } catch (err) {
      return mockResponse({ success: false, error: errorMessage(err) });
    }
  }
  if (url.includes('/v2/schedule/event/update')) {
    try {
      if (hasTauri) {
        const payload = await invoke('update_schedule_event', { req: data || {} });
        fireScheduleEventReconcile(data);
        return mockResponse(payload);
      }
      const res = await bridgePost('/schedule/event/update', data || {});
      if (res?.success && res?.data) {
        fireScheduleEventReconcile(data);
        return mockResponse({ success: true, ...res.data });
      }
      return mockResponse({ success: false, error: errorMessage(res.error) || '修改日程失败' });
    } catch (err) {
      return mockResponse({ success: false, error: errorMessage(err) });
    }
  }
  if (url.includes('/v2/schedule/event/delete')) {
    try {
      if (hasTauri) {
        const payload = await invoke('delete_schedule_event', {
          studentId: data?.student_id || data?.studentId || '',
          eventId: data?.event_id || data?.eventId || ''
        });
        fireScheduleEventReconcile(data);
        return mockResponse(payload);
      }
      const res = await bridgePost('/schedule/event/delete', data || {});
      if (res?.success && res?.data) {
        fireScheduleEventReconcile(data);
        return mockResponse({ success: true, ...res.data });
      }
      return mockResponse({ success: false, error: errorMessage(res.error) || '删除日程失败' });
    } catch (err) {
      return mockResponse({ success: false, error: errorMessage(err) });
    }
  }
  return null;
};
