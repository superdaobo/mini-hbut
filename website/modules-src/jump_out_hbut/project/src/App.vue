<template>
  <div class="game-app">
    <!-- 游戏画布容器（始终存在） -->
    <div ref="gameContainer" class="game-container"></div>

    <!-- 开始界面 -->
    <StartScreen
      v-if="screen === 'start'"
      :highScore="highScore"
      @startGame="handleStartGame"
      @showLeaderboard="handleShowLeaderboard"
    />

    <!-- 游戏中 HUD -->
    <GameHUD
      v-if="screen === 'playing'"
      :score="gameData.score"
      :combo="gameData.combo"
      :jumpCount="gameData.jumpCount"
      :chargePercent="gameData.chargePercent"
      :muted="gameData.muted"
      @toggleMute="handleToggleMute"
    />

    <!-- 游戏结束界面 -->
    <GameOverScreen
      v-if="screen === 'gameover'"
      :score="gameData.score"
      :jumpCount="gameData.jumpCount"
      :duration="gameData.duration"
      :uploadFailed="gameData.uploadFailed"
      :retrying="gameData.retrying"
      @restart="handleRestart"
      @showLeaderboard="handleShowLeaderboard"
      @retryUpload="handleRetryUpload"
    />

    <!-- 排行榜面板 -->
    <LeaderboardPanel
      v-if="screen === 'leaderboard'"
      @close="handleLeaderboardClose"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import StartScreen from './components/StartScreen.vue'
import GameHUD from './components/GameHUD.vue'
import GameOverScreen from './components/GameOverScreen.vue'
import LeaderboardPanel from './components/LeaderboardPanel.vue'
import { GameEngine } from './game/GameEngine.js'
import { readGameModuleContext, createRunId, submitGameRank } from './utils/game_rank.js'

// 当前屏幕状态
const screen = ref('start')

// 上一个屏幕（用于排行榜返回）
const previousScreen = ref('start')

// 游戏数据
const gameData = reactive({
  score: 0,
  combo: 0,
  jumpCount: 0,
  chargePercent: 0,
  duration: 0,
  muted: false,
  uploadFailed: false,
  retrying: false
})

// 最高分
const highScore = ref(Number(localStorage.getItem('jump_out_hbut_highscore') || '0'))

// 排名系统上下文（Task 11.1）
const rankContext = reactive({
  student_id: '',
  player_name: '匿名玩家',
  class_name: '',
  rank_api: ''
})

// 当前游戏会话的 run_id（Task 11.2）
let currentRunId = ''

// 游戏引擎实例
let engine = null
const gameContainer = ref(null)

onMounted(async () => {
  // 读取排名系统上下文（Task 11.1）
  try {
    const ctx = readGameModuleContext()
    rankContext.student_id = ctx.student_id
    rankContext.player_name = ctx.player_name
    rankContext.class_name = ctx.class_name
    rankContext.rank_api = ctx.rank_api
  } catch (e) {
    console.warn('读取游戏上下文失败，排名功能降级:', e)
  }

  engine = new GameEngine()
  try {
    await engine.init(gameContainer.value)
  } catch (e) {
    console.warn('GameEngine init failed:', e)
  }

  // 监听引擎事件
  engine.on('scoreUpdate', ({ total }) => {
    gameData.score = total
  })

  engine.on('comboUpdate', (comboState) => {
    gameData.combo = comboState.count
  })

  engine.on('stateChange', ({ state }) => {
    if (state === 'charging') {
      updateChargeLoop()
    }
  })

  engine.on('gameOver', ({ score, jumpCount, duration }) => {
    gameData.score = score
    gameData.jumpCount = jumpCount
    gameData.duration = duration

    // 更新最高分
    if (score > highScore.value) {
      highScore.value = score
      localStorage.setItem('jump_out_hbut_highscore', String(score))
    }

    screen.value = 'gameover'

    // 提交分数到排名服务（Task 11.2）
    submitScore(score, jumpCount, duration)
  })
})

onBeforeUnmount(() => {
  if (engine) {
    engine.destroy()
    engine = null
  }
})

// 蓄力百分比更新循环
let chargeRafId = null
function updateChargeLoop() {
  if (!engine) return
  const state = engine.getState()
  if (state === 'charging') {
    gameData.chargePercent = engine._chargeSystem.getChargePercent()
    chargeRafId = requestAnimationFrame(updateChargeLoop)
  } else {
    gameData.chargePercent = 0
  }
}

// 提交分数到排名服务（Task 11.2）
async function submitScore(score, jumpCount, duration) {
  gameData.uploadFailed = false
  gameData.retrying = false
  try {
    const result = await submitGameRank({
      score,
      max_level: jumpCount,
      duration_ms: duration,
      move_count: jumpCount,
      run_id: currentRunId,
      ended_reason: 'fall'
    })
    if (!result.success) {
      console.warn('分数提交未成功:', result.error)
      gameData.uploadFailed = true
    }
  } catch (e) {
    console.warn('分数提交失败:', e)
    gameData.uploadFailed = true
  }
}

// 重试上传
async function handleRetryUpload() {
  if (gameData.retrying) return
  gameData.retrying = true
  try {
    const result = await submitGameRank({
      score: gameData.score,
      max_level: gameData.jumpCount,
      duration_ms: gameData.duration,
      move_count: gameData.jumpCount,
      run_id: currentRunId,
      ended_reason: 'fall'
    })
    if (result.success) {
      gameData.uploadFailed = false
    } else {
      console.warn('重试提交未成功:', result.error)
    }
  } catch (e) {
    console.warn('重试提交失败:', e)
  } finally {
    gameData.retrying = false
  }
}

// 事件处理
function handleStartGame() {
  screen.value = 'playing'
  gameData.score = 0
  gameData.combo = 0
  gameData.jumpCount = 0
  gameData.chargePercent = 0
  gameData.duration = 0

  // 每局开始生成唯一 run_id（Task 11.2）
  currentRunId = createRunId()

  if (engine) {
    engine.start()
  }
}

function handleRestart() {
  screen.value = 'playing'
  gameData.score = 0
  gameData.combo = 0
  gameData.jumpCount = 0
  gameData.chargePercent = 0
  gameData.duration = 0

  // 每局开始生成唯一 run_id（Task 11.2）
  currentRunId = createRunId()

  if (engine) {
    engine.reset()
  }
}

function handleShowLeaderboard() {
  previousScreen.value = screen.value
  screen.value = 'leaderboard'
}

function handleLeaderboardClose() {
  screen.value = previousScreen.value
}

function handleToggleMute() {
  if (engine) {
    const muted = !gameData.muted
    gameData.muted = muted
    engine._audioManager.setMuted(muted)
  }
}
</script>

<style scoped>
.game-app {
  width: 100%;
  height: calc(var(--module-vh, 1vh) * 100);
  min-height: calc(var(--module-vh, 1vh) * 100);
  position: relative;
  overflow: hidden;
  padding:
    var(--module-safe-top, 0px)
    var(--module-safe-right, 0px)
    var(--module-safe-bottom, 0px)
    var(--module-safe-left, 0px);
}

.game-container {
  width: 100%;
  height: auto;
  position: absolute;
  inset:
    var(--module-safe-top, 0px)
    var(--module-safe-right, 0px)
    var(--module-safe-bottom, 0px)
    var(--module-safe-left, 0px);
  touch-action: none;
}
</style>
