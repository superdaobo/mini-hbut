import { get } from './axios_adapter/get';
import { post } from './axios_adapter/post';

type AxiosResponse<T = any> = {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, unknown>;
  config: Record<string, unknown>;
};

const axiosGet = <T = any>(url: string, config: Record<string, unknown> = {}) =>
  get(url, config) as Promise<AxiosResponse<T>>;
const axiosPost = <T = any>(url: string, data: Record<string, unknown> = {}, config: Record<string, unknown> = {}) =>
  post(url, data, config) as Promise<AxiosResponse<T>>;

const axiosInstance = {
  get: axiosGet,
  post: axiosPost,
  create: () => axiosInstance,
  interceptors: {
    request: { use: () => {}, eject: () => {} },
    response: { use: () => {}, eject: () => {} }
  },
  defaults: { headers: { common: {}, get: {}, post: {} } }
};

export default axiosInstance;
