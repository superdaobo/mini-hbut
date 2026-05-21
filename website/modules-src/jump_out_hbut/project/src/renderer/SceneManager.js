/**
 * SceneManager - Three.js 场景管理器
 * 负责初始化渲染器、场景、光照，管理渲染循环和 resize 适配
 */
import * as THREE from 'three'
import { createCampusBackdrop } from './CampusBackdrop.js'

class SceneManager {
  constructor() {
    /** @type {THREE.WebGLRenderer|null} */
    this._renderer = null
    /** @type {THREE.Scene|null} */
    this._scene = null
    /** @type {THREE.AmbientLight|null} */
    this._ambientLight = null
    /** @type {THREE.DirectionalLight|null} */
    this._directionalLight = null
    /** @type {THREE.Group|null} */
    this._campusBackdrop = null
    /** @type {HTMLElement|null} */
    this._container = null
    /** @type {number|null} */
    this._animationFrameId = null
    /** @type {THREE.Camera|null} */
    this._camera = null
    /** @type {number|null} */
    this._resizeTimer = null
    /** @type {Function|null} */
    this._boundResize = null
    /** @type {Function|null} */
    this._onResizeCallback = null
  }

  /**
   * 初始化渲染器并挂载到 DOM 容器
   * @param {HTMLElement} container - DOM 容器元素
   */
  init(container) {
    this._container = container

    // 创建场景
    this._scene = new THREE.Scene()
    this._scene.background = new THREE.Color(0x87CEEB) // 浅天蓝色背景

    // 创建渲染器
    this._renderer = new THREE.WebGLRenderer({ antialias: true })
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this._renderer.setSize(container.clientWidth, container.clientHeight)

    // 配置阴影
    this._renderer.shadowMap.enabled = true
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // 挂载到 DOM
    container.appendChild(this._renderer.domElement)

    // 设置光照
    this._setupLights()
    this._setupCampusBackdrop()

    // 绑定 resize 事件（debounce 100ms）
    this._boundResize = this._onWindowResize.bind(this)
    window.addEventListener('resize', this._boundResize)
  }

  /**
   * 设置场景光照：环境光 + 平行光
   */
  _setupLights() {
    // 环境光 - 柔和全局照明
    this._ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    this._scene.add(this._ambientLight)

    // 平行光 - 主光源，从右上方照射
    this._directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    this._directionalLight.position.set(5, 10, 7)
    this._directionalLight.castShadow = true

    // 阴影贴图分辨率 512×512
    this._directionalLight.shadow.mapSize.width = 512
    this._directionalLight.shadow.mapSize.height = 512
    this._directionalLight.shadow.camera.near = 0.5
    this._directionalLight.shadow.camera.far = 50
    this._directionalLight.shadow.camera.left = -15
    this._directionalLight.shadow.camera.right = 15
    this._directionalLight.shadow.camera.top = 15
    this._directionalLight.shadow.camera.bottom = -15

    this._scene.add(this._directionalLight)
  }

  /**
   * 添加低成本校园背景层：南湖、水岸、跑道和远景楼群。
   * 背景不参与碰撞，只提供稳定的湖工场景识别。
   */
  _setupCampusBackdrop() {
    if (!this._scene) return
    this._campusBackdrop = createCampusBackdrop()
    this._scene.add(this._campusBackdrop)
  }

  /**
   * 获取 Three.js 场景对象
   * @returns {THREE.Scene}
   */
  getScene() {
    return this._scene
  }

  /**
   * 获取渲染器
   * @returns {THREE.WebGLRenderer}
   */
  getRenderer() {
    return this._renderer
  }

  /**
   * 添加对象到场景
   * @param {THREE.Object3D} object
   */
  addToScene(object) {
    if (this._scene && object) {
      this._scene.add(object)
    }
  }

  /**
   * 从场景移除对象
   * @param {THREE.Object3D} object
   */
  removeFromScene(object) {
    if (this._scene && object) {
      this._scene.remove(object)
    }
  }

  /**
   * 启动渲染循环
   * @param {THREE.Camera} camera - 用于渲染的相机
   */
  startRenderLoop(camera) {
    this._camera = camera
    this._animate()
  }

  /**
   * 停止渲染循环
   */
  stopRenderLoop() {
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId)
      this._animationFrameId = null
    }
    this._camera = null
  }

  /**
   * 内部动画循环
   */
  _animate() {
    this._animationFrameId = requestAnimationFrame(() => this._animate())

    if (this._renderer && this._scene && this._camera) {
      this._renderer.render(this._scene, this._camera)
    }
  }

  /**
   * 手动触发 resize 适配
   */
  resize() {
    this._performResize()
  }

  /**
   * 窗口 resize 事件处理（debounce 100ms）
   */
  _onWindowResize() {
    if (this._resizeTimer !== null) {
      clearTimeout(this._resizeTimer)
    }
    this._resizeTimer = setTimeout(() => {
      this._performResize()
      this._resizeTimer = null
    }, 100)
  }

  /**
   * 执行实际的 resize 操作
   */
  _performResize() {
    if (!this._container || !this._renderer) return

    const width = this._container.clientWidth
    const height = this._container.clientHeight

    // 更新渲染器尺寸
    this._renderer.setSize(width, height)
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // 通知外部（如相机控制器）更新
    if (this._onResizeCallback) {
      this._onResizeCallback(width, height)
    }
  }

  /**
   * 设置 resize 回调（用于通知相机控制器等外部模块）
   * @param {Function} callback - (width, height) => void
   */
  onResize(callback) {
    this._onResizeCallback = callback
  }

  /**
   * 销毁场景管理器，释放所有资源
   */
  destroy() {
    // 停止渲染循环
    this.stopRenderLoop()

    // 移除 resize 监听
    if (this._boundResize) {
      window.removeEventListener('resize', this._boundResize)
      this._boundResize = null
    }

    // 清除 debounce 定时器
    if (this._resizeTimer !== null) {
      clearTimeout(this._resizeTimer)
      this._resizeTimer = null
    }

    // 从 DOM 移除 canvas
    if (this._renderer && this._container) {
      this._container.removeChild(this._renderer.domElement)
    }

    // 释放渲染器资源
    if (this._renderer) {
      this._renderer.dispose()
      this._renderer = null
    }

    // 清理场景中的所有对象
    if (this._scene) {
      this._scene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose()
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((mat) => mat.dispose())
          } else {
            object.material.dispose()
          }
        }
      })
      this._scene.clear()
      this._scene = null
    }

    this._ambientLight = null
    this._directionalLight = null
    this._campusBackdrop = null
    this._container = null
  }
}

export default SceneManager
