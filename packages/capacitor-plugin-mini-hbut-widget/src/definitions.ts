// packages/capacitor-plugin-mini-hbut-widget/src/definitions.ts

/** 与主 App 共享的单门课程，对应 snapshot.courses[i] */
export interface WidgetCourse {
  period_start: number   // 1..14
  period_end: number     // 1..14，且 >= period_start
  time_start: string     // "HH:mm"
  time_end: string       // "HH:mm"
  name: string           // 1..80
  location: string       // 0..80
  teacher: string        // 0..80
  color?: string         // "#RRGGBB"
}

export interface TodayCourseSnapshot {
  version: 1
  generated_at: string   // ISO 8601
  date: string           // "YYYY-MM-DD"
  student_id: string     // 原值，脱敏由渲染层负责
  week_index: number     // 1..60
  weekday: number        // 1..7（1=周一）
  courses: WidgetCourse[]
}

export type WidgetCapability = 'android-appwidget' | 'ios-widgetkit' | 'unavailable'

export interface WidgetCapabilities {
  platform: WidgetCapability
  /** 系统是否当前安装了至少一个本 App 的 Widget 实例（尽力而为） */
  pinned: boolean
}

export type WidgetBridgeErrorCode =
  | 'SNAPSHOT_TOO_LARGE'     // 超过 32 KB
  | 'WRITE_FAILED'           // 底层 I/O 失败
  | 'INVALID_SNAPSHOT'       // schema 校验失败
  | 'UNAVAILABLE'            // 非移动端运行时

export interface MiniHbutWidgetPlugin {
  writeSnapshot(options: { snapshot: TodayCourseSnapshot }): Promise<void>
  clearSnapshot(): Promise<void>
  requestRefresh(): Promise<void>
  getCapabilities(): Promise<WidgetCapabilities>
}
