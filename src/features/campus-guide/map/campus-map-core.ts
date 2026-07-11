import { CAMPUS_GUIDE_CONFIG } from '../config'
import type { CampusSpot, GeoPoint } from '../types'
import { applyMarkerDodge, visibleDodgedSpots } from './marker-dodge'
import { buildMarkerStyles, buildSpotMarkerStyles, spotToMarkerGeometry } from './marker-manager'
import {
  loadTencentMap,
  toLatLng,
  type TencentLayer,
  type TencentMapInstance,
  type TencentMapNamespace
} from './tencent-map-loader'

export type CampusMapCoreOptions = {
  center: GeoPoint
  aoiRings?: GeoPoint[][]
  selectedSpotId?: string | number
  onMarkerClick?: (spot: CampusSpot) => void
  onZoomChange?: (zoom: number) => void
}

export class CampusMapCore {
  private container: HTMLElement
  private options: CampusMapCoreOptions
  private TMap: TencentMapNamespace | null = null
  private map: TencentMapInstance | null = null
  private markerLayer: TencentLayer | null = null
  private aoiLayer: TencentLayer | null = null
  private locationLayer: TencentLayer | null = null
  private polylineLayer: TencentLayer | null = null
  private customLayer: TencentLayer | null = null
  private spotMap = new Map<string, CampusSpot>()
  private lastSpots: CampusSpot[] = []
  private lastSelectedSpotId?: string | number
  private lastSpotSignature = ''
  private zoomRefreshTimer: ReturnType<typeof setTimeout> | null = null

  constructor(container: HTMLElement, options: CampusMapCoreOptions) {
    this.container = container
    this.options = options
  }

  async init() {
    const TMap = await loadTencentMap()
    this.TMap = TMap
    const center = toLatLng(TMap, this.options.center)

    this.map = new TMap.Map(this.container, {
      center,
      zoom: CAMPUS_GUIDE_CONFIG.defaultZoom,
      minZoom: CAMPUS_GUIDE_CONFIG.minZoom,
      maxZoom: CAMPUS_GUIDE_CONFIG.maxZoom,
      viewMode: '2D',
      showControl: false,
      draggable: true,
      scrollable: true,
      doubleClickZoom: true,
      baseMap: {
        type: 'vector',
        features: ['base', 'building2d', 'point']
      }
    })

    await this.mountCustomLayer()
    this.renderAoi()
    this.bindZoomRefresh()
    return this.map
  }

  private bindZoomRefresh() {
    const refresh = () => {
      if (!this.lastSpots.length) return
      if (this.zoomRefreshTimer) clearTimeout(this.zoomRefreshTimer)
      this.zoomRefreshTimer = setTimeout(() => {
        this.renderSpots(this.lastSpots, this.lastSelectedSpotId)
        this.options.onZoomChange?.(this.getZoom())
      }, 120)
    }
    this.map?.on?.('zoom', refresh)
    this.map?.on?.('zoom_changed', refresh)
  }

  refreshMarkers() {
    if (!this.lastSpots.length) return
    this.renderSpots(this.lastSpots, this.lastSelectedSpotId)
  }

  private destroyMarkerLayer() {
    if (!this.markerLayer) return
    this.markerLayer.setMap?.(null)
    this.markerLayer.destroy?.()
    this.markerLayer = null
  }

  private resolveVisibleSpots(spots: CampusSpot[], zoom: number, selectedSpot: CampusSpot | null) {
    if (!CAMPUS_GUIDE_CONFIG.markerDodge) return spots
    return visibleDodgedSpots(applyMarkerDodge(spots, zoom, selectedSpot))
  }

  private buildSpotSignature(spots: CampusSpot[]) {
    return spots.map((spot) => String(spot.spot_id)).join('|')
  }

  private bindMarkerClick() {
    this.markerLayer?.on?.('click', (event: unknown) => {
      const payload = event as {
        geometry?: { id?: string }
        detail?: { geometry?: { id?: string } }
      }
      const id = payload?.geometry?.id || payload?.detail?.geometry?.id
      if (!id) return
      const spot = this.spotMap.get(id)
      if (spot) this.options.onMarkerClick?.(spot)
    })
  }

  private async mountCustomLayer() {
    if (!this.TMap || !this.map) return
    try {
      const layer = await this.TMap.ImageTileLayer.createCustomLayer({
        layerId: CAMPUS_GUIDE_CONFIG.customLayerId,
        map: this.map,
        minZoom: CAMPUS_GUIDE_CONFIG.minZoom,
        maxZoom: CAMPUS_GUIDE_CONFIG.maxZoom,
        zIndex: 1,
        opacity: 1
      })
      if (layer) this.customLayer = layer
    } catch {
      // 手绘图层鉴权失败时保留标准底图
    }
  }

  private renderAoi() {
    if (!this.TMap || !this.map || !this.options.aoiRings?.length) return
    const geometries = this.options.aoiRings
      .map((ring, index) => {
        const paths = ring.map((point) => toLatLng(this.TMap!, point))
        return paths.length >= 3 ? { id: `aoi-${index}`, paths } : null
      })
      .filter(Boolean)

    if (!geometries.length) return

    this.aoiLayer = new this.TMap.MultiPolygon({
      map: this.map,
      styles: {
        campus: {
          color: 'rgba(0, 116, 207, 0.08)',
          showBorder: true,
          borderColor: 'rgba(0, 116, 207, 0.45)',
          borderWidth: 2
        }
      },
      geometries: geometries.map((item) => ({
        id: item!.id,
        styleId: 'campus',
        paths: item!.paths
      }))
    })
  }

  setCenter(point: GeoPoint, zoom?: number) {
    if (!this.TMap || !this.map) return
    this.map.setCenter(toLatLng(this.TMap, point))
    if (typeof zoom === 'number') this.map.setZoom(zoom)
  }

  getZoom() {
    return Number((this.map as { getZoom?: () => number })?.getZoom?.() ?? CAMPUS_GUIDE_CONFIG.defaultZoom)
  }

  renderSpots(spots: CampusSpot[], selectedSpotId?: string | number) {
    if (!this.TMap || !this.map) return
    this.lastSpots = spots
    this.lastSelectedSpotId = selectedSpotId
    this.spotMap.clear()
    const selected = selectedSpotId ?? this.options.selectedSpotId
    const selectedSpot = spots.find((spot) => String(spot.spot_id) === String(selected ?? '')) || null
    const zoom = this.getZoom()
    const visibleSpots = this.resolveVisibleSpots(spots, zoom, selectedSpot)
    const styles = buildSpotMarkerStyles(
      this.TMap as unknown as { MarkerStyle: new (o: Record<string, unknown>) => unknown },
      visibleSpots,
      selected
    )
    const geometries = visibleSpots
      .map((spot, index) => {
        const geometry = spotToMarkerGeometry(spot, index, selected)
        if (!geometry) return null
        const id = String(spot.spot_id || index)
        this.spotMap.set(id, spot)
        return {
          ...geometry,
          position: toLatLng(this.TMap!, geometry.position as GeoPoint)
        }
      })
      .filter(Boolean)

    const signature = this.buildSpotSignature(spots)
    const categoryChanged = signature !== this.lastSpotSignature
    this.lastSpotSignature = signature

    // 始终写入 geometries（含空数组）以清掉上一分类残留；无有效坐标时不早退
    if (!categoryChanged && this.markerLayer) {
      this.markerLayer.setStyles?.(styles)
      this.markerLayer.setGeometries?.(geometries)
      return
    }

    // 分类切换时销毁旧图层，否则残留上一分类标点
    this.destroyMarkerLayer()
    this.markerLayer = new this.TMap.MultiMarker({
      map: this.map,
      styles,
      geometries,
      zIndex: 120
    })
    this.bindMarkerClick()
  }

  renderLocation(point: GeoPoint) {
    if (!this.TMap || !this.map) return
    const styles = buildMarkerStyles(this.TMap as unknown as { MarkerStyle: new (o: Record<string, unknown>) => unknown })
    const geometry = {
      id: 'user-location',
      styleId: 'location',
      position: toLatLng(this.TMap, point),
      properties: { title: point.name || '当前位置' }
    }
    if (!this.locationLayer) {
      this.locationLayer = new this.TMap.MultiMarker({ map: this.map, styles, geometries: [geometry] })
      return
    }
    this.locationLayer.setGeometries?.([geometry])
  }

  renderPolylines(segments: GeoPoint[][], color = CAMPUS_GUIDE_CONFIG.themeColor) {
    if (!this.TMap || !this.map) return
    const geometries = segments
      .map((segment, index) => {
        const paths = segment.map((point) => toLatLng(this.TMap!, point))
        return paths.length >= 2 ? { id: `route-${index}`, paths } : null
      })
      .filter(Boolean)
    const styles = {
      route: {
        color,
        width: 6,
        borderColor: '#ffffff',
        borderWidth: 2,
        lineCap: 'round'
      }
    }
    if (!this.polylineLayer) {
      this.polylineLayer = new this.TMap.MultiPolyline({
        map: this.map,
        styles,
        geometries: geometries.map((item) => ({
          id: item!.id,
          styleId: 'route',
          paths: item!.paths
        }))
      })
      return
    }
    this.polylineLayer.setGeometries?.(
      geometries.map((item) => ({ id: item!.id, styleId: 'route', paths: item!.paths }))
    )
  }

  clearPolylines() {
    this.polylineLayer?.setGeometries?.([])
  }

  resize() {
    const map = this.map as { resize?: () => void } | null
    map?.resize?.()
  }

  fitPoints(points: GeoPoint[]) {
    if (!this.TMap || !this.map || !points.length) return
    const latitudes = points.map((p) => p.latitude)
    const longitudes = points.map((p) => p.longitude)
    const bounds = {
      sw: new this.TMap.LatLng(Math.min(...latitudes), Math.min(...longitudes)),
      ne: new this.TMap.LatLng(Math.max(...latitudes), Math.max(...longitudes))
    }
    ;(this.map as { fitBounds?: (b: unknown, opts?: unknown) => void }).fitBounds?.(bounds, { padding: 80 })
  }

  destroy() {
    if (this.zoomRefreshTimer) {
      clearTimeout(this.zoomRefreshTimer)
      this.zoomRefreshTimer = null
    }
    this.markerLayer?.destroy?.()
    this.aoiLayer?.destroy?.()
    this.locationLayer?.destroy?.()
    this.polylineLayer?.destroy?.()
    this.customLayer?.destroy?.()
    this.map?.destroy?.()
    this.markerLayer = null
    this.aoiLayer = null
    this.locationLayer = null
    this.polylineLayer = null
    this.customLayer = null
    this.map = null
    this.TMap = null
    this.spotMap.clear()
    this.lastSpotSignature = ''
  }
}