import * as THREE from 'three'

/**
 * 活动中心 - 不规则多边形组合 + 圆柱装饰
 * 主色 #4682B4, 装饰 #5F9EA0
 * 尺寸 2.0×2.0×1.5
 */
export function create() {
  const group = new THREE.Group()
  const mainMat = new THREE.MeshLambertMaterial({ color: 0x4682B4 })
  const decoMat = new THREE.MeshLambertMaterial({ color: 0x5F9EA0 })

  // 主体不规则多边形（用多边形柱体模拟）
  const mainGeo = new THREE.CylinderGeometry(0.9, 1.0, 1.2, 6)
  const mainMesh = new THREE.Mesh(mainGeo, mainMat)
  mainMesh.position.set(0, 0.6, 0)
  mainMesh.castShadow = true
  mainMesh.receiveShadow = true
  group.add(mainMesh)

  // 侧面方块附属
  const sideGeo = new THREE.BoxGeometry(0.8, 1.0, 0.8)
  const sideMesh = new THREE.Mesh(sideGeo, mainMat)
  sideMesh.position.set(0.8, 0.5, 0.5)
  sideMesh.castShadow = true
  sideMesh.receiveShadow = true
  group.add(sideMesh)

  // 圆柱装饰
  const cylGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.5, 8)
  const cyl = new THREE.Mesh(cylGeo, decoMat)
  cyl.position.set(-0.7, 0.75, 0.7)
  cyl.castShadow = true
  cyl.receiveShadow = true
  group.add(cyl)

  return group
}
