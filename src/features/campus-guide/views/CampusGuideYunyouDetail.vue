<script setup lang="ts">
import { onMounted, ref } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { showToast } from '../../../utils/toast'
import { CAMPUS_GUIDE_VIEWS } from '../navigation'
import { enrollYunyouShirt, loadShirtInfo } from '../services/yunyou-service'
import { useCampusGuideStore } from '../store/campus-guide-store'
import type { ShirtInfo } from '../types/phase2'

const emit = defineEmits(['back'])
const store = useCampusGuideStore()
const shirt = ref<ShirtInfo | null>(null)
const loading = ref(true)
const joining = ref(false)

const refresh = async () => {
  loading.value = true
  try {
    shirt.value = await loadShirtInfo()
  } catch (err) {
    showToast((err as Error)?.message || '文化衫信息加载失败', 'error', 2200)
  } finally {
    loading.value = false
  }
}

const handleEnroll = async () => {
  joining.value = true
  try {
    shirt.value = await enrollYunyouShirt()
    showToast('报名成功', 'success', 1500)
  } catch (err) {
    showToast((err as Error)?.message || '报名失败', 'error', 2200)
  } finally {
    joining.value = false
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <GuidePageLayout title="云游文化衫" icon="checkroom" @back="emit('back')">
    <p v-if="loading" class="campus-guide-muted">加载中…</p>
    <template v-else-if="shirt">
      <p class="campus-guide-muted">
        {{ shirt.isJoin ? `已参与云游 · 编号 ${shirt.number || '-'}` : '尚未报名云游活动' }}
      </p>
      <div v-if="!shirt.isJoin" class="campus-guide-action-row">
        <button type="button" class="primary" :disabled="joining" @click="handleEnroll">
          {{ joining ? '报名中…' : '立即报名' }}
        </button>
      </div>
      <template v-else>
        <section class="campus-phase2-section">
          <h3>正面图案</h3>
          <div class="campus-phase2-grid">
            <article v-for="item in shirt.frontList" :key="String(item.id)" class="campus-phase2-card">
              <img v-if="item.pic" :src="item.pic" :alt="item.name || '正面图案'" />
              <p>{{ item.name || '图案' }}</p>
            </article>
          </div>
        </section>
        <section class="campus-phase2-section">
          <h3>背面图案</h3>
          <div class="campus-phase2-grid">
            <article v-for="item in shirt.behindList" :key="String(item.id)" class="campus-phase2-card">
              <img v-if="item.pic" :src="item.pic" :alt="item.name || '背面图案'" />
              <p>{{ item.name || '图案' }}</p>
            </article>
          </div>
        </section>
        <div class="campus-guide-action-row">
          <button type="button" @click="store.navigateTo(CAMPUS_GUIDE_VIEWS.yunyouClue)">查看线索</button>
          <button type="button" class="primary" @click="store.navigateTo(CAMPUS_GUIDE_VIEWS.yunyouSignature)">
            签名定制
          </button>
        </div>
      </template>
    </template>
  </GuidePageLayout>
</template>