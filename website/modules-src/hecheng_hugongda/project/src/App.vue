<template>
  <div class="game-container" :class="{ 'game-container--embedded': embeddedHostRuntime }">
    <div class="game-shell" ref="gameShell">
      <header class="game-header panel" ref="gameHeader">
        <div class="header-row">
          <div class="header-title">
            <p class="eyebrow">校园合成赛</p>
            <h1>合成湖工大</h1>
          </div>
          <div class="header-actions">
            <button class="chip-btn" type="button" @click="toggleHistory">记录</button>
            <button class="chip-btn chip-btn--accent" type="button" @click="toggleLeaderboard">
              排行榜
            </button>
            <div class="score-pill">
              <span class="score-label">得分</span>
              <span class="score-value">{{ score }}</span>
            </div>
          </div>
        </div>
        <p class="subtitle">结算后自动上传成绩，可查看班级榜、全校榜和班级总分榜。</p>
        <div class="header-meta">
          <span>{{ rankHintText }}</span>
          <span v-if="rankSummaryText">{{ rankSummaryText }}</span>
        </div>
      </header>

      <section class="game-area" ref="gameArea">
        <div
          class="game-stage-viewport"
          :style="{ width: stageViewportWidth + 'px', height: stageViewportHeight + 'px' }"
        >
          <div
            class="game-stage-scale"
            :style="{
              width: canvasWidth + 'px',
              height: canvasHeight + 'px',
              transform: `scale(${stageScale})`
            }"
          >
            <div
              class="game-canvas-wrapper"
              :style="{ width: canvasWidth + 'px', height: canvasHeight + 'px' }"
            >
              <canvas
                ref="gameCanvas"
                class="game-canvas"
                :width="canvasWidth"
                :height="canvasHeight"
                @mousedown="handleInputStart"
                @mousemove="handleInputMove"
                @mouseup="handleInputEnd"
                @mouseleave="handleInputEnd"
                @touchstart="handleInputStart"
                @touchmove="handleInputMove"
                @touchend="handleInputEnd"
              ></canvas>

              <div class="guide-line" :style="{ left: dropX + 'px' }" v-if="isDragging || !isMobile"></div>

              <div
                class="current-ball"
                v-if="!hasDropped"
                :style="{
                  left: dropX - schools[nextBallLevel].radius + 'px',
                  top: '20px',
                  width: schools[nextBallLevel].radius * 2 + 'px',
                  height: schools[nextBallLevel].radius * 2 + 'px'
                }"
              >
                <img
                  :src="resolveLogoPath(schools[nextBallLevel].image)"
                  :alt="schools[nextBallLevel].short"
                  class="ball-img"
                />
              </div>

              <div class="next-preview panel panel--compact">
                <span>下个登场</span>
                <div class="preview-circle">
                  <img
                    :src="resolveLogoPath(schools[previewBallLevel].image)"
                    :alt="schools[previewBallLevel].short"
                    class="preview-img"
                  />
                </div>
              </div>

              <div v-if="rankSubmitBusy" class="sync-status">正在同步排行榜成绩...</div>
              <button
                v-else-if="rankSubmitError && (gameOver || hasWon)"
                class="sync-status sync-status--error"
                type="button"
                @click="retryRankSubmit"
              >
                上传失败，点此重试
              </button>

              <div class="drama-toast" :class="{ show: showToast }">
                <div class="drama-content">
                  <span class="drama-text">{{ toastMessage }}</span>
                </div>
              </div>

              <div v-if="gameOver" class="overlay glass-overlay">
                <h2>挑战结束</h2>
                <p class="final-score">最终得分 {{ score }}</p>
                <p class="message">场上已经没有安全落点了。</p>
                <p v-if="rankSummaryText" class="overlay-subtext">{{ rankSummaryText }}</p>
                <div class="overlay-btns">
                  <button class="restart-btn" type="button" @click="forceRestart">再来一局</button>
                  <button class="secondary-btn" type="button" @click="toggleLeaderboard">查看排行榜</button>
                </div>
              </div>

              <div v-if="hasWon" class="overlay glass-overlay win">
                <h2>成功合成湖工大</h2>
                <p class="message">本局已自动记录，你可以直接查看排名。</p>
                <p class="final-score">最终得分 {{ score }}</p>
                <p v-if="rankSummaryText" class="overlay-subtext">{{ rankSummaryText }}</p>
                <div class="overlay-btns">
                  <button class="restart-btn" type="button" @click="forceRestart">继续挑战</button>
                  <button class="secondary-btn" type="button" @click="toggleLeaderboard">查看排行榜</button>
                </div>
              </div>

              <div v-if="showHistory" class="overlay glass-overlay sheet-overlay">
                <div class="sheet-panel">
                  <div class="sheet-header">
                    <div>
                      <p class="sheet-eyebrow">本地</p>
                      <h3>历史战绩</h3>
                    </div>
                    <button class="close-btn" type="button" @click="toggleHistory">×</button>
                  </div>
                  <div class="sheet-body history-list">
                    <div v-if="historyRecords.length === 0" class="sheet-empty">暂无记录，先完成一局。</div>
                    <div v-else class="history-item" v-for="(record, idx) in historyRecords" :key="idx">
                      <div class="history-info">
                        <span class="history-date">{{ formatDate(record.date) }}</span>
                        <strong>得分 {{ record.score }}</strong>
                      </div>
                      <div class="history-badge">
                        <img :src="resolveLogoPath(schools[record.maxLevel].image)" class="badge-img" />
                        <span>{{ schools[record.maxLevel].short }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="sheet-footer">
                    <button
                      v-if="historyRecords.length > 0"
                      class="ghost-btn"
                      type="button"
                      @click="clearHistory"
                    >
                      清空记录
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="showLeaderboard" class="overlay glass-overlay sheet-overlay">
                <div class="sheet-panel sheet-panel--wide">
                  <div class="sheet-header">
                    <div>
                      <p class="sheet-eyebrow">云端</p>
                      <h3>排行榜</h3>
                    </div>
                    <button class="close-btn" type="button" @click="toggleLeaderboard">×</button>
                  </div>

                  <div class="sheet-body">
                    <div class="leaderboard-meta">
                      <span>{{ rankEnabled ? '结算后自动上传最新成绩' : '当前未注入学号，无法上传排行榜' }}</span>
                      <span v-if="leaderboardUpdatedAt">更新于 {{ formatDateTime(leaderboardUpdatedAt) }}</span>
                    </div>

                    <div class="scope-tabs">
                      <button
                        v-for="scope in resolvedScopes"
                        :key="scope.value"
                        class="scope-tab"
                        :class="{ active: leaderboardScope === scope.value, disabled: scope.disabled }"
                        :disabled="scope.disabled"
                        type="button"
                        @click="selectLeaderboardScope(scope.value)"
                      >
                        {{ scope.label }}
                      </button>
                    </div>

                    <div v-if="leaderboardPlayer" class="leaderboard-self">
                      <div class="leaderboard-self__title">我的最好成绩</div>
                      <div class="leaderboard-self__stats">
                        <span>得分 {{ leaderboardPlayer.score }}</span>
                        <span>最高 {{ schools[leaderboardPlayer.max_level]?.short || '未命名' }}</span>
                        <span v-if="leaderboardPlayer.class_rank">班级第 {{ leaderboardPlayer.class_rank }}</span>
                        <span v-if="leaderboardPlayer.school_rank">全校第 {{ leaderboardPlayer.school_rank }}</span>
                        <span v-if="leaderboardPlayer.class_total_rank">
                          班级总分第 {{ leaderboardPlayer.class_total_rank }}
                        </span>
                      </div>
                    </div>

                    <div v-if="leaderboardLoading" class="sheet-empty">正在加载排行榜...</div>
                    <div v-else-if="leaderboardError" class="sheet-empty sheet-empty--error">
                      {{ leaderboardError }}
                    </div>
                    <div v-else-if="leaderboardItems.length === 0" class="sheet-empty">暂无上榜数据。</div>
                    <div v-else class="leaderboard-list">
                      <div
                        class="leaderboard-item"
                        :class="leaderboardItemClasses(item)"
                        v-for="item in leaderboardItems"
                        :key="leaderboardItemKey(item)"
                      >
                        <div class="leaderboard-rank" :class="leaderboardRankClasses(item)">#{{ item.rank }}</div>
                        <div class="leaderboard-main">
                          <template v-if="leaderboardScope === 'class_total'">
                            <strong>{{ item.class_name }}</strong>
                            <span>{{ item.player_count }} 人 · 平均 {{ item.avg_score }}</span>
                          </template>
                          <template v-else>
                            <strong>{{ item.player_name || item.student_id }}</strong>
                            <span>{{ item.class_name || '未绑定班级' }}</span>
                          </template>
                        </div>
                        <div class="leaderboard-side">
                          <template v-if="leaderboardScope === 'class_total'">
                            <strong>{{ item.total_score }}</strong>
                            <span>总分</span>
                          </template>
                          <template v-else>
                            <strong>{{ item.score }}</strong>
                            <span>
                              {{ schools[item.max_level]?.short || '未命名' }}
                              · {{ formatDuration(item.duration_ms) }}
                            </span>
                          </template>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="sheet-footer">
                    <button class="ghost-btn" type="button" @click="loadLeaderboard(leaderboardScope)">
                      刷新
                    </button>
                    <button
                      v-if="rankSubmitError && (gameOver || hasWon)"
                      class="ghost-btn ghost-btn--warn"
                      type="button"
                      @click="retryRankSubmit"
                    >
                      重试上传
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer class="legend-panel panel" ref="legendPanel">
        <div class="legend-scroll">
          <div
            v-for="(school, index) in schools"
            :key="index"
            class="legend-item"
            :class="{ 'current-target': index === schools.length - 1 }"
          >
            <div class="legend-icon">
              <img :src="resolveLogoPath(school.image)" :alt="school.short" />
            </div>
            <span class="legend-name">{{ school.short }}</span>
          </div>
        </div>
      </footer>
    </div>
  </div>
</template>

<script>
import Matter from 'matter-js'
import {
  canUseGameRank,
  createRunId,
  fetchGameLeaderboard,
  readGameModuleContext,
  submitGameRank
} from './utils/game_rank'

const MODULE_LOGO_BASE = `${import.meta.env.BASE_URL || '/'}logos/`
const REFERENCE_STAGE_WIDTH = 360
const REFERENCE_STAGE_HEIGHT = 600
const LOGICAL_STAGE_WIDTH = 320
const LOGICAL_STAGE_HEIGHT = Math.round((LOGICAL_STAGE_WIDTH / REFERENCE_STAGE_WIDTH) * REFERENCE_STAGE_HEIGHT)
const MODULE_HOST_BRIDGE_TYPE = 'mini-hbut:module-size'

const resolveModuleRuntimeVersion = () => {
  if (typeof window === 'undefined') return ''
  const href = String(window.location.href || '')
  const pathname = String(window.location.pathname || '')
  const patterns = [
    /\/module_bundle\/content\/[^/]+\/[^/]+\/([^/]+)\//i,
    /\/modules\/[^/]+\/[^/]+\/([^/]+)\//i
  ]
  for (const source of [href, pathname]) {
    for (const pattern of patterns) {
      const matched = source.match(pattern)
      if (matched?.[1]) {
        return String(matched[1]).trim()
      }
    }
  }
  return ''
}

export default {
  name: 'App',
  data() {
    const rankContext = readGameModuleContext()
    return {
      canvasWidth: LOGICAL_STAGE_WIDTH,
      canvasHeight: LOGICAL_STAGE_HEIGHT,
      stageScale: 1,
      stageViewportWidth: LOGICAL_STAGE_WIDTH,
      stageViewportHeight: LOGICAL_STAGE_HEIGHT,
      dropX: LOGICAL_STAGE_WIDTH / 2,
      score: 0,
      gameOver: false,
      hasWon: false,
      nextBallLevel: 0,
      previewBallLevel: 0,
      isDragging: false,
      hasDropped: false,
      isMobile: false,
      showHistory: false,
      showLeaderboard: false,
      historyRecords: [],
      particles: [],
      rankContext,
      availableScopes: [
        { value: 'class', label: '班级榜', requiresClass: true },
        { value: 'school', label: '全校榜' },
        { value: 'class_total', label: '班级总分榜', requiresClass: true }
      ],
      leaderboardScope: rankContext.className ? 'class' : 'school',
      leaderboardItems: [],
      leaderboardPlayer: null,
      leaderboardLoading: false,
      leaderboardError: '',
      leaderboardUpdatedAt: '',
      rankSubmitBusy: false,
      rankSubmitError: '',
      lastRankSubmission: null,
      currentRunId: '',
      gameStartedAt: 0,
      moveCount: 0,
      bestLevelReached: 0,
      hasSubmittedResult: false,

      toastMessage: '',
      showToast: false,
      toastTimer: null,
      autoSaveInterval: null,
      gameOverWatcher: null,
      embeddedHostRuntime: false,
      embeddedLayoutObserver: null,
      embeddedLayoutRaf: 0,
      hostResizeObserver: null,
      hostLayoutSyncTimer: null,
      hostLayoutSyncRaf: 0,
      hostLayoutStabilizeRaf: 0,
      moduleBuildVersion: resolveModuleRuntimeVersion(),
      dramaScripts: {
        0: ['起步稳住', '热身完成', '场子开了'],
        1: ['节奏起来了', '继续往上合', '这局能成'],
        2: ['开始有点强度', '节奏不错', '继续稳一手'],
        3: ['中盘成型', '别急着乱丢', '准备冲高分'],
        4: ['上半场很稳', '局面已经打开', '离目标更近了'],
        5: ['高分段开始', '别给自己留死角', '这局值得继续'],
        6: ['强度上来了', '继续压住节奏', '全校榜有机会'],
        7: ['离终点不远', '保持耐心', '再稳几步'],
        8: ['就差最后一口气', '冲一把湖工大', '这一局已经够硬'],
        9: ['湖工大合成成功', '本局可以上榜了', '这把很完整']
      },

      engine: null,
      render: null,
      runner: null,

      deathLineY: 120,
      schoolImages: {},
      schools: [
        { name: '清华大学', short: '清华', radius: 20, color: '#9d6c42', score: 1, image: 'qinghua.png' },
        { name: '北京大学', short: '北大', radius: 28, color: '#b55f45', score: 2, image: 'beida.png' },
        { name: '复旦大学', short: '复旦', radius: 36, color: '#c97f38', score: 4, image: 'fudan.png' },
        { name: '浙江大学', short: '浙大', radius: 44, color: '#d9a83d', score: 8, image: 'zheda.png' },
        { name: '上海交通大学', short: '上交', radius: 52, color: '#6b9a74', score: 16, image: 'shangjiao.png' },
        { name: '中国科学技术大学', short: '中科大', radius: 60, color: '#4f8c7f', score: 32, image: 'zhongkeda.png' },
        { name: '南京大学', short: '南大', radius: 66, color: '#517b95', score: 64, image: 'nanda.png' },
        { name: '武汉大学', short: '武大', radius: 72, color: '#5567a1', score: 128, image: 'wuda.png' },
        { name: '华中科技大学', short: '华科', radius: 78, color: '#7b6a9a', score: 256, image: 'huake.png' },
        { name: '湖北工业大学', short: '湖工大', radius: 85, color: '#d0a34b', score: 512, image: 'hugongda.png' }
      ]
    }
  },
  computed: {
    rankEnabled() {
      return canUseGameRank(this.rankContext)
    },
    hasClassContext() {
      return !!this.rankContext.className
    },
    resolvedScopes() {
      return this.availableScopes.map((scope) => ({
        ...scope,
        disabled: !!scope.requiresClass && !this.hasClassContext
      }))
    },
    rankSummaryText() {
      const player = this.lastRankSubmission || this.leaderboardPlayer
      if (!player) return ''
      const parts = []
      if (player.class_rank) parts.push(`班级第 ${player.class_rank}`)
      if (player.school_rank) parts.push(`全校第 ${player.school_rank}`)
      if (player.class_total_rank) parts.push(`班级总分第 ${player.class_total_rank}`)
      return parts.join(' · ')
    },
    rankHintText() {
      if (!this.rankEnabled) return '当前未注入学号，排行榜会保持关闭。'
      if (this.rankSubmitBusy) return '本局结束后正在同步成绩。'
      if (this.rankSubmitError) return `成绩上传失败：${this.rankSubmitError}`
      if (!this.hasClassContext) return '当前未注入班级信息，排行榜默认显示全校榜。'
      return '本局结束后会自动上传最佳成绩。'
    }
  },
  watch: {
    showHistory() {
      this.scheduleHostLayoutSync()
    },
    showLeaderboard() {
      this.scheduleHostLayoutSync()
    },
    gameOver() {
      this.scheduleHostLayoutSync()
    },
    hasWon() {
      this.scheduleHostLayoutSync()
    },
    rankSubmitBusy() {
      this.scheduleHostLayoutSync()
    },
    rankSubmitError() {
      this.scheduleHostLayoutSync()
    },
    leaderboardLoading() {
      this.scheduleHostLayoutSync()
    },
    leaderboardError() {
      this.scheduleHostLayoutSync()
    }
  },
  mounted() {
    this.checkMobile()
    this.embeddedHostRuntime = this.isEmbeddedHostRuntime()
    window.addEventListener('resize', this.handleResize)
    window.addEventListener('beforeunload', this.saveGame)
    this.initDimensions()
    this.initHostLayoutBridge()
    this.initEmbeddedLayoutBridge()
    this.loadHistory()
    this.loadImages().then(() => {
      this.$nextTick(() => {
        this.initDimensions()
      })
      this.initGame()
      this.scheduleHostLayoutSync()
      if (this.rankEnabled) {
        void this.loadLeaderboard(this.leaderboardScope, { silent: true })
      }
    })
    this.scheduleHostLayoutSync()
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize)
    window.removeEventListener('beforeunload', this.saveGame)
    if (this.autoSaveInterval) clearInterval(this.autoSaveInterval)
    if (this.gameOverWatcher) clearInterval(this.gameOverWatcher)
    if (this.toastTimer) clearTimeout(this.toastTimer)
    if (this.hostLayoutSyncTimer) clearTimeout(this.hostLayoutSyncTimer)
    if (this.hostLayoutSyncRaf) {
      cancelAnimationFrame(this.hostLayoutSyncRaf)
      this.hostLayoutSyncRaf = 0
    }
    if (this.hostLayoutStabilizeRaf) {
      cancelAnimationFrame(this.hostLayoutStabilizeRaf)
      this.hostLayoutStabilizeRaf = 0
    }
    if (this.hostResizeObserver) {
      this.hostResizeObserver.disconnect()
      this.hostResizeObserver = null
    }
    if (this.embeddedLayoutObserver) {
      this.embeddedLayoutObserver.disconnect()
      this.embeddedLayoutObserver = null
    }
    if (this.embeddedLayoutRaf) {
      cancelAnimationFrame(this.embeddedLayoutRaf)
      this.embeddedLayoutRaf = 0
    }
    this.saveGame()
    this.stopGame()
  },
  methods: {
    initEmbeddedLayoutBridge() {
      if (!this.embeddedHostRuntime || typeof ResizeObserver !== 'function') return
      const targets = [this.$refs.gameHeader, this.$refs.legendPanel].filter(
        (target) => target instanceof HTMLElement
      )
      if (!targets.length) return
      this.embeddedLayoutObserver = new ResizeObserver(() => {
        if (this.embeddedLayoutRaf) return
        this.embeddedLayoutRaf = window.requestAnimationFrame(() => {
          this.embeddedLayoutRaf = 0
          this.initDimensions()
          this.scheduleHostLayoutSync()
        })
      })
      targets.forEach((target) => this.embeddedLayoutObserver.observe(target))
    },

    initHostLayoutBridge() {
      if (typeof window === 'undefined' || window.parent === window) return
      const observedTarget = this.$el instanceof HTMLElement ? this.$el : this.$refs.gameShell
      if (typeof ResizeObserver === 'function' && observedTarget instanceof HTMLElement) {
        this.hostResizeObserver = new ResizeObserver(() => {
          this.scheduleHostLayoutSync()
        })
        this.hostResizeObserver.observe(observedTarget)
      }
    },

    scheduleHostLayoutSync() {
      if (typeof window === 'undefined' || window.parent === window) return
      if (this.hostLayoutSyncTimer) {
        clearTimeout(this.hostLayoutSyncTimer)
        this.hostLayoutSyncTimer = null
      }
      if (this.hostLayoutSyncRaf) {
        cancelAnimationFrame(this.hostLayoutSyncRaf)
        this.hostLayoutSyncRaf = 0
      }
      if (this.hostLayoutStabilizeRaf) {
        cancelAnimationFrame(this.hostLayoutStabilizeRaf)
        this.hostLayoutStabilizeRaf = 0
      }
      this.hostLayoutSyncRaf = window.requestAnimationFrame(() => {
        this.hostLayoutSyncRaf = 0
        this.hostLayoutStabilizeRaf = window.requestAnimationFrame(() => {
          this.hostLayoutStabilizeRaf = 0
          this.notifyHostLayout()
        })
      })
      this.hostLayoutSyncTimer = window.setTimeout(() => {
        this.hostLayoutSyncTimer = null
        this.notifyHostLayout()
      }, 180)
    },

    notifyHostLayout() {
      if (typeof window === 'undefined' || window.parent === window) return
      const root = this.$el instanceof HTMLElement ? this.$el : null
      const docEl = document.documentElement
      const body = document.body
      const nextHeight = Math.max(
        1,
        Math.ceil(
          Math.max(
            Number(root?.scrollHeight || 0),
            Number(root?.offsetHeight || 0),
            Number(root?.getBoundingClientRect?.().height || 0),
            Number(docEl?.scrollHeight || 0),
            Number(docEl?.offsetHeight || 0),
            Number(body?.scrollHeight || 0),
            Number(body?.offsetHeight || 0)
          )
        )
      )
      window.parent.postMessage(
        {
          type: MODULE_HOST_BRIDGE_TYPE,
          moduleId: 'hecheng_hugongda',
          module_id: 'hecheng_hugongda',
          version: this.moduleBuildVersion,
          height: nextHeight
        },
        '*'
      )
    },

    resolveLogoPath(fileName) {
      return `${MODULE_LOGO_BASE}${fileName}`
    },

    checkMobile() {
      this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      )
    },

    isEmbeddedHostRuntime() {
      return typeof window !== 'undefined' && window.parent !== window
    },

    initDimensions() {
      const fallbackWidth = Math.max(280, window.innerWidth - 20)
      const areaWidth = this.$refs.gameArea?.clientWidth || fallbackWidth
      const nextViewportWidth = Math.max(280, Math.min(areaWidth, LOGICAL_STAGE_WIDTH))
      const nextScale = nextViewportWidth / LOGICAL_STAGE_WIDTH

      this.canvasWidth = LOGICAL_STAGE_WIDTH
      this.canvasHeight = LOGICAL_STAGE_HEIGHT
      this.stageScale = Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1
      this.stageViewportWidth = Math.round(this.canvasWidth * this.stageScale)
      this.stageViewportHeight = Math.round(this.canvasHeight * this.stageScale)
      const radius = this.schools[this.nextBallLevel]?.radius || 0
      this.dropX = Math.max(radius, Math.min(this.canvasWidth - radius, this.dropX || this.canvasWidth / 2))
      this.deathLineY = 120
      this.scheduleHostLayoutSync()
    },

    buildBallBodyOptions(level, { angle = 0 } = {}) {
      const isCompactStage = this.canvasWidth <= 320
      return {
        restitution: isCompactStage ? 0.05 : 0.12,
        friction: isCompactStage ? 0.26 : 0.16,
        frictionStatic: isCompactStage ? 0.44 : 0.28,
        frictionAir: isCompactStage ? 0.028 : 0.016,
        sleepThreshold: isCompactStage ? 25 : 35,
        angle,
        label: `ball_${level}`,
        render: {
          fillStyle: 'transparent',
          strokeStyle: 'transparent'
        }
      }
    },

    handleResize() {
      this.checkMobile()
      this.initDimensions()
      this.scheduleHostLayoutSync()
    },

    async loadImages() {
      const promises = this.schools.map((school, index) => {
        return new Promise((resolve) => {
          const img = new Image()
          img.onload = () => {
            this.schoolImages[index] = img
            resolve()
          }
          img.onerror = () => {
            this.schoolImages[index] = null
            resolve()
          }
          img.src = this.resolveLogoPath(school.image)
        })
      })
      await Promise.all(promises)
    },

    stopGame() {
      if (this.gameOverWatcher) {
        clearInterval(this.gameOverWatcher)
        this.gameOverWatcher = null
      }
      if (this.render) {
        Matter.Render.stop(this.render)
      }
      if (this.runner) {
        Matter.Runner.stop(this.runner)
      }
      if (this.engine) {
        Matter.Engine.clear(this.engine)
      }
      this.render = null
      this.runner = null
      this.engine = null
    },

    resetRunState() {
      this.currentRunId = createRunId()
      this.gameStartedAt = Date.now()
      this.moveCount = 0
      this.bestLevelReached = 0
      this.hasSubmittedResult = false
      this.rankSubmitBusy = false
      this.rankSubmitError = ''
      this.lastRankSubmission = null
    },

    initGame() {
      const Engine = Matter.Engine
      const Render = Matter.Render
      const World = Matter.World
      const Bodies = Matter.Bodies
      const Events = Matter.Events
      const Runner = Matter.Runner

      this.engine = Engine.create({ enableSleeping: true })
      this.engine.world.gravity.y = 1.2

      this.render = Render.create({
        canvas: this.$refs.gameCanvas,
        engine: this.engine,
        options: {
          width: this.canvasWidth,
          height: this.canvasHeight,
          wireframes: false,
          background: 'transparent',
          pixelRatio: window.devicePixelRatio
        }
      })

      const wallThick = 60
      const wallOptions = {
        isStatic: true,
        render: { fillStyle: '#00000010' },
        friction: 0.32,
        restitution: 0.03
      }

      const walls = [
        Bodies.rectangle(this.canvasWidth / 2, this.canvasHeight + wallThick / 2, this.canvasWidth, wallThick, wallOptions),
        Bodies.rectangle(-wallThick / 2, this.canvasHeight / 2, wallThick, this.canvasHeight * 2, wallOptions),
        Bodies.rectangle(
          this.canvasWidth + wallThick / 2,
          this.canvasHeight / 2,
          wallThick,
          this.canvasHeight * 2,
          wallOptions
        )
      ]
      World.add(this.engine.world, walls)

      Events.on(this.engine, 'collisionStart', this.handleCollision)
      Events.on(this.render, 'afterRender', this.drawOverlay)

      const loadSuccess = this.loadGame()
      if (!loadSuccess) {
        this.resetRunState()
        this.score = 0
        this.gameOver = false
        this.hasWon = false
        this.hasDropped = false
        this.nextBallLevel = this.getRandomBallLevel()
        this.previewBallLevel = this.getRandomBallLevel()
      }

      Render.run(this.render)
      this.runner = Runner.create()
      Runner.run(this.runner, this.engine)

      this.startGameOverWatcher()
      if (this.autoSaveInterval) clearInterval(this.autoSaveInterval)
      this.autoSaveInterval = setInterval(this.saveGame, 5000)
    },

    saveGame() {
      if (!this.engine || !this.engine.world) return
      if (this.gameOver || this.hasWon) {
        localStorage.removeItem('hbut_current_save')
        return
      }

      const bodies = Matter.Composite.allBodies(this.engine.world)
      const gameBodies = bodies
        .filter((body) => body.schoolLevel !== undefined && !body.isRemoved)
        .map((body) => ({
          x: body.position.x,
          y: body.position.y,
          level: body.schoolLevel,
          angle: body.angle
        }))

      const saveData = {
        score: this.score,
        nextBallLevel: this.nextBallLevel,
        previewBallLevel: this.previewBallLevel,
        bodies: gameBodies,
        timestamp: Date.now(),
        currentRunId: this.currentRunId,
        gameStartedAt: this.gameStartedAt,
        moveCount: this.moveCount,
        bestLevelReached: this.bestLevelReached,
        hasSubmittedResult: this.hasSubmittedResult
      }

      localStorage.setItem('hbut_current_save', JSON.stringify(saveData))
    },

    loadGame() {
      try {
        const raw = localStorage.getItem('hbut_current_save')
        if (!raw) return false
        const data = JSON.parse(raw)
        this.score = Number(data.score || 0)
        this.nextBallLevel = Number(data.nextBallLevel || 0)
        this.previewBallLevel = Number(data.previewBallLevel || 0)
        this.currentRunId = String(data.currentRunId || createRunId())
        this.gameStartedAt = Number(data.gameStartedAt || Date.now())
        this.moveCount = Number(data.moveCount || 0)
        this.bestLevelReached = Number(data.bestLevelReached || 0)
        this.hasSubmittedResult = !!data.hasSubmittedResult
        this.rankSubmitBusy = false
        this.rankSubmitError = ''
        this.lastRankSubmission = null
        this.gameOver = false
        this.hasWon = false
        this.hasDropped = false

        if (Array.isArray(data.bodies)) {
          data.bodies.forEach((item) => {
            const school = this.schools[item.level]
            if (!school) return
            const ball = Matter.Bodies.circle(
              item.x,
              item.y,
              school.radius,
              this.buildBallBodyOptions(item.level, { angle: item.angle || 0 })
            )
            ball.schoolLevel = item.level
            ball.dropTime = Date.now()
            Matter.World.add(this.engine.world, ball)
          })
        }
        return true
      } catch (error) {
        console.error('Failed to load game', error)
        localStorage.removeItem('hbut_current_save')
        return false
      }
    },

    computeCurrentMaxLevel() {
      if (this.hasWon) return this.schools.length - 1
      let maxLevel = Number(this.bestLevelReached || 0)
      if (this.engine && this.engine.world) {
        const bodies = Matter.Composite.allBodies(this.engine.world)
        bodies.forEach((body) => {
          if (body.schoolLevel !== undefined && !body.isRemoved) {
            maxLevel = Math.max(maxLevel, Number(body.schoolLevel || 0))
          }
        })
      }
      return maxLevel
    },

    saveToHistory() {
      const record = {
        date: Date.now(),
        score: this.score,
        maxLevel: this.computeCurrentMaxLevel()
      }
      this.historyRecords.unshift(record)
      if (this.historyRecords.length > 20) {
        this.historyRecords = this.historyRecords.slice(0, 20)
      }
      localStorage.setItem('hbut_history', JSON.stringify(this.historyRecords))
      localStorage.removeItem('hbut_current_save')
    },

    loadHistory() {
      try {
        const raw = localStorage.getItem('hbut_history')
        if (raw) {
          this.historyRecords = JSON.parse(raw)
        }
      } catch (error) {
        console.error('Failed to load history', error)
      }
    },

    toggleHistory() {
      this.showHistory = !this.showHistory
      if (this.showHistory) this.showLeaderboard = false
      this.scheduleHostLayoutSync()
    },

    clearHistory() {
      if (window.confirm('确定要清空历史记录吗？')) {
        this.historyRecords = []
        localStorage.removeItem('hbut_history')
        this.scheduleHostLayoutSync()
      }
    },

    formatDate(ts) {
      const d = new Date(ts)
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d
        .getMinutes()
        .toString()
        .padStart(2, '0')}`
    },

    formatDateTime(value) {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return value || ''
      return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date
        .getMinutes()
        .toString()
        .padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
    },

    formatDuration(durationMs) {
      const totalSeconds = Math.max(0, Math.floor((Number(durationMs) || 0) / 1000))
      if (!totalSeconds) return '未计时'
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      return `${minutes}:${String(seconds).padStart(2, '0')}`
    },

    leaderboardItemKey(item) {
      return `${this.leaderboardScope}:${item.student_id || item.class_name || item.rank}`
    },

    leaderboardItemClasses(item) {
      const rank = Number(item?.rank || 0)
      return {
        'leaderboard-item--self': !!item?.is_self,
        'leaderboard-item--top1': rank === 1,
        'leaderboard-item--top2': rank === 2,
        'leaderboard-item--top3': rank === 3
      }
    },

    leaderboardRankClasses(item) {
      const rank = Number(item?.rank || 0)
      return {
        'leaderboard-rank--top1': rank === 1,
        'leaderboard-rank--top2': rank === 2,
        'leaderboard-rank--top3': rank === 3
      }
    },

    resolveLeaderboardScope(scope) {
      const nextScope = String(scope || '').trim() || 'class'
      if (!this.hasClassContext && (nextScope === 'class' || nextScope === 'class_total')) {
        return 'school'
      }
      if (nextScope === 'class' || nextScope === 'school' || nextScope === 'class_total') {
        return nextScope
      }
      return this.hasClassContext ? 'class' : 'school'
    },

    buildLeaderboardErrorMessage(error, scope) {
      const message = error?.message || '排行榜加载失败'
      if (!this.hasClassContext && (scope === 'class' || scope === 'class_total' || /class_name/i.test(message))) {
        return '当前未注入班级信息，班级榜暂不可用，已自动切换为全校榜。'
      }
      if (/class_name/i.test(message)) {
        return '排行榜缺少班级信息，请重新进入模块后再试。'
      }
      return message
    },

    toggleLeaderboard() {
      this.showLeaderboard = !this.showLeaderboard
      if (this.showLeaderboard) {
        this.showHistory = false
        void this.loadLeaderboard(this.resolveLeaderboardScope(this.leaderboardScope))
      }
      this.scheduleHostLayoutSync()
    },

    selectLeaderboardScope(scope) {
      const nextScope = this.resolveLeaderboardScope(scope)
      if (nextScope === this.leaderboardScope && this.leaderboardItems.length > 0) return
      void this.loadLeaderboard(nextScope)
    },

    async loadLeaderboard(scope = 'class', { silent = false } = {}) {
      const resolvedScope = this.resolveLeaderboardScope(scope)
      this.leaderboardScope = resolvedScope
      if (!this.rankEnabled) {
        this.leaderboardError = '当前没有登录信息，无法读取排行榜。'
        this.leaderboardItems = []
        return
      }
      if (!silent) {
        this.leaderboardLoading = true
      }
      this.leaderboardError = ''
      try {
        const response = await fetchGameLeaderboard(this.rankContext, {
          scope: resolvedScope,
          studentId: this.rankContext.studentId,
          className: this.rankContext.className,
          schoolName: this.rankContext.schoolName,
          limit: 20
        })
        this.leaderboardItems = Array.isArray(response.leaderboard) ? response.leaderboard : []
        this.leaderboardPlayer = response.player || this.lastRankSubmission || null
        this.leaderboardUpdatedAt = response.refreshed_at || ''
      } catch (error) {
        this.leaderboardItems = []
        this.leaderboardError = this.buildLeaderboardErrorMessage(error, resolvedScope)
      } finally {
        this.leaderboardLoading = false
        this.$nextTick(() => {
          this.initDimensions()
          this.scheduleHostLayoutSync()
        })
      }
    },

    async finalizeRankSubmission(endedReason) {
      if (!this.rankEnabled || this.rankSubmitBusy || this.hasSubmittedResult) return
      this.rankSubmitBusy = true
      this.rankSubmitError = ''
      try {
        const result = await submitGameRank(this.rankContext, {
          runId: this.currentRunId,
          score: this.score,
          maxLevel: this.computeCurrentMaxLevel(),
          durationMs: Math.max(0, Date.now() - Number(this.gameStartedAt || Date.now())),
          moveCount: this.moveCount,
          endedReason,
          extra: {
            source: 'mini-hbut-module',
            is_mobile: this.isMobile,
            from: this.rankContext.from || '',
            runtime: this.rankContext.runtime || ''
          }
        })
        this.lastRankSubmission = result?.player || null
        this.leaderboardPlayer = result?.player || this.leaderboardPlayer
        this.hasSubmittedResult = true
        if (this.showLeaderboard) {
          await this.loadLeaderboard(this.leaderboardScope, { silent: true })
        }
      } catch (error) {
        this.rankSubmitError = error?.message || '排行榜上传失败'
        this.hasSubmittedResult = false
      } finally {
        this.rankSubmitBusy = false
      }
    },

    retryRankSubmit() {
      if (this.hasWon) {
        void this.finalizeRankSubmission('cleared')
      } else if (this.gameOver) {
        void this.finalizeRankSubmission('failed')
      }
    },

    forceRestart() {
      if (this.autoSaveInterval) clearInterval(this.autoSaveInterval)
      localStorage.removeItem('hbut_current_save')
      this.restartGame()
      this.scheduleHostLayoutSync()
    },

    getRandomBallLevel() {
      return Math.floor(Math.random() * 4)
    },

    getEventX(event) {
      const rect = this.$refs.gameCanvas.getBoundingClientRect()
      const clientX = event.touches ? event.touches[0].clientX : event.clientX
      if (!rect.width) return clientX - rect.left
      return ((clientX - rect.left) / rect.width) * this.canvasWidth
    },

    handleInputStart(event) {
      if (this.gameOver || this.hasWon || this.hasDropped) return
      event.preventDefault()
      this.isDragging = true
      this.updateDropX(this.getEventX(event))
    },

    handleInputMove(event) {
      if (event.type === 'mousemove') {
        event.preventDefault()
        this.updateDropX(this.getEventX(event))
        return
      }
      if (!this.isDragging) return
      event.preventDefault()
      this.updateDropX(this.getEventX(event))
    },

    handleInputEnd(event) {
      if (event?.type === 'mouseleave' && !this.isDragging) return
      if (event && (event.type === 'mouseup' || event.type === 'mouseleave' || this.isDragging)) {
        event.preventDefault()
      }
      if (!this.isDragging) return
      this.isDragging = false
      this.dropBall()
    },

    updateDropX(x) {
      const radius = this.schools[this.nextBallLevel].radius
      this.dropX = Math.max(radius, Math.min(this.canvasWidth - radius, x))
    },

    dropBall() {
      if (this.hasDropped || this.gameOver || this.hasWon) return
      this.hasDropped = true
      const currentLevel = this.nextBallLevel
      const school = this.schools[currentLevel]

      const ball = Matter.Bodies.circle(
        this.dropX,
        40,
        school.radius,
        this.buildBallBodyOptions(currentLevel)
      )

      ball.schoolLevel = currentLevel
      ball.dropTime = Date.now()
      Matter.World.add(this.engine.world, ball)

      this.moveCount += 1
      this.bestLevelReached = Math.max(this.bestLevelReached, currentLevel)
      this.nextBallLevel = this.previewBallLevel
      this.previewBallLevel = this.getRandomBallLevel()
      this.saveGame()

      setTimeout(() => {
        if (!this.gameOver && !this.hasWon) this.hasDropped = false
      }, 600)
    },

    handleCollision(event) {
      const pairs = event.pairs || []
      pairs.forEach((pair) => {
        const bodyA = pair.bodyA
        const bodyB = pair.bodyB
        if (bodyA.schoolLevel === undefined || bodyB.schoolLevel === undefined) return
        if (bodyA.schoolLevel !== bodyB.schoolLevel) return
        if (bodyA.schoolLevel >= this.schools.length - 1) return
        if (bodyA.isRemoved || bodyB.isRemoved) return

        bodyA.isRemoved = true
        bodyB.isRemoved = true

        const newLevel = bodyA.schoolLevel + 1
        const newSchool = this.schools[newLevel]
        const newX = (bodyA.position.x + bodyB.position.x) / 2
        const newY = (bodyA.position.y + bodyB.position.y) / 2

        Matter.World.remove(this.engine.world, [bodyA, bodyB])

        const newBall = Matter.Bodies.circle(
          newX,
          newY,
          newSchool.radius,
          this.buildBallBodyOptions(newLevel)
        )
        newBall.schoolLevel = newLevel
        newBall.dropTime = Date.now()
        Matter.World.add(this.engine.world, newBall)

        this.score += newSchool.score
        this.bestLevelReached = Math.max(this.bestLevelReached, newLevel)
        this.saveGame()
        this.createMergeEffect(newX, newY, this.schools[newLevel].color)
        this.triggerDrama(newLevel)

        if (newLevel === this.schools.length - 1) {
          this.hasWon = true
          this.saveToHistory()
          void this.finalizeRankSubmission('cleared')
        }
      })
    },

    triggerDrama(level) {
      if (level < 2) return
      const scripts = this.dramaScripts[level]
      if (!scripts || scripts.length === 0) return
      this.toastMessage = scripts[Math.floor(Math.random() * scripts.length)]
      this.showToast = true
      if (this.toastTimer) clearTimeout(this.toastTimer)
      this.toastTimer = setTimeout(() => {
        this.showToast = false
      }, 2600)
    },

    createMergeEffect(x, y, color) {
      for (let index = 0; index < 12; index += 1) {
        const angle = (Math.PI * 2 * index) / 12
        const speed = 2 + Math.random() * 3
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1.0,
          color,
          size: 3 + Math.random() * 3
        })
      }

      const blastRadius = 150
      const blastForce = 0.05
      const bodies = Matter.Composite.allBodies(this.engine.world)
      bodies.forEach((body) => {
        if (body.isStatic || body.schoolLevel === undefined) return
        const dx = body.position.x - x
        const dy = body.position.y - y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < blastRadius && dist > 10) {
          const forceMagnitude = (1 - dist / blastRadius) * blastForce * body.mass
          Matter.Body.applyForce(body, body.position, {
            x: (dx / dist) * forceMagnitude,
            y: (dy / dist) * forceMagnitude
          })
        }
      })
    },

    drawLogoCover(ctx, img, radius) {
      const naturalWidth = Number(img?.naturalWidth || img?.width || 0)
      const naturalHeight = Number(img?.naturalHeight || img?.height || 0)
      if (!naturalWidth || !naturalHeight) {
        ctx.drawImage(img, -radius, -radius, radius * 2, radius * 2)
        return
      }
      const coverScale = Math.max((radius * 2) / naturalWidth, (radius * 2) / naturalHeight)
      const drawWidth = naturalWidth * coverScale
      const drawHeight = naturalHeight * coverScale
      ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
    },

    startGameOverWatcher() {
      if (this.gameOverWatcher) clearInterval(this.gameOverWatcher)
      this.gameOverWatcher = setInterval(() => {
        if (this.gameOver || this.hasWon || !this.engine) return
        const bodies = Matter.Composite.allBodies(this.engine.world)
        const now = Date.now()
        for (const body of bodies) {
          if (body.schoolLevel === undefined || !body.dropTime || body.isRemoved) continue
          if (now - body.dropTime <= 2000) continue
          // 只有圆心越过警戒线且球体基本停稳，才判定失败，避免边缘抖动误杀。
          if (body.position.y >= this.deathLineY) continue
          if (body.speed >= 0.12) continue
          if (Math.abs(Number(body.angularSpeed || 0)) >= 0.08) continue
          this.gameOver = true
          this.saveToHistory()
          void this.finalizeRankSubmission('failed')
          break
        }
      }, 1000)
    },

    restartGame() {
      this.stopGame()
      this.initGame()
    },

    drawOverlay() {
      if (!this.$refs.gameCanvas) return
      const ctx = this.$refs.gameCanvas.getContext('2d')

      for (let index = this.particles.length - 1; index >= 0; index -= 1) {
        const particle = this.particles[index]
        particle.x += particle.vx
        particle.y += particle.vy
        particle.vy += 0.1
        particle.life -= 0.02
        if (particle.life <= 0) {
          this.particles.splice(index, 1)
          continue
        }
        ctx.save()
        ctx.globalAlpha = particle.life
        ctx.fillStyle = particle.color
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      ctx.save()
      ctx.strokeStyle = 'rgba(182, 72, 56, 0.65)'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.moveTo(0, this.deathLineY)
      ctx.lineTo(this.canvasWidth, this.deathLineY)
      ctx.stroke()
      ctx.fillStyle = 'rgba(153, 58, 46, 0.9)'
      ctx.font = '12px Segoe UI'
      ctx.fillText('警戒线', 12, this.deathLineY - 7)
      ctx.restore()

      const bodies = Matter.Composite.allBodies(this.engine.world)
      bodies.forEach((body) => {
        if (body.schoolLevel === undefined || body.isRemoved) return
        const school = this.schools[body.schoolLevel]
        const img = this.schoolImages[body.schoolLevel]
        const x = body.position.x
        const y = body.position.y
        const radius = school.radius

        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(body.angle)

        if (img) {
          ctx.beginPath()
          ctx.arc(0, 0, radius, 0, Math.PI * 2)
          ctx.fillStyle = '#f8f3ea'
          ctx.fill()

          ctx.beginPath()
          ctx.arc(0, 0, radius, 0, Math.PI * 2)
          ctx.clip()
          this.drawLogoCover(ctx, img, radius)

          ctx.strokeStyle = 'rgba(52, 45, 39, 0.12)'
          ctx.lineWidth = 1
          ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, radius, 0, Math.PI * 2)
          ctx.fillStyle = school.color
          ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(school.short, 0, 0)
        }
        ctx.restore()
      })
    }
  }
}
</script>
