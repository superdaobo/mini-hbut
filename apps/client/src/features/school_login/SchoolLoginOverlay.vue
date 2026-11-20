<script setup lang="ts">
// SchoolLoginOverlay.vue —— goal-20「用 Mini-HBUT 登录」确认弹窗（新认证测试应用）。
//
// 由 overlayHost.ensureSchoolLoginOverlayMounted() 按需挂载一次；状态全部在 schoolLoginStore（深链 / 扫码 / 粘贴都走 openSchoolLogin）。
// 显示：来源、要共享的字段、钓鱼提示；确认后显示核验与签名进度，完成后说明本次是「首次核验」还是「复用」。

import { computed } from 'vue'

import {
  SHARED_FIELD_LABELS,
  closeSchoolLogin,
  confirmSchoolLogin,
  denySchoolLogin,
  schoolLoginState as s
} from './schoolLoginStore'

const visible = computed(() => s.phase !== 'idle')
const verifyText = computed(() =>
  s.verifyStatus === 'verified'
    ? '本次重新向学校教务系统核验了学号'
    : s.verifyStatus === 'reused'
      ? '复用了这台设备最近一次的学号核验结果'
      : ''
)
const fieldLabels = computed(() => s.sharedFields.map((field) => SHARED_FIELD_LABELS[field] || field))
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="school-login-mask" role="dialog" aria-modal="true" aria-label="用 Mini-HBUT 登录">
      <div class="school-login-card">
        <header class="school-login-head">
          <span class="material-symbols-outlined" aria-hidden="true">verified_user</span>
          <h2>用 Mini-HBUT 登录</h2>
        </header>

        <section v-if="s.phase === 'loading'" class="school-login-body">
          <p class="school-login-muted">正在读取登录请求…</p>
        </section>

        <section v-else-if="s.phase === 'confirm'" class="school-login-body">
          <p><strong>{{ s.clientName }}</strong> 请求使用你的 Mini-HBUT 身份登录。</p>
          <p class="school-login-muted">确认后将共享：</p>
          <ul class="school-login-fields">
            <li v-for="label in fieldLabels" :key="label">{{ label }}</li>
          </ul>
          <p class="school-login-warn">只在你自己刚发起登录时才确认；别人发给你的二维码不要确认。</p>
          <p v-if="s.expiresIn > 0" class="school-login-muted">请求将在 {{ Math.ceil(s.expiresIn / 60) }} 分钟内过期</p>
          <div class="school-login-actions">
            <button type="button" class="school-login-btn secondary" @click="denySchoolLogin">拒绝</button>
            <button type="button" class="school-login-btn primary" @click="confirmSchoolLogin">确认登录</button>
          </div>
        </section>

        <section v-else-if="s.phase === 'approving'" class="school-login-body">
          <p class="school-login-muted">正在核验学号并用设备签名确认…</p>
          <p class="school-login-muted">首次在这台设备上使用时需要向学校核验，可能要等几秒。</p>
        </section>

        <section v-else-if="s.phase === 'done'" class="school-login-body">
          <p class="school-login-ok">已确认登录</p>
          <p v-if="s.studentMasked">学号 {{ s.studentMasked }}</p>
          <p v-if="verifyText" class="school-login-muted">{{ verifyText }}</p>
          <p class="school-login-muted">回到发起登录的网页即可看到结果。</p>
          <div class="school-login-actions">
            <button type="button" class="school-login-btn primary" @click="closeSchoolLogin">完成</button>
          </div>
        </section>

        <section v-else-if="s.phase === 'denied'" class="school-login-body">
          <p>已拒绝这次登录。</p>
          <div class="school-login-actions">
            <button type="button" class="school-login-btn primary" @click="closeSchoolLogin">关闭</button>
          </div>
        </section>

        <section v-else class="school-login-body">
          <p class="school-login-error">{{ s.errorText }}</p>
          <div class="school-login-actions">
            <button type="button" class="school-login-btn primary" @click="closeSchoolLogin">关闭</button>
          </div>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.school-login-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.45);
}

.school-login-card {
  width: 100%;
  max-width: 380px;
  padding: 20px;
  border-radius: 16px;
  background: var(--card-bg, #fff);
  color: var(--text-primary, #1d2430);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.school-login-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.school-login-head h2 {
  margin: 0;
  font-size: 18px;
}

.school-login-body p {
  margin: 6px 0;
  line-height: 1.6;
}

.school-login-muted {
  color: var(--text-secondary, #6b7280);
  font-size: 14px;
}

.school-login-warn {
  color: #b45309;
  font-size: 14px;
}

.school-login-ok {
  color: #15803d;
  font-weight: 600;
}

.school-login-error {
  color: #b91c1c;
}

.school-login-fields {
  margin: 4px 0 8px;
  padding-left: 20px;
}

.school-login-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

.school-login-btn {
  min-width: 96px;
  padding: 10px 16px;
  border-radius: 10px;
  border: 1px solid transparent;
  font-size: 15px;
  cursor: pointer;
}

.school-login-btn.primary {
  color: #fff;
  background: var(--primary-color, #2563eb);
}

.school-login-btn.secondary {
  color: var(--text-primary, #1d2430);
  background: transparent;
  border-color: var(--border-color, #d1d5db);
}
</style>
