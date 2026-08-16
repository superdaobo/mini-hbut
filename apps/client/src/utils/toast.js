import { reactive } from 'vue'

export const toastState = reactive({
    show: false,
    message: '',
    type: 'info', // info, success, warning, error
    timer: null
})

export const showToast = (message, type = 'info', duration = 2000) => {
    if (toastState.timer) {
        clearTimeout(toastState.timer)
    }

    toastState.message = message
    toastState.type = type
    toastState.show = true

    toastState.timer = setTimeout(() => {
        toastState.show = false
    }, duration)
}
