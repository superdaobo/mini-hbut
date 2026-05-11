import * as THREE from 'three'

/**
 * 南湖桥 - 长条弧形桥面 + 两侧栏杆 + 弧形装饰（TubeGeometry）
 * 主色 #808080, 栏杆 #A0A0A0
 * 尺寸 4.0×1.0×0.5
 */
export function create() {
  const group = new THREE.Group()
  const mainMat = new THREE.MeshLambertMaterial({ color: 0x808080 })
  const railMat = new THREE.MeshLambertMaterial({ color: 0xA0A0A0 })

  // 长条弧形桥面（用扁平 Box 模拟）
  const deckGeo = new THREE.BoxGeometry(4.0, 0.2, 1.0)
  const deck = new THREE.Mesh(deckGeo, mainMat)
  deck.position.set(0, 0.1, 0)
  deck.castShadow = true
  deck.receiveShadow = true
  group.add(deck)

  // 弧形装饰（TubeGeometry）
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.8, 0.2, 0),
    new THREE.Vector3(-0.9, 0.5, 0),
    new THREE.Vector3(0, 0.6, 0),
    new THREE.Vector3(0.9, 0.5, 0),
    new THREE.Vector3(1.8, 0.2, 0)
  ])
  const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.04, 8, false)
  const tube = new THREE.Mesh(tubeGeo, railMat)
  tube.castShadow = true
  tube.receiveShadow = true
  group.add(tube)

  // 两侧栏杆
  const railGeo = new THREE.BoxGeometry(3.8, 0.15, 0.05)
  const leftRail = new THREE.Mesh(railGeo, railMat)
  leftRail.position.set(0, 0.3, 0.45)
  leftRail.castShadow = true
  leftRail.receiveShadow = true
  group.add(leftRail)

  const rightRail = new THREE.Mesh(railGeo, railMat)
  rightRail.position.set(0, 0.3, -0.45)
  rightRail.castShadow = true
  rightRail.receiveShadow = true
  group.add(rightRail)

  return group
}
