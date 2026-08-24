/**
 * 学习数据 scope 逐项明示清单（issue #699）。
 *
 * 职责：从请求详情的 scopes 中过滤出学习数据类 scope
 * （student.grades.read / student.timetable.read），
 * 以「人话」文案逐项列出将共享的数据内容。
 *
 * 约定：
 *  - 文案为冻结映射（与 App 端授权页保持一致，逐字遵守）；
 *  - 无数据类 scope 时整块不渲染（返回 null）；
 *  - 纯展示组件：批准/勾选动作只存在于 Mini-HBUT App 内，
 *    因此这里必须注明「最终共享范围以你在 Mini-HBUT App 内勾选为准」。
 */
import type { RequestScopeDTO } from '@/lib/core-client/contract'
import type { ComponentType } from 'react'
import { IconCalendar, IconChart, IconInfo } from './icons'

/** 图标组件约定（与 icons.tsx 的 IconProps 一致，此处仅用 aria-hidden 场景） */
type ScopeIcon = ComponentType<{ className?: string }>

/** 数据类 scope → 冻结展示文案（App 端同步使用，不得改动措辞） */
const DATA_SCOPE_ITEMS: ReadonlyArray<{
  id: string
  label: string
  Icon: ScopeIcon
}> = [
  {
    id: 'student.grades.read',
    label: '全部成绩单（含各学期成绩与绩点）',
    Icon: IconChart,
  },
  {
    id: 'student.timetable.read',
    label: '完整课表',
    Icon: IconCalendar,
  },
]

export function DataScopeList({ scopes }: { scopes: RequestScopeDTO[] }) {
  // 只保留本次请求真正申请了的数据类 scope（按冻结映射顺序展示）
  const matched = DATA_SCOPE_ITEMS.filter((item) =>
    scopes.some((scope) => scope.id === item.id),
  )
  // 无数据类 scope：整块不渲染
  if (matched.length === 0) {
    return null
  }

  return (
    <section className="card" aria-label="将共享的学习数据明细">
      <h2 className="scope-title">将共享的学习数据</h2>
      <ul className="scope-list">
        {matched.map(({ id, label, Icon }) => {
          const risk = scopes.find((scope) => scope.id === id)?.risk
          return (
            <li key={id} className="scope-item">
              <div className="scope-item-left">
                <Icon aria-hidden="true" />
                <span className="scope-label">{label}</span>
              </div>
              {risk === 'sensitive' && <span className="risk-tag">敏感</span>}
            </li>
          )
        })}
      </ul>
      <p className="scope-note">
        <IconInfo aria-hidden="true" />
        <span>最终共享范围以你在 Mini-HBUT App 内勾选为准</span>
      </p>
    </section>
  )
}
