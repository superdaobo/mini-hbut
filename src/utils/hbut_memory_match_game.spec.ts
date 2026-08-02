import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  CAMPUS_MEMORY_PAIRS,
  MEMORY_LEVELS,
  createInitialMemoryState,
  flipMemoryCard,
  restartMemoryGame,
  tickMemoryGame
} from '../../website/modules-src/hbut_memory_match/project/src/game/memory.js'

const moduleRoot = path.join(process.cwd(), 'website', 'modules-src', 'hbut_memory_match', 'project')

describe('hbut_memory_match core gameplay', () => {
  it('提供湖工主题记忆牌组', () => {
    expect(CAMPUS_MEMORY_PAIRS.length).toBeGreaterThanOrEqual(6)
    expect(CAMPUS_MEMORY_PAIRS.some((item) => item.label.includes('南湖'))).toBe(true)
    expect(CAMPUS_MEMORY_PAIRS.some((item) => item.label.includes('图书馆'))).toBe(true)
    expect(CAMPUS_MEMORY_PAIRS.some((item) => item.category === 'campus')).toBe(true)
    expect(CAMPUS_MEMORY_PAIRS.some((item) => item.category === 'study')).toBe(true)
  })

  it('初始化为成对洗牌的可玩牌局', () => {
    // 新状态机：默认先进入 preview 预览牌面，显式跳过预览直接进入 playing
    const state = createInitialMemoryState({ pairCount: 6, seed: 7, previewLeftMs: 0 })
    const pairCounts = state.cards.reduce((counts, card) => {
      counts.set(card.pairId, (counts.get(card.pairId) || 0) + 1)
      return counts
    }, new Map())

    expect(state.status).toBe('playing')
    expect(state.moves).toBe(0)
    expect(state.matchedPairs).toBe(0)
    expect(state.cards).toHaveLength(12)
    expect([...pairCounts.values()]).toEqual(Array(6).fill(2))
    expect(state.cards.every((card) => !card.revealed && !card.matched)).toBe(true)
  })

  it('preview 预览结束后自动翻牌进入 playing', () => {
    const preview = createInitialMemoryState({ pairCount: 6, seed: 7 })

    expect(preview.status).toBe('preview')
    expect(preview.cards.every((card) => card.revealed)).toBe(true)

    const playing = tickMemoryGame(preview, MEMORY_LEVELS[0].previewMs)
    expect(playing.status).toBe('playing')
    expect(playing.previewLeftMs).toBe(0)
    expect(playing.cards.every((card) => !card.revealed && !card.matched)).toBe(true)
  })

  it('翻到同一组会计步、锁定匹配并记录事件', () => {
    const state = createInitialMemoryState({
      pairs: [
        { id: 'lake', label: '南湖', hint: '湖畔晚风', category: 'campus' },
        { id: 'library', label: '图书馆', hint: '书香自习', category: 'study' }
      ],
      shuffle: false,
      previewLeftMs: 0
    })
    const first = flipMemoryCard(state, 'lake-a')
    const matched = flipMemoryCard(first, 'lake-b')

    expect(first.cards.find((card) => card.id === 'lake-a')?.revealed).toBe(true)
    expect(matched.moves).toBe(1)
    expect(matched.matchedPairs).toBe(1)
    expect(matched.cards.filter((card) => card.pairId === 'lake').every((card) => card.matched)).toBe(true)
    expect(matched.log[0]).toContain('南湖')
  })

  it('翻错会隐藏上一组，全部匹配后胜利，重开恢复', () => {
    // 末关 levelIndex 保证完成全部配对后进入 won，而非进入下一关
    const state = createInitialMemoryState({
      pairs: [
        { id: 'lake', label: '南湖', hint: '湖畔晚风', category: 'campus' },
        { id: 'library', label: '图书馆', hint: '书香自习', category: 'study' }
      ],
      shuffle: false,
      previewLeftMs: 0,
      levelIndex: MEMORY_LEVELS.length - 1
    })

    const mismatch = flipMemoryCard(flipMemoryCard(state, 'lake-a'), 'library-a')
    const afterAutoHide = flipMemoryCard(mismatch, 'lake-b')
    const almostWon = flipMemoryCard(afterAutoHide, 'lake-a')
    const won = flipMemoryCard(flipMemoryCard(almostWon, 'library-a'), 'library-b')
    // 重开一局回到第 1 关，先进入 preview 预览，倒计时结束后转为 playing
    const restarted = restartMemoryGame(won)
    const restartedPlaying = tickMemoryGame(restarted, MEMORY_LEVELS[0].previewMs)

    expect(mismatch.moves).toBe(1)
    expect(mismatch.pendingMismatch).toEqual(['lake-a', 'library-a'])
    expect(afterAutoHide.cards.find((card) => card.id === 'library-a')?.revealed).toBe(false)
    expect(won.status).toBe('won')
    expect(won.matchedPairs).toBe(2)
    expect(restarted.status).toBe('preview')
    expect(restarted.moves).toBe(0)
    expect(restarted.matchedPairs).toBe(0)
    expect(restartedPlaying.status).toBe('playing')
  })

  it('竖屏嵌入页面固定动态视口高度，避免 iframe 内部滚动条挤压宽度', () => {
    const styleSource = fs.readFileSync(path.join(moduleRoot, 'src', 'style.css'), 'utf8')

    expect(styleSource).toMatch(/html,\s*\nbody\s*\{[\s\S]*height:\s*calc\(var\(--module-vh,\s*1vh\)\s*\*\s*100\)/)
    expect(styleSource).toContain('overflow-x: hidden')
    expect(styleSource).toContain('overflow-y: hidden')
    expect(styleSource).toMatch(/#app\s*\{[\s\S]*height:\s*100%;[\s\S]*padding:/)
  })
})
