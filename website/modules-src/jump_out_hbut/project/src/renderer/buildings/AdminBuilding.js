import * as THREE from 'three'

/**
 * 行政楼 - 对称方块 + 中央门廊凸出
 * 主色 #F5DEB3, 门廊 #DEB887
 * 尺寸 2.2×1.8×1.6
 */
export function create() {
  const group = new THREE.Group()
  const mainMat = new THREE.MeshLambertMaterial({ color: 0xF5DEB3 })
  const porchMat = new THREE.MeshLambertMaterial({ color: 0xDEB887 })

  // 对称方块主体
  const bodyGeo = new THREE.BoxGeometry(2.2, 1.4, 1.8)
  const body = new THREE.Mesh(bodyGeo, mainMat)
  body.position.set(0, 0.7, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 中央门廊凸出
  const porchGeo = new THREE.BoxGeometry(0.8, 1.6, 0.28)
  const porch = new THREE.Mesh(porchGeo, porchMat)
  porch.position.set(0, 0.8, 0.96)
  porch.castShadow = true
  porch.receiveShadow = true
  group.add(porch)

  // 门廊顶部三角装饰
  const topGeo = new THREE.BoxGeometry(1.0, 0.2, 0.5)
  const top = new THREE.Mesh(topGeo, porchMat)
  top.position.set(0, 1.5, 0.96)
  top.castShadow = true
  top.receiveShadow = true
  group.add(top)

  return group
}
