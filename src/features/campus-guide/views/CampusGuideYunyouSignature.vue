<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import GuidePageLayout from '../components/GuidePageLayout.vue'
import { showToast } from '../../../utils/toast'
import { signYunyouShirt } from '../services/yunyou-service'
import { readYunyouUser } from '../services/phase2-storage'

const emit = defineEmits(['back'])
const canvasRef = ref<HTMLCanvasElement | null>(null)
const drawing = ref(false)
const saving = ref(false)
let ctx: CanvasRenderingContext2D | null = null

const getPoint = (event: PointerEvent) => {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  }
}

const startDraw = (event: PointerEvent) => {
  const point = getPoint(event)
  if (!point || !ctx) return
  drawing.value = true
  ctx.beginPath()
  ctx.moveTo(point.x, point.y)
}

const moveDraw = (event: PointerEvent) => {
  if (!drawing.value || !ctx) return
  const point = getPoint(event)
  if (!point) return
  ctx.lineTo(point.x, point.y)
  ctx.stroke()
}

const stopDraw = () => {
  drawing.value = false
}

const clearCanvas = () => {
  const canvas = canvasRef.value
  if (!canvas || !ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

const saveSignature = async () => {
  const canvas = canvasRef.value
  if (!canvas) return
  saving.value = true
  try {
    const signature = canvas.toDataURL('image/png')
    const user = readYunyouUser()
    await signYunyouShirt({
      nick_name: user?.nickName || '云游用户',
      signature,
      position_z: 0
    })
    showToast('签名已提交', 'success', 1500)
    emit('back')
  } catch (err) {
    showToast((err as Error)?.message || '签名提交失败', 'error', 2200)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.width = canvas.clientWidth
  canvas.height = canvas.clientHeight
  ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.strokeStyle = '#0074cf'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
})

onBeforeUnmount(() => {
  ctx = null
})
</script>

<template>
  <GuidePageLayout title="文化衫签名" icon="draw" @back="emit('back')">
    <p class="campus-guide-muted">在下方区域手写签名，将用于云游文化衫展示。</p>
    <canvas
      ref="canvasRef"
      class="campus-phase2-signature-canvas"
      @pointerdown.prevent="startDraw"
      @pointermove.prevent="moveDraw"
      @pointerup.prevent="stopDraw"
      @pointerleave.prevent="stopDraw"
    />
    <div class="campus-guide-action-row">
      <button type="button" @click="clearCanvas">清除</button>
      <button type="button" class="primary" :disabled="saving" @click="saveSignature">
        {{ saving ? '提交中…' : '提交签名' }}
      </button>
    </div>
  </GuidePageLayout>
</template>