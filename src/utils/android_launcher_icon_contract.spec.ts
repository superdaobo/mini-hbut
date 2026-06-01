import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'

type PngMetrics = {
  width: number
  height: number
  bbox: [number, number, number, number] | null
  fullyOpaque: boolean
  whiteCornerCount: number
}

type PngColor = {
  red: number
  green: number
  blue: number
  alpha: number
}

const readPngMetrics = (relativePath: string): PngMetrics => {
  const buffer = fs.readFileSync(path.join(process.cwd(), relativePath))
  expect(buffer.toString('ascii', 1, 4)).toBe('PNG')

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
  expect(bitDepth, `${relativePath} bit depth`).toBe(8)
  const bytesPerPixelByColorType: Record<number, number> = {
    2: 3,
    6: 4
  }
  const bytesPerPixel = bytesPerPixelByColorType[colorType]
  expect(bytesPerPixel, `${relativePath} color type`).toBeDefined()
  const stride = width * bytesPerPixel
  let cursor = 0
  let previous = Buffer.alloc(stride)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let fullyOpaque = true
  let whiteCornerCount = 0

  const readColor = (row: Buffer, x: number): PngColor => {
    const index = x * bytesPerPixel
    if (colorType === 2) {
      return {
        red: row[index],
        green: row[index + 1],
        blue: row[index + 2],
        alpha: 255
      }
    }
    return {
      red: row[index],
      green: row[index + 1],
      blue: row[index + 2],
      alpha: row[index + 3]
    }
  }

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
      const { red, green, blue, alpha } = readColor(row, x)
      if (alpha < 255) {
        fullyOpaque = false
      }
      if (alpha > 0) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
      const isCorner =
        (x === 0 && y === 0) ||
        (x === width - 1 && y === 0) ||
        (x === 0 && y === height - 1) ||
        (x === width - 1 && y === height - 1)
      if (isCorner && alpha === 255 && red >= 245 && green >= 245 && blue >= 245) {
        whiteCornerCount += 1
      }
    }

    previous = row
  }

  return {
    width,
    height,
    bbox: maxX >= 0 ? [minX, minY, maxX, maxY] : null,
    fullyOpaque,
    whiteCornerCount
  }
}

describe('Android launcher icon resources', () => {
  const iconRoots = [
    'src-tauri/icons/android',
    'android/app/src/main/res',
    'src-tauri/gen/android/app/src/main/res'
  ].filter((root) => fs.existsSync(path.join(process.cwd(), root)))

  const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']

  it('keeps legacy launcher icons on an opaque white canvas for APK installer previews', () => {
    for (const root of iconRoots) {
      for (const density of densities) {
        for (const iconName of ['ic_launcher.png', 'ic_launcher_round.png']) {
          const metrics = readPngMetrics(`${root}/mipmap-${density}/${iconName}`)
          expect(metrics.fullyOpaque, `${root} ${density} ${iconName}`).toBe(true)
          expect(metrics.whiteCornerCount, `${root} ${density} ${iconName}`).toBe(4)
        }
      }
    }
  })

  it('keeps adaptive foreground artwork centered inside the safe zone', () => {
    const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']

    for (const root of iconRoots) {
      for (const density of densities) {
        const metrics = readPngMetrics(`${root}/mipmap-${density}/ic_launcher_foreground.png`)
        expect(metrics.bbox, `${root} ${density}`).not.toBeNull()
        const [minX, minY, maxX, maxY] = metrics.bbox!
        const contentWidthRatio = (maxX - minX + 1) / metrics.width
        const contentHeightRatio = (maxY - minY + 1) / metrics.height
        const safeZonePadding = Math.floor(metrics.width * (18 / 108))

        expect(minX, `${root} ${density}`).toBeGreaterThanOrEqual(safeZonePadding - 1)
        expect(minY, `${root} ${density}`).toBeGreaterThanOrEqual(safeZonePadding - 1)
        expect(metrics.width - 1 - maxX, `${root} ${density}`).toBeGreaterThanOrEqual(
          safeZonePadding - 1
        )
        expect(metrics.height - 1 - maxY, `${root} ${density}`).toBeGreaterThanOrEqual(
          safeZonePadding - 1
        )
        expect(contentWidthRatio, `${root} ${density}`).toBeGreaterThanOrEqual(0.58)
        expect(contentWidthRatio, `${root} ${density}`).toBeLessThanOrEqual(0.7)
        expect(contentHeightRatio, `${root} ${density}`).toBeGreaterThanOrEqual(0.58)
        expect(contentHeightRatio, `${root} ${density}`).toBeLessThanOrEqual(0.7)
      }
    }
  })

  it('patches WorkManager into the generated Tauri Android app build.gradle file', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-hbut-widget-'))
    const projectRoot = path.join(tempRoot, 'project')
    const generatedMain = path.join(
      projectRoot,
      'src-tauri',
      'gen',
      'android',
      'app',
      'src',
      'main'
    )
    const generatedApp = path.dirname(path.dirname(generatedMain))
    const gradlePath = path.join(generatedApp, 'build.gradle')

    fs.mkdirSync(path.dirname(gradlePath), { recursive: true })
    fs.writeFileSync(
      gradlePath,
      `apply plugin: 'com.android.application'\n\ndependencies {\n}\n`,
      'utf8'
    )

    const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3'
    const python = [
      'from pathlib import Path',
      'import importlib.util',
      'import sys',
      `spec = importlib.util.spec_from_file_location("patch_android_widget", ${JSON.stringify(
        path.resolve(process.cwd(), 'scripts/patch_android_widget.py')
      )})`,
      'mod = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(mod)',
      `mod.PROJECT_DIR = Path(${JSON.stringify(projectRoot)})`,
      `mod.TAURI_ANDROID = Path(${JSON.stringify(generatedMain)})`,
      `mod.CAPACITOR_ANDROID = Path(${JSON.stringify(path.join(projectRoot, 'android', 'app', 'src', 'main'))})`,
      'result = mod.patch_gradle_dependencies()',
      'print(result)',
      `print(Path(${JSON.stringify(gradlePath)}).read_text(encoding="utf-8"))`
    ].join('\n')

    try {
      const output = execFileSync(pythonExecutable, ['-c', python], {
        encoding: 'utf8'
      })

      expect(output).toContain('True')
      expect(output).toContain('androidx.work:work-runtime-ktx:2.9.0')
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('keeps dev and release Android workflows strict about platform build failures', () => {
    const devWorkflow = fs.readFileSync(
      path.join(process.cwd(), '.github/workflows/dev-build.yml'),
      'utf8'
    )
    const releaseWorkflow = fs.readFileSync(
      path.join(process.cwd(), '.github/workflows/release.yml'),
      'utf8'
    )

    expect(devWorkflow).not.toContain('continue-on-error: true')
    expect(devWorkflow).toContain('run: python scripts/patch_android_widget.py')
    expect(devWorkflow).toContain('if: ${{ success() }}')
    expect(releaseWorkflow).toContain('run: python scripts/patch_android_widget.py')
    expect(releaseWorkflow).not.toMatch(/build-android:[\s\S]*?continue-on-error: true/)
  })
})
