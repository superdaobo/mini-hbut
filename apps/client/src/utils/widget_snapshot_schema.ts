// src/utils/widget_snapshot_schema.ts
// Strict-CSP-safe TodayCourseSnapshot validator.
//
// Do not replace this with a runtime JSON Schema compiler: dynamic code generation is
// intentionally blocked by the desktop release CSP.

import type { TodayCourseSnapshot } from '@mini-hbut/capacitor-plugin-mini-hbut-widget'

const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^\d{2}:\d{2}$/
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

/** TodayCourseSnapshot JSON Schema (kept as documentation and cross-platform contract). */
export const todayCourseSnapshotSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'TodayCourseSnapshot',
  type: 'object' as const,
  additionalProperties: false,
  required: ['version', 'generated_at', 'date', 'student_id', 'week_index', 'weekday', 'courses'],
  properties: {
    version: { type: 'integer' as const, const: 1 },
    generated_at: { type: 'string' as const, pattern: ISO_DATE_TIME_PATTERN.source },
    date: { type: 'string' as const, pattern: DATE_PATTERN.source },
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
          time_start: { type: 'string' as const, pattern: TIME_PATTERN.source },
          time_end: { type: 'string' as const, pattern: TIME_PATTERN.source },
          name: { type: 'string' as const, minLength: 1, maxLength: 80 },
          location: { type: 'string' as const, maxLength: 80 },
          teacher: { type: 'string' as const, maxLength: 80 },
          color: { type: 'string' as const, pattern: COLOR_PATTERN.source },
        },
      },
    },
  },
} as const

export interface SnapshotValidationError {
  instancePath: string
  schemaPath: string
  keyword: string
  params: Record<string, unknown>
  message?: string
}

export type SnapshotValidator = ((value: unknown) => value is TodayCourseSnapshot) & {
  errors: SnapshotValidationError[] | null
}

type JsonObject = Record<string, unknown>

type ErrorCollector = (
  instancePath: string,
  schemaPath: string,
  keyword: string,
  message: string,
  params?: Record<string, unknown>,
) => void

const isPlainObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const escapeJsonPointer = (value: string) => value.replace(/~/g, '~0').replace(/\//g, '~1')

const validateAllowedProperties = (
  value: JsonObject,
  allowed: ReadonlySet<string>,
  instancePath: string,
  schemaPath: string,
  addError: ErrorCollector,
) => {
  for (const property of Object.keys(value)) {
    if (!allowed.has(property)) {
      addError(
        instancePath,
        `${schemaPath}/additionalProperties`,
        'additionalProperties',
        'must NOT have additional properties',
        { additionalProperty: property },
      )
    }
  }
}

const validateRequiredProperties = (
  value: JsonObject,
  required: readonly string[],
  instancePath: string,
  schemaPath: string,
  addError: ErrorCollector,
) => {
  for (const property of required) {
    if (!Object.prototype.hasOwnProperty.call(value, property)) {
      addError(
        instancePath,
        `${schemaPath}/required`,
        'required',
        `must have required property '${property}'`,
        { missingProperty: property },
      )
    }
  }
}

const validateString = (
  value: unknown,
  instancePath: string,
  schemaPath: string,
  addError: ErrorCollector,
  options: { minLength?: number; maxLength?: number; pattern?: RegExp } = {},
) => {
  if (typeof value !== 'string') {
    addError(instancePath, `${schemaPath}/type`, 'type', 'must be string', { type: 'string' })
    return
  }
  const codePointLength = Array.from(value).length
  if (options.minLength !== undefined && codePointLength < options.minLength) {
    addError(instancePath, `${schemaPath}/minLength`, 'minLength', `must NOT have fewer than ${options.minLength} characters`, { limit: options.minLength })
  }
  if (options.maxLength !== undefined && codePointLength > options.maxLength) {
    addError(instancePath, `${schemaPath}/maxLength`, 'maxLength', `must NOT have more than ${options.maxLength} characters`, { limit: options.maxLength })
  }
  if (options.pattern && !options.pattern.test(value)) {
    addError(instancePath, `${schemaPath}/pattern`, 'pattern', `must match pattern "${options.pattern.source}"`, { pattern: options.pattern.source })
  }
}

const validateInteger = (
  value: unknown,
  instancePath: string,
  schemaPath: string,
  addError: ErrorCollector,
  minimum: number,
  maximum: number,
) => {
  if (!Number.isInteger(value)) {
    addError(instancePath, `${schemaPath}/type`, 'type', 'must be integer', { type: 'integer' })
    return
  }
  const numeric = value as number
  if (numeric < minimum) {
    addError(instancePath, `${schemaPath}/minimum`, 'minimum', `must be >= ${minimum}`, { comparison: '>=', limit: minimum })
  }
  if (numeric > maximum) {
    addError(instancePath, `${schemaPath}/maximum`, 'maximum', `must be <= ${maximum}`, { comparison: '<=', limit: maximum })
  }
}

const ROOT_REQUIRED = todayCourseSnapshotSchema.required
const ROOT_PROPERTIES = new Set(Object.keys(todayCourseSnapshotSchema.properties))
const COURSE_REQUIRED = todayCourseSnapshotSchema.properties.courses.items.required
const COURSE_PROPERTIES = new Set(Object.keys(todayCourseSnapshotSchema.properties.courses.items.properties))

const validator = ((value: unknown): value is TodayCourseSnapshot => {
  const errors: SnapshotValidationError[] = []
  const addError: ErrorCollector = (instancePath, schemaPath, keyword, message, params = {}) => {
    errors.push({ instancePath, schemaPath, keyword, params, message })
  }

  if (!isPlainObject(value)) {
    addError('', '#/type', 'type', 'must be object', { type: 'object' })
    validator.errors = errors
    return false
  }

  validateAllowedProperties(value, ROOT_PROPERTIES, '', '#', addError)
  validateRequiredProperties(value, ROOT_REQUIRED, '', '#', addError)

  if (Object.prototype.hasOwnProperty.call(value, 'version')) {
    if (!Number.isInteger(value.version)) {
      addError('/version', '#/properties/version/type', 'type', 'must be integer', { type: 'integer' })
    } else if (value.version !== 1) {
      addError('/version', '#/properties/version/const', 'const', 'must be equal to constant', { allowedValue: 1 })
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, 'generated_at')) {
    validateString(value.generated_at, '/generated_at', '#/properties/generated_at', addError, { pattern: ISO_DATE_TIME_PATTERN })
  }
  if (Object.prototype.hasOwnProperty.call(value, 'date')) {
    validateString(value.date, '/date', '#/properties/date', addError, { pattern: DATE_PATTERN })
  }
  if (Object.prototype.hasOwnProperty.call(value, 'student_id')) {
    validateString(value.student_id, '/student_id', '#/properties/student_id', addError, { maxLength: 32 })
  }
  if (Object.prototype.hasOwnProperty.call(value, 'week_index')) {
    validateInteger(value.week_index, '/week_index', '#/properties/week_index', addError, 0, 60)
  }
  if (Object.prototype.hasOwnProperty.call(value, 'weekday')) {
    validateInteger(value.weekday, '/weekday', '#/properties/weekday', addError, 1, 7)
  }

  if (Object.prototype.hasOwnProperty.call(value, 'courses')) {
    if (!Array.isArray(value.courses)) {
      addError('/courses', '#/properties/courses/type', 'type', 'must be array', { type: 'array' })
    } else {
      if (value.courses.length > 14) {
        addError('/courses', '#/properties/courses/maxItems', 'maxItems', 'must NOT have more than 14 items', { limit: 14 })
      }
      value.courses.forEach((course, index) => {
        const instancePath = `/courses/${index}`
        const schemaPath = '#/properties/courses/items'
        if (!isPlainObject(course)) {
          addError(instancePath, `${schemaPath}/type`, 'type', 'must be object', { type: 'object' })
          return
        }
        validateAllowedProperties(course, COURSE_PROPERTIES, instancePath, schemaPath, addError)
        validateRequiredProperties(course, COURSE_REQUIRED, instancePath, schemaPath, addError)

        const propertyPath = (property: string) => `${instancePath}/${escapeJsonPointer(property)}`
        const propertySchema = (property: string) => `${schemaPath}/properties/${escapeJsonPointer(property)}`
        if (Object.prototype.hasOwnProperty.call(course, 'period_start')) {
          validateInteger(course.period_start, propertyPath('period_start'), propertySchema('period_start'), addError, 1, 14)
        }
        if (Object.prototype.hasOwnProperty.call(course, 'period_end')) {
          validateInteger(course.period_end, propertyPath('period_end'), propertySchema('period_end'), addError, 1, 14)
        }
        if (Object.prototype.hasOwnProperty.call(course, 'time_start')) {
          validateString(course.time_start, propertyPath('time_start'), propertySchema('time_start'), addError, { pattern: TIME_PATTERN })
        }
        if (Object.prototype.hasOwnProperty.call(course, 'time_end')) {
          validateString(course.time_end, propertyPath('time_end'), propertySchema('time_end'), addError, { pattern: TIME_PATTERN })
        }
        if (Object.prototype.hasOwnProperty.call(course, 'name')) {
          validateString(course.name, propertyPath('name'), propertySchema('name'), addError, { minLength: 1, maxLength: 80 })
        }
        if (Object.prototype.hasOwnProperty.call(course, 'location')) {
          validateString(course.location, propertyPath('location'), propertySchema('location'), addError, { maxLength: 80 })
        }
        if (Object.prototype.hasOwnProperty.call(course, 'teacher')) {
          validateString(course.teacher, propertyPath('teacher'), propertySchema('teacher'), addError, { maxLength: 80 })
        }
        if (Object.prototype.hasOwnProperty.call(course, 'color')) {
          validateString(course.color, propertyPath('color'), propertySchema('color'), addError, { pattern: COLOR_PATTERN })
        }
      })
    }
  }

  validator.errors = errors.length > 0 ? errors : null
  return errors.length === 0
}) as SnapshotValidator

validator.errors = null

/** Static validator with an Ajv-compatible `.errors` surface, without dynamic code generation. */
export const validateSnapshot = validator
