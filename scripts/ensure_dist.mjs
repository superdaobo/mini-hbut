import fs from 'node:fs'
import path from 'node:path'

const distDir = path.resolve(process.cwd(), 'dist')

if (fs.existsSync(distDir)) {
  process.exit(0)
}

// Tauri generate_context! 编译期要求 frontendDist 目录存在；dev 模式运行时使用 devUrl
fs.mkdirSync(distDir, { recursive: true })
fs.writeFileSync(
  path.join(distDir, 'index.html'),
  '<!doctype html><html><head><meta charset="utf-8"><title>Mini-HBUT</title></head><body></body></html>',
)
console.log('[ensure-dist] 已创建 stub dist/，供 Tauri 编译期校验（运行时使用 devUrl）')
