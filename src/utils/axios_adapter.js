import { invoke, isTauri } from '@tauri-apps/api/core';

const detectTauri = () => {
    try {
        if (typeof isTauri === 'function' && isTauri()) {
            return true;
        }
    } catch (e) {
        // ignore
    }
    if (typeof window === 'undefined') return false;
    if (window.__TAURI__ || window.__TAURI_INTERNALS__) return true;
    const protocol = window.location?.protocol || '';
    if (protocol === 'tauri:') return true;
    const host = window.location?.hostname || '';
    if (host === 'tauri.localhost') return true;
    return false;
};

const hasTauri = detectTauri();
const LOCAL_BRIDGE = 'http://127.0.0.1:4399';
const BRIDGE_BASE = hasTauri ? LOCAL_BRIDGE : '/bridge';

const looksLikeJson = (contentType, text) => {
    if (contentType.includes('application/json')) return true;
    const trimmed = (text || '').trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
};

const looksLikeHtml = (contentType, text) => {
    if (contentType.includes('text/html')) return true;
    const trimmed = (text || '').trim().toLowerCase();
    return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
};

const parseJsonSafely = (text) => {
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
};

const fetchBridgeJson = async (url, options = {}, fallbackUrl = null) => {
    try {
        const res = await fetch(url, options);
        const contentType = res.headers.get('content-type') || '';
        const text = await res.text();
        if (looksLikeJson(contentType, text)) {
            const parsed = parseJsonSafely(text);
            if (parsed !== null) return parsed;
        }
        if (fallbackUrl && looksLikeHtml(contentType, text)) {
            return fetchBridgeJson(fallbackUrl, options, null);
        }
        return { success: false, error: `非JSON响应: ${text.slice(0, 200)}` };
    } catch (err) {
        if (fallbackUrl) {
            return fetchBridgeJson(fallbackUrl, options, null);
        }
        return { success: false, error: `请求失败: ${err?.message || err}` };
    }
};

const bridgePost = async (path, payload = {}) => {
    const url = `${BRIDGE_BASE}${path}`;
    const fallbackUrl = hasTauri ? null : `${LOCAL_BRIDGE}${path}`;
    return fetchBridgeJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
    }, fallbackUrl);
};

const bridgeGet = async (path) => {
    const url = `${BRIDGE_BASE}${path}`;
    const fallbackUrl = hasTauri ? null : `${LOCAL_BRIDGE}${path}`;
    return fetchBridgeJson(url, { method: 'GET' }, fallbackUrl);
};

const unwrapBridge = (payload) => {
    if (payload && typeof payload === 'object' && 'data' in payload) {
        return payload.data;
    }
    return payload;
};

// 妯℃嫙 Axios 响应结构

const mockResponse = (data) => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {}
});

const mockError = (message) => ({
    response: {
        data: { error: message, success: false },
        status: 500,
        statusText: 'Internal Server Error'
    },
    message
});

const adapter = {
    get: async (url, config = {}) => {
        console.log('[Axios Adapter] GET request received:', url);
        console.log('[Axios Adapter] Full URL:', url);
        try {
            if (url.includes('/v3/login_params')) {
                const data = await invoke('get_login_page');
                // 适配前端期望的格?
                return mockResponse({
                    success: true,
                    lt: data.lt,
                    execution: data.execution,
                    salt: data.salt,
                    captcha_required: data.captcha_required,
                    // 必须包含 inputs 即使为┖，前端可能依?                    inputs: {}
                });
            }
            if (url.includes('/dormitory_data.json')) {
                // 这是€个静态文件请求，应该╁通过? 
                // 或€我们在 Rust 端提供？或€直?import json?
                // 如果?public 目录下的文件，fetch 可以直接请求?                // 浣?axios adapter 会拦截所?axios 请求?                // 我们可以使用原生 fetch 鏉ヨ求静态资?
                const res = await fetch(url);
                const data = await res.json();
                return mockResponse(data);
            }
            
            // 瀛︽列表

            if (url.includes('/v2/semesters')) {
                try {
                    if (!hasTauri) {
                        const res = await bridgePost('/fetch_semesters');
                        return mockResponse(unwrapBridge(res));
                    }
                    const semesters = await invoke('fetch_semesters');
                    return mockResponse(semesters);
                } catch (err) {
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            // 全校课表 - 选项
            if (url.includes('/v2/qxzkb/options')) {
                try {
                    if (!hasTauri) {
                        const payload = await bridgeGet('/qxzkb/options');
                        return mockResponse(unwrapBridge(payload));
                    }
                    const options = await invoke('fetch_qxzkb_options');
                    return mockResponse(options);
                } catch (err) {
                    return mockResponse({ success: false, error: err.toString() });
                }
            }
            
            // 教学楼列?
            if (url.includes('/v2/classroom/buildings')) {
                try {
                    if (!hasTauri) {
                        const res = await bridgePost('/fetch_classroom_buildings');
                        return mockResponse(unwrapBridge(res));
                    }
                    const buildings = await invoke('fetch_classroom_buildings');
                    console.log('[Axios Adapter] Buildings response:', JSON.stringify(buildings));
                    return mockResponse(buildings);
                } catch (err) {
                    console.error('[Axios Adapter] Buildings error:', err);
                    return mockResponse({ success: false, error: err.toString() });
                }
            }
            
            return mockResponse({ success: false, error: 'Unknown GET endpoint: ' + url });
        } catch (e) {
            console.error('[Axios Adapter] GET Error:', e);
            throw mockError(e.toString());
        }
    },
    post: async (url, data = {}, config = {}) => {
        console.log('[Axios Adapter] POST request received:', url);
        console.log('[Axios Adapter] POST data:', JSON.stringify(data));
        try {
            // 登录

            if (url.includes('/v2/start_login')) {
                // LoginV3 (modified) passes plain structure
                console.log('[Axios Adapter] Login data received:', JSON.stringify(data));
                const { username, password, captcha, lt, execution } = data;
                console.log('[Axios Adapter] Extracted captcha:', captcha);

                try {
                    // 加密密码 (Rust 绔?login expects PLAIN password maybe? 
                    // Wait, HbutClient::login sends password to form. 
                    // If HBU requires AES encrypted password, HbutClient does NOT implement it yet?
                    // Checked http_client.rs: it puts password into form directly.
                    // Checked fast_auth.py: it ENCRYPTS password.
                    // Checked utils/crypto.ts: it has encryptPassword.
                    // Rust side `http_client.rs` logic:
                    // It copies `last_login_inputs`. 
                    // It assumes `password` passed to it is ready to send?
                    // Or does `http_client.rs`'s `login` do encryption?
                    // Step 974 `http_client.rs`: 
                    // `form_data.insert(password_key.clone(), password.to_string());`
                    // It does NOT encrypt.
                    // So we must encrypt on Frontend (JS) before sending to Rust?
                    // OR we port encryption to Rust.
                    // The user wants migration.
                    // Rust `http_client.rs` was ported from `fast_auth.py`. 
                    // `fast_auth.py` DOES encrypt. 
                    // `http_client.rs` seems detailed enough to match logic. 
                    // Let's re-read `http_client.rs` lines 156-165.
                    // It just inserts `password`.
                    // SO: Rust login expects the FINAL password string (encrypted if necessary).
                    // But `fast_auth.py` logic says: `data['password'] = encrypt_password_aes(...)`.
                    // So encryption MUST happen.
                    // Option A: Encrypt in Rust (need AES lib).
                    // Option B: Encrypt in JS (adapter or component) and pass encrypted string to Rust.
                    // Given `crypto.ts` exists in `tauri-app/src/utils/crypto.ts`,
                    // I should use `crypto.ts` in the adapter (or LoginV3) to encrypt, then pass to Rust.
                    // `LoginV3` has `loginSalt`.

                    // Let's assume LoginV3 performs the HBU-specific encryption using `crypto.ts` (if I fix imports)
                    // and passes the encrypted password to `start_login` adapter.
                    // Wait, `LoginV3` uses `utils/encryption.js` (RSA for backend transmission).
                    // I need to change `LoginV3` to use `utils/crypto.ts` (AES for HBU CAS).
                    // Or just do it in the adapter.

                    // Let's do it in `LoginV3` modified.

                    console.log('[Axios Adapter] Login request:');
                    console.log('  - username:', username);
                    console.log('  - password length:', password?.length);
                    console.log('  - password first 20 chars:', password?.substring(0, 20));
                    console.log('  - captcha:', captcha, '(length:', captcha?.length || 0, ')');
                    
                    // ????????????? 50??????????????? Rust ??
                    // ??????????????????
                    if (!hasTauri) {
                        const res = await bridgePost('/login', {
                            username,
                            password,
                            captcha: captcha || '',
                            lt: lt || '',
                            execution: execution || ''
                        });
                        if (res?.success) {
                            return mockResponse({ success: true, data: res.data });
                        }
                        return mockResponse({ success: false, error: res?.error?.message || res?.error || '登录失败' });
                    }
                    const res = await invoke('login', {
                        username,
                        password,
                        captcha: captcha || '', // 传€掔┖字符串€不?null
                        lt: lt || '',
                        execution: execution || ''
                    });
                    return mockResponse({ success: true, data: res });

                } catch (err) {
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            // 楠岃瘉鐮佸埛鏂?
            if (url.includes('/v3/refresh_captcha')) {
                if (!hasTauri) {
                    return mockResponse({ success: false, error: '浏览器模式不支持验证码接口' });
                }
                const imgBase64 = await invoke('get_captcha');
                // Tauri command returns "data:image/png;base64,..."
                // Frontend expects plain base64 usually? 
                // LoginV3: `captchaImg.value = data:image/jpeg;base64,${data.captcha_base64}`
                // My Rust: returns full data URI.
                // Adapter needs to strip prefix?

                const parts = imgBase64.split(',');
                const base64 = parts.length > 1 ? parts[1] : parts[0];
                return mockResponse({
                    success: true,
                    captcha_base64: base64,
                    jsessionid: 'ignored', // Cookie jar handles this
                });
            }

            // 成绩

            if (url.includes('/v2/quick_fetch')) {
                if (!hasTauri) {
                    const res = await bridgePost('/sync_grades');
                    if (res?.success) {
                        return mockResponse(unwrapBridge(res));
                    }
                    return mockResponse({ success: false, error: res?.error?.message || res?.error || '获取成绩失败' });
                }
                const grades = await invoke('sync_grades');
                return mockResponse(grades);
            }

            // 课表

            if (url.includes('/v2/schedule/query')) {
                if (!hasTauri) {
                    const res = await bridgePost('/sync_schedule');
                    if (res?.success && res?.data) {
                        return mockResponse({ success: true, ...res.data });
                    }
                    return mockResponse({ success: false, error: res?.error?.message || res?.error || '获取课表失败' });
                }
                const schedule = await invoke('sync_schedule');
                return mockResponse({ success: true, ...schedule });
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
                    return mockResponse({ success: false, error: res?.error?.message || res?.error || '导出日历失败' });
                } catch (err) {
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            // ========== 考试相关 ==========

            if (url.includes('/v2/exams')) {
                try {
                    const { semester } = data;
                    let payload = null;
                    if (!hasTauri) {
                        const res = await bridgePost('/fetch_exams', { semester: semester || null });
                        if (!res?.success) {
                            return mockResponse({ success: false, error: res?.error?.message || res?.error || '获取考试失败' });
                        }
                        payload = unwrapBridge(res);
                    } else {
                        payload = await invoke('fetch_exams', { semester: semester || null });
                    }

                    const base = payload && !Array.isArray(payload) && typeof payload === 'object' ? payload : {};
                    const isSuccess = payload ? payload.success !== false : false;
                    if (isSuccess) {
                        const rawList = Array.isArray(payload) ? payload : (payload.data || []);
                        const transformedExams = rawList.map(exam => ({
                            ...exam,
                            exam_date: exam.date || exam.exam_date || '',
                            exam_time: exam.start_time && exam.end_time
                                ? `${exam.start_time}-${exam.end_time}`
                                : (exam.start_time || exam.exam_time || ''),
                            seat_no: exam.seat_number || exam.seat_no || ''
                        }));
                        return mockResponse({ ...base, success: true, data: transformedExams });
                    }

                    return mockResponse(base || { success: false, error: '获取考试失败' });
                } catch (err) {
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            // ========== 排名相关 ==========
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
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            // ========== 学生信息 ==========

            if (url.includes('/v2/student_info')) {
                try {
                    if (!hasTauri) {
                        const res = await bridgePost('/fetch_student_info');
                        return mockResponse(unwrapBridge(res));
                    }
                    const info = await invoke('fetch_student_info');
                    return mockResponse(info);
                } catch (err) {
                    return mockResponse({ success: false, error: err.toString() });
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
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            // ========== 绌烘暀瀹?==========

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
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            // ========== 培养方案 ==========

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
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            if (url.includes('/v2/training_plan/jys')) {
                try {
                    // 前端可能?kkyx 鎴?yxid，都支持

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
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            if (url.includes('/v2/training_plan') && !url.includes('/options') && !url.includes('/jys')) {
                try {
                    console.log('[Axios Adapter] Training plan courses request:', JSON.stringify(data));
                    // Rust 端期?Option<String>，所ョ┖字符 null 都可?                    // 但为了保持一致€э我们使用 null 琛ㄧず"未€夋嫨"

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
                            page: data.page ? parseInt(data.page) : 1,
                            page_size: data.page_size ? parseInt(data.page_size) : 50,
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
                        page: data.page ? parseInt(data.page) : 1,
                        page_size: data.page_size ? parseInt(data.page_size) : 50,
                    });
                    console.log('[Axios Adapter] Training plan courses response:', JSON.stringify(courses));
                    return mockResponse(courses);
                } catch (err) {
                    console.error('[Axios Adapter] Training plan courses error:', err);
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            // ========== 图书查询 ==========
            if (url.includes('/v2/library/dict')) {
                try {
                    if (!hasTauri) {
                        const res = await bridgePost('/library/dict', {});
                        return mockResponse(unwrapBridge(res));
                    }
                    const payload = await invoke('fetch_library_dict');
                    return mockResponse(payload);
                } catch (err) {
                    return mockResponse({ success: false, error: err.toString() });
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
                    return mockResponse({ success: false, error: err.toString() });
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
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            // ========== 全校课表 ==========

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
                    return mockResponse({ success: false, error: err.toString() });
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
                    return mockResponse({ success: false, error: err.toString() });
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
                    return mockResponse({ success: false, error: err.toString() });
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
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            // ========== 电费相关 ==========

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
                    let res = null;
                    if (!hasTauri) {
                        const bridge = await bridgePost('/electricity_query_account', { payload: accountPayload });
                        res = unwrapBridge(bridge);
                    } else {
                        res = await invoke('electricity_query_account', { payload: accountPayload });
                    }

                    if (!res.success) {
                        return mockResponse({ success: false, error: res.message || res.error || '电费查询失败' });
                    }

                    const resultData = res.resultData || {};
                    const templateList = resultData.templateList || [];
                    let balance = "0.00";
                    let quantity = "0.00";

                    templateList.forEach(item => {
                        if (item.code === 'balance') balance = item.value;
                        if (item.code === 'quantity') quantity = item.value;
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
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            // ========== 校历相关 ==========

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
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            // ========== 学业完成情况 ==========

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
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            console.warn('[Axios Adapter] Unknown POST endpoint:', url);
            return mockResponse({ success: false, error: 'Unknown POST endpoint: ' + url });
        } catch (e) {
            console.error('[Axios Adapter] POST Error:', e);
            throw mockError(e.toString());
        }
    }
};

// 创建€个ā鎷?axios 的对★紝璁╃件可ョ洿鎺ヤ娇鐢?
const axiosInstance = {
    get: adapter.get,
    post: adapter.post,
    // 支持 axios.create() 返回自身
    create: () => axiosInstance,
    // 支持︽器（空实现）
    interceptors: {
        request: { use: () => {}, eject: () => {} },
        response: { use: () => {}, eject: () => {} }
    },
    defaults: {
        headers: {
            common: {},
            get: {},
            post: {}
        }
    }
};

export default axiosInstance;


