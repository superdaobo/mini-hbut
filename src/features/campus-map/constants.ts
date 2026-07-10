/** 校园地图远程配置与缓存常量 */

export const CAMPUS_MAP_SCHEMA_VERSION = '1'
/** 业务缓存版本：bump 后旧 localStorage 键失效，强制二次冷启动下载 */
export const CAMPUS_MAP_CACHE_VERSION = 'v2'

export const CAMPUS_MAP_CONFIG_BASE =
  'https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/campus_map'

export const CAMPUS_MAP_MANIFEST_URL = `${CAMPUS_MAP_CONFIG_BASE}/manifest.json`
export const CAMPUS_MAP_BUILDINGS_URL = `${CAMPUS_MAP_CONFIG_BASE}/buildings.json`
export const CAMPUS_MAP_CONFIG_URL = `${CAMPUS_MAP_CONFIG_BASE}/config.json`

export const CAMPUS_MAP_CACHE_KEY = `static_resource:campus_map_bundle:${CAMPUS_MAP_CACHE_VERSION}`
export const CAMPUS_MAP_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const CAMPUS_MAP_FETCH_TIMEOUT_MS = 10000

/** 用户定位偏离校区中心超过此距离时回退到默认中心（米） */
export const CAMPUS_LOCATION_DRIFT_THRESHOLD_METERS = 2000

/** 步行路线代理路径（Key 由服务端注入） */
export const CAMPUS_MAP_DIRECTION_PROXY = '/campus-map/direction'
