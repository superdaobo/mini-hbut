import { registerPlugin } from '@capacitor/core'
import type { MiniHbutWidgetPlugin } from './definitions'

// 注册 Capacitor 插件，web 平台使用懒加载动态导入
const MiniHbutWidget = registerPlugin<MiniHbutWidgetPlugin>('MiniHbutWidget', {
  web: () => import('./web').then(m => new m.MiniHbutWidgetWeb()),
})

export { MiniHbutWidget }

// 导出类型定义供外部消费
export type {
  WidgetCourse,
  TodayCourseSnapshot,
  ElectricityWidgetSnapshot,
  ExamWidgetItem,
  ExamWidgetSnapshot,
  WidgetCapability,
  WidgetCapabilities,
  WidgetBridgeErrorCode,
  MiniHbutWidgetPlugin,
} from './definitions'
