import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import FlappyGame, {
  GAMEPLAY_LIMITS,
  getPipeGap,
  getPipeSpawnInterval,
  getPipeSpeed
} from '../../website/modules-src/clumsy_bird_hbut/project/src/game/FlappyGame.js'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const clumsyBirdSrcDir = path.join(rootDir, 'website/modules-src/clumsy_bird_hbut/project/src')

function readClumsyBirdSource(relativePath: string) {
  return fs.readFileSync(path.join(clumsyBirdSrcDir, relativePath), 'utf8')
}

function createMockContext() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    quadraticCurveTo: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    set fillStyle(value) { this._fillStyle = value },
    get fillStyle() { return this._fillStyle },
    set strokeStyle(value) { this._strokeStyle = value },
    get strokeStyle() { return this._strokeStyle },
    set lineWidth(value) { this._lineWidth = value },
    get lineWidth() { return this._lineWidth },
    set font(value) { this._font = value },
    get font() { return this._font },
    set textAlign(value) { this._textAlign = value },
    get textAlign() { return this._textAlign }
  } as CanvasRenderingContext2D & Record<string, unknown>
}

function createMockCanvas() {
  return {
    parentElement: {
      clientWidth: 360,
      clientHeight: 640
    },
    style: {},
    width: 0,
    height: 0,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getContext: vi.fn(() => createMockContext())
  } as unknown as HTMLCanvasElement
}

describe('clumsy_bird_hbut experience contract', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => '0'),
      setItem: vi.fn()
    })
    vi.stubGlobal('document', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
  })

  it('uses campus themed text without emoji badges in the shell and canvas prompts', () => {
    const mainSource = readClumsyBirdSource('main.js')
    const gameSource = readClumsyBirdSource('game/FlappyGame.js')

    expect(mainSource).toContain('笨鸟先飞 · 湖工飞行训练')
    expect(mainSource).toContain('排行榜')
    expect(gameSource).toContain('穿过南湖与图书馆')
    expect(gameSource).toContain('点按屏幕起飞')
    expect(`${mainSource}\n${gameSource}`).not.toMatch(/[🐦🏆👆]/u)
  })

  it('creates a fresh leaderboard run id when a new flight starts', () => {
    const mainSource = readClumsyBirdSource('main.js')

    expect(mainSource).toContain('let currentRunId = createRunId()')
    expect(mainSource).toMatch(/state === 'playing'[\s\S]*currentRunId = createRunId\(\)/)

    const gameOverBlock = mainSource.match(/game\.onGameOver = \(data\) => \{([\s\S]*?)\n  \}/)?.[1] || ''
    expect(gameOverBlock).not.toContain('currentRunId = createRunId()')
  })

  it('keeps compact mobile controls readable in the header', () => {
    const styleSource = readClumsyBirdSource('style.css')

    expect(styleSource).toContain('minmax(0, 1fr)')
    expect(styleSource).toContain('white-space: nowrap')
    expect(styleSource).toContain('touch-action: none')
  })

  it('uses bounded progressive difficulty helpers', () => {
    expect(getPipeGap(0)).toBe(GAMEPLAY_LIMITS.gapInitial)
    expect(getPipeGap(80)).toBe(GAMEPLAY_LIMITS.gapMin)
    expect(getPipeGap(80)).toBeGreaterThanOrEqual(GAMEPLAY_LIMITS.gapMin)

    expect(getPipeSpeed(0)).toBe(GAMEPLAY_LIMITS.speedInitial)
    expect(getPipeSpeed(80)).toBe(GAMEPLAY_LIMITS.speedMax)
    expect(getPipeSpeed(80)).toBeLessThanOrEqual(GAMEPLAY_LIMITS.speedMax)

    expect(getPipeSpawnInterval(0)).toBe(GAMEPLAY_LIMITS.spawnInitialMs)
    expect(getPipeSpawnInterval(80)).toBe(GAMEPLAY_LIMITS.spawnMinMs)
    expect(getPipeSpawnInterval(80)).toBeGreaterThanOrEqual(GAMEPLAY_LIMITS.spawnMinMs)
  })

  it('spawns an initial campus gate when play starts', () => {
    const game = new FlappyGame(createMockCanvas())
    const states: string[] = []
    game.onStateChange = (state: string) => states.push(state)

    game._handleTap()

    expect(states).toEqual(['playing'])
    expect(game.pipes).toHaveLength(1)
    expect(game.pipes[0].x).toBeGreaterThan(230)
    expect(game.pipeTimerMs).toBeLessThan(0)
  })

  it('resets score and obstacles after game over tap without starting accidentally', () => {
    const game = new FlappyGame(createMockCanvas())

    game._handleTap()
    game.score = 3
    game.pipes.push({ x: 100, topHeight: 100, bottomY: 250, passed: false, width: 52 })
    game._gameOver()
    game._handleTap()

    expect(game.getState()).toBe('ready')
    expect(game.getScore()).toBe(0)
    expect(game.pipes).toHaveLength(0)
  })
})
