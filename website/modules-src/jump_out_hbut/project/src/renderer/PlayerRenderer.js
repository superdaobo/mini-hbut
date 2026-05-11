/**
 * PlayerRenderer - 角色渲染器
 * 负责创建角色几何体、蓄力压缩动画、跳跃位置更新、落地恢复
 */
import * as THREE from 'three'

/**
 * 计算蓄力时角色 Y 轴缩放值
 * scale = 1.0 - 0.4 * chargePercent
 * @param {number} chargePercent - 蓄力百分比 [0, 1]
 * @returns {number} Y 轴缩放值 [0.6, 1.0]
 */
export function computeScale(chargePercent) {
  return 1.0 - 0.4 * chargePercent
}

class PlayerRenderer {
  constructor() {
    /** @type {THREE.Group|null} */
    this._group = null
    /** @type {THREE.Mesh|null} */
    this._bodyMesh = null
  }

  /**
   * 初始化角色模型
   * 创建一个胶囊体/圆柱体角色
   * @returns {THREE.Group} 角色 mesh 组
   */
  init() {
    this._group = new THREE.Group()

    // 角色主体：圆柱体（半径 0.2，高度 0.6）
    const bodyGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.6, 16)
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xFF6B35 })
    this._bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial)
    this._bodyMesh.castShadow = true

    // 圆柱体中心在原点，向上偏移半高使底部在 y=0
    this._bodyMesh.position.y = 0.3

    // 顶部半球（模拟胶囊体顶部）
    const topCapGeometry = new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    const topCapMaterial = new THREE.MeshLambertMaterial({ color: 0xFF6B35 })
    const topCap = new THREE.Mesh(topCapGeometry, topCapMaterial)
    topCap.castShadow = true
    topCap.position.y = 0.6 // 圆柱顶部

    // 底部半球（模拟胶囊体底部）
    const bottomCapGeometry = new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
    const bottomCapMaterial = new THREE.MeshLambertMaterial({ color: 0xFF6B35 })
    const bottomCap = new THREE.Mesh(bottomCapGeometry, bottomCapMaterial)
    bottomCap.castShadow = true
    bottomCap.position.y = 0 // 圆柱底部

    this._group.add(this._bodyMesh)
    this._group.add(topCap)
    this._group.add(bottomCap)

    return this._group
  }

  /**
   * 获取角色 mesh 组
   * @returns {THREE.Group}
   */
  getMesh() {
    return this._group
  }

  /**
   * 设置角色位置
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setPosition(x, y, z) {
    if (this._group) {
      this._group.position.set(x, y, z)
    }
  }

  /**
   * 设置蓄力压缩缩放
   * Y 轴 scale = 1.0 - 0.4 * chargePercent（Property 9）
   * @param {number} chargePercent - 蓄力百分比 [0, 1]
   */
  setChargeScale(chargePercent) {
    if (this._group) {
      const scaleY = computeScale(chargePercent)
      this._group.scale.set(1, scaleY, 1)
    }
  }

  /**
   * 恢复角色 Y 轴缩放为 1.0（落地恢复）
   */
  resetScale() {
    if (this._group) {
      this._group.scale.set(1, 1, 1)
    }
  }

  /**
   * 获取角色当前位置
   * @returns {{ x: number, y: number, z: number }}
   */
  getPosition() {
    if (this._group) {
      return {
        x: this._group.position.x,
        y: this._group.position.y,
        z: this._group.position.z
      }
    }
    return { x: 0, y: 0, z: 0 }
  }
}

export default PlayerRenderer
