<script setup>
/**
 * 运动场馆预约 — 应用内完整流程（非外链）
 * API：172.16.54.20:9000/reserve/*（SM2 + 一码通 SSO）
 */
import { computed, onMounted, ref } from 'vue'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { showToast } from '../utils/toast'
import { TPageHeader, TEmptyState } from './templates'

const emit = defineEmits(['back'])

const loading = ref(true)
const acting = ref(false)
const error = ref('')
const token = ref('')
const user = ref(null)
const stadiums = ref([])
const tab = ref('home') // home | detail | orders

const selectedStadium = ref(null)
const half = ref(0)
const selectDate = ref('')
const weekList = ref([])
const placeDetailList = ref([])
const costDesc = ref('')
const enablePay = ref('1')
const followNum = ref(0)
const cart = ref([]) // detailList
const orders = ref([])
const payPassword = ref('')
const pendingOrder = ref(null)

const roleId = computed(() => {
  const r = user.value?.roleId
  return r == null ? '' : String(r)
})

const totalPriceFen = computed(() =>
  cart.value.reduce((s, i) => s + (Number(i.price) || 0), 0)
)
const totalPriceYuan = computed(() => (totalPriceFen.value / 100).toFixed(2))

const todayStr = () => {
  const t = new Date()
  const m = String(t.getMonth() + 1).padStart(2, '0')
  const d = String(t.getDate()).padStart(2, '0')
  return `${t.getFullYear()}-${m}-${d}`
}

const bootstrap = async () => {
  if (!isTauriRuntime()) {
    error.value = '请在客户端内使用'
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await invokeNative('sports_venue_bootstrap', {})
    if (!res?.success && !res?.token) {
      throw new Error(res?.message || '登录场馆失败')
    }
    token.value = res.token || ''
    user.value = res.user || null
    stadiums.value = Array.isArray(res.stadiums) ? res.stadiums : []
    if (res.message && !stadiums.value.length) {
      error.value = res.message
    }
    selectDate.value = todayStr()
  } catch (e) {
    error.value = String(e?.message || e || '加载失败（需校园网）')
  } finally {
    loading.value = false
  }
}

const openStadium = async (item, halfVal = 0) => {
  if (String(item?.stadiumType) === '2' && halfVal === 0 && arguments.length < 2) {
    // 半场选择：简单二次确认
    // 默认全场 half=0；半场 half 由用户再点
  }
  selectedStadium.value = item
  half.value = halfVal
  cart.value = []
  tab.value = 'detail'
  await loadDetail()
}

const loadDetail = async () => {
  if (!selectedStadium.value || !token.value) return
  acting.value = true
  error.value = ''
  try {
    const res = await invokeNative('sports_venue_detail', {
      token: token.value,
      roleId: roleId.value || null,
      stadiumId: selectedStadium.value.id,
      selectDate: selectDate.value || todayStr(),
      half: half.value
    })
    const data = res?.data || {}
    weekList.value = Array.isArray(data.weekList) ? data.weekList : []
    placeDetailList.value = Array.isArray(data.placeDetailList) ? data.placeDetailList : []
    costDesc.value = data.costDesc || ''
    enablePay.value = String(data.enablePay ?? '1')
    followNum.value = Number(data.followNum || 0)
  } catch (e) {
    error.value = String(e?.message || e || '加载场地失败')
    showToast(error.value)
  } finally {
    acting.value = false
  }
}

const onPickDate = async (d) => {
  const date = d?.date || d?.selectDate || d
  if (!date) return
  selectDate.value = String(date)
  cart.value = []
  await loadDetail()
}

/** 时段状态：0 可约 1 已约 2 不可约 */
const slotClass = (slot) => {
  if (slot?.isActive) return 'slot mine'
  if (slot?.status === 0) return 'slot free'
  if (slot?.status === 1) return 'slot busy'
  return 'slot disabled'
}

const toggleSlot = (placeWrap, slot, index) => {
  const place = placeWrap?.place || placeWrap
  const list = placeWrap?.placeList || []
  if (!place || !slot) return
  if (slot.status === 1) {
    showToast('该时段已预约')
    return
  }
  if (slot.status !== 0) {
    showToast('该时段不可约')
    return
  }
  const next = list[index + 1]
  if (!next || next.status !== 0) {
    showToast('请选择完整时段')
    return
  }

  // 取消已选
  const existIdx = cart.value.findIndex(
    (c) =>
      c.placeId === place.id &&
      c.list?.includes(slot.dateStr) &&
      c.list?.includes(next.dateStr)
  )
  if (existIdx >= 0) {
    cart.value.splice(existIdx, 1)
    slot.isActive = false
    next.isActive = false
    return
  }

  const price = Number(slot?.price?.price ?? slot?.price ?? 0)
  cart.value.push({
    startDateTime: slot.startTime,
    endDateTime: next.endTime,
    price,
    half: place.half ?? half.value,
    placeName: place.name,
    placeId: place.id,
    list: [slot.dateStr, next.dateStr]
  })
  slot.isActive = true
  next.isActive = true
}

const submitReserve = async () => {
  if (enablePay.value === '0') {
    showToast('暂未开放预约')
    return
  }
  if (!cart.value.length) {
    showToast('请先选择时段')
    return
  }
  acting.value = true
  try {
    const res = await invokeNative('sports_venue_reserve', {
      token: token.value,
      roleId: roleId.value || null,
      payload: {
        totalPrice: totalPriceFen.value,
        stadiumId: selectedStadium.value.id,
        reserveDate: selectDate.value,
        detailList: cart.value,
        followUserList: []
      }
    })
    const data = res?.data
    showToast('预约成功')
    pendingOrder.value = data
    cart.value = []
    if (data?.orderId != null) {
      tab.value = 'orders'
      await loadOrders()
    } else {
      await loadDetail()
    }
  } catch (e) {
    showToast(String(e?.message || e || '预约失败'))
  } finally {
    acting.value = false
  }
}

const loadOrders = async () => {
  if (!token.value) return
  acting.value = true
  try {
    const res = await invokeNative('sports_venue_orders', {
      token: token.value,
      roleId: roleId.value || null,
      pageNum: 1,
      pageSize: 20
    })
    const data = res?.data
    orders.value = Array.isArray(data?.list)
      ? data.list
      : Array.isArray(data)
        ? data
        : []
  } catch (e) {
    showToast(String(e?.message || e || '订单加载失败'))
  } finally {
    acting.value = false
  }
}

const payOrder = async (order) => {
  const orderId = order?.orderId ?? order?.id
  const price = order?.price ?? order?.totalPrice ?? totalPriceFen.value
  if (!payPassword.value) {
    showToast('请输入校园卡密码')
    return
  }
  acting.value = true
  try {
    await invokeNative('sports_venue_pay', {
      token: token.value,
      roleId: roleId.value || null,
      orderId,
      price,
      password: payPassword.value
    })
    showToast('支付成功')
    payPassword.value = ''
    pendingOrder.value = null
    await loadOrders()
  } catch (e) {
    showToast(String(e?.message || e || '支付失败'))
  } finally {
    acting.value = false
  }
}

const cancelOrder = async (order) => {
  const orderId = order?.orderId ?? order?.id
  acting.value = true
  try {
    await invokeNative('sports_venue_cancel_pay', {
      token: token.value,
      roleId: roleId.value || null,
      orderId
    })
    showToast('已取消')
    await loadOrders()
  } catch (e) {
    showToast(String(e?.message || e || '取消失败'))
  } finally {
    acting.value = false
  }
}

const backFromDetail = () => {
  tab.value = 'home'
  selectedStadium.value = null
  cart.value = []
}

onMounted(bootstrap)
</script>

<template>
  <div class="page">
    <TPageHeader title="运动场馆" icon="sports_soccer" @back="emit('back')">
      <template #actions>
        <button
          type="button"
          class="icon-btn"
          :disabled="loading || acting"
          @click="tab === 'orders' ? (tab = 'home') : ((tab = 'orders'), loadOrders())"
        >
          <span class="material-symbols-outlined">{{ tab === 'orders' ? 'home' : 'receipt_long' }}</span>
        </button>
      </template>
    </TPageHeader>

    <div class="body">
      <TEmptyState v-if="loading" type="loading" message="连接场馆服务…" />

      <section v-else-if="error && !stadiums.length && tab === 'home'" class="card">
        <p class="err">{{ error }}</p>
        <p class="hint">需连接校园网</p>
        <button type="button" class="main" @click="bootstrap">重试</button>
      </section>

      <!-- 场馆列表 -->
      <template v-else-if="tab === 'home'">
        <div v-if="user" class="user-bar">
          <strong>{{ user.username || user.name || '同学' }}</strong>
          <span>{{ user.idserial || user.studentId || '' }}</span>
        </div>

        <div class="list">
          <button
            v-for="s in stadiums"
            :key="s.id"
            type="button"
            class="stadium"
            @click="openStadium(s, 0)"
          >
            <div class="stadium-top">
              <span class="badge">运营中</span>
              <h3>{{ s.stadiumName || s.name }}</h3>
            </div>
            <p v-if="s.address" class="meta">{{ s.address }}</p>
            <p v-if="s.openTime || s.businessHours" class="meta">
              {{ s.openTime || s.businessHours }}
            </p>
            <div v-if="String(s.stadiumType) === '2'" class="half-row" @click.stop>
              <button type="button" class="chip" @click="openStadium(s, 0)">全场</button>
              <button type="button" class="chip" @click="openStadium(s, 1)">半场</button>
            </div>
          </button>
        </div>
        <p v-if="!stadiums.length" class="hint">暂无场馆</p>
      </template>

      <!-- 预约详情 -->
      <template v-else-if="tab === 'detail' && selectedStadium">
        <button type="button" class="back-link" @click="backFromDetail">
          <span class="material-symbols-outlined">arrow_back</span>
          {{ selectedStadium.stadiumName || selectedStadium.name }}
        </button>

        <div v-if="weekList.length" class="days">
          <button
            v-for="(d, i) in weekList"
            :key="i"
            type="button"
            class="day"
            :class="{ on: String(d.date || d.selectDate || d) === selectDate }"
            @click="onPickDate(d)"
          >
            <span>{{ d.week || d.weekDay || d.label || '' }}</span>
            <strong>{{ String(d.date || d.selectDate || '').slice(5) || d }}</strong>
          </button>
        </div>
        <div v-else class="days">
          <input v-model="selectDate" type="date" class="date-input" @change="loadDetail" />
        </div>

        <p v-if="costDesc" class="cost">{{ costDesc }}</p>
        <p v-if="error" class="err">{{ error }}</p>

        <div v-if="acting && !placeDetailList.length" class="hint">加载时段…</div>

        <div v-for="(wrap, wi) in placeDetailList" :key="wi" class="place-block">
          <h4>{{ wrap.place?.name || wrap.name || `场地 ${wi + 1}` }}</h4>
          <div class="slots">
            <button
              v-for="(slot, si) in (wrap.placeList || [])"
              :key="si"
              type="button"
              :class="slotClass(slot)"
              :disabled="slot.status !== 0 && !slot.isActive"
              @click="toggleSlot(wrap, slot, si)"
            >
              <span class="t">{{ (slot.startTime || '').slice(11, 16) }}</span>
              <span class="p" v-if="slot.price?.price != null">
                ¥{{ (Number(slot.price.price) / 100).toFixed(0) }}
              </span>
            </button>
          </div>
        </div>

        <div class="legend">
          <span><i class="free" />可约</span>
          <span><i class="busy" />已约</span>
          <span><i class="mine" />已选</span>
        </div>

        <div class="cart-bar">
          <div>
            <strong>¥{{ totalPriceYuan }}</strong>
            <span class="muted">{{ cart.length }} 段</span>
          </div>
          <button
            type="button"
            class="main"
            :disabled="acting || !cart.length"
            @click="submitReserve"
          >
            {{ acting ? '提交中…' : '提交预约' }}
          </button>
        </div>
      </template>

      <!-- 订单 -->
      <template v-else-if="tab === 'orders'">
        <div class="user-bar">
          <strong>我的订单</strong>
          <button type="button" class="link" @click="loadOrders">刷新</button>
        </div>

        <div v-if="pendingOrder" class="card pay-box">
          <p>待支付订单</p>
          <input
            v-model="payPassword"
            type="password"
            class="pwd"
            placeholder="校园卡支付密码"
            autocomplete="off"
          />
          <button
            type="button"
            class="main"
            :disabled="acting"
            @click="payOrder(pendingOrder)"
          >
            支付
          </button>
        </div>

        <div v-for="(o, i) in orders" :key="i" class="order">
          <div class="order-top">
            <strong>{{ o.stadiumName || o.placeName || '订单' }}</strong>
            <span>{{ o.statusName || o.status || '' }}</span>
          </div>
          <p class="meta">{{ o.reserveDate || o.createTime || '' }}</p>
          <p class="meta" v-if="o.price != null">¥{{ (Number(o.price) / 100).toFixed(2) }}</p>
          <div class="order-actions">
            <button
              v-if="String(o.status) === '0' || o.needPay"
              type="button"
              class="chip"
              @click="pendingOrder = o"
            >
              支付
            </button>
            <button
              v-if="String(o.status) === '0'"
              type="button"
              class="chip ghost"
              @click="cancelOrder(o)"
            >
              取消
            </button>
          </div>
        </div>
        <p v-if="!orders.length" class="hint">暂无订单</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100%;
  background: #f8fafc;
  color: #0f172a;
  padding-bottom: 120px;
}
.body {
  padding: 12px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.icon-btn {
  width: 40px;
  height: 40px;
  border: 0;
  background: transparent;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 14px;
}
.err {
  color: #dc2626;
  font-size: 13px;
  margin: 0 0 8px;
}
.hint {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
  font-weight: 600;
}
.user-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #64748b;
}
.user-bar strong {
  color: #0f172a;
  font-size: 15px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.stadium {
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 16px;
  padding: 14px;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.stadium:active {
  transform: scale(0.98);
}
.stadium-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.stadium h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.badge {
  font-size: 10px;
  font-weight: 700;
  color: #059669;
  background: #ecfdf5;
  padding: 2px 8px;
  border-radius: 999px;
}
.meta {
  margin: 6px 0 0;
  font-size: 12px;
  color: #64748b;
}
.half-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.chip {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.chip.ghost {
  background: #fff;
  color: #64748b;
}
.main {
  min-height: 48px;
  border: 0;
  border-radius: 14px;
  background: #15803d;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  padding: 0 18px;
  cursor: pointer;
}
.main:disabled {
  opacity: 0.6;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  padding: 0;
  color: #0f172a;
}
.days {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.day {
  flex: 0 0 auto;
  min-width: 56px;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 12px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
}
.day.on {
  background: #15803d;
  border-color: #15803d;
  color: #fff;
}
.day span {
  font-size: 11px;
  opacity: 0.85;
}
.day strong {
  font-size: 13px;
}
.date-input {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
}
.cost {
  font-size: 12px;
  color: #64748b;
  margin: 0;
}
.place-block {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
}
.place-block h4 {
  margin: 0 0 10px;
  font-size: 14px;
}
.slots {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.slot {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 4px;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  min-height: 48px;
  transition: transform 0.12s ease, background 0.15s ease;
}
.slot .t {
  font-size: 11px;
  font-weight: 700;
}
.slot .p {
  font-size: 10px;
  color: #64748b;
}
.slot.free:active {
  transform: scale(0.96);
}
.slot.busy {
  background: #fee2e2;
  border-color: #fecaca;
  color: #991b1b;
  cursor: not-allowed;
}
.slot.disabled {
  background: #f1f5f9;
  color: #94a3b8;
  cursor: not-allowed;
}
.slot.mine {
  background: #7ebdff;
  border-color: #60a5fa;
  color: #0f172a;
}
.legend {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #64748b;
}
.legend i {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  margin-right: 4px;
  vertical-align: middle;
}
.legend .free {
  background: #fff;
  border: 1px solid #cbd5e1;
}
.legend .busy {
  background: #f67962;
}
.legend .mine {
  background: #7ebdff;
}
.cart-bar {
  position: sticky;
  bottom: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 10px 12px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}
.cart-bar strong {
  font-size: 20px;
  color: #15803d;
}
.muted {
  font-size: 12px;
  color: #94a3b8;
  margin-left: 8px;
}
.order {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
}
.order-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 14px;
}
.order-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.pay-box .pwd {
  width: 100%;
  margin: 10px 0;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  font-size: 14px;
  box-sizing: border-box;
}
.link {
  border: 0;
  background: transparent;
  color: #15803d;
  font-weight: 700;
  cursor: pointer;
}
html.dark .page {
  background: var(--ui-bg, #0b1220);
  color: var(--ui-text, #e2e8f0);
}
html.dark .card,
html.dark .stadium,
html.dark .place-block,
html.dark .order,
html.dark .cart-bar,
html.dark .day,
html.dark .slot {
  background: var(--ui-surface, #111827);
  border-color: #334155;
  color: inherit;
}
html.dark .user-bar strong,
html.dark .back-link {
  color: #e2e8f0;
}
</style>
