import type { GeoPoint } from '../types'

/** 解压腾讯步行路线增量编码坐标（移植小程序 translateCoors） */
export const decodeDeltaPolyline = (raw: Array<number | string>) => {
  const values = raw.map((item) => Number(item)).filter((item) => Number.isFinite(item))
  for (let index = 2; index < values.length; index += 1) {
    values[index] = values[index - 2] + values[index] / 1_000_000
  }
  return values
}

export const polylineToPoints = (raw: Array<number | string>): GeoPoint[] => {
  const values = decodeDeltaPolyline(raw)
  const points: GeoPoint[] = []
  for (let index = 0; index < values.length - 1; index += 2) {
    points.push({ latitude: values[index], longitude: values[index + 1] })
  }
  return points
}