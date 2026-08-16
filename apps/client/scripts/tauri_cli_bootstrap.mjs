#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const compareVersionsDesc = (left, right) =>
  right.localeCompare(left, undefined, { numeric: true, sensitivity: 'base' })

const getEnvValue = (env, name) => {
  const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === name.toLowerCase())
  return key ? String(env[key] || '') : ''
}

const setEnvValue = (env, name, value) => {
  const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === name.toLowerCase())
  env[key || name] = value
}

const prependEnvPaths = (env, name, entries, delimiter = ';') => {
  const existing = getEnvValue(env, name)
  const values = [...entries.filter((entry) => entry && fs.existsSync(entry)), existing].filter(Boolean)
  setEnvValue(env, name, values.join(delimiter))
}

const findExecutableOnPath = (env, executable, delimiter = ';') => {
  const pathValue = getEnvValue(env, 'PATH')
  for (const rawEntry of pathValue.split(delimiter)) {
    const entry = rawEntry.trim().replace(/^"|"$/g, '')
    if (!entry) continue
    const candidate = path.join(entry, executable)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

const listDirectories = (root) => {
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

const discoverVisualStudioRoots = (programFiles, programFilesX86) => {
  const roots = []
  const bases = [
    path.join(programFiles, 'Microsoft Visual Studio'),
    path.join(programFilesX86, 'Microsoft Visual Studio')
  ]

  for (const base of bases) {
    for (const year of listDirectories(base).sort(compareVersionsDesc)) {
      const yearRoot = path.join(base, year)
      for (const edition of listDirectories(yearRoot)) {
        const installRoot = path.join(yearRoot, edition)
        if (fs.existsSync(path.join(installRoot, 'VC', 'Tools', 'MSVC'))) roots.push(installRoot)
      }
    }
  }

  return roots
}

const resolveMsvcToolset = (visualStudioRoots) => {
  for (const visualStudioRoot of visualStudioRoots) {
    const toolsetsRoot = path.join(visualStudioRoot, 'VC', 'Tools', 'MSVC')
    for (const version of listDirectories(toolsetsRoot).sort(compareVersionsDesc)) {
      const toolsetRoot = path.join(toolsetsRoot, version)
      const binaryRoot = path.join(toolsetRoot, 'bin', 'Hostx64', 'x64')
      const required = ['link.exe', 'cl.exe', 'lib.exe'].map((name) => path.join(binaryRoot, name))
      if (required.every((filePath) => fs.existsSync(filePath))) {
        return { visualStudioRoot, toolsetRoot, binaryRoot, version }
      }
    }
  }
  return null
}

const resolveWindowsSdk = (windowsKitsRoot) => {
  const libRoot = path.join(windowsKitsRoot, 'Lib')
  for (const version of listDirectories(libRoot).sort(compareVersionsDesc)) {
    const required = [
      path.join(libRoot, version, 'ucrt', 'x64', 'ucrt.lib'),
      path.join(libRoot, version, 'um', 'x64', 'kernel32.lib'),
      path.join(windowsKitsRoot, 'bin', version, 'x64', 'rc.exe')
    ]
    if (required.every((filePath) => fs.existsSync(filePath))) {
      return { windowsKitsRoot, version, binaryRoot: path.join(windowsKitsRoot, 'bin', version, 'x64') }
    }
  }
  return null
}

/**
 * 为普通 PowerShell/CMD 补齐 Rust MSVC 链接环境，仅作用于当前 Tauri 子进程。
 * 不修改用户级或系统级环境变量。
 */
export const resolveWindowsMsvcEnvironment = ({
  baseEnv = process.env,
  platform = process.platform,
  visualStudioRoots,
  windowsKitsRoot
} = {}) => {
  const env = { ...baseEnv }
  if (platform !== 'win32') return { env, configured: false, reason: 'non-windows' }

  const existingLink = findExecutableOnPath(env, 'link.exe')
  const existingToolset = getEnvValue(env, 'VCToolsInstallDir')
  if (existingLink && existingToolset) {
    return { env, configured: false, reason: 'already-configured', linkPath: existingLink }
  }

  const programFiles = getEnvValue(env, 'ProgramFiles') || 'C:\\Program Files'
  const programFilesX86 = getEnvValue(env, 'ProgramFiles(x86)') || 'C:\\Program Files (x86)'
  const roots = visualStudioRoots || discoverVisualStudioRoots(programFiles, programFilesX86)
  const msvc = resolveMsvcToolset(roots)
  const kitsRoot = windowsKitsRoot || path.join(programFilesX86, 'Windows Kits', '10')
  const sdk = resolveWindowsSdk(kitsRoot)

  if (!msvc || !sdk) {
    const missing = [!msvc && 'MSVC C++ x64 工具', !sdk && 'Windows 10/11 SDK'].filter(Boolean).join('、')
    throw new Error(
      `未找到 ${missing}。请在 Visual Studio Installer 中安装“使用 C++ 的桌面开发”，然后重新执行 npm ci。`
    )
  }

  const includeRoot = path.join(sdk.windowsKitsRoot, 'Include', sdk.version)
  const libRoot = path.join(sdk.windowsKitsRoot, 'Lib', sdk.version)
  const includeEntries = [
    path.join(msvc.toolsetRoot, 'include'),
    path.join(includeRoot, 'ucrt'),
    path.join(includeRoot, 'shared'),
    path.join(includeRoot, 'um'),
    path.join(includeRoot, 'winrt'),
    path.join(includeRoot, 'cppwinrt')
  ]
  const libEntries = [
    path.join(msvc.toolsetRoot, 'lib', 'x64'),
    path.join(libRoot, 'ucrt', 'x64'),
    path.join(libRoot, 'um', 'x64')
  ]

  prependEnvPaths(env, 'PATH', [msvc.binaryRoot, sdk.binaryRoot])
  prependEnvPaths(env, 'INCLUDE', includeEntries)
  prependEnvPaths(env, 'LIB', libEntries)
  prependEnvPaths(env, 'LIBPATH', libEntries)

  setEnvValue(env, 'VSINSTALLDIR', `${msvc.visualStudioRoot}${path.sep}`)
  setEnvValue(env, 'VCINSTALLDIR', `${path.join(msvc.visualStudioRoot, 'VC')}${path.sep}`)
  setEnvValue(env, 'VCToolsInstallDir', `${msvc.toolsetRoot}${path.sep}`)
  setEnvValue(env, 'VCToolsVersion', msvc.version)
  setEnvValue(env, 'WindowsSdkDir', `${sdk.windowsKitsRoot}${path.sep}`)
  setEnvValue(env, 'WindowsSDKVersion', `${sdk.version}${path.sep}`)
  setEnvValue(env, 'UniversalCRTSdkDir', `${sdk.windowsKitsRoot}${path.sep}`)
  setEnvValue(env, 'UCRTVersion', sdk.version)
  setEnvValue(env, 'Platform', 'x64')
  setEnvValue(env, 'VSCMD_ARG_HOST_ARCH', 'x64')
  setEnvValue(env, 'VSCMD_ARG_TGT_ARCH', 'x64')

  return {
    env,
    configured: true,
    reason: 'auto-detected',
    linkPath: path.join(msvc.binaryRoot, 'link.exe'),
    msvcVersion: msvc.version,
    sdkVersion: sdk.version
  }
}

const main = () => {
  const cliPath = path.join(repoRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
  if (!fs.existsSync(cliPath)) {
    console.error('[tauri-bootstrap] 未安装 @tauri-apps/cli，请先运行 npm ci。')
    process.exit(1)
  }

  let resolved
  try {
    resolved = resolveWindowsMsvcEnvironment()
  } catch (error) {
    console.error(`[tauri-bootstrap] ${error?.message || error}`)
    process.exit(1)
  }

  if (resolved.configured) {
    console.log(`[tauri-bootstrap] 已加载 MSVC ${resolved.msvcVersion} / Windows SDK ${resolved.sdkVersion}`)
  }

  const child = spawn(process.execPath, [cliPath, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: resolved.env,
    stdio: 'inherit',
    windowsHide: false
  })

  child.once('error', (error) => {
    console.error(`[tauri-bootstrap] Tauri CLI 启动失败：${error.message}`)
    process.exit(1)
  })
  child.once('exit', (code, signal) => {
    if (signal) return process.exit(1)
    process.exit(code ?? 1)
  })
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) main()
