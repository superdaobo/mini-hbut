<script setup>
import { onMounted, ref } from 'vue'
import { TEmptyState, TPageHeader, TSection } from './templates'
import SessionStatusBanner from './chaoxing_checkin/SessionStatusBanner.vue'
import CheckinActivityCard from './chaoxing_checkin/CheckinActivityCard.vue'
import CheckinHistoryList from './chaoxing_checkin/CheckinHistoryList.vue'
import LocationCheckinModal from './chaoxing_checkin/LocationCheckinModal.vue'
import PhotoCheckinModal from './chaoxing_checkin/PhotoCheckinModal.vue'
import GestureCheckinModal from './chaoxing_checkin/GestureCheckinModal.vue'
import QrCheckinModal from './chaoxing_checkin/QrCheckinModal.vue'
import { useChaoxingCheckin } from '../composables/useChaoxingCheckin'

defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back'])

const {
  activities,
  history,
  loading,
  sessionConnected,
  activeActivities,
  pendingOrExpired,
  refresh,
  submitCommon,
  submitLocation,
  uploadPhoto,
  submitPhoto,
  submitQrcode,
  submitGesture,
  fetchHistory,
  parseQrUrl,
  decodeQrImage,
  captureScreenQr,
  isInflight
} = useChaoxingCheckin()

const refreshing = ref(false)
const error = ref('')
const toast = ref('')

// 模态状态
const locationModal = ref({ visible: false, activeId: '' })
const photoModal = ref({ visible: false, activeId: '' })
const gestureModal = ref({ visible: false, activeId: '' })
const qrModal = ref({ visible: false, activeId: '' })

const showTab = ref('active') // 'active' | 'history'

const handleRefresh = async () => {
  refreshing.value = true
  error.value = ''
  try {
    await refresh(true)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    refreshing.value = false
  }
}

const handleAction = async (activity) => {
  const type = activity.activity_type
  const activeId = activity.active_id

  if (type === 'normal') {
    try {
      const res = await submitCommon(activeId)
      toast.value = res.message || '签到成功'
      await refresh()
    } catch (err) {
      toast.value = err instanceof Error ? err.message : '签到失败'
    }
    return
  }

  if (type === 'location') {
    locationModal.value = { visible: true, activeId }
    return
  }
  if (type === 'photo') {
    photoModal.value = { visible: true, activeId }
    return
  }
  if (type === 'gesture') {
    gestureModal.value = { visible: true, activeId }
    return
  }
  if (type === 'qrcode') {
    qrModal.value = { visible: true, activeId }
    return
  }
}

const handleLocationSubmit = async (payload) => {
  try {
    const res = await submitLocation(
      locationModal.value.activeId,
      payload.latitude,
      payload.longitude,
      payload.address
    )
    toast.value = res.message || '位置签到成功'
    locationModal.value.visible = false
    await refresh()
  } catch (err) {
    toast.value = err instanceof Error ? err.message : '位置签到失败'
  }
}

const handlePhotoSubmit = async (payload) => {
  try {
    const uploaded = await uploadPhoto(payload.bytes, payload.mime, payload.name)
    const res = await submitPhoto(photoModal.value.activeId, uploaded.object_id)
    toast.value = res.message || '拍照签到成功'
    photoModal.value.visible = false
    await refresh()
  } catch (err) {
    toast.value = err instanceof Error ? err.message : '拍照签到失败'
  }
}

const handleGestureSubmit = async (pattern) => {
  try {
    const res = await submitGesture(gestureModal.value.activeId, pattern)
    toast.value = res.message || '手势签到成功'
    gestureModal.value.visible = false
    await refresh()
  } catch (err) {
    toast.value = err instanceof Error ? err.message : '手势签到失败'
  }
}

const handleQrSubmit = async (enc) => {
  try {
    const res = await submitQrcode(qrModal.value.activeId, enc)
    toast.value = res.message || '二维码签到成功'
    qrModal.value.visible = false
    await refresh()
  } catch (err) {
    toast.value = err instanceof Error ? err.message : '二维码签到失败'
  }
}

const handleShowHistory = async () => {
  showTab.value = 'history'
  try {
    await fetchHistory()
  } catch {
    // 静默处理
  }
}

onMounted(async () => {
  try {
    await refresh()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
})
</script>

<template>
  <div class="more-chaoxing-checkin-view">
    <TPageHeader title="学习通签到" @back="emit('back')">
      <template #actions>
        <button class="icon-btn" :disabled="refreshing" @click="handleRefresh">↻</button>
      </template>
    </TPageHeader>

    <div class="more-chaoxing-checkin-view__body">
      <!-- 会话状态 -->
      <SessionStatusBanner :connected="sessionConnected" />

      <!-- Toast 提示 -->
      <Transition name="toast-fade">
        <div v-if="toast" class="checkin-toast" @click="toast = ''">
          {{ toast }}
        </div>
      </Transition>

      <!-- Tab 切换 -->
      <div class="checkin-tabs">
        <button
          :class="['checkin-tab', { 'checkin-tab--active': showTab === 'active' }]"
          @click="showTab = 'active'"
        >
          签到活动
        </button>
        <button
          :class="['checkin-tab', { 'checkin-tab--active': showTab === 'history' }]"
          @click="handleShowHistory"
        >
          签到记录
        </button>
      </div>

      <!-- 活动列表 -->
      <template v-if="showTab === 'active'">
        <TEmptyState v-if="loading" type="loading" message="正在获取签到活动..." />
        <TEmptyState v-else-if="error" type="error" :message="error" />
        <template v-else>
          <TSection v-if="activeActivities.length" title="进行中" icon="🟢">
            <div class="checkin-activity-list">
              <CheckinActivityCard
                v-for="item in activeActivities"
                :key="item.active_id"
                :activity="item"
                :inflight="isInflight(item.active_id)"
                @action="handleAction(item)"
              />
            </div>
          </TSection>

          <TSection v-if="pendingOrExpired.length" title="已结束 / 已签" icon="📋">
            <div class="checkin-activity-list">
              <CheckinActivityCard
                v-for="item in pendingOrExpired"
                :key="item.active_id"
                :activity="item"
                :inflight="isInflight(item.active_id)"
                @action="handleAction(item)"
              />
            </div>
          </TSection>

          <TEmptyState
            v-if="!activities.length"
            type="empty"
            message="暂无签到活动"
            icon="📭"
          />
        </template>
      </template>

      <!-- 历史记录 -->
      <template v-if="showTab === 'history'">
        <CheckinHistoryList :entries="history" />
      </template>
    </div>

    <!-- 模态弹窗 -->
    <LocationCheckinModal
      :visible="locationModal.visible"
      @close="locationModal.visible = false"
      @submit="handleLocationSubmit"
    />
    <PhotoCheckinModal
      :visible="photoModal.visible"
      @close="photoModal.visible = false"
      @submit="handlePhotoSubmit"
    />
    <GestureCheckinModal
      :visible="gestureModal.visible"
      @close="gestureModal.visible = false"
      @submit="handleGestureSubmit"
    />
    <QrCheckinModal
      :visible="qrModal.visible"
      :active-id="qrModal.activeId"
      :parse-qr-url="parseQrUrl"
      :decode-qr-image="decodeQrImage"
      :capture-screen-qr="captureScreenQr"
      @close="qrModal.visible = false"
      @submit="handleQrSubmit"
    />
  </div>
</template>

<style scoped>
.more-chaoxing-checkin-view {
  min-height: calc(var(--app-vh, 1vh) * 100);
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg-gradient);
  overflow-y: auto;
}

.more-chaoxing-checkin-view__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: calc(14px * var(--ui-space-scale));
  padding: 14px 14px calc(28px + env(safe-area-inset-bottom));
}

.checkin-tabs {
  display: flex;
  gap: 8px;
  padding: 4px;
  border-radius: calc(12px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 70%, transparent);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.checkin-tab {
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: calc(10px * var(--ui-radius-scale));
  background: transparent;
  color: var(--ui-muted);
  font-size: calc(14px * var(--ui-font-scale));
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.checkin-tab--active {
  background: var(--ui-surface);
  color: var(--ui-text);
  box-shadow: var(--ui-shadow-soft);
}

.checkin-activity-list {
  display: flex;
  flex-direction: column;
  gap: calc(10px * var(--ui-space-scale));
}

.checkin-toast {
  position: fixed;
  top: calc(60px + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  padding: 10px 20px;
  border-radius: calc(12px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 95%, var(--ui-primary) 5%);
  color: var(--ui-text);
  font-size: calc(13px * var(--ui-font-scale));
  font-weight: 600;
  box-shadow: var(--ui-shadow-soft);
  border: 1px solid rgba(148, 163, 184, 0.2);
  cursor: pointer;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}

.icon-btn {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: color-mix(in oklab, var(--ui-surface) 92%, white 8%);
  color: var(--ui-text);
  cursor: pointer;
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 760px) {
  .more-chaoxing-checkin-view__body {
    padding: 12px 12px calc(24px + env(safe-area-inset-bottom));
  }
}
</style>
