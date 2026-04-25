<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { TModal } from './templates'
import {
  buildDefaultWorkspaceLayout,
  HOME_MODULE_ORDER_DEFAULT,
  HOME_WIDGET_ORDER_DEFAULT,
  NOTIFICATION_CARD_ORDER_DEFAULT
} from '../config/ui_settings'
import {
  cloneWorkspaceLayout,
  flushUiSettings,
  useUiSettings
} from '../utils/ui_settings'
import { showToast } from '../utils/toast'

const props = defineProps({
  visible: { type: Boolean, default: false },
  initialTab: { type: String, default: 'home' }
})

const emit = defineEmits(['close'])

const uiSettings = useUiSettings()
const rootRef = ref(null)
const activeTab = ref('home')
const draftLayout = ref(cloneWorkspaceLayout(buildDefaultWorkspaceLayout()))
const draggingKey = ref('')
const draggingSection = ref('')
const dragEnabled = ref(false)

const homeWidgetMeta = {
  module_grid: {
    title: '功能宫格',
    desc: '首页 16 个主功能入口'
  },
  today_panel: {
    title: '今日上课提醒',
    desc: '当前/即将上课课程卡片'
  }
}

const homeModuleMeta = {
  grades: '成绩查询',
  classroom: '空教室',
  electricity: '电费查询',
  transactions: '交易记录',
  exams: '考试安排',
  ranking: '绩点排名',
  campus_code: '校园码',
  calendar: '校历',
  academic: '学业情况',
  qxzkb: '全校课表',
  course_selection: '选课中心',
  training: '培养方案',
  library: '图书查询',
  campus_map: '校园地图',
  resource_share: '资料分享',
  ai: '校园助手'
}

const notificationCardMeta = {
  class_reminder: {
    title: '上课提醒',
    desc: '下一门课与提醒提前时间'
  },
  electricity: {
    title: '电费监控',
    desc: '宿舍电量与低电状态'
  },
  grades: {
    title: '成绩动态',
    desc: '最近成绩变化摘要'
  },
  exams: {
    title: '考试列表',
    desc: '近期与明日考试安排'
  }
}

const homeWidgetItems = computed(() =>
  draftLayout.value.home.widgetsOrder.map((key, index) => ({
    key,
    index,
    ...homeWidgetMeta[key]
  }))
)

const homeModuleItems = computed(() =>
  draftLayout.value.home.moduleOrder.map((key, index) => ({
    key,
    index,
    title: homeModuleMeta[key] || key
  }))
)

const notificationCardItems = computed(() =>
  draftLayout.value.notifications.cardsOrder.map((key, index) => ({
    key,
    index,
    ...notificationCardMeta[key]
  }))
)

const setDraftFromState = () => {
  draftLayout.value = cloneWorkspaceLayout(uiSettings.workspaceLayout)
}

const getSectionList = (section) => {
  if (section === 'home-widgets') return draftLayout.value.home.widgetsOrder
  if (section === 'home-modules') return draftLayout.value.home.moduleOrder
  if (section === 'notifications-cards') return draftLayout.value.notifications.cardsOrder
  return []
}

const setSectionList = (section, nextList) => {
  if (section === 'home-widgets') {
    draftLayout.value.home.widgetsOrder = [...nextList]
    return
  }
  if (section === 'home-modules') {
    draftLayout.value.home.moduleOrder = [...nextList]
    return
  }
  if (section === 'notifications-cards') {
    draftLayout.value.notifications.cardsOrder = [...nextList]
  }
}

const moveKeyBefore = (section, dragKey, targetKey) => {
  const list = [...getSectionList(section)]
  const fromIndex = list.indexOf(dragKey)
  const targetIndex = list.indexOf(targetKey)
  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return
  list.splice(fromIndex, 1)
  list.splice(targetIndex, 0, dragKey)
  setSectionList(section, list)
}

const resolveClosestKey = (section, clientX, clientY) => {
  const root = rootRef.value
  if (!root) return ''
  const selector = `[data-layout-section="${section}"][data-layout-key]`
  const cards = [...root.querySelectorAll(selector)]
  if (!cards.length) return ''

  const directNode = document.elementFromPoint(clientX, clientY)?.closest?.(selector)
  if (directNode) {
    return String(directNode.getAttribute('data-layout-key') || '').trim()
  }

  let bestKey = ''
  let bestDistance = Number.POSITIVE_INFINITY
  cards.forEach((card) => {
    const rect = card.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const dx = centerX - clientX
    const dy = centerY - clientY
    const distance = dx * dx + dy * dy
    if (distance < bestDistance) {
      bestDistance = distance
      bestKey = String(card.getAttribute('data-layout-key') || '').trim()
    }
  })
  return bestKey
}

const stopDragging = () => {
  draggingKey.value = ''
  draggingSection.value = ''
  dragEnabled.value = false
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
  window.removeEventListener('pointercancel', handlePointerUp)
}

const handlePointerMove = (event) => {
  if (!dragEnabled.value || !draggingSection.value || !draggingKey.value) return
  const targetKey = resolveClosestKey(draggingSection.value, event.clientX, event.clientY)
  if (!targetKey || targetKey === draggingKey.value) return
  moveKeyBefore(draggingSection.value, draggingKey.value, targetKey)
}

const handlePointerUp = () => {
  stopDragging()
}

const handleDragStart = (section, key, event) => {
  if (!props.visible) return
  event.preventDefault()
  draggingSection.value = section
  draggingKey.value = key
  dragEnabled.value = true
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', handlePointerUp)
}

const handleRestoreDefault = () => {
  const defaults = buildDefaultWorkspaceLayout()
  if (activeTab.value === 'home') {
    draftLayout.value.home = cloneWorkspaceLayout(defaults).home
    showToast('首页布局已恢复默认', 'success')
    return
  }
  draftLayout.value.notifications = cloneWorkspaceLayout(defaults).notifications
  showToast('通知布局已恢复默认', 'success')
}

const handleCancel = () => {
  setDraftFromState()
  stopDragging()
  emit('close')
}

const handleSave = () => {
  uiSettings.workspaceLayout = cloneWorkspaceLayout(draftLayout.value)
  flushUiSettings()
  stopDragging()
  showToast('工作台布局已保存', 'success')
  emit('close')
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      stopDragging()
      return
    }
    activeTab.value = props.initialTab === 'notifications' ? 'notifications' : 'home'
    setDraftFromState()
  }
)

watch(
  () => props.initialTab,
  (tab) => {
    if (!props.visible) return
    activeTab.value = tab === 'notifications' ? 'notifications' : 'home'
  }
)

onBeforeUnmount(() => {
  stopDragging()
})
</script>

<template>
  <TModal
    :visible="visible"
    title="工作台布局"
    width="960px"
    :close-on-overlay="false"
    @close="handleCancel"
  >
    <div ref="rootRef" class="workspace-editor">
      <div class="workspace-editor__hero">
        <div>
          <strong>网格吸附布局</strong>
          <p>拖动带虚线握把的卡片完成排序。只有点击“完成”后才会写入当前方案。</p>
        </div>
        <div class="workspace-editor__tabs">
          <button
            type="button"
            class="workspace-editor__tab"
            :class="{ active: activeTab === 'home' }"
            @click="activeTab = 'home'"
          >
            首页布局
          </button>
          <button
            type="button"
            class="workspace-editor__tab"
            :class="{ active: activeTab === 'notifications' }"
            @click="activeTab = 'notifications'"
          >
            通知布局
          </button>
        </div>
      </div>

      <template v-if="activeTab === 'home'">
        <section class="workspace-section">
          <div class="workspace-section__head">
            <h4>首页工作台组件</h4>
            <span>固定横幅与公告不参与排序</span>
          </div>
          <div class="workspace-list">
            <article
              v-for="item in homeWidgetItems"
              :key="item.key"
              class="workspace-card workspace-card--wide"
              :class="{ dragging: draggingSection === 'home-widgets' && draggingKey === item.key }"
              data-layout-section="home-widgets"
              :data-layout-key="item.key"
            >
              <button
                type="button"
                class="workspace-card__handle"
                @pointerdown="handleDragStart('home-widgets', item.key, $event)"
              >
                ⋮⋮
              </button>
              <div class="workspace-card__body">
                <strong>{{ item.index + 1 }}. {{ item.title }}</strong>
                <span>{{ item.desc }}</span>
              </div>
            </article>
          </div>
        </section>

        <section class="workspace-section">
          <div class="workspace-section__head">
            <h4>首页功能宫格</h4>
            <span>4 列吸附排序，保存后立即应用到首页</span>
          </div>
          <div class="workspace-grid">
            <article
              v-for="item in homeModuleItems"
              :key="item.key"
              class="workspace-card workspace-card--module"
              :class="{ dragging: draggingSection === 'home-modules' && draggingKey === item.key }"
              data-layout-section="home-modules"
              :data-layout-key="item.key"
            >
              <button
                type="button"
                class="workspace-card__handle"
                @pointerdown="handleDragStart('home-modules', item.key, $event)"
              >
                ⋮⋮
              </button>
              <div class="workspace-card__body">
                <strong>{{ item.index + 1 }}</strong>
                <span>{{ item.title }}</span>
              </div>
            </article>
          </div>
        </section>
      </template>

      <template v-else>
        <section class="workspace-section">
          <div class="workspace-section__head">
            <h4>通知信息卡</h4>
            <span>移动端长按可直接打开本编辑器</span>
          </div>
          <div class="workspace-list">
            <article
              v-for="item in notificationCardItems"
              :key="item.key"
              class="workspace-card workspace-card--wide"
              :class="{ dragging: draggingSection === 'notifications-cards' && draggingKey === item.key }"
              data-layout-section="notifications-cards"
              :data-layout-key="item.key"
            >
              <button
                type="button"
                class="workspace-card__handle"
                @pointerdown="handleDragStart('notifications-cards', item.key, $event)"
              >
                ⋮⋮
              </button>
              <div class="workspace-card__body">
                <strong>{{ item.index + 1 }}. {{ item.title }}</strong>
                <span>{{ item.desc }}</span>
              </div>
            </article>
          </div>
        </section>
      </template>

      <div class="workspace-editor__footer">
        <button type="button" class="ghost-btn" @click="handleCancel">取消</button>
        <button type="button" class="ghost-btn" @click="handleRestoreDefault">恢复默认</button>
        <button type="button" class="primary-btn" @click="handleSave">完成</button>
      </div>
    </div>
  </TModal>
</template>

<style scoped>
.workspace-editor {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.workspace-editor__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.workspace-editor__hero strong {
  display: block;
  font-size: calc(16px * var(--ui-font-scale));
  color: var(--ui-text);
}

.workspace-editor__hero p {
  margin: 6px 0 0;
  font-size: calc(13px * var(--ui-font-scale));
  line-height: 1.6;
  color: var(--ui-muted);
}

.workspace-editor__tabs {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}

.workspace-editor__tab,
.ghost-btn,
.primary-btn {
  border-radius: calc(12px * var(--ui-radius-scale));
  border: 1px solid color-mix(in oklab, var(--ui-primary) 18%, rgba(148, 163, 184, 0.34));
  padding: 10px 14px;
  font-size: calc(13px * var(--ui-font-scale));
  font-weight: 700;
  cursor: pointer;
  transition:
    transform calc(0.16s * var(--ui-motion-scale)) ease,
    box-shadow calc(0.16s * var(--ui-motion-scale)) ease,
    background calc(0.16s * var(--ui-motion-scale)) ease;
}

.workspace-editor__tab,
.ghost-btn {
  background: color-mix(in oklab, var(--ui-surface) 90%, #fff 10%);
  color: var(--ui-text);
}

.workspace-editor__tab.active {
  background: color-mix(in oklab, var(--ui-primary-soft) 60%, #fff 40%);
  border-color: color-mix(in oklab, var(--ui-primary) 28%, rgba(148, 163, 184, 0.42));
  box-shadow: var(--ui-shadow-soft);
}

.primary-btn {
  background: linear-gradient(135deg, var(--ui-primary), var(--ui-secondary));
  color: #fff;
}

.workspace-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.workspace-section__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.workspace-section__head h4 {
  margin: 0;
  font-size: calc(15px * var(--ui-font-scale));
  color: var(--ui-text);
}

.workspace-section__head span {
  font-size: calc(12px * var(--ui-font-scale));
  color: var(--ui-muted);
}

.workspace-list,
.workspace-grid {
  display: grid;
  gap: 12px;
}

.workspace-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.workspace-card {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
  padding: 14px;
  border-radius: calc(18px * var(--ui-radius-scale));
  border: 1px solid color-mix(in oklab, var(--ui-primary) 16%, rgba(148, 163, 184, 0.3));
  background: color-mix(in oklab, var(--ui-surface) 92%, #fff 8%);
  box-shadow: var(--ui-shadow-soft);
  user-select: none;
}

.workspace-card.dragging {
  opacity: 0.72;
  transform: scale(0.985);
}

.workspace-card--module {
  min-height: 102px;
}

.workspace-card__handle {
  border: 1px dashed color-mix(in oklab, var(--ui-primary) 28%, rgba(148, 163, 184, 0.4));
  border-radius: calc(12px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-primary-soft) 42%, #fff 58%);
  color: var(--ui-primary);
  font-size: 15px;
  font-weight: 700;
  cursor: grab;
  min-height: 100%;
}

.workspace-card__handle:active {
  cursor: grabbing;
}

.workspace-card__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.workspace-card__body strong {
  font-size: calc(14px * var(--ui-font-scale));
  color: var(--ui-text);
}

.workspace-card__body span {
  font-size: calc(12px * var(--ui-font-scale));
  line-height: 1.5;
  color: var(--ui-muted);
}

.workspace-editor__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid color-mix(in oklab, var(--ui-primary) 14%, rgba(148, 163, 184, 0.28));
}

@media (max-width: 860px) {
  .workspace-editor__hero {
    flex-direction: column;
  }

  .workspace-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .workspace-editor__footer {
    flex-wrap: wrap;
  }

  .workspace-editor__footer > button {
    flex: 1 1 calc(50% - 8px);
  }
}
</style>
