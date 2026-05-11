import * as THREE from 'three'

/**
 * 宿舍楼 - 窄高方块 + 侧面 4-6 层阳台凸起
 * 主色 #CD5C5C, 阳台 #E8A0A0
 * 尺寸 1.5×1.2×2.2
 */
export function create() {
  const group = new THREE.Group()
  const mainMat = new THREE.MeshLambertMaterial({ color: 0xCD5C5C })
  const balconyMat = new THREE.MeshLambertMaterial({ color: 0xE8A0A0 })

  // 窄高方块主体
  const bodyGeo = new THREE.BoxGeometry(1.5, 2.2, 1.2)
  const body = new THREE.Mesh(bodyGeo, mainMat)
  body.position.set(0, 1.1, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 侧面 5 层阳台凸起
  const balconyGeo = new THREE.BoxGeometry(0.15, 0.25, 0.8)
  for (let i = 0; i < 5; i++) {
    const balcony = new THREE.Mesh(balconyGeo, balconyMat)
    balcony.position.set(0.82, 0.35 + i * 0.4, 0)
    balcony.castShadow = true
    balcony.receiveShadow = true
    group.add(balcony)
  }

  return group
}
