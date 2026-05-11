import * as THREE from 'three'

/**
 * 实验楼 - 灰白色方块 + 屋顶 2-3 个圆柱烟囱
 * 主色 #B0B0B0, 烟囱 #808080
 * 尺寸 2.0×1.8×2.0
 */
export function create() {
  const group = new THREE.Group()
  const mainMat = new THREE.MeshLambertMaterial({ color: 0xB0B0B0 })
  const chimneyMat = new THREE.MeshLambertMaterial({ color: 0x808080 })

  // 灰白色方块主体
  const bodyGeo = new THREE.BoxGeometry(2.0, 1.7, 1.8)
  const body = new THREE.Mesh(bodyGeo, mainMat)
  body.position.set(0, 0.85, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 屋顶 3 个圆柱烟囱
  const chimneyGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8)
  const chimneyPositions = [
    [-0.5, 1.9, 0],
    [0, 1.9, -0.3],
    [0.5, 1.9, 0.2]
  ]
  chimneyPositions.forEach(([x, y, z]) => {
    const chimney = new THREE.Mesh(chimneyGeo, chimneyMat)
    chimney.position.set(x, y, z)
    chimney.castShadow = true
    chimney.receiveShadow = true
    group.add(chimney)
  })

  return group
}
