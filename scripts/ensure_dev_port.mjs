import { execSync } from 'node:child_process'
import net from 'node:net'
import { resolveDevHost, resolveDevPort } from './dev_port.mjs'

const host = resolveDevHost()
const port = resolveDevPort()

const isPortListening = () =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    socket.setTimeout(500)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    const done = () => {
      socket.destroy()
      resolve(false)
    }
    socket.once('timeout', done)
    socket.once('error', done)
  })

const findListeningPidWindows = () => {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' })
    for (const line of output.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue
      if (host === '127.0.0.1' && !line.includes('127.0.0.1')) continue
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (/^\d+$/.test(pid)) return pid
    }
  } catch {
    // netstat/findstr 无匹配时返回非 0
  }
  return null
}

const findListeningPidUnix = () => {
  try {
    const output = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN`, { encoding: 'utf8' })
    const line = output.split(/\r?\n/).find((row) => row && !row.startsWith('COMMAND'))
    if (!line) return null
    return line.trim().split(/\s+/)[1] || null
  } catch {
    return null
  }
}

const killPid = (pid) => {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
    } else {
      execSync(`kill -9 ${pid}`, { stdio: 'ignore' })
    }
    return true
  } catch {
    return false
  }
}

const main = async () => {
  if (!(await isPortListening())) {
    return
  }

  const pid =
    process.platform === 'win32' ? findListeningPidWindows() : findListeningPidUnix()

  if (!pid) {
    console.error(`[ensure-dev-port] 端口 ${port} 已被占用，但无法识别监听进程，请手动释放后重试。`)
    process.exit(1)
    return
  }

  console.warn(`[ensure-dev-port] 端口 ${port} 被 PID ${pid} 占用，尝试结束残留 dev 进程…`)
  if (!killPid(pid)) {
    console.error(`[ensure-dev-port] 无法结束 PID ${pid}，请手动关闭占用 ${port} 的进程。`)
    process.exit(1)
    return
  }

  await new Promise((r) => setTimeout(r, 300))
  if (await isPortListening()) {
    console.error(`[ensure-dev-port] 端口 ${port} 仍被占用，请更换 VITE_DEV_PORT 或手动清理。`)
    process.exit(1)
  } else {
    console.log(`[ensure-dev-port] 已释放 ${host}:${port}`)
  }
}

main().catch((error) => {
  console.error('[ensure-dev-port] 失败:', error?.message || error)
  process.exit(1)
})
