import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

type PngMetrics = {
  width: number
  height: number
  bbox: [number, number, number, number] | null
}

const readPngMetrics = (relativePath: string): PngMetrics => {
  const buffer = fs.readFileSync(path.join(process.cwd(), relativePath))
  expect(buffer.toString('ascii', 1, 4)).toBe('PNG')

  let offset = 8
  let width = 0
  let height = 0
  const idatChunks: Buffer[] = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
    } else if (type === 'IDAT') {
      idatChunks.push(Buffer.from(data))
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks))
  const bytesPerPixel = 4
  const stride = width * bytesPerPixel
  let cursor = 0
  let previous = Buffer.alloc(stride)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor]
    cursor += 1
    const row = Buffer.from(raw.subarray(cursor, cursor + stride))
    cursor += stride

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0
      const up = previous[x] || 0
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0
      let value = row[x]

      if (filter === 1) value = (value + left) & 255
      else if (filter === 2) value = (value + up) & 255
      else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255
      else if (filter === 4) {
        const pa = Math.abs(up - upperLeft)
        const pb = Math.abs(left - upperLeft)
        const pc = Math.abs(left + up - 2 * upperLeft)
        value = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft)) & 255
      }

      row[x] = value
    }

    for (let x = 0; x < width; x += 1) {
      const alpha = row[x * bytesPerPixel + 3]
      if (alpha > 0) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }

    previous = row
  }

  return {
    width,
    height,
    bbox: maxX >= 0 ? [minX, minY, maxX, maxY] : null
  }
}

describe('Android launcher icon resources', () => {
  it('keeps the adaptive foreground large enough to avoid double shrinking', () => {
    const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']

    for (const density of densities) {
      const metrics = readPngMetrics(
        `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`
      )
      expect(metrics.bbox, density).not.toBeNull()
      const [minX, minY, maxX, maxY] = metrics.bbox!
      const contentWidthRatio = (maxX - minX + 1) / metrics.width
      const contentHeightRatio = (maxY - minY + 1) / metrics.height

      expect(contentWidthRatio, density).toBeGreaterThanOrEqual(0.62)
      expect(contentHeightRatio, density).toBeGreaterThanOrEqual(0.62)
    }
  })
})
