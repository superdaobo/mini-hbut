import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('ranking view contract', () => {
  it('shows the GPA ceiling as 5.0 instead of 4.0', () => {
    const source = readSource('src/components/RankingView.vue')

    expect(source).toContain('<span class="text-sm text-on-primary/80">/ 5.0</span>')
    expect(source).not.toContain('<span class="text-sm text-on-primary/80">/ 4.0</span>')
  })
})
