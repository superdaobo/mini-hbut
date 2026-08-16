<script setup>
import { openExternal } from '../utils/external_link'
import { showToast } from '../utils/toast'

const emit = defineEmits(['back'])

const quickLinks = [
  {
    id: 'portal',
    title: '新融合门户',
    subtitle: '湖北工业大学统一身份认证与办事入口',
    url: 'https://e.hbut.edu.cn/',
    icon: 'account_balance',
    iconBg: '#E8F0FE',
    iconColor: '#1A73E8'
  },
  {
    id: 'chaoxing',
    title: '学习通',
    subtitle: '超星学习通网页版',
    url: 'https://i.chaoxing.com/',
    icon: 'school',
    iconBg: '#E6F4EA',
    iconColor: '#1E8E3E'
  }
]

const handleOpenLink = async (link) => {
  const ok = await openExternal(link.url)
  if (!ok) {
    showToast(`无法打开「${link.title}」，请稍后重试`, 'error')
  }
}
</script>

<template>
  <div class="quick-links-view">
    <header class="subpage-header">
      <button class="back-button" type="button" @click="emit('back')" aria-label="返回">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <div class="header-copy">
        <span class="header-kicker">我的</span>
        <h1>快捷链接</h1>
      </div>
      <span class="header-spacer" aria-hidden="true"></span>
    </header>

    <p class="intro">常用校园系统入口，点击后在系统浏览器中打开。</p>

    <section class="links-list" aria-label="快捷链接列表">
      <button
        v-for="link in quickLinks"
        :key="link.id"
        class="link-card"
        type="button"
        @click="handleOpenLink(link)"
      >
        <div class="link-icon-box" :style="{ background: link.iconBg }">
          <span class="material-symbols-outlined" :style="{ color: link.iconColor }">{{ link.icon }}</span>
        </div>
        <div class="link-copy">
          <strong>{{ link.title }}</strong>
          <span>{{ link.subtitle }}</span>
        </div>
        <span class="material-symbols-outlined link-arrow">open_in_new</span>
      </button>
    </section>
  </div>
</template>

<style scoped>
.quick-links-view {
  min-height: calc(var(--app-vh, 1vh) * 100);
  min-height: 100dvh;
  padding: 16px 16px 120px;
  background: var(--ui-bg-gradient, #f9f9ff);
}

.subpage-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.back-button {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 12px;
  background: color-mix(in srgb, var(--ui-primary, #2563eb) 8%, #ffffff 92%);
  color: var(--ui-primary, #2563eb);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex: 0 0 auto;
}

.header-copy {
  flex: 1;
  min-width: 0;
}

.header-kicker {
  display: block;
  margin-bottom: 2px;
  color: #64748b;
  font-size: 12px;
}

.header-copy h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.2;
  color: #0f172a;
}

.header-spacer {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
}

.intro {
  margin: 0 0 16px;
  color: #64748b;
  font-size: 14px;
  line-height: 1.6;
}

.links-list {
  display: grid;
  gap: 12px;
}

.link-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 16px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 20px;
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
  cursor: pointer;
  text-align: left;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.link-card:active {
  transform: scale(0.98);
}

.link-icon-box {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.link-icon-box .material-symbols-outlined {
  font-size: 26px;
}

.link-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.link-copy strong {
  color: #0f172a;
  font-size: 16px;
}

.link-copy span {
  color: #64748b;
  font-size: 13px;
  line-height: 1.4;
}

.link-arrow {
  color: #94a3b8;
  font-size: 20px;
  flex: 0 0 auto;
}

@media (min-width: 720px) {
  .quick-links-view {
    max-width: 760px;
    margin: 0 auto;
  }
}
</style>
