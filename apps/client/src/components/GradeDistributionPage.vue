<script setup>
/**
 * 给分记录独立页面（#1110）
 *
 * 「首页 → 全部功能 → 教务服务」的独立入口（module/view id: `grade_distribution`）：
 * - 页面壳 = TPageHeader（标题 + 返回首页）+ 复用的 `GradeDistributionView`；
 * - 与「成绩查询 → 给分记录」Tab 是**两个入口、同一个视图**：
 *   GradeDistributionView 自带取数 / 搜索 / 分页状态，本页面不传任何 props，
 *   因此独立页不依赖成绩查询的刷新 / 滚动状态，Tab 内行为也保持不变；
 * - 登录 / 角色 / App Store guest/demo 策略由导航层（decideHomeNavigate /
 *   isModuleAllowed / 角色白名单）统一把关，本页面不做额外旁路。
 */
import { useLocale } from '../utils/app_i18n'
import { TPageHeader } from './templates'
import GradeDistributionView from './GradeDistributionView.vue'

const { t } = useLocale()

const emit = defineEmits(['back'])
</script>

<template>
  <div class="grade-distribution-page">
    <TPageHeader :title="t('grade.dist.title')" icon="bar_chart" @back="emit('back')" />

    <div class="grade-distribution-page__body">
      <GradeDistributionView />
    </div>
  </div>
</template>

<style scoped>
.grade-distribution-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.grade-distribution-page__body {
  flex: 1;
  padding: 12px 0 24px;
}
</style>
