import * as THREE from 'three'

/**
 * 教学楼 - 标准方块 + 正面 3×4 窗户凹槽阵列
 * 主色 #6B8E9B, 窗户 #1C3A4A
 * 尺寸 2.2×1.8×1.8
 */
export function create() {
  const group = new THREE.Group()
  const mainMat = new THREE.MeshLambertMaterial({ color: 0x6B8E9B })
  const windowMat = new THREE.MeshLambertMaterial({ color: 0x1C3A4A })

  // 主体方块
  const bodyGeo = new THREE.BoxGeometry(2.2, 1.8, 1.8)
  const body = new THREE.Mesh(bodyGeo, mainMat)
  body.position.set(0, 0.9, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // 正面 3×4 窗户凹槽阵列
  const winGeo = new THREE.BoxGeometry(0.3, 0.25, 0.05)
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const win = new THREE.Mesh(winGeo, windowMat)
      const x = (col - 1) * 0.6
      const y = 0.4 + row * 0.4
      win.position.set(x, y, 0.93)
      win.castShadow = false
      win.receiveShadow = false
      group.add(win)
    }
  }

  return group
}
