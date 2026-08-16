// 论坛媒体工具纯函数单元测试
import { describe, expect, it } from 'vitest'
import { fileLabel, fileQueueKey, fileSizeLabel, uploadScopeLabel, uploadStatusText } from './media'

const fileOf = (overrides: Record<string, unknown> = {}) => ({
  name: 'a.png',
  size: 1024,
  lastModified: 1700000000000,
  ...overrides
})

describe('forum media utils', () => {
  it('fileLabel 取文件名，空值回退“附件”', () => {
    expect(fileLabel(fileOf())).toBe('a.png')
    expect(fileLabel(fileOf({ name: '' }))).toBe('附件')
    expect(fileLabel(null)).toBe('附件')
    expect(fileLabel(undefined)).toBe('附件')
  })

  it('fileSizeLabel 按大小显示 KB/MB，无效回退“待上传”', () => {
    expect(fileSizeLabel(fileOf({ size: 0 }))).toBe('待上传')
    expect(fileSizeLabel(fileOf({ size: 512 }))).toBe('1 KB')
    expect(fileSizeLabel(fileOf({ size: 1024 }))).toBe('1 KB')
    expect(fileSizeLabel(fileOf({ size: 2048 }))).toBe('2 KB')
    expect(fileSizeLabel(fileOf({ size: 2 * 1024 * 1024 }))).toBe('2.0 MB')
    expect(fileSizeLabel(null)).toBe('待上传')
  })

  it('uploadStatusText 覆盖四种上传状态并有兜底', () => {
    expect(uploadStatusText('queued')).toBe('等待上传')
    expect(uploadStatusText('uploading')).toBe('上传中')
    expect(uploadStatusText('success')).toBe('已上传')
    expect(uploadStatusText('failed')).toBe('上传失败')
    expect(uploadStatusText('unknown')).toBe('等待上传')
  })

  it('uploadScopeLabel 覆盖常见作用域并有兜底', () => {
    expect(uploadScopeLabel('thread')).toBe('发帖附件')
    expect(uploadScopeLabel('reply')).toBe('回复附件')
    expect(uploadScopeLabel('avatar')).toBe('头像图片')
    expect(uploadScopeLabel('retry')).toBe('重试上传')
    expect(uploadScopeLabel('other')).toBe('图床文件')
  })

  it('fileQueueKey 由作用域与文件元数据组成', () => {
    expect(fileQueueKey(fileOf())).toBe('thread:a.png:1024:1700000000000')
    expect(fileQueueKey(fileOf(), 'reply')).toBe('reply:a.png:1024:1700000000000')
    expect(fileQueueKey(null)).toBe('thread:附件:0:0')
  })
})
