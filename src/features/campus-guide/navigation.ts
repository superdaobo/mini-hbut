export const CAMPUS_GUIDE_VIEWS = Object.freeze({
  hub: 'hub',
  home: 'home',
  settings: 'settings',
  search: 'search',
  walkline: 'walkline',
  poi: 'poi',
  route: 'route',
  roadmap: 'roadmap',
  bus: 'bus',
  activity: 'activity',
  activityDetail: 'activity-detail',
  notice: 'notice',
  noticeDetail: 'notice-detail',
  about: 'about',
  collect: 'collect',
  mockLocation: 'mock-location',
  yunyouIntro: 'yunyou-intro',
  yunyouDetail: 'yunyou-detail',
  yunyouClue: 'yunyou-clue',
  yunyouSignature: 'yunyou-signature',
  punchHome: 'punch-home',
  punchMap: 'punch-map',
  punchPostcard: 'punch-postcard',
  punchAlumniCard: 'punch-alumni-card',
  punchMy: 'punch-my'
})

export type CampusGuideViewId = (typeof CAMPUS_GUIDE_VIEWS)[keyof typeof CAMPUS_GUIDE_VIEWS]

export type CampusGuideNavParams = {
  spotId?: string | number
  spot?: import('./types').CampusSpot
  endPoint?: import('./types').GeoPoint
  routeId?: string | number
  routeIndex?: number
  activityId?: string | number
  noticeId?: string | number
  keyword?: string
}

export const CAMPUS_GUIDE_VIEW_TITLES: Record<CampusGuideViewId, string> = {
  hub: '湖工大导览',
  home: '校园导览',
  settings: '导览设置',
  search: '搜索地点',
  walkline: '步行导航',
  poi: '地点详情',
  route: '游览路线',
  roadmap: '路线地图',
  bus: '班车路线',
  activity: '校园活动',
  'activity-detail': '活动详情',
  notice: '通知公告',
  'notice-detail': '公告详情',
  about: '校园概况',
  collect: '我的收藏',
  'mock-location': '模拟定位',
  'yunyou-intro': '云游打卡',
  'yunyou-detail': '云游文化衫',
  'yunyou-clue': '云游线索',
  'yunyou-signature': '文化衫签名',
  'punch-home': '校庆打卡',
  'punch-map': '地图打卡',
  'punch-postcard': '校庆明信片',
  'punch-alumni-card': '校友卡',
  'punch-my': '我的校庆'
}

const KNOWN_VIEWS = new Set(Object.values(CAMPUS_GUIDE_VIEWS))

export const isKnownCampusGuideView = (view: string) => KNOWN_VIEWS.has(view as CampusGuideViewId)