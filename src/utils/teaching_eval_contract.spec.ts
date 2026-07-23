import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '../..')
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

describe('teaching eval (#439) contract', () => {
  it('Dashboard 教务分组含 teaching_eval 入口', () => {
    const dash = read('src/components/Dashboard.vue')
    expect(dash).toMatch(/id:\s*['"]teaching_eval['"]/)
    expect(dash).toMatch(/教学评教/)
  })

  it('TeachingEvalView 具备一键满分确认与不再询问偏好', () => {
    const view = read('src/components/TeachingEvalView.vue')
    expect(view).toMatch(/hbu_teaching_eval_skip_confirm/)
    expect(view).toMatch(/fillFullScore|一键满分/)
    expect(view).toMatch(/showConfirm|不再询问/)
    expect(view).toMatch(/teaching_eval_list|teaching_eval_submit/)
  })

  it('Rust 模块协议未定时返回失败提交且提供满分纯函数', () => {
    const rs = read('src-tauri/src/modules/teaching_eval.rs')
    expect(rs).toMatch(/protocol_ready:\s*false/)
    expect(rs).toMatch(/apply_full_score_answers/)
    expect(rs).toMatch(/success:\s*false/)
    expect(rs).toMatch(/docs\/protocol\/teaching-eval\.md|教学评教/)
  })

  it('协议文档存在且标注写操作约束', () => {
    const doc = read('docs/protocol/teaching-eval.md')
    expect(doc).toMatch(/#439/)
    expect(doc).toMatch(/protocol_ready/)
    expect(doc).toMatch(/teaching_eval_submit/)
  })
})
