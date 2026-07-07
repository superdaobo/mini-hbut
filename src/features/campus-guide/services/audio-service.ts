let currentAudio: HTMLAudioElement | null = null
let speaking = false

const stopSpeech = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  speaking = false
}

export const stopCampusAudio = () => {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  stopSpeech()
}

export const playCampusAudioUrl = async (url: string) => {
  stopCampusAudio()
  if (!url) return false
  currentAudio = new Audio(url)
  try {
    await currentAudio.play()
    return true
  } catch {
    currentAudio = null
    return false
  }
}

export const speakCampusText = (text: string) => {
  stopCampusAudio()
  const content = String(text || '').trim()
  if (!content || typeof window === 'undefined' || !window.speechSynthesis) return false
  const utterance = new SpeechSynthesisUtterance(content)
  utterance.lang = 'zh-CN'
  utterance.rate = 1
  speaking = true
  utterance.onend = () => {
    speaking = false
  }
  window.speechSynthesis.speak(utterance)
  return true
}

export const playCampusSpeech = async (speech: unknown, fallbackText?: string) => {
  if (Array.isArray(speech) && speech[0] && typeof speech[0] === 'object') {
    const item = speech[0] as Record<string, unknown>
    const url = String(item.audio || item.url || '').trim()
    if (url && (await playCampusAudioUrl(url))) return true
  }
  if (speech && typeof speech === 'object') {
    const item = speech as Record<string, unknown>
    const url = String(item.audio || item.url || '').trim()
    if (url && (await playCampusAudioUrl(url))) return true
  }
  return speakCampusText(fallbackText || '')
}

export const isCampusAudioPlaying = () => {
  if (currentAudio && !currentAudio.paused) return true
  return speaking
}