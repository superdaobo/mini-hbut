import {
  bridgePost,
  errorMessage,
  hasTauri,
  invoke,
  mockResponse,
  type JsonObject
} from './bridge';

/** 处理登录与验证码端点；非认证端点返回 null。 */
export const handleAuthPost = async (url: string, data: JsonObject): Promise<unknown | null> => {
  if (url.includes('/v2/start_login')) {
    const username = String(data.username ?? '');
    const password = String(data.password ?? '');
    const captcha = String(data.captcha ?? '');
    const lt = String(data.lt ?? '');
    const execution = String(data.execution ?? '');
    try {
      if (!hasTauri) {
        const response = await bridgePost('/login', {
          username,
          password,
          captcha,
          lt,
          execution
        });
        if (response?.success) {
          return mockResponse({ success: true, data: response.data });
        }
        return mockResponse({
          success: false,
          error: errorMessage(response.error) || '登录失败'
        });
      }
      const response = await invoke('login', {
        username,
        password,
        captcha,
        lt,
        execution
      });
      return mockResponse({ success: true, data: response });
    } catch (error) {
      return mockResponse({ success: false, error: errorMessage(error) });
    }
  }

  if (url.includes('/v3/refresh_captcha')) {
    if (!hasTauri) {
      return mockResponse({ success: false, error: '浏览器模式不支持验证码接口' });
    }
    const imageData = await invoke<string>('get_captcha');
    const parts = imageData.split(',');
    return mockResponse({
      success: true,
      captcha_base64: parts.length > 1 ? parts[1] : parts[0],
      jsessionid: 'ignored'
    });
  }

  return null;
};
