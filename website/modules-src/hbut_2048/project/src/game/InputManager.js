/**
 * InputManager - 处理键盘和触摸输入
 */
export class InputManager {
  constructor() {
    this.events = {}
    this.touchStartX = 0
    this.touchStartY = 0
    this.listen()
  }

  // 注册事件
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = []
    }
    this.events[event].push(callback)
  }

  // 触发事件
  emit(event, data) {
    const callbacks = this.events[event]
    if (callbacks) {
      callbacks.forEach((cb) => cb(data))
    }
  }

  // 监听输入
  listen() {
    // 键盘方向键
    const directionMap = {
      ArrowUp: 0,
      ArrowRight: 1,
      ArrowDown: 2,
      ArrowLeft: 3,
      // WASD 支持
      w: 0,
      d: 1,
      s: 2,
      a: 3,
      W: 0,
      D: 1,
      S: 2,
      A: 3
    }

    document.addEventListener('keydown', (event) => {
      const mapped = directionMap[event.key]
      if (mapped !== undefined) {
        event.preventDefault()
        this.emit('move', mapped)
      }
    })

    // 触摸滑动
    const gameContainer = document.getElementById('game-container')
    if (gameContainer) {
      gameContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) return // 忽略多指
        this.touchStartX = e.touches[0].clientX
        this.touchStartY = e.touches[0].clientY
      }, { passive: true })

      gameContainer.addEventListener('touchmove', (e) => {
        e.preventDefault()
      }, { passive: false })

      gameContainer.addEventListener('touchend', (e) => {
        if (e.changedTouches.length === 0) return
        const dx = e.changedTouches[0].clientX - this.touchStartX
        const dy = e.changedTouches[0].clientY - this.touchStartY
        const absDx = Math.abs(dx)
        const absDy = Math.abs(dy)

        // 最小滑动距离阈值
        if (Math.max(absDx, absDy) < 20) return

        // 判断方向：0=上, 1=右, 2=下, 3=左
        if (absDx > absDy) {
          this.emit('move', dx > 0 ? 1 : 3)
        } else {
          this.emit('move', dy > 0 ? 2 : 0)
        }
      }, { passive: true })
    }

    // 新游戏按钮
    const restartBtn = document.getElementById('restart-button')
    if (restartBtn) {
      restartBtn.addEventListener('click', () => this.emit('restart'))
    }

    // 继续游戏按钮（赢了之后继续）
    const keepPlayingBtn = document.getElementById('keep-playing-button')
    if (keepPlayingBtn) {
      keepPlayingBtn.addEventListener('click', () => this.emit('keepPlaying'))
    }
  }
}
