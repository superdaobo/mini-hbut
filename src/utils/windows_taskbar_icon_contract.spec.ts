import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import zlib from 'node:zlib'

type IcoFrame = {
  width: number
  height: number
  bytes: number
  offset: number
}

type PngSize = {
  width: number
  height: number
}

const iconPath = resolve(process.cwd(), 'src-tauri/icons/icon.ico')

const readIconBytes = (frame: IcoFrame): Buffer => {
  return readFileSync(iconPath).subarray(frame.offset, frame.offset + frame.bytes)
}

const sha256 = (buffer: Buffer): string => {
  return createHash('sha256').update(buffer).digest('hex')
}

const readPngSize = (buffer: Buffer): PngSize => {
  expect(buffer.toString('ascii', 1, 4)).toBe('PNG')
  expect(buffer.toString('ascii', 12, 16)).toBe('IHDR')

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  }
}

const readIcoFrames = (relativePath: string): IcoFrame[] => {
  const buffer = readFileSync(resolve(process.cwd(), relativePath))

  expect(buffer.readUInt16LE(0), `${relativePath} reserved`).toBe(0)
  expect(buffer.readUInt16LE(2), `${relativePath} type`).toBe(1)

  const count = buffer.readUInt16LE(4)
  const frames: IcoFrame[] = []

  for (let index = 0; index < count; index += 1) {
    const entryOffset = 6 + index * 16
    const width = buffer[entryOffset] === 0 ? 256 : buffer[entryOffset]
    const height = buffer[entryOffset + 1] === 0 ? 256 : buffer[entryOffset + 1]

    frames.push({
      width,
      height,
      bytes: buffer.readUInt32LE(entryOffset + 8),
      offset: buffer.readUInt32LE(entryOffset + 12)
    })
  }

  return frames
}

describe('Windows taskbar icon contract', () => {
  it('ships a multi-resolution ICO so Windows can pick a crisp taskbar frame', () => {
    const frames = readIcoFrames('src-tauri/icons/icon.ico')
    const squareSizes = frames
      .filter((frame) => frame.width === frame.height)
      .map((frame) => frame.width)
      .sort((a, b) => a - b)
    const iconBytes = readFileSync(iconPath).length

    expect(squareSizes).toEqual([16, 24, 32, 48, 64, 128, 256])
    expect(new Set(squareSizes).size).toBe(squareSizes.length)
    expect(Math.max(...frames.map((frame) => frame.bytes))).toBeGreaterThan(1024)
    for (const frame of frames) {
      expect(frame.offset + frame.bytes).toBeLessThanOrEqual(iconBytes)
    }
  })

  it('keeps every ICO payload dimension consistent with its directory entry', () => {
    const frames = readIcoFrames('src-tauri/icons/icon.ico')

    for (const frame of frames) {
      expect(readPngSize(readIconBytes(frame))).toEqual({
        width: frame.width,
        height: frame.height
      })
    }
  })

  it('keeps the high-resolution ICO frame aligned with the generated Tauri PNG icon', () => {
    const frames = readIcoFrames('src-tauri/icons/icon.ico')
    const png256 = readFileSync(resolve(process.cwd(), 'src-tauri/icons/128x128@2x.png'))
    const ico256 = frames.find((frame) => frame.width === 256 && frame.height === 256)

    expect(ico256).toBeDefined()
    expect(sha256(readIconBytes(ico256!))).toBe(sha256(png256))
  })

  it('reruns the Tauri Windows resource build when the ICO changes', () => {
    const buildScript = readFileSync(resolve(process.cwd(), 'src-tauri/build.rs'), 'utf8')

    expect(buildScript).toContain('cargo:rerun-if-changed=icons/icon.ico')
  })

  it('keeps Windows bundle icons aligned with the official badge source', () => {
    const sourcePath = 'src-tauri/icons/source/official_badge.png'
    const readCenterColor = (relativePath: string) => {
      const buffer = readFileSync(resolve(process.cwd(), relativePath))
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

      const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
      expect(bytesPerPixel, `${relativePath} color type`).toBeGreaterThan(0)
      expect(bitDepth, `${relativePath} bit depth`).toBe(8)

      const raw = zlib.inflateSync(Buffer.concat(idatChunks))
      const stride = width * bytesPerPixel
      let cursor = 0
      let previous = Buffer.alloc(stride)
      const centerY = Math.floor(height / 2)
      const centerX = Math.floor(width / 2)
      let centerColor: { red: number; green: number; blue: number; alpha: number } | null = null

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
        if (y === centerY) {
          const index = centerX * bytesPerPixel
          centerColor = bytesPerPixel === 4
            ? { red: row[index], green: row[index + 1], blue: row[index + 2], alpha: row[index + 3] }
            : { red: row[index], green: row[index + 1], blue: row[index + 2], alpha: 255 }
        }
        previous = row
      }

      expect(centerColor, `${relativePath} center color`).not.toBeNull()
      return centerColor!
    }

    const colorDistance = (
      left: { red: number; green: number; blue: number; alpha: number },
      right: { red: number; green: number; blue: number; alpha: number }
    ) =>
      Math.abs(left.red - right.red) +
      Math.abs(left.green - right.green) +
      Math.abs(left.blue - right.blue) +
      Math.abs(left.alpha - right.alpha)

    expect(readFileSync(resolve(process.cwd(), sourcePath)).length).toBeGreaterThan(0)
    const sourceCenter = readCenterColor(sourcePath)
    const iconCenter = readCenterColor('src-tauri/icons/icon.png')
    expect(colorDistance(sourceCenter, iconCenter)).toBeLessThanOrEqual(24)
    expect(iconCenter.alpha).toBeGreaterThan(0)
  })

  it('requires desktop workflows to regenerate official icons before packaging', () => {
    const workflows = [
      '.github/workflows/ci.yml',
      '.github/workflows/dev-build.yml',
      '.github/workflows/release.yml'
    ]

    for (const workflowPath of workflows) {
      const workflow = readFileSync(resolve(process.cwd(), workflowPath), 'utf8')
      expect(workflow).toContain('python scripts/regenerate_official_icons.py')
      expect(workflow).toContain('windows_taskbar_icon_contract.spec.ts')
    }
  })
})
