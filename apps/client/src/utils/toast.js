import { reactive } from 'vue'

export const toastState = reactive({
    show: false,
    message: '',
    type: 'info', // info, success, warning, error
    timer: null
})

// Toast 文案最大长度：超出部分截断并加省略号，
// 防止后端异常长文本（如整段 HTML）撑爆弹窗（issue #762 前端兜底）。
const MAX_TOAST_LENGTH = 200

const truncateToastMessage = (message) => {
    const text = String(message ?? '')
    if (text.length <= MAX_TOAST_LENGTH) {
        return text
    }
    return `${text.slice(0, MAX_TOAST_LENGTH)}…`
}

export const showToast = (message, type = 'info', duration = 2000) => {
    if (toastState.timer) {
        clearTimeout(toastState.timer)
    }

    toastState.message = truncateToastMessage(message)
    toastState.type = type
    toastState.show = true

    toastState.timer = setTimeout(() => {
        toastState.show = false
    }, duration)
}
