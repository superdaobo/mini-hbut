import { createApp } from 'vue'
import './style.css'
import './styles/ui_ux_pro_max.css'
import 'katex/dist/katex.min.css'
import App from './App.vue'
import { initUiSettings } from './utils/ui_settings'
import { initAppSettings } from './utils/app_settings'
import { initFontSettings } from './utils/font_settings'

initUiSettings()
initAppSettings()
initFontSettings()
createApp(App).mount('#app')
