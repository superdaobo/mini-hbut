<script setup>
import { ref } from 'vue'
import { TModal } from '../templates'
import { useGeolocation } from '../../composables/useGeolocation'

defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'submit'])

const { available: geoAvailable, loading: geoLoading, getCurrentPosition } = useGeolocation()

const latitude = ref('')
const longitude = ref('')
const address = ref('')
const error = ref('')
const submitting = ref(false)

const handleGeolocate = async () => {
  error.value = ''
  try {
    const pos = await getCurrentPosition()
    latitude.value = String(pos.latitude)
    longitude.value = String(pos.longitude)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '定位失败'
  }
}

const handleSubmit = () => {
  const lat = parseFloat(latitude.value)
  const lng = parseFloat(longitude.value)
  const addr = address.value.trim()

  if (isNaN(lat) || isNaN(lng)) {
    error.value = '请输入有效的经纬度'
    return
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    error.value = '经纬度超出有效范围'
    return
  }
  if (!addr) {
    error.value = '请输入地址描述'
    return
  }

  error.value = ''
  submitting.value = true
  emit('submit', { latitude: lat, longitude: lng, address: addr })
  submitting.value = false
}

const handleClose = () => {
  error.value = ''
  emit('close')
}
</script>

<template>
  <TModal :visible="visible" title="位置签到" width="380px" @close="handleClose">
    <div class="location-modal">
      <div class="location-modal__row">
        <label class="location-modal__label">纬度</label>
        <input
          v-model="latitude"
          class="location-modal__input"
          type="text"
          inputmode="decimal"
          placeholder="例：30.5728"
        />
      </div>
      <div class="location-modal__row">
        <label class="location-modal__label">经度</label>
        <input
          v-model="longitude"
          class="location-modal__input"
          type="text"
          inputmode="decimal"
          placeholder="例：114.3162"
        />
      </div>
      <div class="location-modal__row">
        <label class="location-modal__label">地址</label>
        <input
          v-model="address"
          class="location-modal__input"
          type="text"
          placeholder="例：湖北工业大学图书馆"
        />
      </div>

      <button
        v-if="geoAvailable"
        class="location-modal__geo-btn"
        :disabled="geoLoading"
        @click="handleGeolocate"
      >
        {{ geoLoading ? '定位中...' : '📍 获取当前位置' }}
      </button>

      <p v-if="error" class="location-modal__error">{{ error }}</p>
    </div>

    <template #footer>
      <button class="modal-btn modal-btn--cancel" @click="handleClose">取消</button>
      <button class="modal-btn modal-btn--primary" :disabled="submitting" @click="handleSubmit">
        确认签到
      </button>
    </template>
  </TModal>
</template>

<style scoped>
.location-modal {
  display: flex;
  flex-direction: column;
  gap: calc(12px * var(--ui-space-scale));
}

.location-modal__row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.location-modal__label {
  font-size: calc(12px * var(--ui-font-scale));
  font-weight: 600;
  color: var(--ui-muted);
}

.location-modal__input {
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: calc(10px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 80%, transparent);
  color: var(--ui-text);
  font-size: calc(14px * var(--ui-font-scale));
  outline: none;
  transition: border-color 0.15s;
}

.location-modal__input:focus {
  border-color: var(--ui-primary);
}

.location-modal__geo-btn {
  padding: 10px;
  border: 1px dashed rgba(148, 163, 184, 0.4);
  border-radius: calc(10px * var(--ui-radius-scale));
  background: transparent;
  color: var(--ui-primary);
  font-size: calc(13px * var(--ui-font-scale));
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.location-modal__geo-btn:hover {
  background: color-mix(in oklab, var(--ui-primary) 6%, transparent);
}

.location-modal__geo-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.location-modal__error {
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
