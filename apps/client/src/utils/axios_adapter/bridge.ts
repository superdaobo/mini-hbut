import { invokeNative, isTauriRuntime } from '../../platform/native';

export type JsonObject = Record<string, unknown>

export interface MockResponse<T> {
    data: T;
    status: number;
    statusText: string;
    headers: JsonObject;
    config: JsonObject;
}

export const asRecord = (value: unknown): JsonObject =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as JsonObject
        : {};

export const errorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    // 后端常以 { kind, message } / { error } 对象返回错误；直接 String(obj) 会变成
    // "[object Object]"，这里优先取出可读字段，避免把对象序列化结果展示给用户。
    if (error !== null && typeof error === 'object') {
        const record = error as { message?: unknown; error?: unknown; kind?: unknown };
        const candidate = [record.message, record.error, record.kind]
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .map((item) => item.trim())
            .find((item) => item.length > 0);
        if (candidate) return candidate;
    }
    return String(error ?? '');
};

export const invoke = <T = JsonObject>(command: string, args?: JsonObject): Promise<T> =>
    invokeNative<T>(command, args);

export const hasTauri = isTauriRuntime();
export const LOCAL_BRIDGE = 'http://127.0.0.1:4399';
export const BRIDGE_BASE = hasTauri ? LOCAL_BRIDGE : '/bridge';

export const looksLikeJson = (contentType: string, text: string): boolean => {
    if (contentType.includes('application/json')) return true;
    const trimmed = (text || '').trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
};

export const looksLikeHtml = (contentType: string, text: string): boolean => {
    if (contentType.includes('text/html')) return true;
    const trimmed = (text || '').trim().toLowerCase();
    return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
};

export const parseJsonSafely = (text: string): unknown => {
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
};

const DEFAULT_BRIDGE_TIMEOUT_MS = 12000;

export const fetchBridgeJson = async (url: string, options: RequestInit = {}, fallbackUrl: string | null = null, timeoutMs: number = DEFAULT_BRIDGE_TIMEOUT_MS): Promise<unknown> => {
    // 请求带超时：本地 bridge/上游挂起时给用户明确提示，而不是无限等待
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const res = await fetch(url, controller ? { ...options, signal: controller.signal } : options);
        const contentType = res.headers.get('content-type') || '';
        const text = await res.text();
        if (looksLikeJson(contentType, text)) {
            const parsed = parseJsonSafely(text);
            if (parsed !== null) return parsed;
        }
        if (fallbackUrl && looksLikeHtml(contentType, text)) {
            return fetchBridgeJson(fallbackUrl, options, null, timeoutMs);
        }
        return { success: false, error: `非JSON响应: ${text.slice(0, 200)}` };
    } catch (err) {
        if (controller?.signal.aborted) {
            return { success: false, error: '请求超时，请检查网络后重试' };
        }
        if (fallbackUrl) {
            return fetchBridgeJson(fallbackUrl, options, null, timeoutMs);
        }
        return { success: false, error: `请求失败: ${errorMessage(err)}` };
    } finally {
        if (timer !== null) clearTimeout(timer);
    }
};

export const bridgePost = async (path: string, payload: unknown = {}): Promise<JsonObject> => {
    const url = `${BRIDGE_BASE}${path}`;
    const fallbackUrl = hasTauri ? null : `${LOCAL_BRIDGE}${path}`;
    return asRecord(await fetchBridgeJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
    }, fallbackUrl));
};

export const bridgeGet = async (path: string): Promise<JsonObject> => {
    const url = `${BRIDGE_BASE}${path}`;
    const fallbackUrl = hasTauri ? null : `${LOCAL_BRIDGE}${path}`;
    return asRecord(await fetchBridgeJson(url, { method: 'GET' }, fallbackUrl));
};

export const unwrapBridge = (payload: unknown): unknown => {
    if (payload && typeof payload === 'object' && 'data' in payload) {
        return (payload as JsonObject).data;
    }
    return payload;
};

// 妯℃嫙 Axios 响应结构

export const mockResponse = <T>(data: T): MockResponse<T> => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {}
});

export const mockError = (message: unknown) => ({
    response: {
        data: { error: String(message), success: false },
        status: 500,
        statusText: 'Internal Server Error'
    },
    message: String(message)
});
