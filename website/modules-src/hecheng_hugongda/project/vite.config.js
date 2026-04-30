import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 移除 crossorigin 属性，避免 Capacitor WebView iframe 内加载资源时
// 因本地文件服务器缺少 CORS 头而被拦截，导致嵌入页面黑屏。
const stripCrossOrigin = () => ({
  name: 'strip-crossorigin',
  enforce: 'post',
  transformIndexHtml(html) {
    return html.replace(/ crossorigin/g, '')
  }
})

export default defineConfig({
  base: './',
  plugins: [vue(), stripCrossOrigin()],
})
