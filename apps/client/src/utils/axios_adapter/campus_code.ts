import {
    bridgePost,
    errorMessage,
    hasTauri,
    invoke,
    mockResponse,
    unwrapBridge,
    type JsonObject,
    type MockResponse
} from './bridge';

/**
 * 处理校园码相关 POST 路由，避免所有业务路由堆积在单一 Axios 适配器中。
 */
export const handleCampusCodePost = async (
    url: string,
    data: JsonObject
): Promise<MockResponse<unknown> | null> => {
    if (url.includes('/v2/campus_code/config')) {
        const payload = {
            devCode: data?.dev_code || data?.devCode || ''
        };
        try {
            if (!hasTauri) {
                const res = await bridgePost('/campus_code/config', { payload });
                return mockResponse(unwrapBridge(res));
            }
            const res = await invoke('campus_code_fetch_config', { payload });
            return mockResponse(res);
        } catch (err) {
            return mockResponse({ success: false, error: errorMessage(err) });
        }
    }

    if (url.includes('/v2/campus_code/qrcode')) {
        const payload = {
            mode: data?.mode || 'online',
            devCode: data?.dev_code || data?.devCode || '',
            qrcodeType: data?.qrcode_type || data?.qrcodeType || ''
        };
        try {
            if (!hasTauri) {
                const res = await bridgePost('/campus_code/qrcode', { payload });
                return mockResponse(unwrapBridge(res));
            }
            const res = await invoke('campus_code_fetch_qrcode', { payload });
            return mockResponse(res);
        } catch (err) {
            return mockResponse({ success: false, error: errorMessage(err) });
        }
    }

    if (url.includes('/v2/campus_code/order_status')) {
        const payload = {
            qrcode: data?.qrcode || '',
            offline: !!data?.offline
        };
        try {
            if (!hasTauri) {
                const res = await bridgePost('/campus_code/order_status', { payload });
                return mockResponse(unwrapBridge(res));
            }
            const res = await invoke('campus_code_fetch_order_status', { payload });
            return mockResponse(res);
        } catch (err) {
            return mockResponse({ success: false, error: errorMessage(err) });
        }
    }

    return null;
};
