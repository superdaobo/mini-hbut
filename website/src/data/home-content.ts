/** 首页 Hero / Showcase 产品文案（对齐 Kimi 交付包） */
export const EYEBROW = 'Mini-HBUT · 校园信息聚合客户端';
export const H1_A = '一个入口，';
export const H1_B = '看清整个校园日程';
export const SUB =
  '课表、成绩、考试、通知、电费、空教室——湖工大校园信息一手掌握。数据本地存储，请求由你的设备发起，安全又畅快。';

export const CHIPS = ['课表', '成绩', '考试', '通知', '电费', '空教室'] as const;

export const TRUST_ITEMS = [
  'Windows',
  'macOS',
  'Linux',
  'Android',
  'iOS',
  '开源免费',
  '数据本地存储',
] as const;

export const GITHUB_URL = 'https://github.com/superdaobo/mini-hbut';
export const SITE_URL = 'https://hbut.6661111.xyz';

/** App Store / TestFlight 集中配置（#466）— 避免 Hero/Download 散落魔法字符串 */
export const APP_STORE_APP_ID = '6787857278';
export const APP_STORE_LINKS = {
  /** iOS 系统优先打开的 App Store 深链 */
  itmsApps: `itms-apps://apps.apple.com/app/id${APP_STORE_APP_ID}`,
  /** 桌面/失败回退的网页商店页 */
  https: `https://apps.apple.com/app/id${APP_STORE_APP_ID}`,
  /** 次要：TestFlight（非首页主 CTA） */
  testFlight: `itms-beta://beta.itunes.apple.com/v1/app/${APP_STORE_APP_ID}`,
} as const;

/** 下载区锚点：Android / iOS 卡片定位 */
export const DOWNLOAD_ANDROID_ANCHOR = 'download-android';
export const DOWNLOAD_IOS_ANCHOR = 'download-ios';

/**
 * 选择应打开的 App Store URL：iOS/iPadOS 优先 itms-apps，其它环境用 https 网页。
 * 纯函数，便于单测；不读 secret。
 */
export function resolveAppStoreOpenUrl(
  userAgent: string | null | undefined = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): string {
  const ua = String(userAgent || '');
  const isAppleMobile =
    /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
  return isAppleMobile ? APP_STORE_LINKS.itmsApps : APP_STORE_LINKS.https;
}

export type ShowcaseStage = {
  tag: string;
  title: string;
  desc: string;
  side: 'left' | 'right' | 'center';
  /** 手机内展示的 App 屏 */
  screen:
    | 'home'
    | 'schedule'
    | 'grades'
    | 'exams'
    | 'notifications'
    | 'electricity'
    | 'classroom'
    | 'ranking'
    | 'all-features'
    | 'me';
};

export const SHOWCASE_STAGES: ShowcaseStage[] = [
  {
    tag: '首页',
    title: '今日校园，一眼看懂',
    desc: '课程、电费、考试倒计时、最新通知——开机第一屏，全部就位。',
    side: 'left',
    screen: 'home',
  },
  {
    tag: '课表',
    title: '周视图课表',
    desc: '整周课程一屏尽览，自动同步教务系统，调课变动即时更新。',
    side: 'right',
    screen: 'schedule',
  },
  {
    tag: '成绩',
    title: '绩点与成绩明细',
    desc: 'GPA、专业排名、单科分数本地缓存，教务系统维护时照样可查。',
    side: 'left',
    screen: 'grades',
  },
  {
    tag: '考试',
    title: '考试倒计时',
    desc: '每一场考试的时间、地点、剩余天数，安排得明明白白。',
    side: 'right',
    screen: 'exams',
  },
  {
    tag: '通知',
    title: '校园通知聚合',
    desc: '教务、图书馆、后勤、学工……全校通知汇入同一条时间线。',
    side: 'left',
    screen: 'notifications',
  },
  {
    tag: '电费',
    title: '宿舍电费查询',
    desc: '余额、日均用电、趋势图一目了然，还能一键跳转充值。',
    side: 'right',
    screen: 'electricity',
  },
  {
    tag: '空教室',
    title: '空教室速查',
    desc: '按楼栋、插座、人数筛选，自习找教室不再一间间敲门。',
    side: 'left',
    screen: 'classroom',
  },
  {
    tag: '下载',
    title: 'App Store 与全平台下载',
    desc: 'iOS 使用 App Store 正式安装；Windows / macOS / Linux / Android 亦可一键获取。',
    side: 'center',
    screen: 'all-features',
  },
];

/** Hero 手机自动轮播序列 */
export const HERO_PHONE_SEQUENCE = [
  'home',
  'schedule',
  'grades',
  'exams',
  'notifications',
  'electricity',
  'classroom',
] as const;

export const HERO_PHONE_CAPTIONS: Record<(typeof HERO_PHONE_SEQUENCE)[number], string> = {
  home: '今日校园，一眼看懂',
  schedule: '周视图课表',
  grades: '绩点与成绩明细',
  exams: '考试倒计时',
  notifications: '校园通知聚合',
  electricity: '宿舍电费查询',
  classroom: '空教室速查',
};
