import {
  bridgePost,
  errorMessage,
  hasTauri,
  invoke,
  mockResponse,
  type JsonObject
} from './bridge';
import { runExclusiveLogin } from '../../app/coordinators/sessionGate';

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
      // #659：手动登录提交走全局单飞门 —— 后台恢复已在登录时复用同一请求，
      // 反之手动登录进行中时后台恢复也会让路，保证同一时刻只有一个 login
      const response = await runExclusiveLogin(() =>
        invoke('login', {
          username,
          password,
          captcha,
          lt,
          execution
        })
      );
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
