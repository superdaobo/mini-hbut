import { loadTencentMap, toTencentLatLng } from '../../../utils/tencent_map_loader'
import { TOWERGO_CONFIG } from '../../../utils/towergo_api'
import type { CampusBuilding, CampusMapConfig, MapLatLng } from '../types'
import { CAMPUS_MAP_CONTAINER_CLASS, injectCampusMapStyles } from './map_style'

type TMapInstance = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => TMapMap
  LatLng: new (lat: number, lng: number) => unknown
  LatLngBounds: new (sw: unknown, ne: unknown) => unknown
  MultiMarker: new (options: Record<string, unknown>) => TMapLayer
  MultiPolyline: new (options: Record<string, unknown>) => TMapLayer
}

type TMapMap = {
  setCenter: (center: unknown) => void
  setZoom: (zoom: number) => void
  fitBounds: (bounds: unknown, options?: Record<string, unknown>) => void
  destroy?: () => void
}

type TMapLayer = {
  setGeometries?: (geometries: unknown[]) => void
  on?: (event: string, handler: (event: unknown) => void) => void
  setMap?: (map: TMapMap | null) => void
}

export type CampusMapMarkerClickHandler = (building: CampusBuilding) => void

export class CampusMapController {
  private map: TMapMap | null = null
  private TMap: TMapInstance | null = null
  private buildingLayer: TMapLayer | null = null
  private routeLayer: TMapLayer | null = null
  private userLayer: TMapLayer | null = null
  private buildings: CampusBuilding[] = []
  private onMarkerClick: CampusMapMarkerClickHandler | null = null

  async init(container: HTMLElement, config: CampusMapConfig) {
    if (!container.offsetWidth || !container.offsetHeight) {
      throw new Error('地图容器尺寸无效')
    }
    injectCampusMapStyles()
    container.classList.add(CAMPUS_MAP_CONTAINER_CLASS)

    this.TMap = (await loadTencentMap(TOWERGO_CONFIG.qqMapKey)) as TMapInstance
    const center = toTencentLatLng(this.TMap, config.center)
    this.map = new this.TMap.Map(container, {
      center,
      zoom: config.default_zoom,
      viewMode: '2D',
      baseMap: { type: 'vector' }
    })

    if (config.bounds) {
      const bounds = new this.TMap.LatLngBounds(
        toTencentLatLng(this.TMap, config.bounds.sw),
        toTencentLatLng(this.TMap, config.bounds.ne)
      )
      this.map.fitBounds(bounds, { padding: 48 })
    }
  }

  destroy() {
    this.buildingLayer?.setMap?.(null)
    this.routeLayer?.setMap?.(null)
    this.userLayer?.setMap?.(null)
    this.buildingLayer = null
    this.routeLayer = null
    this.userLayer = null
    this.map?.destroy?.()
    this.map = null
    this.TMap = null
  }

  setMarkerClickHandler(handler: CampusMapMarkerClickHandler | null) {
    this.onMarkerClick = handler
  }

  setBuildings(buildings: CampusBuilding[]) {
    this.buildings = buildings
    if (!this.map || !this.TMap) return

    const geometries = buildings.map((building) => ({
      id: building.id,
      position: toTencentLatLng(this.TMap!, { lat: building.lat, lng: building.lng }),
      properties: { title: building.name, category: building.category }
    }))

    if (!this.buildingLayer) {
      this.buildingLayer = new this.TMap.MultiMarker({ map: this.map, geometries })
      this.buildingLayer.on?.('click', (event: { geometry?: { id?: string } }) => {
        const id = event?.geometry?.id
        const target = this.buildings.find((item) => item.id === id)
        if (target) this.onMarkerClick?.(target)
      })
      return
    }
    this.buildingLayer.setGeometries?.(geometries)
  }

  focusBuilding(building: CampusBuilding, zoom = 18) {
    if (!this.map || !this.TMap) return
    this.map.setCenter(toTencentLatLng(this.TMap, { lat: building.lat, lng: building.lng }))
    this.map.setZoom(zoom)
  }

  setUserLocation(point: MapLatLng) {
    if (!this.map || !this.TMap) return
    const geometry = {
      id: 'user-location',
      position: toTencentLatLng(this.TMap, point),
      properties: { title: '我的位置' }
    }
    if (!this.userLayer) {
      this.userLayer = new this.TMap.MultiMarker({ map: this.map, geometries: [geometry] })
      return
    }
    this.userLayer.setGeometries?.([geometry])
  }

  setRoutePolyline(points: MapLatLng[]) {
    if (!this.map || !this.TMap) return
    if (!points.length) {
      this.routeLayer?.setGeometries?.([])
      return
    }
    const paths = points.map((point) => toTencentLatLng(this.TMap!, point))
    const geometry = { id: 'walking-route', paths }
    if (!this.routeLayer) {
      this.routeLayer = new this.TMap.MultiPolyline({
        map: this.map,
        geometries: [geometry],
        styles: {
          route: {
            color: '#6366f1',
            width: 6,
            borderColor: '#ffffff',
            borderWidth: 2,
            lineCap: 'round'
          }
        }
      })
      return
    }
    this.routeLayer.setGeometries?.([geometry])
  }

  clearRoute() {
    this.routeLayer?.setGeometries?.([])
  }
}
