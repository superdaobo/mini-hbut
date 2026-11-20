<script setup lang="ts">
// SchoolLoginTestEntry.vue —— goal-20：设置 → 调试信息里的「新认证扫码登录测试」入口。
//
// 三种方式把测试网页的二维码交给 App：拍照 / 选图片识别（Rust 本地解码，图片不出本机）、粘贴登录链接。
// 网页上的「在本机打开 Mini-HBUT」按钮走深链，不经过这里。解析成功后交给 schoolLoginStore 弹出确认。

import { ref } from 'vue'

import { decodeIdentityQrImage } from '../identity/qr/decodeIdentityQrImage'
import { ensureSchoolLoginOverlayMounted } from './overlayHost'
import { openSchoolLogin, parseSchoolLoginText } from './schoolLoginStore'

const DEMO_URL = 'https://mini.hbut.site/school/demo/'
const pasteText = ref('')
const busy = ref(false)
const hint = ref('')

const submitText = (raw: string): void => {
  const request = parseSchoolLoginText(raw)
  pasteText.value = ''
  if (!request) {
    hint.value = '没有识别到 Mini-HBUT 登录二维码，请确认是测试网页上的二维码'
    return
  }
  hint.value = ''
  ensureSchoolLoginOverlayMounted()
  void openSchoolLogin(request)
}

const handleFile = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || busy.value) return
  if (file.size > 10 * 1024 * 1024) {
    hint.value = '图片太大（超过 10MB）'
    return
  }
  busy.value = true
  hint.value = '正在识别…'
  try {
    const decoded = await decodeIdentityQrImage(new Uint8Array(await file.arrayBuffer()), file.type || 'image/png')
    if (!decoded) {
      hint.value = '没有在图片里找到二维码'
      return
    }
    submitText(decoded.url)
  } finally {
    busy.value = false
  }
}

const handlePaste = (): void => {
  if (pasteText.value.trim()) submitText(pasteText.value)
}
</script>

<template>
  <div class="school-login-entry">
    <p class="school-login-entry-title">新认证扫码登录测试</p>
    <p class="school-login-entry-hint">
      在电脑或手机浏览器打开 {{ DEMO_URL }} 点「用 Mini-HBUT 登录」，再用下面的方式识别二维码；同一台设备上也可以直接点网页里的「在本机打开 Mini-HBUT」。
    </p>
    <div class="school-login-entry-actions">
      <label class="mini-btn btn-ripple school-login-entry-file">
        {{ busy ? '识别中…' : '拍照 / 选择图片识别二维码' }}
        <input type="file" accept="image/*" :disabled="busy" @change="handleFile" />
      </label>
    </div>
    <div class="school-login-entry-paste">
      <input
        v-model="pasteText"
        type="text"
        inputmode="url"
        autocomplete="off"
        spellcheck="false"
        placeholder="或粘贴 minihbut://school-login?… 登录链接"
        @keyup.enter="handlePaste"
      />
      <button type="button" class="mini-btn btn-ripple" @click="handlePaste">打开</button>
    </div>
    <p v-if="hint" class="school-login-entry-hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.school-login-entry {
  margin: 12px 0;
  padding: 12px;
  border-radius: 12px;
  border: 1px dashed var(--border-color, #d1d5db);
}

.school-login-entry-title {
  margin: 0 0 4px;
  font-weight: 600;
}

.school-login-entry-hint {
  margin: 4px 0;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  word-break: break-all;
}

.school-login-entry-actions {
  margin: 8px 0;
}

.school-login-entry-file {
  position: relative;
  overflow: hidden;
  display: inline-block;
}

.school-login-entry-file input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.school-login-entry-paste {
  display: flex;
  gap: 8px;
}

.school-login-entry-paste input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #d1d5db);
  background: transparent;
  color: inherit;
}
</style>
