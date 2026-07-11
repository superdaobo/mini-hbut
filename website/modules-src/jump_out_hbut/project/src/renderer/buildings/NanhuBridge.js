import * as THREE from 'three'
import { BUILDING_DATA } from '../../utils/constants.js'

/**
 * 南湖桥 - 桥面 + 两侧栏杆 + 弧形装饰
 * 尺寸跟随 BUILDING_DATA.nanhu_bridge（更方的落点矩形）
 */
export function create() {
  const group = new THREE.Group()
  const size = BUILDING_DATA.nanhu_bridge.size
  const w = size.width
  const d = size.depth
  const h = size.height
  const mainMat = new THREE.MeshLambertMaterial({ color: 0x808080 })
  const railMat = new THREE.MeshLambertMaterial({ color: 0xa0a0a0 })

  // 桥面：贴合逻辑 size
  const deckGeo = new THREE.BoxGeometry(w, Math.min(0.22, h * 0.4), d)
  const deck = new THREE.Mesh(deckGeo, mainMat)
  deck.position.set(0, Math.min(0.12, h * 0.25), 0)
  deck.castShadow = true
  deck.receiveShadow = true
  group.add(deck)

  // 弧形装饰
  const halfW = w * 0.42
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-halfW, 0.18, 0),
    new THREE.Vector3(-halfW * 0.5, Math.min(0.45, h * 0.7), 0),
    new THREE.Vector3(0, Math.min(0.52, h * 0.85), 0),
    new THREE.Vector3(halfW * 0.5, Math.min(0.45, h * 0.7), 0),
    new THREE.Vector3(halfW, 0.18, 0)
  ])
  const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.035, 8, false)
  const tube = new THREE.Mesh(tubeGeo, railMat)
  tube.castShadow = true
  tube.receiveShadow = true
  group.add(tube)

  // 两侧栏杆
  const railGeo = new THREE.BoxGeometry(w * 0.92, 0.14, 0.05)
  const zOffset = d * 0.42
  const leftRail = new THREE.Mesh(railGeo, railMat)
  leftRail.position.set(0, 0.28, zOffset)
  leftRail.castShadow = true
  leftRail.receiveShadow = true
  group.add(leftRail)

  const rightRail = new THREE.Mesh(railGeo, railMat)
  rightRail.position.set(0, 0.28, -zOffset)
  rightRail.castShadow = true
  rightRail.receiveShadow = true
  group.add(rightRail)

  return group
}
