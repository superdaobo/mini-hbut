/**
 * InputHandler - 输入处理器
 * 统一处理 pointer events（兼容触摸和鼠标）
 * 暴露 onPressStart / onPressEnd 回调
 * 防止触摸和鼠标事件同时触发（互斥标志）
 * 处理页面失焦（visibilitychange）暂停
 */
export class InputHandler {
  constructor() {
    this._onPressStart = null
    this._onPressEnd = null
    this._element = null
    this._isPointerDown = false
    this._usedTouch = false // 互斥标志：触摸事件触发后忽略后续鼠标事件
    this._touchResetTimer = null

    // 绑定方法引用（用于 removeEventListener）
    this._handlePointerDown = this._handlePointerDown.bind(this)
    this._handlePointerUp = this._handlePointerUp.bind(this)
    this._handlePointerCancel = this._handlePointerCancel.bind(this)
    this._handleVisibilityChange = this._handleVisibilityChange.bind(this)
  }

  /**
   * 初始化，绑定事件到目标元素
   * @param {HTMLElement} element - 监听事件的 DOM 元素
   */
  init(element) {
    if (!element) return
    this._element = element

    // 使用 pointer events 作为主要输入方式
    element.addEventListener('pointerdown', this._handlePointerDown)
    element.addEventListener('pointerup', this._handlePointerUp)
    element.addEventListener('pointercancel', this._handlePointerCancel)

    // 防止触摸设备上的默认行为（如滚动、长按菜单）
    element.addEventListener('touchstart', this._preventDefault, { passive: false })
    element.addEventListener('contextmenu', this._preventDefault)

    // 页面失焦处理
    document.addEventListener('visibilitychange', this._handleVisibilityChange)
  }

  /**
   * 设置按下开始回调
   * @param {Function} callback
   */
  onPressStart(callback) {
    this._onPressStart = callback
  }

  /**
   * 设置按下结束回调
   * @param {Function} callback
   */
  onPressEnd(callback) {
    this._onPressEnd = callback
  }

  /**
   * 处理 pointerdown 事件
   * @param {PointerEvent} e
   */
  _handlePointerDown(e) {
    // 互斥逻辑：如果已经用了触摸，忽略鼠标事件
    if (e.pointerType === 'touch') {
      this._usedTouch = true
      this._resetTouchFlag()
    } else if (e.pointerType === 'mouse' && this._usedTouch) {
      return // 忽略触摸后紧跟的鼠标事件
    }

    if (this._isPointerDown) return // 防止重复触发
    this._isPointerDown = true

    if (this._onPressStart) {
      this._onPressStart()
    }
  }

  /**
   * 处理 pointerup 事件
   * @param {PointerEvent} e
   */
  _handlePointerUp(e) {
    // 互斥逻辑
    if (e.pointerType === 'mouse' && this._usedTouch) {
      return
    }

    if (!this._isPointerDown) return
    this._isPointerDown = false

    if (this._onPressEnd) {
      this._onPressEnd()
    }
  }

  /**
   * 处理 pointercancel 事件（如系统弹窗打断）
   * @param {PointerEvent} e
   */
  _handlePointerCancel(e) {
    if (!this._isPointerDown) return
    this._isPointerDown = false

    if (this._onPressEnd) {
      this._onPressEnd()
    }
  }

  /**
   * 页面失焦时，如果正在按压则触发 pressEnd
   */
  _handleVisibilityChange() {
    if (document.hidden && this._isPointerDown) {
      this._isPointerDown = false
      if (this._onPressEnd) {
        this._onPressEnd()
      }
    }
  }

  /**
   * 重置触摸互斥标志（延迟 400ms，允许后续鼠标事件）
   */
  _resetTouchFlag() {
    if (this._touchResetTimer) {
      clearTimeout(this._touchResetTimer)
    }
    this._touchResetTimer = setTimeout(() => {
      this._usedTouch = false
      this._touchResetTimer = null
    }, 400)
  }

  /**
   * 阻止默认行为
   * @param {Event} e
   */
  _preventDefault(e) {
    e.preventDefault()
  }

  /**
   * 销毁，解绑所有事件
   */
  destroy() {
    if (this._element) {
      this._element.removeEventListener('pointerdown', this._handlePointerDown)
      this._element.removeEventListener('pointerup', this._handlePointerUp)
      this._element.removeEventListener('pointercancel', this._handlePointerCancel)
      this._element.removeEventListener('touchstart', this._preventDefault)
      this._element.removeEventListener('contextmenu', this._preventDefault)
      this._element = null
    }

    document.removeEventListener('visibilitychange', this._handleVisibilityChange)

    if (this._touchResetTimer) {
      clearTimeout(this._touchResetTimer)
      this._touchResetTimer = null
    }

    this._onPressStart = null
    this._onPressEnd = null
    this._isPointerDown = false
    this._usedTouch = false
  }
}

export default InputHandler
