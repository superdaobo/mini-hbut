import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
})
