import {
    asRecord,
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

/**
 * #1114：桥路径失败时必须保留完整结构 { success:false, error:{kind,message} }。
 * 旧实现一律 unwrapBridge(res) 只取 data —— 失败时 data 为 null，error.kind 被丢弃，
 * 前端无法区分「登录失效」与「上游暂不可用」。成功路径保持原样（取 data）。
 */
const bridgeResult = (res: JsonObject): unknown => {
    if (res.success === false || (res.error !== undefined && res.error !== null)) {
        return res;
    }
    return unwrapBridge(res);
};

/**
 * #1114：Tauri 命令错误归一化。A1 会把命令错误改成可序列化的 {kind,message} 对象；
 * 对象错误保留 kind（供前端 classify 判定是否自动退避），字符串错误保持旧形态兼容。
 */
const invokeErrorPayload = (err: unknown): { success: false; error: { kind: string; message: string } | string } => {
    if (err !== null && typeof err === 'object') {
        const record = asRecord(err) as { kind?: unknown };
        const kind = typeof record.kind === 'string' ? record.kind.trim() : '';
        if (kind) {
            return { success: false, error: { kind, message: errorMessage(err) } };
        }
    }
    return { success: false, error: errorMessage(err) };
};

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
                return mockResponse(bridgeResult(res));
            }
            const res = await invoke('campus_code_fetch_config', { payload });
            return mockResponse(res);
        } catch (err) {
            return mockResponse(invokeErrorPayload(err));
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
                return mockResponse(bridgeResult(res));
            }
            const res = await invoke('campus_code_fetch_qrcode', { payload });
            return mockResponse(res);
        } catch (err) {
            return mockResponse(invokeErrorPayload(err));
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
                return mockResponse(bridgeResult(res));
            }
            const res = await invoke('campus_code_fetch_order_status', { payload });
            return mockResponse(res);
        } catch (err) {
            return mockResponse(invokeErrorPayload(err));
        }
    }

    return null;
};
