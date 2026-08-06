/**
 * 课表领域（Schedule）共享类型。
 * 原始 ScheduleView.vue 为无类型 JS 风格，拆分后统一使用宽松记录类型，
 * 保证字段访问行为与原实现完全一致（不引入运行时校验）。
 */

/** 宽松课程记录：教务课程与自定义课程共用，允许任意扩展字段 */
export type Course = Record<string, any>

/** 按天组织的课程（含冲突块） */
export type DayCourses = Record<number, Course[]>
