/**
 * FlappyGame - 笨鸟先飞游戏核心逻辑
 * 纯 Canvas 2D 实现的 Flappy Bird 风格游戏
 */

// 游戏状态枚举
const STATE = {
  READY: 'ready',
  PLAYING: 'playing',
  GAME_OVER: 'game_over'
}

// 游戏常量
const LOGICAL_WIDTH = 320
const LOGICAL_HEIGHT = 480
const GRAVITY = 0.5
const FLAP_VELOCITY = -8
const PIPE_SPEED = 2.5
const PIPE_WIDTH = 52
const PIPE_GAP_INITIAL = 140
const PIPE_GAP_MIN = 100
const PIPE_SPAWN_INTERVAL = 90 // 帧数间隔
const BIRD_RADIUS = 15
const BIRD_X = 80
const GROUND_HEIGHT = 60

export default class FlappyGame {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')

    // 游戏状态
    this.state = STATE.READY
    this.score = 0
    this.bestScore = parseInt(localStorage.getItem('clumsy_bird_best') || '0', 10)
    this.flapCount = 0
    this.startTime = 0
    this.endTime = 0

    // 小鸟属性
    this.birdY = LOGICAL_HEIGHT / 2
    this.birdVelocity = 0
    this.birdRotation = 0
    this.bobOffset = 0
    this.bobDirection = 1

    // 管道
    this.pipes = []
    this.pipeTimer = 0

    // 动画
    this.animationId = null
    this.frameCount = 0

    // 事件回调
    this.onScoreChange = null
    this.onGameOver = null
    this.onStateChange = null

    // 设置 canvas 尺寸
    this._resize()
    this._bindEvents()
  }

  /** 设置 canvas 尺寸，保持逻辑比例 */
  _resize() {
    const container = this.canvas.parentElement
    if (!container) return

    const containerW = container.clientWidth
    const containerH = container.clientHeight
    const aspect = LOGICAL_WIDTH / LOGICAL_HEIGHT

    let w, h
    if (containerW / containerH < aspect) {
      w = containerW
      h = containerW / aspect
    } else {
      h = containerH
      w = containerH * aspect
    }

    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.canvas.width = LOGICAL_WIDTH
    this.canvas.height = LOGICAL_HEIGHT
    this.scale = w / LOGICAL_WIDTH
  }

  /** 绑定输入事件 */
  _bindEvents() {
    // 点击/触摸
    const handleInput = (e) => {
      e.preventDefault()
      this._handleTap()
    }

    this.canvas.addEventListener('pointerdown', handleInput)
    this.canvas.addEventListener('touchstart', handleInput, { passive: false })

    // 键盘
    this._keyHandler = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        this._handleTap()
      }
    }
    document.addEventListener('keydown', this._keyHandler)

    // 窗口大小变化
    this._resizeHandler = () => this._resize()
    window.addEventListener('resize', this._resizeHandler)
  }

  /** 处理点击/触摸输入 */
  _handleTap() {
    switch (this.state) {
      case STATE.READY:
        this._startGame()
        break
      case STATE.PLAYING:
        this._flap()
        break
      case STATE.GAME_OVER:
        // 游戏结束后点击重新开始
        this._reset()
        break
    }
  }

  /** 开始游戏 */
  _startGame() {
    this.state = STATE.PLAYING
    this.startTime = Date.now()
    this.birdVelocity = FLAP_VELOCITY
    this.flapCount = 1
    this.onStateChange?.(this.state)
  }

  /** 小鸟拍翅膀 */
  _flap() {
    this.birdVelocity = FLAP_VELOCITY
    this.flapCount++
  }

  /** 重置游戏 */
  _reset() {
    this.state = STATE.READY
    this.score = 0
    this.flapCount = 0
    this.birdY = LOGICAL_HEIGHT / 2
    this.birdVelocity = 0
    this.birdRotation = 0
    this.pipes = []
    this.pipeTimer = 0
    this.frameCount = 0
    this.onScoreChange?.(0)
    this.onStateChange?.(this.state)
  }

  /** 获取当前管道间隙（随分数递减） */
  _getCurrentGap() {
    const reduction = Math.min(this.score * 2, PIPE_GAP_INITIAL - PIPE_GAP_MIN)
    return PIPE_GAP_INITIAL - reduction
  }

  /** 生成新管道 */
  _spawnPipe() {
    const gap = this._getCurrentGap()
    const playableHeight = LOGICAL_HEIGHT - GROUND_HEIGHT
    const minTop = 60
    const maxTop = playableHeight - gap - 60
    const topHeight = minTop + Math.random() * (maxTop - minTop)

    this.pipes.push({
      x: LOGICAL_WIDTH + 10,
      topHeight,
      bottomY: topHeight + gap,
      passed: false,
      width: PIPE_WIDTH
    })
  }

  /** 碰撞检测 */
  _checkCollision() {
    const birdTop = this.birdY - BIRD_RADIUS
    const birdBottom = this.birdY + BIRD_RADIUS
    const birdLeft = BIRD_X - BIRD_RADIUS
    const birdRight = BIRD_X + BIRD_RADIUS
    const groundY = LOGICAL_HEIGHT - GROUND_HEIGHT

    // 撞地面或天花板
    if (birdBottom >= groundY || birdTop <= 0) {
      return true
    }

    // 撞管道
    for (const pipe of this.pipes) {
      const pipeLeft = pipe.x
      const pipeRight = pipe.x + pipe.width

      // 水平方向有重叠
      if (birdRight > pipeLeft && birdLeft < pipeRight) {
        // 撞上管道或下管道
        if (birdTop < pipe.topHeight || birdBottom > pipe.bottomY) {
          return true
        }
      }
    }

    return false
  }

  /** 更新游戏逻辑（每帧） */
  _update() {
    this.frameCount++

    if (this.state === STATE.READY) {
      // 待机状态：小鸟上下浮动
      this.bobOffset += 0.08 * this.bobDirection
      if (Math.abs(this.bobOffset) > 8) this.bobDirection *= -1
      this.birdY = LOGICAL_HEIGHT / 2 + this.bobOffset
      return
    }

    if (this.state !== STATE.PLAYING) return

    // 更新小鸟物理
    this.birdVelocity += GRAVITY
    this.birdY += this.birdVelocity

    // 小鸟旋转（根据速度）
    this.birdRotation = Math.min(Math.max(this.birdVelocity * 3, -30), 90)

    // 生成管道
    this.pipeTimer++
    if (this.pipeTimer >= PIPE_SPAWN_INTERVAL) {
      this._spawnPipe()
      this.pipeTimer = 0
    }

    // 更新管道位置
    const speed = PIPE_SPEED + Math.min(this.score * 0.05, 1.5)
    for (let i = this.pipes.length - 1; i >= 0; i--) {
      const pipe = this.pipes[i]
      pipe.x -= speed

      // 计分：小鸟通过管道
      if (!pipe.passed && pipe.x + pipe.width < BIRD_X) {
        pipe.passed = true
        this.score++
        this.onScoreChange?.(this.score)
      }

      // 移除屏幕外管道
      if (pipe.x + pipe.width < -10) {
        this.pipes.splice(i, 1)
      }
    }

    // 碰撞检测
    if (this._checkCollision()) {
      this._gameOver()
    }
  }

  /** 游戏结束 */
  _gameOver() {
    this.state = STATE.GAME_OVER
    this.endTime = Date.now()

    // 更新最高分
    if (this.score > this.bestScore) {
      this.bestScore = this.score
      localStorage.setItem('clumsy_bird_best', String(this.bestScore))
    }

    this.onGameOver?.({
      score: this.score,
      bestScore: this.bestScore,
      flapCount: this.flapCount,
      durationMs: this.endTime - this.startTime
    })
    this.onStateChange?.(this.state)
  }

  // ========== 渲染 ==========

  /** 绘制天空背景 */
  _drawBackground() {
    const ctx = this.ctx
    const gradient = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT)
    gradient.addColorStop(0, '#87CEEB')
    gradient.addColorStop(0.6, '#B0E0E6')
    gradient.addColorStop(1, '#E0F7FA')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)

    // 简单云朵装饰
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
    const cloudOffset = (this.frameCount * 0.3) % (LOGICAL_WIDTH + 100)
    this._drawCloud(LOGICAL_WIDTH - cloudOffset, 60, 40)
    this._drawCloud(LOGICAL_WIDTH - cloudOffset + 180, 100, 30)
    this._drawCloud(LOGICAL_WIDTH - cloudOffset + 90, 40, 25)
  }

  /** 绘制云朵 */
  _drawCloud(x, y, size) {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.arc(x + size * 0.8, y - size * 0.3, size * 0.7, 0, Math.PI * 2)
    ctx.arc(x + size * 1.4, y, size * 0.8, 0, Math.PI * 2)
    ctx.fill()
  }

  /** 绘制地面 */
  _drawGround() {
    const ctx = this.ctx
    const groundY = LOGICAL_HEIGHT - GROUND_HEIGHT

    // 地面主体
    ctx.fillStyle = '#8B4513'
    ctx.fillRect(0, groundY, LOGICAL_WIDTH, GROUND_HEIGHT)

    // 草地
    ctx.fillStyle = '#4CAF50'
    ctx.fillRect(0, groundY, LOGICAL_WIDTH, 12)

    // 草地深色边
    ctx.fillStyle = '#388E3C'
    ctx.fillRect(0, groundY + 10, LOGICAL_WIDTH, 3)
  }

  /** 绘制管道 */
  _drawPipes() {
    const ctx = this.ctx

    for (const pipe of this.pipes) {
      // 上管道
      const topGradient = ctx.createLinearGradient(pipe.x, 0, pipe.x + pipe.width, 0)
      topGradient.addColorStop(0, '#388E3C')
      topGradient.addColorStop(0.3, '#4CAF50')
      topGradient.addColorStop(0.7, '#4CAF50')
      topGradient.addColorStop(1, '#2E7D32')

      ctx.fillStyle = topGradient
      ctx.fillRect(pipe.x, 0, pipe.width, pipe.topHeight)

      // 上管道帽
      ctx.fillStyle = '#2E7D32'
      ctx.fillRect(pipe.x - 4, pipe.topHeight - 20, pipe.width + 8, 20)
      ctx.strokeStyle = '#1B5E20'
      ctx.lineWidth = 2
      ctx.strokeRect(pipe.x - 4, pipe.topHeight - 20, pipe.width + 8, 20)

      // 下管道
      const groundY = LOGICAL_HEIGHT - GROUND_HEIGHT
      ctx.fillStyle = topGradient
      ctx.fillRect(pipe.x, pipe.bottomY, pipe.width, groundY - pipe.bottomY)

      // 下管道帽
      ctx.fillStyle = '#2E7D32'
      ctx.fillRect(pipe.x - 4, pipe.bottomY, pipe.width + 8, 20)
      ctx.strokeStyle = '#1B5E20'
      ctx.lineWidth = 2
      ctx.strokeRect(pipe.x - 4, pipe.bottomY, pipe.width + 8, 20)
    }
  }

  /** 绘制小鸟 */
  _drawBird() {
    const ctx = this.ctx
    const x = BIRD_X
    const y = this.birdY

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate((this.birdRotation * Math.PI) / 180)

    // 身体（橙黄色圆形）
    const bodyGradient = ctx.createRadialGradient(0, 0, 2, 0, 0, BIRD_RADIUS)
    bodyGradient.addColorStop(0, '#FFD54F')
    bodyGradient.addColorStop(1, '#FF8F00')
    ctx.fillStyle = bodyGradient
    ctx.beginPath()
    ctx.arc(0, 0, BIRD_RADIUS, 0, Math.PI * 2)
    ctx.fill()

    // 身体边框
    ctx.strokeStyle = '#E65100'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 眼睛（白色底）
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.arc(5, -4, 6, 0, Math.PI * 2)
    ctx.fill()

    // 瞳孔
    ctx.fillStyle = '#212121'
    ctx.beginPath()
    ctx.arc(7, -4, 3, 0, Math.PI * 2)
    ctx.fill()

    // 嘴巴（橙色三角）
    ctx.fillStyle = '#E65100'
    ctx.beginPath()
    ctx.moveTo(BIRD_RADIUS - 2, -2)
    ctx.lineTo(BIRD_RADIUS + 8, 2)
    ctx.lineTo(BIRD_RADIUS - 2, 5)
    ctx.closePath()
    ctx.fill()

    // 翅膀
    const wingFlap = Math.sin(this.frameCount * 0.3) * 4
    ctx.fillStyle = '#FFA000'
    ctx.beginPath()
    ctx.ellipse(-4, 4 + wingFlap, 8, 5, -0.3, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  }

  /** 绘制分数（游戏中） */
  _drawScore() {
    if (this.state !== STATE.PLAYING) return

    const ctx = this.ctx
    ctx.fillStyle = '#FFFFFF'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 3
    ctx.font = 'bold 40px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.strokeText(String(this.score), LOGICAL_WIDTH / 2, 60)
    ctx.fillText(String(this.score), LOGICAL_WIDTH / 2, 60)
  }

  /** 绘制准备界面 */
  _drawReadyScreen() {
    if (this.state !== STATE.READY) return

    const ctx = this.ctx
    ctx.fillStyle = '#FFFFFF'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2
    ctx.font = 'bold 28px Arial, sans-serif'
    ctx.textAlign = 'center'

    ctx.strokeText('笨鸟先飞', LOGICAL_WIDTH / 2, 120)
    ctx.fillText('笨鸟先飞', LOGICAL_WIDTH / 2, 120)

    ctx.font = '18px Arial, sans-serif'
    ctx.lineWidth = 1.5
    ctx.strokeText('点击屏幕开始', LOGICAL_WIDTH / 2, 360)
    ctx.fillText('点击屏幕开始', LOGICAL_WIDTH / 2, 360)

    // 提示图标（手指点击）
    ctx.font = '36px Arial, sans-serif'
    ctx.fillText('👆', LOGICAL_WIDTH / 2, 400)
  }

  /** 绘制游戏结束界面 */
  _drawGameOverScreen() {
    if (this.state !== STATE.GAME_OVER) return

    const ctx = this.ctx

    // 半透明遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)

    // 结果面板
    const panelX = 30
    const panelY = 120
    const panelW = LOGICAL_WIDTH - 60
    const panelH = 200

    ctx.fillStyle = '#FFF8E1'
    ctx.strokeStyle = '#795548'
    ctx.lineWidth = 3
    this._roundRect(panelX, panelY, panelW, panelH, 12)
    ctx.fill()
    ctx.stroke()

    // 游戏结束文字
    ctx.fillStyle = '#D32F2F'
    ctx.font = 'bold 24px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('游戏结束', LOGICAL_WIDTH / 2, panelY + 40)

    // 分数
    ctx.fillStyle = '#333333'
    ctx.font = '18px Arial, sans-serif'
    ctx.fillText(`得分: ${this.score}`, LOGICAL_WIDTH / 2, panelY + 80)

    // 最高分
    ctx.fillStyle = '#FF6F00'
    ctx.fillText(`最高分: ${this.bestScore}`, LOGICAL_WIDTH / 2, panelY + 110)

    // 重新开始提示
    ctx.fillStyle = '#666666'
    ctx.font = '16px Arial, sans-serif'
    ctx.fillText('点击屏幕重新开始', LOGICAL_WIDTH / 2, panelY + 160)
  }

  /** 绘制圆角矩形路径 */
  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  /** 主渲染循环 */
  _render() {
    const ctx = this.ctx
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)

    this._drawBackground()
    this._drawPipes()
    this._drawGround()
    this._drawBird()
    this._drawScore()
    this._drawReadyScreen()
    this._drawGameOverScreen()
  }

  /** 游戏主循环 */
  _gameLoop() {
    this._update()
    this._render()
    this.animationId = requestAnimationFrame(() => this._gameLoop())
  }

  // ========== 公共 API ==========

  /** 启动游戏循环 */
  start() {
    if (this.animationId) return
    this._gameLoop()
  }

  /** 停止游戏循环 */
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  /** 获取当前游戏状态 */
  getState() {
    return this.state
  }

  /** 获取当前分数 */
  getScore() {
    return this.score
  }

  /** 获取最高分 */
  getBestScore() {
    return this.bestScore
  }

  /** 销毁游戏实例 */
  destroy() {
    this.stop()
    document.removeEventListener('keydown', this._keyHandler)
    window.removeEventListener('resize', this._resizeHandler)
  }
}
