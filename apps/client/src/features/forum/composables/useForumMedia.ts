// 论坛媒体领域：图床上传队列、附件 URL 解析、头像上传
// 描述：uploadFiles/retryUploadFile/copyAttachmentUrl/uploadAvatarImage 保持原 ForumView 行为。
import { ref, type Ref } from 'vue'
import type { FileLike, UploadQueueItem } from '../types'
import { toText } from '../utils/format'
import { fileLabel as fileLabelOf, fileQueueKey, fileSizeLabel as fileSizeLabelOf, uploadScopeLabel, uploadStatusText } from '../utils/media'
import type { ForumSession } from './useForumSession'

/** 媒体领域状态与动作 */
export interface ForumMedia {
  uploadQueue: Ref<UploadQueueItem[]>
  profileAvatarInput: Ref<HTMLInputElement | null>
  avatarUploadStatus: Ref<string>
  uploadFiles: (files: File[], scope?: string) => Promise<Array<number | string>>
  retryUploadFile: (item: UploadQueueItem) => Promise<void>
  copyAttachmentUrl: (value: unknown) => Promise<void>
  attachmentUrl: (attachmentId: unknown) => string
  attachmentProxyUrl: (payloadOrId: unknown) => string
  resolveAvatarAttachmentUrl: (payload: unknown) => string
  rememberUploadResult: (file: File, scope?: string, patch?: Partial<UploadQueueItem>) => UploadQueueItem
  syncUploadQueueForScope: (files: File[], scope: string) => void
  openAvatarFilePicker: () => void
  uploadAvatarImage: (event: Event) => Promise<void>
  fileLabel: (file: unknown) => string
  fileSizeLabel: (file: unknown) => string
  uploadStatusText: (status: string) => string
  uploadScopeLabel: (scope: string) => string
}

/** 创建媒体领域 composable */
export const useForumMedia = (session: ForumSession): ForumMedia => {
  const uploadQueue = ref<UploadQueueItem[]>([])
  const profileAvatarInput = ref<HTMLInputElement | null>(null)
  const avatarUploadStatus = ref('')

  const fileLabel = (file: unknown): string => fileLabelOf(file as FileLike | null | undefined)
  const fileSizeLabel = (file: unknown): string => fileSizeLabelOf(file as FileLike | null | undefined)

  const attachmentUrl = (attachmentId: unknown): string => session.client?.getAttachmentUrl?.(toText(attachmentId)) || ''

  const attachmentProxyUrl = (payloadOrId: unknown): string => {
    const record = (payloadOrId && typeof payloadOrId === 'object' ? payloadOrId : {}) as Record<string, unknown>
    const directUrl = toText(record.url).trim()
    if (/^https?:\/\//i.test(directUrl)) return directUrl
    const attachmentId = toText(record.attachment_id).trim()
    const rawValue = typeof payloadOrId === 'object' && payloadOrId !== null ? '' : toText(payloadOrId).trim()
    const attachmentAddress = directUrl || attachmentId || rawValue
    return attachmentAddress ? session.client?.getAttachmentUrl?.(attachmentAddress) || '' : ''
  }

  const resolveAvatarAttachmentUrl = (payload: unknown): string => {
    const record = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
    const directUrl = toText(record.url).trim()
    if (/^https?:\/\//i.test(directUrl)) return directUrl
    const attachmentAddress = directUrl || toText(record.attachment_id).trim()
    return attachmentAddress ? attachmentProxyUrl(attachmentAddress) : ''
  }

  const rememberUploadResult = (file: File, scope = 'thread', patch: Partial<UploadQueueItem> = {}): UploadQueueItem => {
    const key = patch.key || fileQueueKey(file, scope)
    const current = uploadQueue.value.find((item) => item.key === key)
    const nextItem: UploadQueueItem = {
      key,
      scope,
      file,
      name: fileLabel(file),
      sizeLabel: fileSizeLabel(file),
      status: 'queued',
      progress: 0,
      attachmentId: '',
      proxyUrl: '',
      error: '',
      updatedAt: Date.now(),
      ...(current || {}),
      ...patch
    }
    uploadQueue.value = [
      ...uploadQueue.value.filter((item) => item.key !== key),
      nextItem
    ].slice(-12)
    return nextItem
  }

  const syncUploadQueueForScope = (files: File[], scope: string): void => {
    const keys = new Set((files || []).map((file) => fileQueueKey(file, scope)))
    uploadQueue.value = uploadQueue.value.filter((item) => item.scope !== scope || keys.has(item.key))
    for (const file of files || []) rememberUploadResult(file, scope)
  }

  const uploadFiles = async (files: File[], scope = 'thread'): Promise<Array<number | string>> => {
    const uploaded: Array<number | string> = []
    for (const file of files || []) {
      try {
        rememberUploadResult(file, scope, { status: 'uploading', progress: 45, error: '' })
        const payload = (await session.client!.uploadAttachment(file)) as Record<string, unknown>
        const proxyUrl = attachmentProxyUrl(payload)
        rememberUploadResult(file, scope, {
          status: 'success',
          progress: 100,
          attachmentId: toText(payload?.attachment_id).trim(),
          proxyUrl,
          error: ''
        })
        if (payload?.attachment_id) uploaded.push(payload.attachment_id as number | string)
      } catch (error) {
        rememberUploadResult(file, scope, {
          status: 'failed',
          progress: 100,
          error: (error as Error)?.message || '上传失败，点击重试'
        })
        throw error
      }
    }
    return uploaded
  }

  const retryUploadFile = async (item: UploadQueueItem): Promise<void> => {
    const file = item.file
    if (!file) return
    if (!session.isLoggedIn.value) {
      session.requireLogin()
      return
    }
    if (!session.client) await session.buildClient()
    await session.runPending(`upload:retry:${item.key}`, async () => {
      rememberUploadResult(file, item.scope || 'retry', { key: item.key, status: 'uploading', progress: 45, error: '' })
      try {
        const payload = (await session.client!.uploadAttachment(file)) as Record<string, unknown>
        rememberUploadResult(file, item.scope || 'retry', {
          key: item.key,
          status: 'success',
          progress: 100,
          attachmentId: toText(payload?.attachment_id).trim(),
          proxyUrl: attachmentProxyUrl(payload),
          error: ''
        })
        session.toast('附件已重新上传到图床', 'success')
      } catch (error) {
        rememberUploadResult(file, item.scope || 'retry', {
          key: item.key,
          status: 'failed',
          progress: 100,
          error: (error as Error)?.message || '上传失败，点击重试'
        })
        throw error
      }
    }, '附件正在重试上传，请勿重复点击')
  }

  const copyAttachmentUrl = async (value: unknown): Promise<void> => {
    const url = toText(value).trim()
    if (!url) {
      session.toast('暂无可复制的代理 URL', 'warning')
      return
    }
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('clipboard unavailable')
      }
      await navigator.clipboard.writeText(url)
      session.toast('代理 URL 已复制', 'success')
    } catch {
      session.toast('当前环境不支持自动复制，请手动复制代理 URL', 'warning')
    }
  }

  const openAvatarFilePicker = (): void => {
    if (session.isPending('profile:avatar-upload')) return
    if (!session.isLoggedIn.value) {
      session.requireLogin()
      return
    }
    profileAvatarInput.value?.click?.()
  }

  const uploadAvatarImage = async (event: Event): Promise<void> => {
    const input = event?.target as HTMLInputElement
    const file = Array.from(input?.files || [])[0]
    if (!file) return
    if (!session.isLoggedIn.value) {
      if (input) input.value = ''
      session.requireLogin()
      return
    }
    if (!session.client) await session.buildClient()
    try {
      await session.runPending('profile:avatar-upload', async () => {
        avatarUploadStatus.value = '正在上传头像到图床'
        rememberUploadResult(file, 'avatar', { status: 'uploading', progress: 45, error: '' })
        const payload = (await session.client!.uploadAttachment(file)) as Record<string, unknown>
        const avatarUrl = resolveAvatarAttachmentUrl(payload)
        if (!avatarUrl) throw new Error('图床未返回头像地址')
        session.profile.value.avatar_url = avatarUrl
        rememberUploadResult(file, 'avatar', {
          status: 'success',
          progress: 100,
          attachmentId: toText(payload?.attachment_id).trim(),
          proxyUrl: avatarUrl,
          error: ''
        })
        avatarUploadStatus.value = '已回填图床地址，请保存资料'
        session.toast('头像已上传到图床，请保存资料', 'success')
      }, '头像图床上传中，请勿重复选择')
    } catch (error) {
      rememberUploadResult(file, 'avatar', { status: 'failed', progress: 100, error: (error as Error)?.message || '头像上传失败' })
      avatarUploadStatus.value = '头像上传失败，可重试或使用手动 URL'
      session.toast((error as Error)?.message || '头像上传失败', 'error')
    } finally {
      if (input) input.value = ''
    }
  }

  return {
    uploadQueue,
    profileAvatarInput,
    avatarUploadStatus,
    uploadFiles,
    retryUploadFile,
    copyAttachmentUrl,
    attachmentUrl,
    attachmentProxyUrl,
    resolveAvatarAttachmentUrl,
    rememberUploadResult,
    syncUploadQueueForScope,
    openAvatarFilePicker,
    uploadAvatarImage,
    fileLabel,
    fileSizeLabel,
    uploadStatusText,
    uploadScopeLabel
  }
}
