import { isTestAccountSession } from '../test_account.js';
import { resolveTestAccountHttpResponse } from '../test_account_fixtures.js';
import {
  asRecord,
  bridgeGet,
  bridgePost,
  errorMessage,
  hasTauri,
  invoke,
  mockError,
  mockResponse,
  unwrapBridge,
  type JsonObject
} from './bridge';

export const get = async (url: string, config: JsonObject = {}) => {
    console.log('[Axios Adapter] GET request received:', url);
    console.log('[Axios Adapter] Full URL:', url);
    try {
        if (isTestAccountSession()) {
            const testAccountResponse = resolveTestAccountHttpResponse('get', url, config);
            if (testAccountResponse) return mockResponse(testAccountResponse);
            return mockResponse({
                success: false,
                demo_disabled: true,
                error: '未知测试账号 HTTP 请求已拦截'
            });
        }
        if (url.includes('/v3/login_params')) {
            const data = asRecord(await invoke('get_login_page'));
            // 适配前端期望的格?
            return mockResponse({
                success: true,
                lt: data.lt,
                execution: data.execution,
                salt: data.salt,
                captcha_required: data.captcha_required,
                // 必须包含 inputs 字段，即使为空对象，避免前端空判断报错
                inputs: {}
            });
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
                return mockResponse({ success: false, error: errorMessage(err) });
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
                return mockResponse({ success: false, error: errorMessage(err) });
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
                return mockResponse({ success: false, error: errorMessage(err) });
            }
        }
        
        return mockResponse({ success: false, error: 'Unknown GET endpoint: ' + url });
    } catch (e) {
        console.error('[Axios Adapter] GET Error:', e);
        throw mockError(errorMessage(e));
    }
}
