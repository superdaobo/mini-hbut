export type StatisticsEnvironment = 'production' | 'test'

const buildProfile = String(import.meta.env.VITE_BUILD_PROFILE || 'standard').trim().toLowerCase()

export const resolveStatisticsEnvironment = (profile: unknown): StatisticsEnvironment =>
  String(profile || '').trim().toLowerCase() === 'release' ? 'production' : 'test'

export const STATISTICS_ENVIRONMENT: StatisticsEnvironment = resolveStatisticsEnvironment(buildProfile)

export const STATISTICS_SERVICE_BASE_URL = STATISTICS_ENVIRONMENT === 'production'
  ? 'https://mini-hbut-ocr-service.hf.space'
  : 'https://mini-hbut-testocr1.hf.space'

export const STATISTICS_HEALTH_ENDPOINT = `${STATISTICS_SERVICE_BASE_URL}/health`
export const STATISTICS_CLOUD_SYNC_ENDPOINT = `${STATISTICS_SERVICE_BASE_URL}/api/cloud-sync`
export const STATISTICS_OCR_ENDPOINT = `${STATISTICS_SERVICE_BASE_URL}/api/ocr/recognize`

export const isProductionStatisticsEnvironment = () => STATISTICS_ENVIRONMENT === 'production'

export const isStatisticsServiceUrlCompatibleForEnvironment = (
  value: unknown,
  environment: StatisticsEnvironment
): boolean => {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return false
  const isProductionHost =
    text.includes('mini-hbut-ocr-service.hf.space') ||
    text.includes('superdaobo-ocr-service.hf.space')
  const isTestHost = text.includes('mini-hbut-testocr1.hf.space')
  if (environment === 'production') return !isTestHost
  return !isProductionHost
}

export const isStatisticsServiceUrlCompatible = (value: unknown): boolean =>
  isStatisticsServiceUrlCompatibleForEnvironment(value, STATISTICS_ENVIRONMENT)
