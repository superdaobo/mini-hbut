import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CAMPUS_MAP_BUILDINGS_URL,
  CAMPUS_MAP_CONFIG_BASE,
  CAMPUS_MAP_DIRECTION_PROXY,
  CAMPUS_MAP_MANIFEST_URL,
  CAMPUS_MAP_SCHEMA_VERSION
} from './constants'
import {
  parseCampusBuildingsPayload,
  parseCampusMapConfig,
  parseCampusMapManifest
} from './data/schema'
import { searchCampusBuildings } from './data/search'
import { decodeTencentPolyline } from './services/walking_route_service'
import fallbackBuildings from './fixtures/buildings.json'
import fallbackConfig from './fixtures/config.json'
import fallbackManifest from './fixtures/manifest.json'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('campus map contract', () => {
  it('keeps remote config URLs and schema version aligned', () => {
    expect(CAMPUS_MAP_SCHEMA_VERSION).toBe('1')
    expect(CAMPUS_MAP_CONFIG_BASE).toContain('mini-hbut-config')
    expect(CAMPUS_MAP_MANIFEST_URL).toContain('/campus_map/manifest.json')
    expect(CAMPUS_MAP_BUILDINGS_URL).toContain('/campus_map/buildings.json')
    expect(CAMPUS_MAP_DIRECTION_PROXY).toBe('/campus-map/direction')
  })

  it('parses bundled fixtures with the shared schema', () => {
    const manifest = parseCampusMapManifest(fallbackManifest)
    const config = parseCampusMapConfig(fallbackConfig)
    const buildings = parseCampusBuildingsPayload(fallbackBuildings)

    expect(manifest.version).toBeTruthy()
    expect(config.center.lat).toBeGreaterThan(0)
    expect(buildings.length).toBeGreaterThan(5)
  })

  it('searches buildings by name and alias', () => {
    const buildings = parseCampusBuildingsPayload(fallbackBuildings)
    expect(searchCampusBuildings(buildings, '一教')[0]?.id).toBe('j1')
    expect(searchCampusBuildings(buildings, '图书馆')[0]?.id).toBe('library')
  })

  it('decodes tencent walking polyline deltas', () => {
    const points = decodeTencentPolyline([30481900, 114313000, 100, 200, -50, 100])
    expect(points[0]).toEqual({ lat: 30.4819, lng: 114.313 })
    expect(points[1].lat).toBeCloseTo(30.482, 6)
    expect(points[1].lng).toBeCloseTo(114.3132, 6)
    expect(points[2].lat).toBeCloseTo(30.48195, 6)
    expect(points[2].lng).toBeCloseTo(114.3133, 6)
  })

  it('wires campus map direction proxy through vite and tauri bridge', () => {
    const vite = read('vite.config.ts')
    const bridge = read('src-tauri/src/http_server.rs')
    const view = read('src/components/CampusMapView.vue')

    expect(vite).toContain("'/campus-map'")
    expect(bridge).toContain('.route("/campus-map/direction", get(campus_map_direction_proxy))')
    expect(bridge).toContain('CAMPUS_MAP_DIRECTION_BASE')
    expect(view).toContain('useCampusMap')
    expect(view).not.toContain('map1.jpg')
  })

  it('uses MarkerStyle for building pins so Tencent MultiMarker is visible', () => {
    const controller = read('src/features/campus-map/map/campus_map_controller.ts')
    const markers = read('src/features/campus-map/map/campus_map_markers.ts')
    expect(markers).toContain('buildCampusBuildingMarkerStyles')
    expect(markers).toContain('MarkerStyle')
    expect(controller).toContain('buildCampusBuildingMarkerStyles')
    expect(controller).toContain('styleId')
    expect(controller).toContain('campusBuildingStyleId')
  })
})
