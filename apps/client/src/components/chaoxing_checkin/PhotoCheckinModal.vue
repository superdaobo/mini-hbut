<script setup>
import { ref } from 'vue'
import { TModal } from '../templates'
import { useQrScanner } from '../../composables/useQrScanner'

defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'submit'])

const { cameraAvailable } = useQrScanner()

const fileInputRef = ref(null)
const preview = ref('')
const selectedFile = ref(null)
const error = ref('')
const submitting = ref(false)

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const handleFileChange = (event) => {
  const file = event.target?.files?.[0]
  if (!file) return

  if (file.size > MAX_FILE_SIZE) {
    error.value = '图片大小不能超过 10MB'
    return
  }

  if (!file.type.startsWith('image/')) {
    error.value = '请选择图片文件'
    return
  }

  error.value = ''
  selectedFile.value = file
  preview.value = URL.createObjectURL(file)
}

const handleSubmit = async () => {
  if (!selectedFile.value) {
    error.value = '请先选择照片'
    return
  }

  submitting.value = true
  error.value = ''

  try {
    const buffer = await selectedFile.value.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    emit('submit', {
      bytes,
      mime: selectedFile.value.type || 'image/jpeg',
      name: selectedFile.value.name || 'photo.jpg'
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : '读取文件失败'
  } finally {
    submitting.value = false
  }
}

const handleClose = () => {
  error.value = ''
  preview.value = ''
  selectedFile.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
  emit('close')
}
</script>

<template>
  <TModal :visible="visible" title="拍照签到" width="380px" @close="handleClose">
    <div class="photo-modal">
      <div class="photo-modal__preview" @click="fileInputRef?.click()">
        <img v-if="preview" :src="preview" class="photo-modal__img" alt="预览" />
        <div v-else class="photo-modal__placeholder">
          <span class="photo-modal__placeholder-icon">📷</span>
          <span>点击选择照片</span>
        </div>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        accept="image/*"
        :capture="cameraAvailable ? 'environment' : undefined"
        class="photo-modal__file-input"
        @change="handleFileChange"
      />

      <p v-if="error" class="photo-modal__error">{{ error }}</p>
    </div>

    <template #footer>
      <button class="modal-btn modal-btn--cancel" @click="handleClose">取消</button>
      <button class="modal-btn modal-btn--primary" :disabled="submitting || !selectedFile" @click="handleSubmit">
        {{ submitting ? '上传中...' : '确认签到' }}
      </button>
    </template>
  </TModal>
</template>

<style scoped>
.photo-modal {
  display: flex;
  flex-direction: column;
  gap: calc(12px * var(--ui-space-scale));
}

.photo-modal__preview {
  width: 100%;
  aspect-ratio: 4 / 3;
  border: 2px dashed rgba(148, 163, 184, 0.35);
  border-radius: calc(12px * var(--ui-radius-scale));
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: color-mix(in oklab, var(--ui-surface) 60%, transparent);
  transition: border-color 0.15s;
}

.photo-modal__preview:hover {
  border-color: var(--ui-primary);
}

.photo-modal__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-modal__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--ui-muted);
  font-size: calc(13px * var(--ui-font-scale));
}

.photo-modal__placeholder-icon {
  font-size: 2rem;
}

.photo-modal__file-input {
  display: none;
}

.photo-modal__error {
  margin: 0;
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-danger);
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

.modal-btn--primary {
  background: var(--ui-primary);
  color: #fff;
}

.modal-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
