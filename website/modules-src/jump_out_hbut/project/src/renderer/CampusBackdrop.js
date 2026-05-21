import * as THREE from 'three'

function tag(object, ...tags) {
  object.userData.hbutTags = [...new Set([...(object.userData.hbutTags || []), ...tags])]
  if (tags[0]) object.userData.campusRole = tags[0]
  return object
}

function makeBox(width, height, depth, color, tags) {
  const mesh = tag(
    new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshLambertMaterial({ color })
    ),
    ...tags
  )
  mesh.castShadow = false
  mesh.receiveShadow = true
  return mesh
}

export function createCampusBackdrop() {
  const group = new THREE.Group()
  group.userData = {
    displayName: '湖工校园背景',
    hbutTags: ['hbut-campus-backdrop']
  }

  const ground = makeBox(34, 0.04, 34, 0xd9f99d, ['campus-ground'])
  ground.position.set(0, -0.04, 8)
  group.add(ground)

  const nanhu = makeBox(11, 0.025, 5.2, 0x7dd3fc, ['nanhu-water'])
  nanhu.position.set(-8.5, -0.015, 10)
  group.add(nanhu)

  const lakeShine = makeBox(9.5, 0.026, 0.08, 0xe0f2fe, ['nanhu-water', 'detail-layer'])
  lakeShine.position.set(-8.5, 0.002, 9)
  group.add(lakeShine)

  const track = makeBox(8, 0.035, 2.8, 0xf97316, ['campus-track'])
  track.position.set(7.5, -0.01, 8)
  group.add(track)

  const trackField = makeBox(5.8, 0.038, 1.4, 0x22c55e, ['campus-track', 'detail-layer'])
  trackField.position.set(7.5, 0.012, 8)
  group.add(trackField)

  const road = makeBox(28, 0.032, 0.38, 0x64748b, ['campus-road'])
  road.position.set(0, 0, 3.6)
  group.add(road)

  const skylineMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 })
  const skylineHeights = [0.7, 1.05, 0.85, 1.25, 0.95, 0.75]
  skylineHeights.forEach((height, index) => {
    const tower = tag(
      new THREE.Mesh(new THREE.BoxGeometry(1.05, height, 0.5), skylineMat),
      'distant-skyline'
    )
    tower.position.set(-7 + index * 2.8, height / 2 - 0.02, 16)
    tower.castShadow = false
    tower.receiveShadow = true
    group.add(tower)
  })

  return group
}
