/**
 * 内联 SVG 图标集（设计参考：stitch_pixel_perfect_ui_restoration）。
 * 全部为 Heroicons outline 风格，stroke=currentColor，随文字颜色变化。
 * 零外部依赖（CSP 要求：不引用 CDN/图片），图标直接内嵌。
 */

interface IconProps {
  className?: string
}

const base = (props: IconProps) => ({
  className: props.className,
  fill: 'none',
  stroke: 'currentColor',
  viewBox: '0 0 24 24',
  xmlns: 'http://www.w3.org/2000/svg',
})

/** 装饰盾牌（Header 右侧） */
export function IconShield(props: IconProps) {
  return (
    <svg {...base(props)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
      <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  )
}

/** 测试徽章（烧瓶） */
export function IconFlask(props: IconProps) {
  return (
    <svg {...base(props)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  )
}

/** 应用占位图标（毕业帽/书本） */
export function IconApp(props: IconProps) {
  return (
    <svg {...base(props)} viewBox="0 0 100 100">
      <path d="M50 20L20 35L50 50L80 35L50 20Z" fill="currentColor" stroke="none" />
      <path
        d="M30 45V65C30 70 40 75 50 75C60 75 70 70 70 65V45M20 35V65"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="6"
      />
      <rect x="35" y="50" width="30" height="20" rx="2" fill="white" strokeWidth="4" />
      <circle cx="42" cy="56" r="3" fill="currentColor" stroke="none" />
      <circle cx="50" cy="56" r="3" fill="currentColor" stroke="none" />
      <circle cx="58" cy="56" r="3" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** 外链（新窗口） */
export function IconExternalLink(props: IconProps) {
  return (
    <svg {...base(props)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  )
}

/** 小对勾（审核徽章） */
export function IconCheckSmall(props: IconProps) {
  return (
    <svg {...base(props)} viewBox="0 0 20 20" fill="currentColor" stroke="none">
      <path
        clipRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        fillRule="evenodd"
      />
    </svg>
  )
}

/** 权限：身份标识（人像） */
export function IconUser(props: IconProps) {
  return (
    <svg {...base(props)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

/** 权限：昵称与头像（人像圈） */
export function IconUserCircle(props: IconProps) {
  return (
    <svg {...base(props)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

/** 权限：课程表（日历） */
export function IconCalendar(props: IconProps) {
  return (
    <svg {...base(props)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

/** 权限：成绩（柱状图） */
export function IconChart(props: IconProps) {
  return (
    <svg {...base(props)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

/** 权限右侧对勾（圆圈勾） */
export function IconCheckCircle(props: IconProps) {
  return (
    <svg {...base(props)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

/** 信息（圆圈 i） */
export function IconInfo(props: IconProps) {
  return (
    <svg {...base(props)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

/** 时钟（倒计时） */
export function IconClock(props: IconProps) {
  return (
    <svg {...base(props)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

/** 复制（链接/授权码） */
export function IconCopy(props: IconProps) {
  return (
    <svg {...base(props)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}

/** 信息横幅（实心圆圈 i） */
export function IconInfoSolid(props: IconProps) {
  return (
    <svg {...base(props)} viewBox="0 0 20 20" fill="currentColor" stroke="none">
      <path
        clipRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        fillRule="evenodd"
      />
    </svg>
  )
}

/** 警告三角（实心，过期/错误） */
export function IconWarning(props: IconProps) {
  return (
    <svg {...base(props)} viewBox="0 0 20 20" fill="currentColor" stroke="none">
      <path
        clipRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
        fillRule="evenodd"
      />
    </svg>
  )
}

/** 成功对勾（实心，成功横幅） */
export function IconCheckSolid(props: IconProps) {
  return (
    <svg {...base(props)} viewBox="0 0 20 20" fill="currentColor" stroke="none">
      <path
        clipRule="evenodd"
        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
        fillRule="evenodd"
      />
    </svg>
  )
}

/** 问号（帮助页） */
export function IconQuestionMark(props: IconProps) {
  return (
    <svg {...base(props)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

/** 盾牌对勾（帮助页安全声明） */
export function IconShieldCheck(props: IconProps) {
  return (
    <svg {...base(props)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  )
}
