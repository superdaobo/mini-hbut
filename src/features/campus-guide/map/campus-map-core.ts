import { pushDebugLog } from '../../../utils/debug_logger'
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
  private customLayerReady = false
  private customLayerRetries = 0
  /** 含尺寸未就绪的调度次数上限，避免容器长期 0 尺寸时无限 timer */
  private customLayerScheduleCount = 0
  private spotMap = new Map<string, CampusSpot>()
  private lastSpots: CampusSpot[] = []
  private lastSelectedSpotId?: string | number
  private lastSpotSignature = ''
  /** 最近一次成功写入 MultiMarker 的几何数量（用于 UI 提示有数无点） */
  private lastPaintedMarkerCount = 0
  private zoomRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private customLayerRetryTimer: ReturnType<typeof setTimeout> | null = null

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
      // 手绘层优先：减少 2D 楼块/兴趣点遮挡自定义瓦片（#369 iOS）
      baseMap: {
        type: 'vector',
        features: ['base']
      }
    })

    // 首帧 container 在 iOS 上常为 0 尺寸，延后 + 重试挂载手绘层
    await this.mountCustomLayer()
    this.scheduleCustomLayerRetry()
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

  /**
   * 强制刷新 marker。
   * @param forceRecreate 为 true 时销毁重建 MultiMarker，避免 setStyles 残留导致有数无点
   */
  refreshMarkers(forceRecreate = false) {
    if (!this.lastSpots.length) return
    if (forceRecreate) {
      this.lastSpotSignature = ''
      this.destroyMarkerLayer()
    }
    this.renderSpots(this.lastSpots, this.lastSelectedSpotId)
  }

  getLastPaintedMarkerCount() {
    return this.lastPaintedMarkerCount
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

  private scheduleCustomLayerRetry() {
    if (this.customLayerReady) return
    if (this.customLayerRetries >= 4 || this.customLayerScheduleCount >= 10) return
    if (this.customLayerRetryTimer) clearTimeout(this.customLayerRetryTimer)
    this.customLayerScheduleCount += 1
    const delay = 400 + Math.min(this.customLayerScheduleCount, 6) * 350
    this.customLayerRetryTimer = setTimeout(() => {
      this.customLayerRetryTimer = null
      void this.mountCustomLayer()
      this.scheduleCustomLayerRetry()
    }, delay)
  }

  private async mountCustomLayer() {
    if (!this.TMap || !this.map || this.customLayerReady) return
    const layerId = CAMPUS_GUIDE_CONFIG.customLayerId
    const w = this.container?.clientWidth || 0
    const h = this.container?.clientHeight || 0
    let attempt = this.customLayerRetries
    try {
      // 尺寸为 0 时创建的自定义层在 iOS WKWebView 上常不可见（不计入失败次数）
      if (w < 8 || h < 8) {
        pushDebugLog(
          'CampusGuide',
          `手绘层延后挂载（容器未就绪） size=${w}x${h}`,
          'warn',
          { layerId, size: `${w}x${h}` }
        )
        return
      }
      this.customLayerRetries += 1
      attempt = this.customLayerRetries
      // 仅触发 SDK resize，避免递归 schedule
      const map = this.map as { resize?: () => void } | null
      map?.resize?.()
      const create = this.TMap.ImageTileLayer?.createCustomLayer
      if (typeof create !== 'function') {
        pushDebugLog('CampusGuide', 'ImageTileLayer.createCustomLayer 不可用', 'error', { layerId })
        return
      }
      // 销毁半成品层再挂，避免 iOS 重复创建失败
      if (this.customLayer) {
        try {
          this.customLayer.setMap?.(null)
          this.customLayer.destroy?.()
        } catch {
          // ignore
        }
        this.customLayer = null
      }
      const layer = await create({
        layerId,
        map: this.map,
        minZoom: CAMPUS_GUIDE_CONFIG.minZoom,
        maxZoom: CAMPUS_GUIDE_CONFIG.maxZoom,
        zIndex: 2,
        opacity: 1
      })
      if (layer) {
        this.customLayer = layer
        this.customLayerReady = true
        pushDebugLog(
          'CampusGuide',
          `手绘层挂载成功 attempt=${attempt} layerId=${layerId}`,
          'info',
          { layerId, attempt, size: `${w}x${h}` }
        )
        return
      }
      pushDebugLog(
        'CampusGuide',
        `手绘层返回空 attempt=${attempt} layerId=${layerId}`,
        'warn',
        { layerId, attempt }
      )
    } catch (err) {
      pushDebugLog(
        'CampusGuide',
        `手绘层挂载失败 attempt=${attempt}: ${(err as Error)?.message || err}`,
        'error',
        { layerId, attempt, err }
      )
      // 手绘图层鉴权/瓦片失败时保留标准底图
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
    // 过滤掉 styles 中 undefined 条目，避免 MultiMarker 静默不可见
    const safeStyles: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(styles)) {
      if (value != null) safeStyles[key] = value
    }
    const geometries = visibleSpots
      .map((spot, index) => {
        const geometry = spotToMarkerGeometry(spot, index, selected)
        if (!geometry) return null
        // styleId 必须在 styles 中存在，否则 pin 不显示
        if (!safeStyles[geometry.styleId]) return null
        const id = String(spot.spot_id || index)
        this.spotMap.set(id, spot)
        try {
          return {
            ...geometry,
            position: toLatLng(this.TMap!, geometry.position as GeoPoint)
          }
        } catch {
          return null
        }
      })
      .filter(Boolean)

    this.lastPaintedMarkerCount = geometries.length
    if (spots.length > 0 && geometries.length === 0) {
      pushDebugLog(
        'CampusGuide',
        `renderSpots: ${spots.length} 个点位均无有效几何（坐标/样式失败）`,
        'warn',
        { spots: spots.length, visible: visibleSpots.length }
      )
    }

    const signature = this.buildSpotSignature(spots)
    const categoryChanged = signature !== this.lastSpotSignature
    this.lastSpotSignature = signature

    // 有数无点常见于 setStyles 未生效：分类切换时强制重建；同分类尝试增量更新
    if (!categoryChanged && this.markerLayer) {
      try {
        this.markerLayer.setStyles?.(safeStyles)
        this.markerLayer.setGeometries?.(geometries)
        return
      } catch (err) {
        pushDebugLog(
          'CampusGuide',
          `setStyles/setGeometries 失败，重建 marker 层: ${(err as Error)?.message || err}`,
          'warn'
        )
        this.destroyMarkerLayer()
      }
    }

    // 分类切换 / 更新失败时销毁旧图层再挂，避免残留或有数无点
    this.destroyMarkerLayer()
    try {
      this.markerLayer = new this.TMap.MultiMarker({
        map: this.map,
        styles: safeStyles,
        geometries,
        zIndex: 120
      })
      this.bindMarkerClick()
    } catch (err) {
      this.lastPaintedMarkerCount = 0
      pushDebugLog(
        'CampusGuide',
        `MultiMarker 创建失败: ${(err as Error)?.message || err}`,
        'error',
        { count: geometries.length }
      )
    }
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
    // 过滤非法点，避免 TMap 内部访问 undefined[n] 崩溃（#491 reading '4'）
    const geometries = segments
      .map((segment, index) => {
        const paths = (segment || [])
          .filter(
            (point) =>
              point &&
              Number.isFinite(Number(point.latitude)) &&
              Number.isFinite(Number(point.longitude))
          )
          .map((point) => toLatLng(this.TMap!, point))
        return paths.length >= 2 ? { id: `route-${index}`, paths } : null
      })
      .filter(Boolean)

    // 必须用 PolylineStyle；纯对象在部分 GL 版本会触发内部 styles 索引崩溃
    const styleOpts = {
      color,
      width: 6,
      borderColor: '#ffffff',
      borderWidth: 2,
      lineCap: 'round' as const
    }
    const routeStyle =
      typeof this.TMap.PolylineStyle === 'function'
        ? new this.TMap.PolylineStyle(styleOpts)
        : { ...styleOpts }
    const styles = { route: routeStyle }
    const mapped = geometries.map((item) => ({
      id: item!.id,
      styleId: 'route',
      paths: item!.paths
    }))

    try {
      if (!this.polylineLayer) {
        this.polylineLayer = new this.TMap.MultiPolyline({
          map: this.map,
          styles,
          geometries: mapped
        })
        return
      }
      this.polylineLayer.setStyles?.(styles)
      this.polylineLayer.setGeometries?.(mapped)
    } catch (err) {
      pushDebugLog(
        'CampusGuide',
        `renderPolylines 失败: ${(err as Error)?.message || err}`,
        'error',
        { segments: segments.length }
      )
      // 销毁坏层，避免后续 setGeometries 连环崩
      try {
        this.polylineLayer?.setMap?.(null)
        this.polylineLayer?.destroy?.()
      } catch {
        // ignore
      }
      this.polylineLayer = null
      throw err
    }
  }

  clearPolylines() {
    this.polylineLayer?.setGeometries?.([])
  }

  resize() {
    const map = this.map as { resize?: () => void } | null
    map?.resize?.()
    // iOS 首屏旋转/壳层高度变化后补挂手绘层
    if (!this.customLayerReady) this.scheduleCustomLayerRetry()
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
    if (this.customLayerRetryTimer) {
      clearTimeout(this.customLayerRetryTimer)
      this.customLayerRetryTimer = null
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
    this.customLayerReady = false
    this.customLayerRetries = 0
    this.customLayerScheduleCount = 0
    this.map = null
    this.TMap = null
    this.spotMap.clear()
    this.lastSpotSignature = ''
    this.lastPaintedMarkerCount = 0
  }
}