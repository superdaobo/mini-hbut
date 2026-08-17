/** 校园地图样式：通过 CSS 变量覆盖腾讯地图控件，适配 App 暗色模式 */

export const CAMPUS_MAP_CONTAINER_CLASS = 'campus-map-tencent-host'

export const injectCampusMapStyles = () => {
  if (typeof document === 'undefined') return
  const id = 'campus-map-tencent-style'
  if (document.getElementById(id)) return

  const style = document.createElement('style')
  style.id = id
  style.textContent = `
.${CAMPUS_MAP_CONTAINER_CLASS} {
  width: 100%;
  height: 100%;
  border-radius: 16px;
  overflow: hidden;
  background: var(--ui-surface-muted, #e5e7eb);
}
.${CAMPUS_MAP_CONTAINER_CLASS} .tmap-zoom-control,
.${CAMPUS_MAP_CONTAINER_CLASS} .tmap-control-container {
  filter: none;
}
html.dark .${CAMPUS_MAP_CONTAINER_CLASS} {
  filter: brightness(0.92) saturate(0.95);
}
`
  document.head.appendChild(style)
}
