import * as THREE from 'three'

/**
 * 食堂 - 扁平宽大方块 + 暖色调斜屋顶
 * 主色 #D2691E, 屋顶 #FF8C00
 * 尺寸 2.5×2.0×1.2
 */
export function create() {
  const group = new THREE.Group()
  const mainMat = new THREE.MeshLambertMaterial({ color: 0xD2691E })
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xFF8C00 })

  // 扁平宽大方块主体
  const bodyGeo = new THREE.BoxGeometry(2.5, 0.8, 2.0)
  const body = new THREE.Mesh(bodyGeo, mainMat)
  body.position.set(0, 0.4, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 斜屋顶（用缩放的 BoxGeometry 模拟）
  const roofGeo = new THREE.BoxGeometry(2.7, 0.3, 2.2)
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.position.set(0, 0.95, 0)
  roof.rotation.x = 0.05
  roof.castShadow = true
  roof.receiveShadow = true
  group.add(roof)

  return group
}
