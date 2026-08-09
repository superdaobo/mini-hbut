// 论坛媒体上传纯工具（无副作用，便于单元测试）
// 描述：附件名/大小展示、上传状态文案、队列键生成等纯函数。
import type { FileLike } from '../types'
import { toText } from './format'

/** 附件显示名：取文件名，空值回退“附件” */
export const fileLabel = (file: FileLike | null | undefined): string => toText(file?.name).trim() || '附件'

/** 附件大小展示：无效/空返回“待上传”，小于 1MB 显示 KB，否则显示 MB */
export const fileSizeLabel = (file: FileLike | null | undefined): string => {
  const size = Number(file?.size || 0)
  if (!Number.isFinite(size) || size <= 0) return '待上传'
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

/** 上传状态文案映射 */
export const uploadStatusText = (status: string): string =>
  ({
    queued: '等待上传',
    uploading: '上传中',
    success: '已上传',
    failed: '上传失败'
  })[status] || '等待上传'

/** 上传作用域文案映射 */
export const uploadScopeLabel = (scope: string): string =>
  ({
    thread: '发帖附件',
    reply: '回复附件',
    avatar: '头像图片',
    retry: '重试上传'
  })[scope] || '图床文件'

/** 队列键：作用域 + 文件名 + 大小 + 修改时间，用于去重与重试定位 */
export const fileQueueKey = (file: FileLike | null | undefined, scope = 'thread'): string =>
  `${scope}:${fileLabel(file)}:${Number(file?.size || 0)}:${Number(file?.lastModified || 0)}`
