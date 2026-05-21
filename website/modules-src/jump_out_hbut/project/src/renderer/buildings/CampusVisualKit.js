import * as THREE from 'three'

const CAMPUS_META = {
  library: { name: '湖工图书馆', accent: 0x2563eb, sign: 0x1e3a8a },
  engineering: { name: '湖工工程楼', accent: 0xf97316, sign: 0x7c2d12 },
  gymnasium: { name: '湖工体育馆', accent: 0x22c55e, sign: 0x166534 },
  south_gate: { name: '湖工南门', accent: 0xfacc15, sign: 0x991b1b },
  north_gate: { name: '湖工北门', accent: 0x38bdf8, sign: 0x334155 },
  canteen: { name: '湖工食堂', accent: 0xfb923c, sign: 0x9a3412 },
  teaching: { name: '湖工教学楼', accent: 0x60a5fa, sign: 0x1e3a8a },
  laboratory: { name: '湖工实验楼', accent: 0x34d399, sign: 0x047857 },
  dormitory: { name: '湖工宿舍', accent: 0xf472b6, sign: 0x9d174d },
  admin: { name: '湖工行政楼', accent: 0xfbbf24, sign: 0x92400e },
  activity_center: { name: '湖工活动中心', accent: 0xa78bfa, sign: 0x5b21b6 },
  metro_station: { name: '湖工地铁站', accent: 0xfacc15, sign: 0x1d4ed8 },
  nanhu_bridge: { name: '南湖桥', accent: 0x38bdf8, sign: 0x0369a1 }
}

const materialCache = new Map()

function material(color, options = {}) {
  const key = `${color}:${options.transparent ? options.opacity : 1}`
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshLambertMaterial({
      color,
      transparent: Boolean(options.transparent),
      opacity: options.opacity ?? 1
    }))
  }
  return materialCache.get(key)
}

function tag(object, ...tags) {
  object.userData.hbutTags = [...new Set([...(object.userData.hbutTags || []), ...tags])]
  if (tags[0]) object.userData.campusRole = tags[0]
  return object
}

function addLandingOutline(group, size, meta) {
  const railMat = material(meta.accent)
  const railHeight = 0.035
  const railWidth = 0.045
  const y = size.height + railHeight / 2 + 0.015
  const z = Math.max(0.2, size.depth / 2 - railWidth / 2)
  const x = Math.max(0.2, size.width / 2 - railWidth / 2)

  const frontBackGeo = new THREE.BoxGeometry(size.width - 0.12, railHeight, railWidth)
  const sideGeo = new THREE.BoxGeometry(railWidth, railHeight, size.depth - 0.12)

  const rails = [
    { geo: frontBackGeo, pos: [0, y, z] },
    { geo: frontBackGeo, pos: [0, y, -z] },
    { geo: sideGeo, pos: [x, y, 0] },
    { geo: sideGeo, pos: [-x, y, 0] }
  ]

  rails.forEach(({ geo, pos }) => {
    const rail = tag(new THREE.Mesh(geo, railMat), 'landing-safe-outline', 'detail-layer')
    rail.position.set(...pos)
    rail.castShadow = false
    rail.receiveShadow = false
    group.add(rail)
  })
}

function addCampusSign(group, size, meta) {
  const signWidth = Math.min(size.width * 0.62, 1.35)
  const signHeight = Math.min(size.height * 0.18, 0.32)
  const y = Math.max(0.34, Math.min(size.height - 0.18, size.height * 0.52))
  const z = size.depth / 2 + 0.032

  const sign = tag(
    new THREE.Mesh(
      new THREE.BoxGeometry(signWidth, signHeight, 0.035),
      material(meta.sign)
    ),
    'campus-sign',
    'detail-layer'
  )
  sign.position.set(0, y, z)
  sign.castShadow = false
  sign.receiveShadow = false
  group.add(sign)

  const badge = tag(
    new THREE.Mesh(
      new THREE.BoxGeometry(signWidth * 0.24, signHeight * 0.22, 0.04),
      material(meta.accent)
    ),
    'campus-sign',
    'detail-layer'
  )
  badge.position.set(-signWidth * 0.3, y + signHeight * 0.02, z + 0.018)
  badge.castShadow = false
  badge.receiveShadow = false
  group.add(badge)
}

function addWindowGrid(group, size, meta) {
  if (size.height < 0.9) return

  const cols = Math.max(2, Math.min(4, Math.floor(size.width / 0.55)))
  const rows = Math.max(2, Math.min(4, Math.floor(size.height / 0.45)))
  const count = cols * rows
  const windowGeo = new THREE.BoxGeometry(0.22, 0.16, 0.025)
  const windows = tag(
    new THREE.InstancedMesh(windowGeo, material(0xdbeafe, { transparent: true, opacity: 0.82 }), count),
    'detail-layer'
  )
  const matrix = new THREE.Matrix4()
  const xStep = (size.width * 0.72) / Math.max(1, cols - 1)
  const yStep = (size.height * 0.52) / Math.max(1, rows - 1)
  let index = 0

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = cols === 1 ? 0 : -size.width * 0.36 + col * xStep
      const y = size.height * 0.28 + row * yStep
      const z = size.depth / 2 + 0.046
      matrix.makeTranslation(x, y, z)
      windows.setMatrixAt(index, matrix)
      index++
    }
  }

  windows.instanceMatrix.needsUpdate = true
  windows.castShadow = false
  windows.receiveShadow = false
  group.add(windows)
}

function addCampusPlinth(group, size, meta) {
  const plinth = tag(
    new THREE.Mesh(
      new THREE.BoxGeometry(size.width * 0.92, 0.06, size.depth * 0.92),
      material(meta.accent, { transparent: true, opacity: 0.78 })
    ),
    'detail-layer'
  )
  plinth.position.set(0, 0.03, 0)
  plinth.castShadow = false
  plinth.receiveShadow = true
  group.add(plinth)
}

export function decorateCampusBuilding(type, group, size) {
  const meta = CAMPUS_META[type] || { name: '湖工地标', accent: 0x60a5fa, sign: 0x1e3a8a }

  group.userData = {
    ...group.userData,
    campusLandmark: true,
    displayName: meta.name,
    hbutTags: [...new Set([...(group.userData.hbutTags || []), 'hbut-campus'])]
  }

  addCampusPlinth(group, size, meta)
  addWindowGrid(group, size, meta)
  addCampusSign(group, size, meta)
  addLandingOutline(group, size, meta)

  return group
}
