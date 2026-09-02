import { isTestAccountSession } from '../test_account.js';
import { resolveTestAccountHttpResponse } from '../test_account_fixtures.js';
import { handleAuthPost } from './auth';
import { handleCampusCodePost } from './campus_code';
import { reconcileLocalReminders } from '../local_reminder_scheduler';
import {
  asRecord,
  bridgePost,
  errorMessage,
  hasTauri,
  invoke,
  mockError,
  mockResponse,
  unwrapBridge,
  type JsonObject
} from './bridge';

export const post = async (url: string, data: JsonObject = {}, _config: JsonObject = {}) => {
    console.log('[Axios Adapter] POST request received:', url);
    console.log('[Axios Adapter] POST data:', JSON.stringify(data));

    // #610：自定义课程 CRUD 成功后触发系统预调度 reconcile（课表变化后旧 pending 清理/补建）
    const fireCustomCourseReconcile = () => {
        const sid = String(data?.student_id || data?.studentId || '').trim();
        if (!sid) return;
        void reconcileLocalReminders({ studentId: sid, reason: 'custom-course-crud' }).catch(() => {});
    };
    try {
        const testAccountResponse = resolveTestAccountHttpResponse('post', url, data);
        if (testAccountResponse && (isTestAccountSession() || url.includes('/v2/start_login'))) {
            return mockResponse(testAccountResponse);
        }
        if (isTestAccountSession()) {
            return mockResponse({
                success: false,
                demo_disabled: true,
                error: '未知测试账号 HTTP 请求已拦截'
            });
        }
        const authResponse = await handleAuthPost(url, data);
        if (authResponse) return authResponse;
        if (url.includes('/v2/quick_fetch')) {
            if (!hasTauri) {
                const res = await bridgePost('/sync_grades', {
                    current_only: !!data?.teacher_current_only
                });
                if (res?.success) {
                    return mockResponse(unwrapBridge(res));
                }
                return mockResponse({ success: false, error: errorMessage(res.error) || '获取成绩失败' });
            }
            const grades = await invoke('sync_grades', {
                currentOnly: !!data?.teacher_current_only
            });
            return mockResponse(grades);
        }
        if (url.includes('/v2/grade_teacher_cache')) {
            try {
                if (hasTauri) {
                    const payload = await invoke('get_grade_teacher_cache', {
                        studentId: data?.student_id || data?.studentId || null
                    });
                    return mockResponse(payload);
                }
                return mockResponse({ success: true, by_kcbh: {}, semesters: {} });
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/grade_teachers/current')) {
            try {
                if (hasTauri) {
                    const payload = await invoke('sync_grade_teachers_current_semester');
                    return mockResponse(payload);
                }
                return mockResponse({ success: false, error: '浏览器模式不支持任课教师补齐' });
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/schedule/query')) {
            let schedule: JsonObject = {};
            if (!hasTauri) {
                const res = await bridgePost('/sync_schedule', data || {});
                if (res?.success && res?.data) {
                    schedule = { success: true, ...(asRecord(res.data)) };
                } else {
                    return mockResponse({ success: false, error: errorMessage(res.error) || '获取课表失败' });
                }
            } else {
                const raw = await invoke('sync_schedule', { semester: data?.semester || null });
                schedule = asRecord(raw);
            }
            // #610：课表同步成功后触发系统预调度 reconcile（幂等，重复同步不重复创建）
            const schedulePayload = asRecord(schedule);
            const scheduleSid = String(data?.student_id || '');
            if (scheduleSid) {
                void reconcileLocalReminders({
                    studentId: scheduleSid,
                    courses: Array.isArray(schedulePayload.data)
                        ? (schedulePayload.data as Array<Record<string, unknown>>)
                        : null,
                    scheduleMeta: (schedulePayload.meta as Record<string, unknown>) || null,
                    reason: 'schedule-sync'
                }).catch(() => {});
            }
            return mockResponse({ success: true, ...schedulePayload });
        }
        if (url.includes('/v2/schedule/custom/list_all')) {
            try {
                if (hasTauri) {
                    const payload = await invoke('list_all_custom_schedule_courses', {
                        studentId: data?.student_id || ''
                    });
                    return mockResponse(payload);
                }
                const res = await bridgePost('/schedule/custom/list_all', data || {});
                if (res?.success && res?.data) {
                    return mockResponse({ success: true, ...res.data });
                }
                return mockResponse({ success: false, error: errorMessage(res.error) || '获取全部自定义课程失败' });
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/schedule/custom/list')) {
            try {
                if (hasTauri) {
                    const payload = await invoke('list_custom_schedule_courses', {
                        studentId: data?.student_id || '',
                        semester: data?.semester || ''
                    });
                    return mockResponse(payload);
                }
                const res = await bridgePost('/schedule/custom/list', data || {});
                if (res?.success && res?.data) {
                    return mockResponse({ success: true, ...res.data });
                }
                return mockResponse({ success: false, error: errorMessage(res.error) || '获取自定义课程失败' });
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/schedule/custom/add')) {
            try {
                if (hasTauri) {
                    const payload = await invoke('add_custom_schedule_course', { req: data || {} });
                    fireCustomCourseReconcile();
                    return mockResponse(payload);
                }
                const res = await bridgePost('/schedule/custom/add', data || {});
                if (res?.success && res?.data) {
                    fireCustomCourseReconcile();
                    return mockResponse({ success: true, ...res.data });
                }
                return mockResponse({ success: false, error: errorMessage(res.error) || '添加自定义课程失败' });
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/schedule/custom/update')) {
            try {
                if (hasTauri) {
                    const payload = await invoke('update_custom_schedule_course', { req: data || {} });
                    fireCustomCourseReconcile();
                    return mockResponse(payload);
                }
                const res = await bridgePost('/schedule/custom/update', data || {});
                if (res?.success && res?.data) {
                    fireCustomCourseReconcile();
                    return mockResponse({ success: true, ...res.data });
                }
                return mockResponse({ success: false, error: errorMessage(res.error) || '修改自定义课程失败' });
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/schedule/custom/delete')) {
            try {
                if (hasTauri) {
                    const payload = await invoke('delete_custom_schedule_course', { req: data || {} });
                    fireCustomCourseReconcile();
                    return mockResponse(payload);
                }
                const res = await bridgePost('/schedule/custom/delete', data || {});
                if (res?.success && res?.data) {
                    fireCustomCourseReconcile();
                    return mockResponse({ success: true, ...res.data });
                }
                return mockResponse({ success: false, error: errorMessage(res.error) || '删除自定义课程失败' });
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/schedule/export_calendar')) {
            try {
                if (hasTauri) {
                    const payload = await invoke('export_schedule_calendar', { req: data || {} });
                    return mockResponse({ success: true, ...payload });
                }
                const res = await bridgePost('/export_schedule_calendar', data || {});
                if (res?.success && res?.data) {
                    return mockResponse({ success: true, ...res.data });
                }
                return mockResponse({ success: false, error: errorMessage(res.error) || '导出日历失败' });
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/exams')) {
            try {
                const { semester } = data;
                let payload: unknown = null;
                if (!hasTauri) {
                    const res = await bridgePost('/fetch_exams', { semester: semester || null });
                    if (!res?.success) {
                        return mockResponse({ success: false, error: errorMessage(res.error) || '获取考试失败' });
                    }
                    payload = unwrapBridge(res);
                } else {
                    payload = await invoke('fetch_exams', { semester: semester || null });
                }
                const base = asRecord(payload);
                const isSuccess = payload !== null && base.success !== false;
                if (isSuccess) {
                    const rawList: unknown[] = Array.isArray(payload)
                        ? payload
                        : Array.isArray(base.data)
                            ? base.data
                            : [];
                    const transformedExams = rawList.map((rawExam: unknown) => {
                        const exam = asRecord(rawExam);
                        return {
                            ...exam,
                            exam_date: exam.date || exam.exam_date || '',
                            exam_time: exam.start_time && exam.end_time
                                ? `${String(exam.start_time)}-${String(exam.end_time)}`
                                : (exam.start_time || exam.exam_time || ''),
                            seat_no: exam.seat_number || exam.seat_no || ''
                        };
                    });
                    // #610：考试同步成功后触发系统预调度 reconcile（确定性考试提醒，重复同步不重复登记）
                    const examSid = String(data?.student_id || '');
                    if (examSid) {
                        void reconcileLocalReminders({
                            studentId: examSid,
                            exams: transformedExams as Array<Record<string, unknown>>,
                            reason: 'exams-sync'
                        }).catch(() => {});
                    }
                    return mockResponse({ ...base, success: true, data: transformedExams });
                }
                return mockResponse(Object.keys(base).length ? base : { success: false, error: '获取考试失败' });
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/ranking')) {
            try {
                const { student_id, semester } = data;
                if (!hasTauri) {
                    const res = await bridgePost('/fetch_ranking', { 
                        student_id: student_id || '',
                        semester: semester || '' 
                    });
                    return mockResponse(unwrapBridge(res));
                }
                const ranking = await invoke('fetch_ranking', { 
                    studentId: student_id || '',
                    semester: semester || '' 
                });
                return mockResponse(ranking);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/student_info')) {
            try {
                if (!hasTauri) {
                    const res = await bridgePost('/fetch_student_info');
                    return mockResponse(unwrapBridge(res));
                }
                const info = await invoke('fetch_student_info');
                return mockResponse(info);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/student_login_access')) {
            try {
                const page = Number(data?.page) > 0 ? Number(data.page) : 1;
                const pageSizeRaw = Number(data?.page_size ?? data?.pageSize);
                const pageSize = pageSizeRaw > 0 ? pageSizeRaw : 10;
                if (!hasTauri) {
                    const res = await bridgePost('/fetch_personal_login_access_info', {
                        page,
                        page_size: pageSize
                    });
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('fetch_personal_login_access_info', {
                    page,
                    pageSize
                });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/classroom/query')) {
            try {
                console.log('[Axios Adapter] Classroom query with data:', data);
                if (!hasTauri) {
                    const res = await bridgePost('/fetch_classrooms', {
                        week: data.week || null,
                        weekday: data.weekday || null,
                        periods: data.periods || null,
                        building: data.building || null,
                    });
                    return mockResponse(unwrapBridge(res));
                }
                const classrooms = await invoke('fetch_classrooms', {
                    week: data.week || null,
                    weekday: data.weekday || null,
                    periods: data.periods || null,
                    building: data.building || null,
                });
                console.log('[Axios Adapter] Classroom response:', classrooms);
                return mockResponse(classrooms);
            } catch (err) {
                console.error('[Axios Adapter] Classroom error:', err);
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/training_plan/options')) {
            try {
                console.log('[Axios Adapter] Training plan options request');
                if (!hasTauri) {
                    const res = await bridgePost('/fetch_training_plan_options');
                    return mockResponse(unwrapBridge(res));
                }
                const options = await invoke('fetch_training_plan_options');
                console.log('[Axios Adapter] Training plan options response:', options);
                return mockResponse(options);
            } catch (err) {
                console.error('[Axios Adapter] Training plan options error:', err);
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/training_plan/jys')) {
            try {
                const yxid = data.yxid || data.kkyx || '';
                console.log('[Axios Adapter] Training plan JYS request for yxid:', yxid);
                if (!hasTauri) {
                    const res = await bridgePost('/fetch_training_plan_jys', { yxid });
                    return mockResponse(unwrapBridge(res));
                }
                const jys = await invoke('fetch_training_plan_jys', { yxid });
                return mockResponse(jys);
            } catch (err) {
                console.error('[Axios Adapter] Training plan JYS error:', err);
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/training_plan') && !url.includes('/options') && !url.includes('/jys')) {
            try {
                console.log('[Axios Adapter] Training plan courses request:', JSON.stringify(data));
                if (!hasTauri) {
                    const res = await bridgePost('/fetch_training_plan_courses', {
                        grade: data.grade || null,
                        kkxq: data.kkxq || null,
                        kkyx: data.kkyx || null,
                        kkjys: data.kkjys || null,
                        kcxz: data.kcxz || null,
                        kcgs: data.kcgs || null,
                        kcbh: data.kcbh || null,
                        kcmc: data.kcmc || null,
                        page: data.page ? Number.parseInt(String(data.page), 10) : 1,
                        page_size: data.page_size ? Number.parseInt(String(data.page_size), 10) : 50,
                    });
                    return mockResponse(unwrapBridge(res));
                }
                const courses = await invoke('fetch_training_plan_courses', {
                    grade: data.grade || null,
                    kkxq: data.kkxq || null,
                    kkyx: data.kkyx || null,
                    kkjys: data.kkjys || null,
                    kcxz: data.kcxz || null,
                    kcgs: data.kcgs || null,
                    kcbh: data.kcbh || null,
                    kcmc: data.kcmc || null,
                    page: data.page ? Number.parseInt(String(data.page), 10) : 1,
                    page_size: data.page_size ? Number.parseInt(String(data.page_size), 10) : 50,
                });
                console.log('[Axios Adapter] Training plan courses response:', JSON.stringify(courses));
                return mockResponse(courses);
            } catch (err) {
                console.error('[Axios Adapter] Training plan courses error:', err);
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/library/dict')) {
            try {
                if (!hasTauri) {
                    const res = await bridgePost('/library/dict', {});
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('fetch_library_dict');
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/library/search')) {
            try {
                if (!hasTauri) {
                    const res = await bridgePost('/library/search', { params: data || {} });
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('search_library_books', { params: data || {} });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/library/detail')) {
            try {
                const payloadData = data || {};
                if (!hasTauri) {
                    const res = await bridgePost('/library/detail', {
                        title: payloadData.title || '',
                        isbn: payloadData.isbn || '',
                        record_id: payloadData.record_id ?? payloadData.recordId ?? null
                    });
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('fetch_library_book_detail', {
                    title: payloadData.title || '',
                    isbn: payloadData.isbn || '',
                    recordId: payloadData.record_id ?? payloadData.recordId ?? null
                });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/qxzkb/jcinfo')) {
            try {
                const { xnxq } = data;
                if (!hasTauri) {
                    const res = await bridgePost('/qxzkb/jcinfo', { xnxq });
                    return mockResponse(unwrapBridge(res));
                }
                const info = await invoke('fetch_qxzkb_jcinfo', { xnxq });
                return mockResponse(info);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/qxzkb/zyxx')) {
            try {
                const { yxid, nj } = data;
                if (!hasTauri) {
                    const res = await bridgePost('/qxzkb/zyxx', { yxid, nj });
                    return mockResponse(unwrapBridge(res));
                }
                const info = await invoke('fetch_qxzkb_zyxx', { yxid, nj });
                return mockResponse(info);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/qxzkb/kkjys')) {
            try {
                const { kkyxid } = data;
                if (!hasTauri) {
                    const res = await bridgePost('/qxzkb/kkjys', { kkyxid });
                    return mockResponse(unwrapBridge(res));
                }
                const info = await invoke('fetch_qxzkb_kkjys', { kkyxid });
                return mockResponse(info);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/qxzkb/query')) {
            try {
                const queryPayload = { ...data };
                if (!hasTauri) {
                    const res = await bridgePost('/qxzkb/query', queryPayload);
                    return mockResponse(unwrapBridge(res));
                }
                const result = await invoke('fetch_qxzkb_list', { query: queryPayload });
                return mockResponse(result);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/course_selection/overview')) {
            try {
                if (!hasTauri) {
                    const res = await bridgePost('/course_selection/overview', {});
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('fetch_course_selection_overview');
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/course_selection/list')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/course_selection/list', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('fetch_course_selection_list', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/course_selection/end_time')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/course_selection/end_time', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('fetch_course_selection_end_time', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/course_selection/child_classes')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/course_selection/child_classes', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('fetch_course_selection_child_classes', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/course_selection/selected_courses')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/course_selection/selected_courses', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('fetch_course_selection_selected_courses', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/course_selection/select')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/course_selection/select', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('select_course_selection_course', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/course_selection/withdraw')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/course_selection/withdraw', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('withdraw_course_selection_course', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/course_selection/detail_intro')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/course_selection/detail_intro', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('fetch_course_selection_detail_intro', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/course_selection/detail_teacher')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/course_selection/detail_teacher', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('fetch_course_selection_detail_teacher', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/online_learning/overview')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/overview', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('online_learning_overview', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/online_learning/sync_now')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/sync_now', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('online_learning_sync_now', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/online_learning/sync_runs')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/sync_runs', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('online_learning_list_sync_runs', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/online_learning/clear_cache')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/clear_cache', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('online_learning_clear_cache', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/chaoxing/session_status')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/chaoxing/session_status', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('chaoxing_get_session_status', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/chaoxing/courses')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/chaoxing/courses', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('chaoxing_fetch_courses', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/chaoxing/course_outline')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/chaoxing/course_outline', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('chaoxing_fetch_course_outline', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (
            url.includes('/v2/chaoxing/course_score') ||
            url.includes('chaoxing/course_score')
        ) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/chaoxing/course_score', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('chaoxing_fetch_course_score', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/chaoxing/course_progress')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/chaoxing/course_progress', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('chaoxing_fetch_course_progress', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/chaoxing/launch_url')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/chaoxing/launch_url', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('chaoxing_get_launch_url', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/yuketang/qr_login/create')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/yuketang/qr_login/create', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('yuketang_create_qr_login', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/yuketang/qr_login/poll')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/yuketang/qr_login/poll', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('yuketang_poll_qr_login', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/yuketang/courses')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/yuketang/courses', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('yuketang_fetch_courses', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/yuketang/course_outline')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/yuketang/course_outline', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('yuketang_fetch_course_outline', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/yuketang/course_progress')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/yuketang/course_progress', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('yuketang_fetch_course_progress', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/chaoxing/knowledge_cards')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/chaoxing/knowledge_cards', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('chaoxing_get_knowledge_cards', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/chaoxing/video_status')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/chaoxing/video_status', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('chaoxing_get_video_status', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/chaoxing/course_score')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/chaoxing/course_score', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('chaoxing_fetch_course_score', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/chaoxing/report_progress')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/chaoxing/report_progress', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('chaoxing_report_progress', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/yuketang/course_chapters')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/yuketang/course_chapters', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('yuketang_get_course_chapters', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/yuketang/leaf_info')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/yuketang/leaf_info', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('yuketang_get_leaf_info', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/yuketang/heartbeat')) {
            try {
                const payloadData = { ...(data || {}) };
                if (!hasTauri) {
                    const res = await bridgePost('/online_learning/yuketang/heartbeat', payloadData);
                    return mockResponse(unwrapBridge(res));
                }
                const payload = await invoke('yuketang_send_heartbeat', { req: payloadData });
                return mockResponse(payload);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/electricity/balance')) {
            const { area_id, building_id, layer_id, room_id } = data;
            const accountPayload = {
                "utilityType": "electric",
                "bigArea": "",
                "area": area_id,
                "building": building_id,
                "unit": "",
                "level": layer_id,
                "room": room_id,
                "subArea": ""
            };
            try {
                let res: JsonObject = {};
                if (!hasTauri) {
                    const bridge = await bridgePost('/electricity_query_account', { payload: accountPayload });
                    res = asRecord(unwrapBridge(bridge));
                } else {
                    res = await invoke<JsonObject>('electricity_query_account', { payload: accountPayload });
                }
                if (!res.success) {
                    return mockResponse({ success: false, error: res.message || res.error || '电费查询失败' });
                }
                const resultData = asRecord(res.resultData);
                const templateList = Array.isArray(resultData.templateList) ? resultData.templateList : [];
                let balance = "0.00";
                let quantity = "0.00";
                templateList.forEach((rawItem: unknown) => {
                    const item = asRecord(rawItem);
                    if (item.code === 'balance') balance = String(item.value ?? '0.00');
                    if (item.code === 'quantity') quantity = String(item.value ?? '0.00');
                });
                const offline = !!res.offline;
                const syncTime = res.sync_time || resultData.sync_time;
                return mockResponse({
                    success: true,
                    balance,
                    quantity,
                    status: resultData.utilityStatusName || "未知",
                    offline,
                    sync_time: syncTime || (offline ? '' : new Date().toISOString())
                });
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        const campusCodeResponse = await handleCampusCodePost(url, data);
        if (campusCodeResponse) return campusCodeResponse;
        if (url.includes('/v2/calendar')) {
            try {
                const { semester } = data;
                if (!hasTauri) {
                    const res = await bridgePost('/fetch_calendar_data', { semester: semester || null });
                    return mockResponse(unwrapBridge(res));
                }
                const calendar = await invoke('fetch_calendar_data', { 
                    semester: semester || null 
                });
                return mockResponse(calendar);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        if (url.includes('/v2/academic_progress')) {
            try {
                const { fasz } = data;
                if (!hasTauri) {
                    const res = await bridgePost('/fetch_academic_progress', { fasz: fasz || 1 });
                    return mockResponse(unwrapBridge(res));
                }
                const progress = await invoke('fetch_academic_progress', { 
                    fasz: fasz || 1 
                });
                return mockResponse(progress);
            } catch (err) {
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        console.warn('[Axios Adapter] Unknown POST endpoint:', url);
        return mockResponse({ success: false, error: 'Unknown POST endpoint: ' + url });
    } catch (e) {
        console.error('[Axios Adapter] POST Error:', e);
        throw mockError(errorMessage(e));
    }
}
