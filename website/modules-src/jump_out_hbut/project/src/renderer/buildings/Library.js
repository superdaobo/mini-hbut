import * as THREE from 'three'

/**
 * 图书馆 - 3 层方块堆叠 + 正面半透明蓝色玻璃幕墙
 * 主色 #5B7B8A, 玻璃 #87CEEB (opacity: 0.6)
 * 尺寸 3.0×2.5×2.0
 */
export function create() {
  const group = new THREE.Group()
  const mainColor = 0x5B7B8A
  const glassColor = 0x87CEEB

  const mainMat = new THREE.MeshLambertMaterial({ color: mainColor })
  const glassMat = new THREE.MeshLambertMaterial({
    color: glassColor,
    transparent: true,
    opacity: 0.6
  })

  // 3 层方块堆叠，每层略小
  const layers = [
    { w: 3.0, h: 0.7, d: 2.5, y: 0.35 },
    { w: 2.8, h: 0.65, d: 2.3, y: 1.025 },
    { w: 2.6, h: 0.6, d: 2.1, y: 1.65 }
  ]

  layers.forEach(l => {
    const geo = new THREE.BoxGeometry(l.w, l.h, l.d)
    const mesh = new THREE.Mesh(geo, mainMat)
    mesh.position.set(0, l.y, 0)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  })

  // 正面玻璃幕墙
  const glassGeo = new THREE.BoxGeometry(2.6, 1.8, 0.05)
  const glassMesh = new THREE.Mesh(glassGeo, glassMat)
  glassMesh.position.set(0, 1.0, 1.25)
  glassMesh.castShadow = false
  glassMesh.receiveShadow = false
  group.add(glassMesh)

  return group
}
