import * as THREE from 'three'

/**
 * 体育馆 - 方形基座 + 半球体屋顶 + 4 根柱子
 * 主色 #A8A8A8
 * 尺寸 3.2×3.2×1.8
 */
export function create() {
  const group = new THREE.Group()
  const mainMat = new THREE.MeshLambertMaterial({ color: 0xA8A8A8 })
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x909090 })

  // 方形基座
  const baseGeo = new THREE.BoxGeometry(3.2, 0.6, 3.2)
  const baseMesh = new THREE.Mesh(baseGeo, mainMat)
  baseMesh.position.set(0, 0.3, 0)
  baseMesh.castShadow = true
  baseMesh.receiveShadow = true
  group.add(baseMesh)

  // 半球体屋顶
  const domeGeo = new THREE.SphereGeometry(1.4, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2)
  const domeMesh = new THREE.Mesh(domeGeo, mainMat)
  domeMesh.position.set(0, 0.6, 0)
  domeMesh.castShadow = true
  domeMesh.receiveShadow = true
  group.add(domeMesh)

  // 4 根柱子
  const pillarGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.2, 8)
  const positions = [
    [1.2, 0.6, 1.2],
    [-1.2, 0.6, 1.2],
    [1.2, 0.6, -1.2],
    [-1.2, 0.6, -1.2]
  ]
  positions.forEach(([x, y, z]) => {
    const pillar = new THREE.Mesh(pillarGeo, pillarMat)
    pillar.position.set(x, y, z)
    pillar.castShadow = true
    pillar.receiveShadow = true
    group.add(pillar)
  })

  return group
}
