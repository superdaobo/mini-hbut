import * as THREE from 'three'

/**
 * 北门 - 现代风格斜柱 + 水平横梁
 * 主色 #4A4A4A
 * 尺寸 2.0×1.5×1.6
 */
export function create() {
  const group = new THREE.Group()
  const mainMat = new THREE.MeshLambertMaterial({ color: 0x4A4A4A })

  // 左斜柱
  const pillarGeo = new THREE.BoxGeometry(0.2, 1.8, 0.2)
  const leftPillar = new THREE.Mesh(pillarGeo, mainMat)
  leftPillar.position.set(-0.7, 0.8, 0)
  leftPillar.rotation.z = 0.15
  leftPillar.castShadow = true
  leftPillar.receiveShadow = true
  group.add(leftPillar)

  // 右斜柱
  const rightPillar = new THREE.Mesh(pillarGeo, mainMat)
  rightPillar.position.set(0.7, 0.8, 0)
  rightPillar.rotation.z = -0.15
  rightPillar.castShadow = true
  rightPillar.receiveShadow = true
  group.add(rightPillar)

  // 水平横梁
  const beamGeo = new THREE.BoxGeometry(2.0, 0.2, 0.4)
  const beam = new THREE.Mesh(beamGeo, mainMat)
  beam.position.set(0, 1.5, 0)
  beam.castShadow = true
  beam.receiveShadow = true
  group.add(beam)

  // 底部基座
  const baseGeo = new THREE.BoxGeometry(2.0, 0.15, 1.5)
  const base = new THREE.Mesh(baseGeo, mainMat)
  base.position.set(0, 0.075, 0)
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)

  return group
}
