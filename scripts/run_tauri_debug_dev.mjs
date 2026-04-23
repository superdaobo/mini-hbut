import net from 'node:net'
import { spawn } from 'node:child_process'

const VITE_PORT = Number(process.env.TAURI_DEV_VITE_PORT || 1420)
const BRIDGE_PORT = Number(process.env.TAURI_DEV_BRIDGE_PORT || 4399)
const HOST = '127.0.0.1'

const checkPortOpen = (port) =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host: HOST, port })
    socket.setTimeout(800)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    const close = () => {
      socket.destroy()
      resolve(false)
    }
    socket.once('timeout', close)
    socket.once('error', close)
  })

const main = async () => {
  const viteReady = await checkPortOpen(VITE_PORT)
  const bridgeReady = await checkPortOpen(BRIDGE_PORT)

  if (viteReady && bridgeReady) {
    console.log(`[tauri-debug-dev] 复用现有实例：vite=${VITE_PORT}, bridge=${BRIDGE_PORT}`)
    return
  }

  if (viteReady || bridgeReady) {
    console.error(
      `[tauri-debug-dev] 端口状态不一致：vite=${viteReady}, bridge=${bridgeReady}。请先清理冲突进程后再启动。`
    )
    process.exitCode = 1
    return
  }

  const npmBinary = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const child = spawn(npmBinary, ['run', 'tauri', '--', 'dev'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      HBUT_DEBUG_ENABLE_BRIDGE_TOOLS: 'true'
    }
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })
}

main().catch((error) => {
  console.error('[tauri-debug-dev] 启动失败:', error?.message || error)
  process.exitCode = 1
})
