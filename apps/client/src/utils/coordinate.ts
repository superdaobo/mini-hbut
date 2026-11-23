import { wgs84ToGcj02 } from './towergo_map'

/**
 * 坐标纠偏统一出口。
 *
 * 系统/浏览器定位返回的是 WGS-84，而腾讯地图与铁塔接口都要求 GCJ-02。
 * 所有「从系统定位进来、往外发给地图/接口」的坐标必须经这里转换，
 * 避免各调用点各自调用/忘记转换导致人、车、POI 错位（实测偏差约 589m）。
 */

/** WGS-84 → GCJ-02；境外/非法输入原样返回（与 wgs84ToGcj02 语义一致） */
export const toGcj = (lat: number, lng: number): { latitude: number; longitude: number } =>
  wgs84ToGcj02(lat, lng)

/** 对点对象整体转换经纬度，其余字段（name/accuracy/source 等）原样保留 */
export const toGcjPoint = <T extends { latitude: number; longitude: number }>(point: T): T => {
  const converted = toGcj(point.latitude, point.longitude)
  return { ...point, latitude: converted.latitude, longitude: converted.longitude }
}
