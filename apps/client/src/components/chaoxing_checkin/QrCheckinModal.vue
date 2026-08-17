<script setup>
import { ref } from 'vue'
import { TModal } from '../templates'
import { useQrScanner } from '../../composables/useQrScanner'
import { isTauriRuntime } from '../../platform/native'
import QrScreenSelectOverlay from './QrScreenSelectOverlay.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  activeId: { type: String, default: '' },
  parseQrUrl: { type: Function, required: true },
  decodeQrImage: { type: Function, required: true },
  captureScreenQr: { type: Function, required: true }
})

const emit = defineEmits(['close', 'submit'])

const { cameraAvailable } = useQrScanner()

const mode = ref('paste') // 'paste' | 'image' | 'camera' | 'screen'
const urlInput = ref('')
const error = ref('')
const processing = ref(false)
const showScreenOverlay = ref(false)
const fileInputRef = ref(null)

const isDesktop = isTauriRuntime()

const handlePasteSubmit = async () => {
  const raw = urlInput.value.trim().replace(/&amp;/g, '&')
  if (!raw) {
    error.value = '请粘贴二维码链接'
    return
  }
  processing.value = true
  error.value = ''
  try {
    const parts = await props.parseQrUrl(raw)
    emit('submit', parts.enc)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '链接解析失败'
  } finally {
    processing.value = false
  }
}

const handleImageSelect = async (event) => {
  const file = event.target?.files?.[0]
  if (!file) return

  if (file.size > 10 * 1024 * 1024) {
    error.value = '图片大小不能超过 10MB'
    return
  }

  processing.value = true
  error.value = ''
  try {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const decoded = await props.decodeQrImage(bytes, file.type || 'image/png')
    const parts = await props.parseQrUrl(decoded.url)
    emit('submit', parts.enc)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '二维码识别失败'
  } finally {
    processing.value = false
    if (fileInputRef.value) fileInputRef.value.value = ''
  }
}

const handleCameraCapture = async (event) => {
  // 移动端通过 file input capture 唤起相机，拍照后走图片解码流程
  await handleImageSelect(event)
}

const handleScreenCapture = () => {
  showScreenOverlay.value = true
}

const handleScreenRect = async (rect) => {
  showScreenOverlay.value = false
  processing.value = true
  error.value = ''
  try {
    const decoded = await props.captureScreenQr(rect)
    const parts = await props.parseQrUrl(decoded.url)
    emit('submit', parts.enc)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '屏幕截图识别失败'
  } finally {
    processing.value = false
  }
}

const handleClose = () => {
  error.value = ''
  urlInput.value = ''
  processing.value = false
  showScreenOverlay.value = false
  emit('close')
}
</script>

<template>
  <TModal :visible="visible" title="二维码签到" width="400px" @close="handleClose">
    <div class="qr-modal">
      <!-- 入口选择 -->
      <div class="qr-modal__entries">
        <button
          :class="['qr-entry-btn', { 'qr-entry-btn--active': mode === 'paste' }]"
          @click="mode = 'paste'"
        >
          📋 粘贴链接
        </button>
        <button
          :class="['qr-entry-btn', { 'qr-entry-btn--active': mode === 'image' }]"
          @click="mode = 'image'"
        >
          🖼️ 选择图片
        </button>
        <button
          v-if="cameraAvailable"
          :class="['qr-entry-btn', { 'qr-entry-btn--active': mode === 'camera' }]"
          @click="mode = 'camera'"
        >
          📷 拍照扫码
        </button>
        <button
          v-if="isDesktop"
          :class="['qr-entry-btn', { 'qr-entry-btn--active': mode === 'screen' }]"
          @click="mode = 'screen'"
        >
          🖥️ 屏幕截图
        </button>
      </div>

      <!-- 粘贴链接 -->
      <div v-if="mode === 'paste'" class="qr-modal__section">
        <textarea
          v-model="urlInput"
          class="qr-modal__textarea"
          placeholder="粘贴学习通签到二维码链接..."
          rows="3"
        ></textarea>
        <button
          class="qr-modal__action-btn"
          :disabled="processing || !urlInput.trim()"
          @click="handlePasteSubmit"
        >
          {{ processing ? '解析中...' : '解析并签到' }}
        </button>
      </div>

      <!-- 选择图片 -->
      <div v-if="mode === 'image'" class="qr-modal__section">
        <label class="qr-modal__file-label" @click="fileInputRef?.click()">
          <span class="qr-modal__file-icon">🖼️</span>
          <span>点击选择包含二维码的图片</span>
        </label>
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          class="qr-modal__file-input"
          @change="handleImageSelect"
        />
        <p v-if="processing" class="qr-modal__hint">正在识别二维码...</p>
      </div>

      <!-- 拍照扫码 -->
      <div v-if="mode === 'camera'" class="qr-modal__section">
        <label class="qr-modal__file-label">
          <span class="qr-modal__file-icon">📷</span>
          <span>点击拍摄二维码照片</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            class="qr-modal__file-input"
            @change="handleCameraCapture"
          />
        </label>
        <p v-if="processing" class="qr-modal__hint">正在识别二维码...</p>
      </div>

      <!-- 屏幕截图 -->
      <div v-if="mode === 'screen'" class="qr-modal__section">
        <button
          class="qr-modal__action-btn"
          :disabled="processing"
          @click="handleScreenCapture"
        >
          {{ processing ? '识别中...' : '🖥️ 选择屏幕区域' }}
        </button>
        <p class="qr-modal__hint">点击后将出现全屏覆盖层，拖拽选择包含二维码的区域</p>
      </div>

      <p v-if="error" class="qr-modal__error">{{ error }}</p>
    </div>

    <template #footer>
      <button class="modal-btn modal-btn--cancel" @click="handleClose">关闭</button>
    </template>
  </TModal>

  <!-- 屏幕区域选择覆盖层 -->
  <QrScreenSelectOverlay
    v-if="showScreenOverlay"
    @select="handleScreenRect"
    @cancel="showScreenOverlay = false"
  />
</template>

<style scoped>
.qr-modal {
  display: flex;
  flex-direction: column;
  gap: calc(14px * var(--ui-space-scale));
}

.qr-modal__entries {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.qr-entry-btn {
  padding: 10px 8px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: calc(10px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 80%, transparent);
  color: var(--ui-muted);
  font-size: calc(12px * var(--ui-font-scale));
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  text-align: center;
}

.qr-entry-btn--active {
  border-color: var(--ui-primary);
  color: var(--ui-primary);
  background: color-mix(in oklab, var(--ui-primary) 6%, var(--ui-surface) 94%);
}

.qr-modal__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.qr-modal__textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: calc(10px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 80%, transparent);
  color: var(--ui-text);
  font-size: calc(13px * var(--ui-font-scale));
  resize: vertical;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
}

.qr-modal__textarea:focus {
  border-color: var(--ui-primary);
}

.qr-modal__action-btn {
  padding: 10px 16px;
  border: none;
  border-radius: calc(10px * var(--ui-radius-scale));
  background: var(--ui-primary);
  color: #fff;
  font-size: calc(13px * var(--ui-font-scale));
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
}

.qr-modal__action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.qr-modal__file-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  border: 2px dashed rgba(148, 163, 184, 0.35);
  border-radius: calc(12px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 60%, transparent);
  color: var(--ui-muted);
  font-size: calc(13px * var(--ui-font-scale));
  cursor: pointer;
  transition: border-color 0.15s;
}

.qr-modal__file-label:hover {
  border-color: var(--ui-primary);
}

.qr-modal__file-icon {
  font-size: 2rem;
}

.qr-modal__file-input {
  display: none;
}

.qr-modal__hint {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
  text-align: center;
}

.qr-modal__error {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-danger);
  text-align: center;
}

.modal-btn {
  padding: 8px 18px;
  border: none;
  border-radius: calc(10px * var(--ui-radius-scale));
  font-size: calc(13px * var(--ui-font-scale));
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
}

.modal-btn--cancel {
  background: rgba(148, 163, 184, 0.14);
  color: var(--ui-muted);
}
</style>
