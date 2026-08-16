// 测试 fixture：semester 模块类型声明（与 semester.js 导出对齐）
export interface SemesterOption {
  value: string
  label?: string
  [key: string]: unknown
}

export function compareSemesterDesc(a: string, b: string): number
export function normalizeSemesterList(list: unknown[]): SemesterOption[]
export function readStoredScheduleSemester(): string
export function deriveSemesterByDate(date?: Date): string
export function getPreferredSemesterFast(date?: Date): string
export function mergeSemesterOptions(list: unknown[], selectedSemester?: string): SemesterOption[]
export function resolveCurrentSemester(semesterList: unknown[], hintedCurrent?: string): string
export function semesterIsNewer(a: string, b: string): boolean
