import * as THREE from 'three'

/**
 * 南门 - 两侧门柱 + 顶部横梁 + 牌匾
 * 主色 #8B0000, 牌匾 #FFD700
 * 尺寸 2.2×1.5×1.8
 */
export function create() {
  const group = new THREE.Group()
  const mainMat = new THREE.MeshLambertMaterial({ color: 0x8B0000 })
  const plaqueMat = new THREE.MeshLambertMaterial({ color: 0xFFD700 })

  // 左门柱
  const pillarGeo = new THREE.BoxGeometry(0.4, 1.8, 0.4)
  const leftPillar = new THREE.Mesh(pillarGeo, mainMat)
  leftPillar.position.set(-0.8, 0.9, 0)
  leftPillar.castShadow = true
  leftPillar.receiveShadow = true
  group.add(leftPillar)

  // 右门柱
  const rightPillar = new THREE.Mesh(pillarGeo, mainMat)
  rightPillar.position.set(0.8, 0.9, 0)
  rightPillar.castShadow = true
  rightPillar.receiveShadow = true
  group.add(rightPillar)

  // 顶部横梁
  const beamGeo = new THREE.BoxGeometry(2.2, 0.3, 0.5)
  const beam = new THREE.Mesh(beamGeo, mainMat)
  beam.position.set(0, 1.65, 0)
  beam.castShadow = true
  beam.receiveShadow = true
  group.add(beam)

  // 牌匾
  const plaqueGeo = new THREE.BoxGeometry(1.0, 0.3, 0.1)
  const plaque = new THREE.Mesh(plaqueGeo, plaqueMat)
  plaque.position.set(0, 1.4, 0.3)
  plaque.castShadow = false
  plaque.receiveShadow = false
  group.add(plaque)

  return group
}
