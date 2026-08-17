import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

type PngColor = {
  red: number
  green: number
  blue: number
  alpha: number
}

const readPngPixel = (buffer: Buffer, pixelX: number, pixelY: number, label: string): PngColor => {
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks: Buffer[] = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') {
      idatChunks.push(Buffer.from(data))
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks))
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  expect(bytesPerPixel, `${label} color type`).toBeGreaterThan(0)
  expect(bitDepth, `${label} bit depth`).toBe(8)

  const stride = width * bytesPerPixel
  let cursor = 0
  let previous = Buffer.alloc(stride)
  let pixelColor: PngColor | null = null

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

    if (y === pixelY) {
      const index = pixelX * bytesPerPixel
      if (bytesPerPixel === 4) {
        pixelColor = {
          red: row[index],
          green: row[index + 1],
          blue: row[index + 2],
          alpha: row[index + 3]
        }
      } else {
        pixelColor = {
          red: row[index],
          green: row[index + 1],
          blue: row[index + 2],
          alpha: 255
        }
      }
    }

    previous = row
  }

  expect(pixelColor, `${label} pixel`).not.toBeNull()
  return pixelColor!
}

const readCenterColor = (relativePath: string): PngColor => {
  const buffer = fs.readFileSync(path.join(process.cwd(), relativePath))
  // PNG IHDR 固定布局：width = offset 16..20，height = offset 20..24
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  return readPngPixel(buffer, Math.floor(width / 2), Math.floor(height / 2), relativePath)
}

/** 读取 SVG 内嵌 PNG（data:image/png;base64,..）的解码缓冲。 */
const readSvgEmbeddedPng = (relativePath: string): Buffer => {
  const svg = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
  const match = svg.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)
  expect(match, `${relativePath} embedded png`).not.toBeNull()
  return Buffer.from(match![1], 'base64')
}

const colorDistance = (left: PngColor, right: PngColor) =>
  Math.abs(left.red - right.red) +
  Math.abs(left.green - right.green) +
  Math.abs(left.blue - right.blue) +
  Math.abs(left.alpha - right.alpha)

describe('iOS launcher icon resources', () => {
  const sourcePath = 'src-tauri/icons/source/official_badge.png'
  const iosIcons = [
    'src-tauri/icons/ios/AppIcon-60x60@3x.png',
    'src-tauri/icons/ios/AppIcon-512@2x.png',
    'src-tauri/icons/ios/AppIcon-1024x1024@1x.png'
  ]

  it('keeps iOS home and marketing icons aligned with the official badge source', () => {
    expect(fs.existsSync(path.join(process.cwd(), sourcePath))).toBe(true)
    const sourceCenter = readCenterColor(sourcePath)

    for (const iconPath of iosIcons) {
      expect(fs.existsSync(path.join(process.cwd(), iconPath))).toBe(true)
      const iconCenter = readCenterColor(iconPath)
      expect(colorDistance(sourceCenter, iconCenter), iconPath).toBeLessThanOrEqual(24)
      expect(iconCenter.alpha, iconPath).toBeGreaterThan(0)
    }
  })

  it('keeps App Store opaque icons free of alpha for TestFlight validation', () => {
    for (const iconPath of [
      'src-tauri/icons/ios/AppIcon-512@2x-appstore.png',
      'src-tauri/icons/ios/AppIcon-1024x1024@1x-appstore.png'
    ]) {
      const buffer = fs.readFileSync(path.join(process.cwd(), iconPath))
      const colorType = buffer[25]
      expect(colorType, iconPath).toBe(2)
    }
  })

  it('keeps web favicon aligned with the current brand icon (#631)', () => {
    // 旧 favicon 为白底浅蓝旧 logo（四角接近白色）；新图标为品牌蓝底（四角蓝）。
    // 校验角落像素蓝底特征，防止旧标识再次随 public/favicon.svg 打进 App 包。
    const faviconPng = readSvgEmbeddedPng('public/favicon.svg')
    const corner = readPngPixel(faviconPng, 8, 8, 'public/favicon.svg corner')
    expect(corner.red, '旧图标白底（red 接近 255）').toBeLessThan(130)
    expect(corner.blue, '品牌蓝底').toBeGreaterThan(190)
  })

  it('requires iOS workflows to regenerate icons before syncing into Tauri assets', () => {
    const workflows = [
      '.github/workflows/ios-testflight.yml',
      '.github/workflows/dev-build.yml',
      '.github/workflows/release.yml'
    ]

    for (const workflowPath of workflows) {
      const workflow = fs.readFileSync(path.join(process.cwd(), '../..', workflowPath), 'utf8')
      expect(workflow).toContain('python scripts/fix_ios_app_icons.py')
      expect(workflow).toContain('node scripts/sync_tauri_platform_icons.mjs ios')
      const fixIndex = workflow.indexOf('python scripts/fix_ios_app_icons.py')
      const syncIndex = workflow.indexOf('node scripts/sync_tauri_platform_icons.mjs ios')
      expect(fixIndex).toBeGreaterThanOrEqual(0)
      expect(syncIndex).toBeGreaterThan(fixIndex)
    }
  })
})