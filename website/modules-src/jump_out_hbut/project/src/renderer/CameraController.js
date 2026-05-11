/**
 * CameraController - 相机控制器
 * 使用正交相机（OrthographicCamera）实现等距视角
 * 支持平滑跟随目标和窗口 resize 适配
 */
import * as THREE from 'three'
import { CAMERA_CONFIG } from '../utils/constants.js'

/**
 * easeOutCubic 缓动函数
 * @param {number} t - 进度 [0, 1]
 * @returns {number} 缓动后的值
 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

class CameraController {
  constructor() {
    /** @type {THREE.OrthographicCamera|null} */
    this._camera = null

    /** 视锥体大小 */
    this._frustumSize = CAMERA_CONFIG.frustumSize

    /** 相机相对于 lookAt 目标的偏移量 */
    this._offset = new THREE.Vector3(
      CAMERA_CONFIG.position.x,
      CAMERA_CONFIG.position.y,
      CAMERA_CONFIG.position.z
    )

    /** 当前 lookAt 目标位置 */
    this._currentTarget = new THREE.Vector3(
      CAMERA_CONFIG.lookAt.x,
      CAMERA_CONFIG.lookAt.y,
      CAMERA_CONFIG.lookAt.z
    )

    // 跟随动画状态
    /** @type {THREE.Vector3|null} 跟随起始位置 */
    this._followStart = null
    /** @type {THREE.Vector3|null} 跟随目标位置 */
    this._followEnd = null
    /** 跟随动画已用时间（ms） */
    this._followElapsed = 0
    /** 跟随动画总时长（ms） */
    this._followDuration = 0
    /** 是否正在跟随动画中 */
    this._isFollowing = false
  }

  /**
   * 初始化相机
   * @param {number} width - 视口宽度
   * @param {number} height - 视口高度
   * @returns {THREE.OrthographicCamera} 创建的正交相机
   */
  init(width, height) {
    const aspect = width / height
    const halfH = this._frustumSize / 2
    const halfW = halfH * aspect

    this._camera = new THREE.OrthographicCamera(
      -halfW, halfW,
      halfH, -halfH,
      CAMERA_CONFIG.near,
      CAMERA_CONFIG.far
    )

    // 设置等距视角位置
    this._camera.position.set(
      this._currentTarget.x + this._offset.x,
      this._currentTarget.y + this._offset.y,
      this._currentTarget.z + this._offset.z
    )
    this._camera.lookAt(this._currentTarget)

    return this._camera
  }

  /**
   * 开始跟随目标位置（带缓动动画）
   * @param {THREE.Vector3|{x:number, y:number, z:number}} targetPos - 目标位置
   * @param {number} [duration] - 动画时长（ms），默认使用配置值
   */
  followTarget(targetPos, duration) {
    const dur = duration !== undefined ? duration : CAMERA_CONFIG.followDuration

    // 记录动画起止位置
    this._followStart = this._currentTarget.clone()
    this._followEnd = new THREE.Vector3(
      targetPos.x !== undefined ? targetPos.x : 0,
      targetPos.y !== undefined ? targetPos.y : 0,
      targetPos.z !== undefined ? targetPos.z : 0
    )

    this._followElapsed = 0
    this._followDuration = dur
    this._isFollowing = true

    // 如果 duration 为 0，立即到达目标
    if (dur <= 0) {
      this._currentTarget.copy(this._followEnd)
      this._updateCameraPosition()
      this._isFollowing = false
    }
  }

  /**
   * 每帧更新（处理跟随动画）
   * @param {number} deltaTime - 帧间隔时间（ms）
   */
  update(deltaTime) {
    if (!this._isFollowing || !this._camera) return

    this._followElapsed += deltaTime

    // 计算动画进度
    const rawT = Math.min(this._followElapsed / this._followDuration, 1)
    const easedT = easeOutCubic(rawT)

    // 插值计算当前目标位置
    this._currentTarget.lerpVectors(this._followStart, this._followEnd, easedT)

    // 更新相机位置和朝向
    this._updateCameraPosition()

    // 动画完成
    if (rawT >= 1) {
      this._isFollowing = false
      this._currentTarget.copy(this._followEnd)
      this._updateCameraPosition()
    }
  }

  /**
   * 窗口 resize 时更新视锥体
   * @param {number} width - 新视口宽度
   * @param {number} height - 新视口高度
   */
  resize(width, height) {
    if (!this._camera) return

    const aspect = width / height
    const halfH = this._frustumSize / 2
    const halfW = halfH * aspect

    this._camera.left = -halfW
    this._camera.right = halfW
    this._camera.top = halfH
    this._camera.bottom = -halfH
    this._camera.updateProjectionMatrix()
  }

  /**
   * 获取相机实例
   * @returns {THREE.OrthographicCamera|null}
   */
  getCamera() {
    return this._camera
  }

  /**
   * 获取当前 lookAt 目标位置
   * @returns {THREE.Vector3}
   */
  getCurrentTarget() {
    return this._currentTarget.clone()
  }

  /**
   * 是否正在执行跟随动画
   * @returns {boolean}
   */
  isFollowing() {
    return this._isFollowing
  }

  /**
   * 根据当前目标位置更新相机 position 和 lookAt
   */
  _updateCameraPosition() {
    if (!this._camera) return

    this._camera.position.set(
      this._currentTarget.x + this._offset.x,
      this._currentTarget.y + this._offset.y,
      this._currentTarget.z + this._offset.z
    )
    this._camera.lookAt(this._currentTarget)
  }

  /**
   * 销毁相机控制器
   */
  destroy() {
    this._camera = null
    this._followStart = null
    this._followEnd = null
    this._isFollowing = false
  }
}

export default CameraController
