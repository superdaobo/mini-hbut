<script setup>
import { computed } from 'vue'

const props = defineProps({
  iconKey: { type: String, required: true },
  badgeSize: { type: Number, default: 44 },
  iconSize: { type: Number, default: 24 },
  alt: { type: String, default: '' },
  variant: { type: String, default: 'module' }
})

const iconMap = {
  grades: 'school',
  classroom: 'meeting_room',
  electricity: 'bolt',
  transactions: 'receipt_long',
  exams: 'event_note',
  ranking: 'leaderboard',
  campus_code: 'qr_code_2',
  calendar: 'calendar_month',
  school_inbox: 'mail',
  academic: 'trending_up',
  qxzkb: 'table_chart',
  course_selection: 'playlist_add_check',
  training: 'account_tree',
  library: 'local_library',
  campus_map: 'map',
  resource_share: 'cloud',
  chaoxing_class: 'menu_book',
  chaoxing_hub: 'school',
  chaoxing_inbox: 'inbox',
  teaching_eval: 'rate_review',
  broadband: 'wifi',
  sports_venue: 'sports_soccer',
  towergo: 'electric_bike',
  smart_orientation: 'school',
  ai: 'smart_toy',
  more: 'apps',
  home: 'home',
  schedule: 'calendar_month',
  notifications: 'notifications',
  me: 'person'
}

const symbolName = computed(() => iconMap[props.iconKey] || 'help')

const iconStyle = computed(() => ({
  '--badge-size': `${props.badgeSize}px`,
  '--icon-size': `${props.iconSize}px`,
  fontSize: `${props.iconSize}px`
}))
</script>

<template>
  <span 
    class="theme-module-icon material-symbols-outlined" 
    :class="`variant-${variant}`" 
    :style="iconStyle" 
    aria-hidden="true"
  >{{ symbolName }}</span>
</template>

<style scoped>
.theme-module-icon {
  width: var(--badge-size);
  height: var(--badge-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--icon-size);
  color: var(--module-icon-color, var(--ui-primary, #0066cc));
  font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  user-select: none;
  line-height: 1;
}

.theme-module-icon.variant-tab {
  font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
  color: currentColor;
}
</style>
