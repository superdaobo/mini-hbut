<script setup>
import { computed } from 'vue'

import iconGrades from '../../assets/module-icons/grades.svg?raw'
import iconClassroom from '../../assets/module-icons/classroom.svg?raw'
import iconElectricity from '../../assets/module-icons/electricity.svg?raw'
import iconTransactions from '../../assets/module-icons/transactions.svg?raw'
import iconExams from '../../assets/module-icons/exams.svg?raw'
import iconRanking from '../../assets/module-icons/ranking.svg?raw'
import iconCalendar from '../../assets/module-icons/calendar.svg?raw'
import iconAcademic from '../../assets/module-icons/academic.svg?raw'
import iconQxzkb from '../../assets/module-icons/global_schedule.svg?raw'
import iconTraining from '../../assets/module-icons/training.svg?raw'
import iconLibrary from '../../assets/module-icons/library.svg?raw'
import iconCampusMap from '../../assets/module-icons/campus_map.svg?raw'
import iconResourceShare from '../../assets/module-icons/resource_share.svg?raw'
import iconCampusAssistant from '../../assets/module-icons/campus_assistant.svg?raw'

const props = defineProps({
  iconKey: { type: String, required: true },
  badgeSize: { type: Number, default: 44 },
  iconSize: { type: Number, default: 24 },
  alt: { type: String, default: '' },
  variant: { type: String, default: 'module' }
})

const removeBgIconKeys = new Set([
  'classroom',
  'campus_map'
])

const iconMap = {
  grades: iconGrades,
  classroom: iconClassroom,
  electricity: iconElectricity,
  transactions: iconTransactions,
  exams: iconExams,
  ranking: iconRanking,
  calendar: iconCalendar,
  academic: iconAcademic,
  qxzkb: iconQxzkb,
  training: iconTraining,
  library: iconLibrary,
  campus_map: iconCampusMap,
  resource_share: iconResourceShare,
  ai: iconCampusAssistant,
  home: iconCampusAssistant,
  schedule: iconQxzkb,
  notifications: iconExams,
  me: iconRanking
}

const iconSrc = computed(() => iconMap[props.iconKey] || '')

const iconStyle = computed(() => ({
  '--badge-size': `${props.badgeSize}px`,
  '--icon-size': `${props.iconSize}px`
}))

const iconKeyClass = computed(() =>
  String(props.iconKey || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
)

function normalizeSvgMarkup(svgText) {
  if (!svgText) return ''
  let normalized = svgText
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<svg\b([^>]*)>/i, '<svg$1 part="module-icon-svg">')

  if (removeBgIconKeys.has(props.iconKey)) {
    normalized = normalized.replace(
      /(<svg\b[^>]*>)([\s\S]*?)(<\/svg>)/i,
      (_match, openTag, body, closeTag) => {
        const cleanedBody = body.replace(
          /^\s*<(path|circle|ellipse|rect)\b[\s\S]*?(?:\/>|><\/\1>)\s*/i,
          ''
        )
        return `${openTag}${cleanedBody}${closeTag}`
      }
    )
  }

  return normalized
}

const iconMarkup = computed(() => normalizeSvgMarkup(iconSrc.value))
</script>

<template>
  <span class="theme-module-icon" :class="`variant-${variant}`" :style="iconStyle" aria-hidden="true">
    <span v-if="iconMarkup" class="icon-svg" :class="`icon-${iconKeyClass}`" v-html="iconMarkup" />
    <span v-else class="fallback-glyph">?</span>
  </span>
</template>

<style scoped>
.theme-module-icon {
  width: var(--badge-size);
  height: var(--badge-size);
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(
      120% 120% at 18% 18%,
      color-mix(in oklab, var(--ui-primary) 22%, #dcf1ff 78%) 0%,
      color-mix(in oklab, var(--ui-secondary) 14%, #eff8ff 86%) 100%
    );
  border: 1px solid color-mix(in oklab, var(--ui-primary) 24%, rgba(148, 163, 184, 0.24));
  box-shadow:
    0 8px 16px color-mix(in oklab, var(--ui-primary) 14%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
  overflow: hidden;
  color: var(--module-icon-color, #2f8dff);
}

.icon-svg {
  /* 保证图标始终完整落在圆圈内，且各模块缩放一致 */
  width: min(calc(var(--badge-size) * 0.56), calc(var(--icon-size) * 0.92));
  height: min(calc(var(--badge-size) * 0.56), calc(var(--icon-size) * 0.92));
  user-select: none;
  -webkit-user-drag: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
}

.icon-svg.icon-classroom {
  width: min(calc(var(--badge-size) * 0.64), calc(var(--icon-size) * 1.16));
  height: min(calc(var(--badge-size) * 0.64), calc(var(--icon-size) * 1.16));
  transform: translate(-2px, 2px);
}

.icon-svg.icon-academic {
  width: min(calc(var(--badge-size) * 0.62), calc(var(--icon-size) * 1.08));
  height: min(calc(var(--badge-size) * 0.62), calc(var(--icon-size) * 1.08));
  transform: translateY(1px);
}

.icon-svg :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.icon-svg :deep(svg *) {
  fill: currentColor !important;
  stroke: currentColor !important;
}

.icon-svg :deep([fill='none']) {
  fill: none !important;
}

.icon-svg :deep([stroke='none']) {
  stroke: none !important;
}

.theme-module-icon.variant-tab {
  background: transparent;
  border: none;
  box-shadow: none;
}

.theme-module-icon.variant-tab .icon-svg {
  width: var(--icon-size);
  height: var(--icon-size);
  color: currentColor;
}

.fallback-glyph {
  font-size: calc(var(--icon-size) * 0.8);
  line-height: 1;
  color: color-mix(in oklab, var(--ui-primary) 84%, #111827 16%);
}

/* 主题级统一色调：圆圈底色和图标主色同步联动 */
:global(html[data-theme='campus_blue']) .theme-module-icon,
:global(html[data-theme='forest_mint']) .theme-module-icon,
:global(html[data-theme='sunset_orange']) .theme-module-icon,
:global(html[data-theme='minimal_slate']) .theme-module-icon,
:global(html[data-theme='graphite_night']) .theme-module-icon {
  --module-icon-color: color-mix(in oklab, var(--ui-primary) 88%, #2ea8ff 12%);
}

:global(html[data-theme='graphite_night']) .theme-module-icon {
  background:
    radial-gradient(
      120% 120% at 20% 16%,
      color-mix(in oklab, var(--ui-primary) 28%, #162033 72%) 0%,
      color-mix(in oklab, var(--ui-secondary) 20%, #101a2b 80%) 100%
    );
  border-color: color-mix(in oklab, var(--ui-primary) 38%, rgba(148, 163, 184, 0.34));
}

:global(html[data-ui-icon='mono']) .theme-module-icon .icon-svg {
  opacity: 0.9;
}

:global(html[data-ui-icon='line']) .theme-module-icon .icon-svg {
  opacity: 0.95;
}
</style>
