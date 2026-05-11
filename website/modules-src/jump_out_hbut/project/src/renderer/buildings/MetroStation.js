import * as THREE from 'three'

/**
 * 地铁站 - 低矮方块 + 圆形 M 标志 + 斜坡入口
 * 主色 #003DA5, 标志 #FFD700
 * 尺寸 1.5×1.5×0.8
 */
export function create() {
  const group = new THREE.Group()
  const mainMat = new THREE.MeshLambertMaterial({ color: 0x003DA5 })
  const signMat = new THREE.MeshLambertMaterial({ color: 0xFFD700 })

  // 低矮方块主体
  const bodyGeo = new THREE.BoxGeometry(1.5, 0.5, 1.5)
  const body = new THREE.Mesh(bodyGeo, mainMat)
  body.position.set(0, 0.25, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 圆形 M 标志（用圆环模拟）
  const signGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16)
  const sign = new THREE.Mesh(signGeo, signMat)
  sign.position.set(0, 0.65, 0.7)
  sign.rotation.x = Math.PI / 2
  sign.castShadow = false
  sign.receiveShadow = false
  group.add(sign)

  // 斜坡入口
  const rampGeo = new THREE.BoxGeometry(0.6, 0.15, 0.8)
  const ramp = new THREE.Mesh(rampGeo, mainMat)
  ramp.position.set(0, 0.1, 1.0)
  ramp.rotation.x = -0.2
  ramp.castShadow = true
  ramp.receiveShadow = true
  group.add(ramp)

  return group
}
