// src/utils/widget_snapshot_schema.ts
// Ajv 预编译 validator — 对齐 design §4.1 JSON Schema

// Vite/ESM 下 ajv CJS 无 default，使用具名导出（兼容 dist/2020）
import { Ajv2020 } from 'ajv/dist/2020.js'

/**
 * ISO 8601 date-time 正则（简化版，覆盖常见格式）
 * 匹配：2024-01-15T08:30:00Z / 2024-01-15T08:30:00+08:00 / 2024-01-15T08:30:00.123Z
 */
const ISO_DATE_TIME_PATTERN =
  '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$'

/** TodayCourseSnapshot JSON Schema（严格字段，additionalProperties: false） */
export const todayCourseSnapshotSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'TodayCourseSnapshot',
  type: 'object' as const,
  additionalProperties: false,
  required: ['version', 'generated_at', 'date', 'student_id', 'week_index', 'weekday', 'courses'],
  properties: {
    version: { type: 'integer' as const, const: 1 },
    generated_at: { type: 'string' as const, pattern: ISO_DATE_TIME_PATTERN },
    date: { type: 'string' as const, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    student_id: { type: 'string' as const, maxLength: 32 },
    week_index: { type: 'integer' as const, minimum: 0, maximum: 60 },
    weekday: { type: 'integer' as const, minimum: 1, maximum: 7 },
    courses: {
      type: 'array' as const,
      maxItems: 14,
      items: {
        type: 'object' as const,
        additionalProperties: false,
        required: ['period_start', 'period_end', 'time_start', 'time_end', 'name', 'location', 'teacher'],
        properties: {
          period_start: { type: 'integer' as const, minimum: 1, maximum: 14 },
          period_end: { type: 'integer' as const, minimum: 1, maximum: 14 },
          time_start: { type: 'string' as const, pattern: '^\\d{2}:\\d{2}$' },
          time_end: { type: 'string' as const, pattern: '^\\d{2}:\\d{2}$' },
          name: { type: 'string' as const, minLength: 1, maxLength: 80 },
          location: { type: 'string' as const, maxLength: 80 },
          teacher: { type: 'string' as const, maxLength: 80 },
          color: { type: 'string' as const, pattern: '^#[0-9A-Fa-f]{6}$' },
        },
      },
    },
  },
} as const

const ajv = new Ajv2020({ allErrors: true })

/** 预编译的 snapshot validator，返回 boolean；错误信息通过 validateSnapshot.errors 获取 */
export const validateSnapshot = ajv.compile(todayCourseSnapshotSchema)
