import { invoke } from '@tauri-apps/api/core';

// 模拟 Axios 响应结构
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
                // 适配前端期望的格式
                return mockResponse({
                    success: true,
                    lt: data.lt,
                    execution: data.execution,
                    salt: data.salt,
                    captcha_required: data.captcha_required,
                    // 必须包含 inputs 即使为空，前端可能依赖
                    inputs: {}
                });
            }
            if (url.includes('/dormitory_data.json')) {
                // 这是一个静态文件请求，应该让它通过? 
                // 或者我们在 Rust 端提供？或者直接 import json?
                // 如果是 public 目录下的文件，fetch 可以直接请求。
                // 但 axios adapter 会拦截所有 axios 请求。
                // 我们可以使用原生 fetch 来请求静态资源
                const res = await fetch(url);
                const data = await res.json();
                return mockResponse(data);
            }
            
            // 学期列表
            if (url.includes('/v2/semesters')) {
                try {
                    const semesters = await invoke('fetch_semesters');
                    return mockResponse(semesters);
                } catch (err) {
                    return mockResponse({ success: false, error: err.toString() });
                }
            }
            
            // 教学楼列表
            if (url.includes('/v2/classroom/buildings')) {
                try {
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
                    // 加密密码 (Rust 端 login expects PLAIN password maybe? 
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
                    
                    // 安全检查：密码长度不应超过50（正常密码），移除这个检查让 Rust 后端处理
                    // 因为这个检查可能误判
                    
                    const res = await invoke('login', {
                        username,
                        password,
                        captcha: captcha || '', // 传递空字符串而不是 null
                        lt: lt || '',
                        execution: execution || ''
                    });
                    return mockResponse({ success: true, data: res });

                } catch (err) {
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            // 验证码刷新
            if (url.includes('/v3/refresh_captcha')) {
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
                const grades = await invoke('sync_grades');
                return mockResponse({ success: true, data: grades });
            }

            // 课表
            if (url.includes('/v2/schedule/query')) {
                const schedule = await invoke('sync_schedule');
                return mockResponse({ success: true, ...schedule });
            }

            // ========== 考试相关 ==========
            if (url.includes('/v2/exams')) {
                try {
                    const exams = await invoke('fetch_exams', { semester: data.semester || null });
                    // 转换字段名以匹配前端期望格式
                    const transformedExams = exams.map(exam => ({
                        ...exam,
                        exam_date: exam.date || exam.exam_date || '',
                        exam_time: exam.start_time && exam.end_time 
                            ? `${exam.start_time}-${exam.end_time}` 
                            : (exam.start_time || exam.exam_time || ''),
                        seat_no: exam.seat_number || exam.seat_no || ''
                    }));
                    return mockResponse({ success: true, data: transformedExams });
                } catch (err) {
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            // ========== 排名相关 ==========
            if (url.includes('/v2/ranking')) {
                try {
                    const { student_id, semester } = data;
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
                    const info = await invoke('fetch_student_info');
                    return mockResponse(info);
                } catch (err) {
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            // ========== 空教室 ==========
            if (url.includes('/v2/classroom/query')) {
                try {
                    console.log('[Axios Adapter] Classroom query with data:', data);
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
                    // 前端可能传 kkyx 或 yxid，都支持
                    const yxid = data.yxid || data.kkyx || '';
                    console.log('[Axios Adapter] Training plan JYS request for yxid:', yxid);
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
                    // Rust 端期望 Option<String>，所以空字符串和 null 都可以
                    // 但为了保持一致性，我们使用 null 表示"未选择"
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
                    const res = await invoke('electricity_query_account', { payload: accountPayload });

                    if (!res.success) {
                        return mockResponse({ success: false, error: res.message });
                    }

                    const resultData = res.resultData || {};
                    const templateList = resultData.templateList || [];
                    let balance = "0.00";
                    let quantity = "0.00";

                    templateList.forEach(item => {
                        if (item.code === 'balance') balance = item.value;
                        if (item.code === 'quantity') quantity = item.value;
                    });

                    return mockResponse({
                        success: true,
                        balance,
                        quantity,
                        status: resultData.utilityStatusName || "未知",
                        sync_time: new Date().toISOString()
                    });
                } catch (err) {
                    return mockResponse({ success: false, error: err.toString() });
                }
            }

            // ========== 校历相关 ==========
            if (url.includes('/v2/calendar')) {
                try {
                    const { semester } = data;
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

// 创建一个模拟 axios 的对象，让组件可以直接使用
const axiosInstance = {
    get: adapter.get,
    post: adapter.post,
    // 支持 axios.create() 返回自身
    create: () => axiosInstance,
    // 支持拦截器（空实现）
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
