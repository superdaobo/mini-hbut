type ForecastTemperature = {
  temp_low?: unknown
  temp_high?: unknown
}

type TemperatureBounds = {
  min: number
  max: number
  span: number
}

type TemperatureRangeScale = {
  leftPct: number
  widthPct: number
}

type TemperatureColorUsage = 'bar' | 'text'

type WeatherIconTone = {
  category: 'sunny' | 'cloudy' | 'overcast' | 'rain' | 'heavyRain' | 'snow' | 'fog' | 'default'
  color: string
}

const FALLBACK_SCALE: TemperatureRangeScale = { leftPct: 46, widthPct: 8 }
const MIN_VISIBLE_WIDTH_PCT = 8
const FALLBACK_TEXT_COLOR = '#64748b'
const FALLBACK_BAR_COLOR = '#94a3b8'

const toFiniteTemperature = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null

  const temperature = Number(value)
  return Number.isFinite(temperature) ? temperature : null
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const roundPct = (value: number) => Math.round(value * 100) / 100

export const getTemperatureColor = (
  temperatureValue: unknown,
  usage: TemperatureColorUsage = 'bar'
) => {
  const temperature = toFiniteTemperature(temperatureValue)
  if (temperature === null) return usage === 'text' ? FALLBACK_TEXT_COLOR : FALLBACK_BAR_COLOR

  if (usage === 'text') {
    if (temperature < 8) return '#2563eb'
    if (temperature < 24) return '#0f766e'
    if (temperature < 32) return '#c2410c'
    return '#dc2626'
  }

  if (temperature < 8) return '#60a5fa'
  if (temperature < 24) return '#2dd4bf'
  if (temperature < 32) return '#fb923c'
  return '#f87171'
}

export const getWeatherIconTone = (conditionValue: unknown): WeatherIconTone => {
  const condition = String(conditionValue || '').trim()

  if (condition.includes('雷') || condition.includes('暴雨') || condition.includes('大雨')) {
    return { category: 'heavyRain', color: '#3f6f95' }
  }

  if (condition.includes('雨')) {
    return { category: 'rain', color: '#4f8fbf' }
  }

  if (condition.includes('雪')) {
    return { category: 'snow', color: '#7b8fc5' }
  }

  if (condition.includes('雾') || condition.includes('霾')) {
    return { category: 'fog', color: '#8491a0' }
  }

  if (condition.includes('阴')) {
    return { category: 'overcast', color: '#6f7f91' }
  }

  if (condition.includes('云')) {
    return { category: 'cloudy', color: '#7b8798' }
  }

  if (condition.includes('晴')) {
    return { category: 'sunny', color: '#d99a2b' }
  }

  return { category: 'default', color: '#6f95b8' }
}

export const getForecastTemperatureBounds = (forecast: ForecastTemperature[] = []): TemperatureBounds => {
  const lows: number[] = []
  const highs: number[] = []

  for (const day of forecast) {
    const low = toFiniteTemperature(day?.temp_low)
    const high = toFiniteTemperature(day?.temp_high)

    if (low === null || high === null) continue
    lows.push(Math.min(low, high))
    highs.push(Math.max(low, high))
  }

  if (lows.length === 0 || highs.length === 0) {
    return { min: 0, max: 0, span: 0 }
  }

  const min = Math.min(...lows)
  const max = Math.max(...highs)
  return { min, max, span: max - min }
}

export const getTemperatureRangeScale = (
  lowValue: unknown,
  highValue: unknown,
  bounds: TemperatureBounds
): TemperatureRangeScale => {
  const low = toFiniteTemperature(lowValue)
  const high = toFiniteTemperature(highValue)
  const min = toFiniteTemperature(bounds?.min)
  const max = toFiniteTemperature(bounds?.max)
  const span = toFiniteTemperature(bounds?.span)

  if (low === null || high === null || min === null || max === null || span === null || span <= 0) {
    return { ...FALLBACK_SCALE }
  }

  const rangeLow = Math.min(low, high)
  const rangeHigh = Math.max(low, high)
  const rawLeft = ((rangeLow - min) / span) * 100
  const rawWidth = ((rangeHigh - rangeLow) / span) * 100
  const center = rawLeft + rawWidth / 2
  const widthPct = clamp(rawWidth, MIN_VISIBLE_WIDTH_PCT, 100)
  const leftPct = clamp(center - widthPct / 2, 0, 100 - widthPct)

  return {
    leftPct: roundPct(leftPct),
    widthPct: roundPct(widthPct)
  }
}

export const getTemperatureRangeStyle = (
  low: unknown,
  high: unknown,
  bounds: TemperatureBounds
) => {
  const scale = getTemperatureRangeScale(low, high, bounds)

  return {
    left: `${scale.leftPct}%`,
    width: `${scale.widthPct}%`,
    background: `linear-gradient(90deg, ${getTemperatureColor(low, 'bar')} 0%, ${getTemperatureColor(high, 'bar')} 100%)`
  }
}
