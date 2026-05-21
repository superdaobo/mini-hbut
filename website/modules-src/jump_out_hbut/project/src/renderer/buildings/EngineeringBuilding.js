import * as THREE from 'three'

/**
 * 工程技术综合楼 - 高层主体 + 侧翼低矮方块 + 顶部设备层
 * 主色 #8B4513
 * 尺寸 2.8×2.2×2.5
 */
export function create() {
  const group = new THREE.Group()
  const mainMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 })
  const equipMat = new THREE.MeshLambertMaterial({ color: 0x6B3310 })

  // 高层主体
  const mainGeo = new THREE.BoxGeometry(1.8, 2.2, 1.6)
  const mainMesh = new THREE.Mesh(mainGeo, mainMat)
  mainMesh.position.set(0, 1.1, 0)
  mainMesh.castShadow = true
  mainMesh.receiveShadow = true
  group.add(mainMesh)

  // 侧翼低矮方块
  const wingGeo = new THREE.BoxGeometry(0.85, 1.2, 1.6)
  const wingMesh = new THREE.Mesh(wingGeo, mainMat)
  wingMesh.position.set(0.95, 0.6, 0)
  wingMesh.castShadow = true
  wingMesh.receiveShadow = true
  group.add(wingMesh)

  // 另一侧翼
  const wing2Mesh = new THREE.Mesh(wingGeo, mainMat)
  wing2Mesh.position.set(-0.95, 0.6, 0)
  wing2Mesh.castShadow = true
  wing2Mesh.receiveShadow = true
  group.add(wing2Mesh)

  // 顶部设备层
  const equipGeo = new THREE.BoxGeometry(1.2, 0.3, 1.0)
  const equipMesh = new THREE.Mesh(equipGeo, equipMat)
  equipMesh.position.set(0, 2.35, 0)
  equipMesh.castShadow = true
  equipMesh.receiveShadow = true
  group.add(equipMesh)

  return group
}
