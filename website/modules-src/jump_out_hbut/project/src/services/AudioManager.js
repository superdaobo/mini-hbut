/**
 * AudioManager - 音效管理器
 * 使用 Web Audio API 加载和播放音效
 * 支持 6 种音效：charge、jump、land、perfect、fall、combo
 * 实现静音开关 + localStorage 持久化
 * 首次用户交互时 resume AudioContext
 * 音效加载失败时静默降级
 */

const STORAGE_KEY = 'jump_out_hbut_muted'

/** 音效文件映射 */
const SOUND_FILES = {
  charge: 'charge.mp3',
  jump: 'jump.mp3',
  land: 'land.mp3',
  perfect: 'perfect.mp3',
  fall: 'fall.mp3',
  combo: 'combo.mp3'
}

const AUDIO_ASSET_URLS = import.meta.glob('../assets/audio/*.{mp3,wav,ogg}', {
  eager: true,
  query: '?url',
  import: 'default'
})

const SOUND_URLS = Object.fromEntries(
  Object.entries(SOUND_FILES)
    .map(([name, file]) => {
      const match = Object.entries(AUDIO_ASSET_URLS).find(([assetPath]) => assetPath.endsWith(`/${file}`))
      return match ? [name, match[1]] : null
    })
    .filter(Boolean)
)

export class AudioManager {
  constructor() {
    this._context = null
    this._buffers = {} // { [soundName]: AudioBuffer }
    this._muted = false
    this._initialized = false
    this._resumeHandler = null
  }

  /**
   * 初始化 AudioContext 并加载音效
   * 从 localStorage 恢复静音状态
   */
  async init() {
    // 恢复静音状态
    this._muted = this._loadMuteState()

    try {
      this._context = new (window.AudioContext || window.webkitAudioContext)()
    } catch (e) {
      // Web Audio API 不可用，静默降级
      console.warn('[AudioManager] Web Audio API 不可用，音效已禁用')
      return
    }

    // 首次用户交互时 resume AudioContext（浏览器自动播放策略）
    if (this._context.state === 'suspended') {
      this._resumeHandler = () => this._resumeContext()
      document.addEventListener('pointerdown', this._resumeHandler, { once: true })
      document.addEventListener('keydown', this._resumeHandler, { once: true })
    }

    // 异步加载所有音效（不阻塞初始化）
    this._loadAllSounds()
    this._initialized = true
  }

  /**
   * 播放指定音效
   * @param {'charge'|'jump'|'land'|'perfect'|'fall'|'combo'} sound - 音效名称
   */
  play(sound) {
    if (this._muted || !this._context || !this._buffers[sound]) return

    try {
      const source = this._context.createBufferSource()
      source.buffer = this._buffers[sound]

      const gainNode = this._context.createGain()
      gainNode.gain.value = 1.0

      source.connect(gainNode)
      gainNode.connect(this._context.destination)
      source.start(0)
    } catch (e) {
      // 播放失败静默降级
    }
  }

  /**
   * 设置静音状态
   * @param {boolean} muted - 是否静音
   */
  setMuted(muted) {
    this._muted = Boolean(muted)
    this._saveMuteState()
  }

  /**
   * 获取当前静音状态
   * @returns {boolean}
   */
  isMuted() {
    return this._muted
  }

  /**
   * 销毁 AudioContext 并释放资源
   */
  destroy() {
    if (this._resumeHandler) {
      document.removeEventListener('pointerdown', this._resumeHandler)
      document.removeEventListener('keydown', this._resumeHandler)
      this._resumeHandler = null
    }

    if (this._context) {
      this._context.close().catch(() => {})
      this._context = null
    }

    this._buffers = {}
    this._initialized = false
  }

  /**
   * 恢复被挂起的 AudioContext
   */
  async _resumeContext() {
    if (this._context && this._context.state === 'suspended') {
      try {
        await this._context.resume()
      } catch (e) {
        // 静默处理
      }
    }
  }

  /**
   * 加载所有音效文件
   */
  async _loadAllSounds() {
    const availableSounds = Object.entries(SOUND_URLS)
    if (availableSounds.length === 0) return

    const loadPromises = availableSounds.map(async ([name, url]) => {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const arrayBuffer = await response.arrayBuffer()
        this._buffers[name] = await this._context.decodeAudioData(arrayBuffer)
      } catch (e) {
        // 单个音效加载失败不影响其他音效，静默降级
        console.warn(`[AudioManager] 音效 "${name}" 加载失败，已跳过`)
      }
    })

    await Promise.allSettled(loadPromises)
  }

  /**
   * 从 localStorage 读取静音状态
   * @returns {boolean}
   */
  _loadMuteState() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch (e) {
      return false
    }
  }

  /**
   * 保存静音状态到 localStorage
   */
  _saveMuteState() {
    try {
      localStorage.setItem(STORAGE_KEY, String(this._muted))
    } catch (e) {
      // localStorage 不可用时静默忽略
    }
  }
}

export default AudioManager
