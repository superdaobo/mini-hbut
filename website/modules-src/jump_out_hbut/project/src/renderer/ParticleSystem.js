/**
 * ParticleSystem - 粒子特效系统
 * 使用对象池模式管理粒子，完美着陆时从落点向四周扩散
 * 粒子生命周期 400ms，自动回收到池中
 */
import * as THREE from 'three'

/** 粒子池大小 */
const POOL_SIZE = 50

/** 粒子生命周期（毫秒） */
const PARTICLE_LIFETIME = 400

/** 粒子半径范围 */
const PARTICLE_RADIUS_MIN = 0.05
const PARTICLE_RADIUS_MAX = 0.1

/** 粒子扩散速度范围 */
const PARTICLE_SPEED_MIN = 2.0
const PARTICLE_SPEED_MAX = 5.0

/** 粒子初始上升速度 */
const PARTICLE_UP_SPEED_MIN = 3.0
const PARTICLE_UP_SPEED_MAX = 6.0

/** 重力加速度 */
const GRAVITY = -15.0

/** 粒子亮色调色板 */
const PARTICLE_COLORS = [
  0xFFD700, // 金黄
  0xFF8C00, // 深橙
  0x00FFFF, // 青色
  0xFFFFFF, // 白色
  0xFF69B4, // 粉红
  0x7FFF00, // 黄绿
  0xFF4500, // 橙红
  0x00FF7F  // 春绿
]

/**
 * 单个粒子数据结构
 */
class Particle {
  constructor(mesh) {
    /** @type {THREE.Mesh} */
    this.mesh = mesh
    /** @type {boolean} 是否激活 */
    this.active = false
    /** @type {number} 水平速度 X */
    this.vx = 0
    /** @type {number} 垂直速度 Y */
    this.vy = 0
    /** @type {number} 水平速度 Z */
    this.vz = 0
    /** @type {number} 已存活时间（毫秒） */
    this.age = 0
    /** @type {number} 生命周期（毫秒） */
    this.lifetime = PARTICLE_LIFETIME
  }
}

class ParticleSystem {
  constructor() {
    /** @type {Particle[]} 粒子对象池 */
    this._pool = []
    /** @type {THREE.Scene|null} */
    this._scene = null
  }

  /**
   * 初始化粒子系统，预分配对象池
   * @param {THREE.Scene} scene - Three.js 场景
   */
  init(scene) {
    this._scene = scene

    // 预分配粒子对象池
    for (let i = 0; i < POOL_SIZE; i++) {
      const radius = PARTICLE_RADIUS_MIN + Math.random() * (PARTICLE_RADIUS_MAX - PARTICLE_RADIUS_MIN)
      const geometry = new THREE.SphereGeometry(radius, 6, 6)
      const material = new THREE.MeshLambertMaterial({
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length]
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.visible = false
      scene.add(mesh)

      this._pool.push(new Particle(mesh))
    }
  }

  /**
   * 从对象池中获取一个空闲粒子
   * @returns {Particle|null} 空闲粒子，池满时返回 null
   */
  _acquire() {
    for (let i = 0; i < this._pool.length; i++) {
      if (!this._pool[i].active) {
        return this._pool[i]
      }
    }
    return null
  }

  /**
   * 回收粒子到对象池
   * @param {Particle} particle
   */
  _release(particle) {
    particle.active = false
    particle.mesh.visible = false
    particle.age = 0
    particle.vx = 0
    particle.vy = 0
    particle.vz = 0
  }

  /**
   * 发射粒子（完美着陆时调用）
   * 粒子从落点向四周扩散
   * @param {{ x: number, y: number, z: number }} position - 发射位置
   * @param {number} [count] - 发射数量（默认 20~30 随机）
   */
  emit(position, count) {
    if (!count) {
      count = 20 + Math.floor(Math.random() * 11) // 20~30
    }

    for (let i = 0; i < count; i++) {
      const particle = this._acquire()
      if (!particle) break // 池已满，停止发射

      // 激活粒子
      particle.active = true
      particle.age = 0
      particle.lifetime = PARTICLE_LIFETIME

      // 设置初始位置
      particle.mesh.position.set(position.x, position.y, position.z)
      particle.mesh.visible = true

      // 随机颜色
      const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)]
      particle.mesh.material.color.setHex(color)

      // 随机方向（XZ 平面 360° 均匀分布）
      const angle = Math.random() * Math.PI * 2
      const speed = PARTICLE_SPEED_MIN + Math.random() * (PARTICLE_SPEED_MAX - PARTICLE_SPEED_MIN)

      particle.vx = Math.cos(angle) * speed
      particle.vz = Math.sin(angle) * speed
      particle.vy = PARTICLE_UP_SPEED_MIN + Math.random() * (PARTICLE_UP_SPEED_MAX - PARTICLE_UP_SPEED_MIN)

      // 随机缩放，增加视觉多样性
      const scale = 0.5 + Math.random() * 1.0
      particle.mesh.scale.set(scale, scale, scale)
    }
  }

  /**
   * 每帧更新所有激活的粒子
   * @param {number} deltaTime - 帧间隔时间（毫秒）
   */
  update(deltaTime) {
    const dt = deltaTime / 1000 // 转换为秒

    for (let i = 0; i < this._pool.length; i++) {
      const particle = this._pool[i]
      if (!particle.active) continue

      // 更新存活时间
      particle.age += deltaTime

      // 超过生命周期，回收
      if (particle.age >= particle.lifetime) {
        this._release(particle)
        continue
      }

      // 更新速度（重力影响）
      particle.vy += GRAVITY * dt

      // 更新位置
      particle.mesh.position.x += particle.vx * dt
      particle.mesh.position.y += particle.vy * dt
      particle.mesh.position.z += particle.vz * dt

      // 根据生命周期进度淡出（缩小）
      const lifeProgress = particle.age / particle.lifetime
      const fadeScale = 1.0 - lifeProgress
      particle.mesh.scale.setScalar(Math.max(0.01, fadeScale))
    }
  }

  /**
   * 获取当前激活的粒子数量
   * @returns {number}
   */
  getActiveCount() {
    let count = 0
    for (let i = 0; i < this._pool.length; i++) {
      if (this._pool[i].active) count++
    }
    return count
  }

  /**
   * 销毁粒子系统，释放所有资源
   */
  destroy() {
    for (let i = 0; i < this._pool.length; i++) {
      const particle = this._pool[i]
      particle.active = false

      if (this._scene) {
        this._scene.remove(particle.mesh)
      }

      // 释放几何体和材质
      if (particle.mesh.geometry) {
        particle.mesh.geometry.dispose()
      }
      if (particle.mesh.material) {
        particle.mesh.material.dispose()
      }
    }

    this._pool = []
    this._scene = null
  }
}

export default ParticleSystem
