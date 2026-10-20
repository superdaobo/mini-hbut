<script setup lang="ts">
import { isHttpLink } from '../utils/external_link'
/**
 * #1089：跨页面复用的独立全屏公告详情；只负责展示和事件，
 * Markdown 清洗与链接打开仍交由 RemoteConfigCoordinator。
 */
defineProps<{
  visible: boolean
  announcement: { title?: string; updated_at?: string; image?: string; link?: string } | null
  html: string
  fromHomePanel: boolean
}>()

const emit = defineEmits<{
  (event: 'back'): void
  (event: 'dismiss'): void
  (event: 'content-click', originalEvent: MouseEvent): void
  (event: 'external-open', url: string, originalEvent: MouseEvent): void
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="announcement-fullscreen">
      <div v-if="visible" class="announcement-fullscreen-overlay" @click.self="emit('dismiss')">
        <section
          class="announcement-fullscreen-card"
          role="dialog"
          aria-modal="true"
          :aria-label="announcement?.title || '公告详情'"
        >
          <header class="announcement-fullscreen-header">
            <button
              v-if="fromHomePanel"
              type="button"
              class="announcement-fullscreen-nav"
              aria-label="返回通知列表"
              @click="emit('back')"
            >
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
            </button>
            <h2>{{ announcement?.title || '公告详情' }}</h2>
            <button
              type="button"
              class="announcement-fullscreen-nav"
              aria-label="关闭公告"
              @click="emit('dismiss')"
            >
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
          </header>
          <div class="announcement-fullscreen-body">
            <div v-if="announcement?.updated_at" class="announcement-fullscreen-meta">
              更新时间：{{ announcement.updated_at }}
            </div>
            <div v-if="announcement?.image" class="announcement-fullscreen-image">
              <img :src="announcement.image" :alt="announcement.title || '公告图片'" />
            </div>
            <div
              class="announcement-fullscreen-content select-text"
              @click="(event) => emit('content-click', event)"
              v-html="html"
            ></div>
            <a
              v-if="announcement?.link && isHttpLink(announcement.link)"
              class="announcement-fullscreen-link"
              :href="announcement.link"
              target="_blank"
              rel="noopener noreferrer"
              @click.prevent="(event) => emit('external-open', announcement?.link || '', event)"
            >查看原文 <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i></a>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.announcement-fullscreen-overlay {
  position: fixed;
  inset: 0;
  z-index: 9997;
  display: flex;
  justify-content: center;
  align-items: center;
  padding:
    max(12px, var(--app-safe-top, 0px))
    max(12px, env(safe-area-inset-right, 0px))
    max(12px, var(--app-safe-bottom, 0px))
    max(12px, env(safe-area-inset-left, 0px));
  background: rgba(15, 23, 42, 0.46);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.announcement-fullscreen-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 720px;
  height: min(85dvh, 860px);
  max-height: 100%;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  background: var(--ui-modal-surface, #fff);
  color: var(--ui-text, #0f172a);
  border-radius: 24px;
  border: 1px solid var(--ui-modal-surface-border, rgba(148, 163, 184, 0.25));
  box-shadow: var(--ui-modal-surface-shadow, 0 24px 60px rgba(15, 23, 42, 0.28));
}
.announcement-fullscreen-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.17);
}
.announcement-fullscreen-header h2 {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  font-size: 18px;
  font-weight: 750;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.announcement-fullscreen-nav {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--ui-primary-soft, #f1f5f9);
  color: var(--ui-text, #475569);
  cursor: pointer;
}
.announcement-fullscreen-nav:hover { opacity: 0.78; }
.announcement-fullscreen-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  padding: 14px 22px 28px;
}
.announcement-fullscreen-meta {
  color: var(--ui-muted, #64748b);
  font-size: 12px;
  margin-bottom: 14px;
}
.announcement-fullscreen-image img {
  width: 100%;
  max-width: 100%;
  height: auto;
  border-radius: 14px;
  margin-bottom: 16px;
}
.announcement-fullscreen-content {
  color: var(--ui-text, #334155);
  font-size: 15px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.announcement-fullscreen-content :deep(img),
.announcement-fullscreen-content :deep(video) {
  max-width: 100%;
  height: auto;
}
.announcement-fullscreen-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--ui-primary, #3b82f6);
  font-size: 14px;
  margin-top: 16px;
}
:global(html.dark) .announcement-fullscreen-card,
:global(html[data-theme='graphite_night']) .announcement-fullscreen-card {
  background: var(--ui-modal-surface, #1e293b);
}
.announcement-fullscreen-enter-active,
.announcement-fullscreen-leave-active { transition: opacity 0.22s ease; }
.announcement-fullscreen-enter-active .announcement-fullscreen-card,
.announcement-fullscreen-leave-active .announcement-fullscreen-card { transition: transform 0.22s ease, opacity 0.22s ease; }
.announcement-fullscreen-enter-from,
.announcement-fullscreen-leave-to { opacity: 0; }
.announcement-fullscreen-enter-from .announcement-fullscreen-card { transform: translateY(16px) scale(0.96); }
.announcement-fullscreen-leave-to .announcement-fullscreen-card { transform: translateY(6px) scale(0.98); }
@media (max-width: 599px) {
  .announcement-fullscreen-card { height: 100%; border-radius: 20px; }
  .announcement-fullscreen-header { padding: 14px 15px 12px; }
  .announcement-fullscreen-body { padding: 12px 17px 24px; }
}
@media (prefers-reduced-motion: reduce) {
  .announcement-fullscreen-enter-active,
  .announcement-fullscreen-leave-active,
  .announcement-fullscreen-enter-active .announcement-fullscreen-card,
  .announcement-fullscreen-leave-active .announcement-fullscreen-card { transition: none !important; }
}
</style>
