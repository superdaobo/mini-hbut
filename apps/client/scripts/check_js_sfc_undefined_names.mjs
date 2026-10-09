/**
 * 纯 JS 的 Vue SFC「未定义标识符」门禁。
 *
 * ## 为什么需要它
 *
 * `tsconfig.json` 只 include `*.ts / *.tsx / *.vue`，但**没有开 `checkJs`** ——
 * 也就是说 `<script setup>` 里若是纯 JS（无 `lang="ts"`），`vue-tsc` 根本不做检查，
 * `vite build` 也不会报错。于是「用了没导入的标识符」这类错误会一路进到包里，
 * 只在**运行时**抛 `ReferenceError`，把整个组件渲染打挂 —— 表现为**整页白屏**。
 *
 * 线上实例（#1013 教师端）：`Dashboard.vue` 的 mounted 钩子里
 * `ReferenceError: isTeacherRole is not defined` → 首页白屏。
 *
 * ## 检查方式
 *
 * 用一份开启 `checkJs` 的 tsconfig 跑 `vue-tsc`，只筛 **TS2304（Cannot find name）**，
 * 忽略其它类型噪音（`unknown` 属性访问等在海量既有 JS 里必然存在，不适合当门禁）。
 *
 * ## 覆盖范围
 *
 * 只覆盖 `CHECKED_FILES` 里列出的文件 —— 目的是**零误报**。
 * 以下文件存在**同类预存问题**（导入了模块但漏导入具体符号），
 * 需要先修掉才能纳入（建议单独开 issue）：
 *   - `src/components/AiChatView.vue`（hasTauriRuntime / normalizeMathText /
 *     activeBridgeBase / activeBridgeIndex / isAiUnauthorizedText / availableModelSet …）
 *   - `src/components/CampusNetworkView.vue`
 *   - `src/components/SportsVenueView.vue`
 *   - `src/components/CourseSelectionView.vue`
 *   - `src/features/ai/chat-model.js`
 * 修完后把它们加进 `CHECKED_FILES` 即可逐步扩大覆盖面。
 */

import { spawnSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 受门禁保护的纯 JS SFC（新增/修改这类文件时请一并加进来）。 */
export const CHECKED_FILES = ['src/components/Dashboard.vue', 'src/components/LoginV3.vue']

const CONFIG_NAME = 'tsconfig.js-sfc-check.json'

/** 生成临时 tsconfig：开 checkJs、关掉无关严格项，只 include 受保护文件。 */
const buildConfig = () =>
  JSON.stringify(
    {
      extends: './tsconfig.json',
      compilerOptions: {
        allowJs: true,
        checkJs: true,
        strict: false,
        noUnusedLocals: false,
        noUnusedParameters: false
      },
      include: CHECKED_FILES,
      references: []
    },
    null,
    2
  )

const UNDEFINED_NAME_PATTERN = /error TS2304: Cannot find name '([^']+)'/

/** vue-tsc 的 JS 入口。直接用它而不是 `npx`：Windows 上 spawn `npx.cmd` 必须开 shell，
 *  而开了 shell 又拿到不到真实退出码（会静默「通过」—— 这个门禁第一版就踩过）。 */
const VUE_TSC_ENTRY = path.join(root, 'node_modules', 'vue-tsc', 'bin', 'vue-tsc.js')

const run = () => {
  const configPath = path.join(root, CONFIG_NAME)
  writeFileSync(configPath, buildConfig(), 'utf8')
  try {
    const result = spawnSync(
      process.execPath,
      [VUE_TSC_ENTRY, '--noEmit', '-p', CONFIG_NAME],
      { cwd: root, encoding: 'utf8' }
    )
    if (result.error) {
      throw new Error(`无法启动 vue-tsc：${result.error.message}`)
    }
    // 检查器自身没跑起来时必须报错，绝不能静默「通过」
    if (result.status === null) {
      throw new Error(`vue-tsc 未正常结束（signal=${result.signal}）`)
    }
    const output = `${result.stdout || ''}${result.stderr || ''}`
    const fatal = output
      .split('\n')
      .find((line) => /error TS\d+/.test(line) && !line.includes('TS2304'))
    // 只把 TS2304 当门禁；但若连一条编译输出都没有，说明配置有问题
    if (!output.trim()) {
      throw new Error('vue-tsc 没有任何输出，配置可能未生效')
    }
    void fatal
    return output
      .split('\n')
      .map((line) => UNDEFINED_NAME_PATTERN.exec(line))
      .filter(Boolean)
      .map((match) => match[0])
  } finally {
    try {
      unlinkSync(configPath)
    } catch {
      /* 临时文件已不在也无所谓 */
    }
  }
}

const problems = run()

if (problems.length > 0) {
  console.error('[js-sfc-undefined-names] 发现未定义标识符（运行时会导致组件白屏）：')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('\n请补上缺失的 import / 声明，或改用已导入的等价实现。')
  process.exit(1)
}

console.log(`[js-sfc-undefined-names] 通过（已检查 ${CHECKED_FILES.length} 个纯 JS SFC）`)
