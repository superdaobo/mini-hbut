/**
 * GameEngine - 游戏引擎主控
 * 整合所有核心模块、渲染层、服务层
 * 实现 init/start/reset/destroy 生命周期
 * 实现 update loop 和事件系统
 * 触觉反馈：Vibration API
 */
import { ChargeSystem } from './ChargeSystem.js'
import { JumpController } from './JumpController.js'
import { LandingDetector } from './LandingDetector.js'
import { ComboSystem } from './ComboSystem.js'
import { ScoreManager } from './ScoreManager.js'
import { PlatformGenerator } from './PlatformGenerator.js'
import { StateMachine } from './StateMachine.js'
import SceneManager from '../renderer/SceneManager.js'
import CameraController from '../renderer/CameraController.js'
import PlayerRenderer from '../renderer/PlayerRenderer.js'
import ParticleSystem from '../renderer/ParticleSystem.js'
import * as BuildingFactory from '../renderer/buildings/BuildingFactory.js'
import { InputHandler } from '../services/InputHandler.js'
import { AudioManager } from '../services/AudioManager.js'
import { PerformanceMonitor } from '../services/PerformanceMonitor.js'

/** 触觉反馈时长（毫秒） */
const VIBRATION_NORMAL = 50
const VIBRATION_PERFECT = 100
const VIBRATION_FAIL = 200

/** 着陆动画时长（毫秒） */
const LANDING_ANIMATION_DURATION = 300

export class GameEngine {
  constructor() {
    // 核心模块
    this._stateMachine = new StateMachine()
    this._chargeSystem = new ChargeSystem()
    this._jumpController = new JumpController()
    this._landingDetector = new LandingDetector()
    this._comboSystem = new ComboSystem()
    this._scoreManager = new ScoreManager()
    this._platformGenerator = new PlatformGenerator()

    // 渲染层
    this._sceneManager = new SceneManager()
    this._cameraController = new CameraController()
    this._playerRenderer = new PlayerRenderer()
    this._particleSystem = new ParticleSystem()

    // 服务层
    this._inputHandler = new InputHandler()
    this._audioManager = new AudioManager()
    this._performanceMonitor = new PerformanceMonitor()

    // 游戏状态
    this._platforms = []       // 当前场景中的平台列表
    this._currentPlatform = null // 当前站立的平台
    this._jumpCount = 0        // 跳跃次数
    this._startTime = 0        // 游戏开始时间
    this._lastFrameTime = 0    // 上一帧时间戳
    this._animationFrameId = null
    this._landingTimer = null   // 着陆动画定时器

    // 事件系统
    this._listeners = {}

    // 容器引用
    this._container = null
    this._initialized = false
  }

  /**
   * 初始化所有子系统
   * @param {HTMLElement} container - DOM 容器元素
   */
  async init(container) {
    this._container = container

    // 初始化渲染层
    this._sceneManager.init(container)
    const scene = this._sceneManager.getScene()

    const camera = this._cameraController.init(
      container.clientWidth,
      container.clientHeight
    )

    // 初始化角色
    const playerMesh = this._playerRenderer.init()
    scene.add(playerMesh)

    // 初始化粒子系统
    this._particleSystem.init(scene)

    // 初始化输入处理
    this._inputHandler.init(container)
    this._inputHandler.onPressStart(() => this._handlePressStart())
    this._inputHandler.onPressEnd(() => this._handlePressEnd())

    // 初始化音效
    await this._audioManager.init()

    // 性能监控降级回调
    this._performanceMonitor.onLevelChange((level) => {
      this._applyPerformanceLevel(level)
    })

    // 状态机变化回调
    this._stateMachine.onChange((newState, prevState) => {
      this._emit('stateChange', { state: newState, prevState })
    })

    // 启动渲染循环
    this._sceneManager.startRenderLoop(camera)

    this._initialized = true
  }

  /**
   * 开始游戏
   */
  start() {
    // 重置所有子系统
    this._resetSubsystems()

    // 生成初始平台
    const initialPlatform = this._platformGenerator.getInitialPlatform()
    this._addPlatformToScene(initialPlatform)
    this._currentPlatform = initialPlatform

    // 生成下一个平台
    const nextPlatform = this._platformGenerator.generateNext(initialPlatform, 0)
    this._addPlatformToScene(nextPlatform)

    // 设置角色初始位置（站在第一个平台顶部）
    const startPos = initialPlatform.position
    this._playerRenderer.setPosition(
      startPos.x,
      startPos.y + initialPlatform.size.height,
      startPos.z
    )

    // 相机对准角色
    this._cameraController.followTarget(startPos, 0)

    // 设置状态为 idle
    this._stateMachine.reset()

    // 记录开始时间
    this._startTime = Date.now()
    this._jumpCount = 0

    // 启动游戏更新循环
    this._lastFrameTime = performance.now()
    this._startUpdateLoop()
  }

  /**
   * 重置游戏（再来一局）
   */
  reset() {
    this._stopUpdateLoop()
    this._clearLandingTimer()

    // 清除场景中的平台
    this._clearPlatforms()

    // 重置所有子系统
    this._resetSubsystems()

    // 重新开始
    this.start()
  }

  /**
   * 销毁引擎，释放所有资源
   */
  destroy() {
    this._stopUpdateLoop()
    this._clearLandingTimer()

    // 销毁服务层
    this._inputHandler.destroy()
    this._audioManager.destroy()
    this._performanceMonitor.reset()

    // 销毁渲染层
    this._particleSystem.destroy()
    this._sceneManager.destroy()
    this._cameraController.destroy()

    // 清除事件监听
    this._listeners = {}
    this._platforms = []
    this._currentPlatform = null
    this._container = null
    this._initialized = false
  }

  // ========== 状态查询 ==========

  /**
   * 获取当前游戏状态
   * @returns {string}
   */
  getState() {
    return this._stateMachine.getState()
  }

  /**
   * 获取当前分数
   * @returns {number}
   */
  getScore() {
    return this._scoreManager.getTotal()
  }

  /**
   * 获取当前连击数
   * @returns {number}
   */
  getCombo() {
    return this._comboSystem.getState().count
  }

  /**
   * 获取跳跃次数
   * @returns {number}
   */
  getJumpCount() {
    return this._jumpCount
  }

  /**
   * 获取游戏时长（毫秒）
   * @returns {number}
   */
  getDuration() {
    if (this._startTime === 0) return 0
    return Date.now() - this._startTime
  }

  // ========== 事件系统 ==========

  /**
   * 注册事件监听
   * @param {string} event - 事件名称
   * @param {Function} handler - 处理函数
   */
  on(event, handler) {
    if (!this._listeners[event]) {
      this._listeners[event] = []
    }
    this._listeners[event].push(handler)
  }

  /**
   * 移除事件监听
   * @param {string} event - 事件名称
   * @param {Function} handler - 处理函数
   */
  off(event, handler) {
    if (!this._listeners[event]) return
    this._listeners[event] = this._listeners[event].filter(h => h !== handler)
  }

  // ========== 内部方法 ==========

  /**
   * 触发事件
   * @param {string} event - 事件名称
   * @param {*} data - 事件数据
   */
  _emit(event, data) {
    const handlers = this._listeners[event]
    if (!handlers) return
    for (let i = 0; i < handlers.length; i++) {
      handlers[i](data)
    }
  }

  /**
   * 处理按下开始（蓄力）
   */
  _handlePressStart() {
    if (!this._stateMachine.canCharge()) return

    const success = this._stateMachine.transition('charging')
    if (success) {
      this._chargeSystem.startCharge()
      this._audioManager.play('charge')
    }
  }

  /**
   * 处理按下结束（跳跃）
   */
  _handlePressEnd() {
    if (this._stateMachine.getState() !== 'charging') return

    const chargePercent = this._chargeSystem.stopCharge()
    const success = this._stateMachine.transition('jumping')

    if (success) {
      this._executeJump(chargePercent)
    }
  }

  /**
   * 执行跳跃
   * @param {number} chargePercent - 蓄力百分比
   */
  _executeJump(chargePercent) {
    // 随机选择方向
    const direction = Math.random() < 0.5 ? 'left' : 'right'

    // 获取角色当前位置作为起始位置
    const playerPos = this._playerRenderer.getPosition()
    const startPos = {
      x: playerPos.x,
      y: this._currentPlatform.position.y + this._currentPlatform.size.height,
      z: playerPos.z
    }

    // 执行跳跃
    this._jumpController.jump(chargePercent, direction, startPos)
    this._jumpCount++

    // 恢复角色缩放
    this._playerRenderer.resetScale()

    // 播放跳跃音效
    this._audioManager.play('jump')
  }

  /**
   * 启动游戏更新循环
   */
  _startUpdateLoop() {
    const loop = (timestamp) => {
      this._animationFrameId = requestAnimationFrame(loop)

      const deltaTime = timestamp - this._lastFrameTime
      this._lastFrameTime = timestamp

      // 限制最大 deltaTime 防止跳帧
      const dt = Math.min(deltaTime, 50)

      this._update(dt)
    }

    this._animationFrameId = requestAnimationFrame(loop)
  }

  /**
   * 停止更新循环
   */
  _stopUpdateLoop() {
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId)
      this._animationFrameId = null
    }
  }

  /**
   * 每帧更新
   * @param {number} deltaTime - 帧间隔（毫秒）
   */
  _update(deltaTime) {
    // 性能监控
    this._performanceMonitor.recordFrame(deltaTime)

    const state = this._stateMachine.getState()

    // 蓄力状态：更新角色压缩动画
    if (state === 'charging') {
      const percent = this._chargeSystem.getChargePercent()
      this._playerRenderer.setChargeScale(percent)

      // 达到 100% 自动触发跳跃
      if (percent >= 1.0) {
        this._handlePressEnd()
      }
    }

    // 跳跃状态：更新跳跃位置
    if (state === 'jumping') {
      const pos = this._jumpController.update(deltaTime)
      this._playerRenderer.setPosition(pos.x, pos.y, pos.z)

      // 相机跟随
      this._cameraController.followTarget({ x: pos.x, y: 0, z: pos.z })

      // 跳跃完成 → 检测落点
      if (!this._jumpController.isJumping()) {
        this._checkLanding(pos)
      }
    }

    // 更新相机缓动
    this._cameraController.update(deltaTime)

    // 更新粒子系统
    this._particleSystem.update(deltaTime)
  }

  /**
   * 检测落点
   * @param {{ x: number, y: number, z: number }} landingPos - 落点位置
   */
  _checkLanding(landingPos) {
    const result = this._landingDetector.detect(landingPos, this._platforms)

    if (result.success) {
      // 成功着陆
      this._stateMachine.transition('landed')
      this._onLandingSuccess(result)
    } else {
      // 坠落失败
      this._stateMachine.transition('gameover')
      this._onLandingFail()
    }
  }

  /**
   * 着陆成功处理
   * @param {{ type: string, platform: object }} result - 落点判定结果
   */
  _onLandingSuccess(result) {
    const { type, platform } = result

    // 更新当前平台
    this._currentPlatform = platform

    // 设置角色位置到平台顶部
    this._playerRenderer.setPosition(
      platform.position.x,
      platform.position.y + platform.size.height,
      platform.position.z
    )

    // 更新连击
    const comboState = this._comboSystem.recordLanding(type)
    this._emit('comboUpdate', comboState)

    // 计算分数
    const score = this._scoreManager.addScore(platform.baseScore, comboState.multiplier)
    this._emit('scoreUpdate', { score, total: this._scoreManager.getTotal() })

    // 触觉反馈
    if (type === 'perfect') {
      this._vibrate(VIBRATION_PERFECT)
      this._audioManager.play('perfect')
      // 完美着陆粒子特效
      this._particleSystem.emit({
        x: platform.position.x,
        y: platform.position.y + platform.size.height,
        z: platform.position.z
      })
      // 连击音效
      if (comboState.count >= 2) {
        this._audioManager.play('combo')
      }
    } else {
      this._vibrate(VIBRATION_NORMAL)
      this._audioManager.play('land')
    }

    // 生成下一个平台
    const nextPlatform = this._platformGenerator.generateNext(
      platform,
      this._scoreManager.getTotal()
    )
    this._addPlatformToScene(nextPlatform)

    // 清理远处的旧平台（保留最近 5 个）
    this._cleanOldPlatforms(5)

    // 着陆动画完成后回到 idle
    this._clearLandingTimer()
    this._landingTimer = setTimeout(() => {
      this._stateMachine.transition('idle')
      this._landingTimer = null
    }, LANDING_ANIMATION_DURATION)
  }

  /**
   * 着陆失败处理（坠落）
   */
  _onLandingFail() {
    this._vibrate(VIBRATION_FAIL)
    this._audioManager.play('fall')

    // 停止更新循环
    this._stopUpdateLoop()

    // 触发 gameOver 事件
    this._emit('gameOver', {
      score: this._scoreManager.getTotal(),
      jumpCount: this._jumpCount,
      duration: this.getDuration()
    })
  }

  /**
   * 将平台添加到场景
   * @param {object} platform - 平台数据
   */
  _addPlatformToScene(platform) {
    // 创建建筑模型
    const mesh = BuildingFactory.create(platform.type)
    mesh.position.set(
      platform.position.x,
      platform.position.y,
      platform.position.z
    )
    platform.mesh = mesh

    this._sceneManager.addToScene(mesh)
    this._platforms.push(platform)
  }

  /**
   * 清理远处的旧平台
   * @param {number} keepCount - 保留的平台数量
   */
  _cleanOldPlatforms(keepCount) {
    while (this._platforms.length > keepCount) {
      const old = this._platforms.shift()
      if (old.mesh) {
        this._sceneManager.removeFromScene(old.mesh)
      }
    }
  }

  /**
   * 清除所有平台
   */
  _clearPlatforms() {
    for (const platform of this._platforms) {
      if (platform.mesh) {
        this._sceneManager.removeFromScene(platform.mesh)
      }
    }
    this._platforms = []
    this._currentPlatform = null
  }

  /**
   * 重置所有子系统
   */
  _resetSubsystems() {
    this._chargeSystem.reset()
    this._jumpController.reset()
    this._comboSystem.reset()
    this._scoreManager.reset()
    this._platformGenerator.reset()
    this._performanceMonitor.reset()
    this._playerRenderer.resetScale()
  }

  /**
   * 触觉反馈
   * @param {number} duration - 振动时长（毫秒）
   */
  _vibrate(duration) {
    if (navigator && navigator.vibrate) {
      navigator.vibrate(duration)
    }
  }

  /**
   * 应用性能降级
   * @param {number} level - 降级等级
   */
  _applyPerformanceLevel(level) {
    const renderer = this._sceneManager.getRenderer()
    if (!renderer) return

    if (level >= 1) {
      // Level 1: 关闭阴影
      renderer.shadowMap.enabled = false
    }
    // Level 2 的粒子/几何体简化由各子系统自行处理
  }

  /**
   * 清除着陆动画定时器
   */
  _clearLandingTimer() {
    if (this._landingTimer !== null) {
      clearTimeout(this._landingTimer)
      this._landingTimer = null
    }
  }
}
