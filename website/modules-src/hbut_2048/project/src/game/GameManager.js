import { Grid } from './Grid.js'
import { Tile } from './Tile.js'
import { InputManager } from './InputManager.js'
import { HTMLActuator } from './HTMLActuator.js'

/**
 * GameManager - 2048 游戏核心逻辑
 */
export class GameManager {
  constructor(size = 4, onScoreChange, onGameEnd) {
    this.size = size
    this.onScoreChange = onScoreChange || (() => {})
    this.onGameEnd = onGameEnd || (() => {})
    this.startTiles = 2

    this.inputManager = new InputManager()
    this.actuator = new HTMLActuator()

    this.inputManager.on('move', this.move.bind(this))
    this.inputManager.on('restart', this.restart.bind(this))
    this.inputManager.on('keepPlaying', this.keepPlaying.bind(this))

    this.setup()
  }

  // 重新开始
  restart() {
    this.actuator.continueGame()
    this.setup()
  }

  // 继续游戏（达到 2048 后）
  keepPlaying() {
    this.keepPlayingMode = true
    this.actuator.continueGame()
  }

  // 判断游戏是否结束
  isGameTerminated() {
    return this.over || (this.won && !this.keepPlayingMode)
  }

  // 初始化游戏
  setup() {
    this.grid = new Grid(this.size)
    this.score = 0
    this.over = false
    this.won = false
    this.keepPlayingMode = false
    this.moveCount = 0
    this.maxTile = 2
    this.startTime = Date.now()

    // 添加初始方块
    this.addStartTiles()

    // 渲染
    this.actuate()
  }

  // 添加初始方块
  addStartTiles() {
    for (let i = 0; i < this.startTiles; i++) {
      this.addRandomTile()
    }
  }

  // 随机添加一个方块（90% 概率为 2，10% 概率为 4）
  addRandomTile() {
    if (this.grid.cellsAvailable()) {
      const value = Math.random() < 0.9 ? 2 : 4
      const cell = this.grid.randomAvailableCell()
      const tile = new Tile(cell, value)
      this.grid.insertTile(tile)
    }
  }

  // 渲染当前状态
  actuate() {
    this.actuator.actuate(this.grid, {
      score: this.score,
      over: this.over,
      won: this.won,
      bestScore: this.getBestScore(),
      terminated: this.isGameTerminated()
    })
    this.onScoreChange(this.score, this.maxTile)
  }

  // 获取本地最高分
  getBestScore() {
    return Number(localStorage.getItem('hbut_2048_best') || 0)
  }

  // 保存最高分
  saveBestScore() {
    const best = this.getBestScore()
    if (this.score > best) {
      localStorage.setItem('hbut_2048_best', this.score)
    }
  }

  // 准备方块移动（保存当前位置）
  prepareTiles() {
    this.grid.eachCell((x, y, tile) => {
      if (tile) {
        tile.mergedFrom = null
        tile.savePosition()
      }
    })
  }

  // 移动方块到指定位置
  moveTile(tile, cell) {
    this.grid.cells[tile.position.x][tile.position.y] = null
    this.grid.cells[cell.x][cell.y] = tile
    tile.updatePosition(cell)
  }

  // 执行移动操作
  // direction: 0=上, 1=右, 2=下, 3=左
  move(direction) {
    if (this.isGameTerminated()) return

    const vector = this.getVector(direction)
    const traversals = this.buildTraversals(vector)
    let moved = false

    this.prepareTiles()

    traversals.x.forEach((x) => {
      traversals.y.forEach((y) => {
        const cell = { x, y }
        const tile = this.grid.cellContent(cell)

        if (tile) {
          const positions = this.findFarthestPosition(cell, vector)
          const next = this.grid.cellContent(positions.next)

          // 合并条件：下一个格子有相同值的 tile，且该 tile 不是本轮已合并的
          if (next && next.value === tile.value && !next.mergedFrom) {
            const merged = new Tile(positions.next, tile.value * 2)
            merged.mergedFrom = [tile, next]

            this.grid.insertTile(merged)
            this.grid.removeTile(tile)

            // 更新 tile 位置（用于动画）
            tile.updatePosition(positions.next)

            // 更新分数
            this.score += merged.value
            this.maxTile = Math.max(this.maxTile, merged.value)

            // 检查是否达到 2048
            if (merged.value === 2048) {
              this.won = true
            }

            moved = true
          } else {
            // 移动到最远可达位置
            if (positions.farthest.x !== cell.x || positions.farthest.y !== cell.y) {
              this.moveTile(tile, positions.farthest)
              moved = true
            }
          }
        }
      })
    })

    if (moved) {
      this.moveCount++
      this.addRandomTile()
      this.saveBestScore()

      if (!this.movesAvailable()) {
        this.over = true
        this.onGameEnd({
          score: this.score,
          maxTile: this.maxTile,
          moveCount: this.moveCount,
          durationMs: Date.now() - this.startTime,
          won: this.won
        })
      }

      this.actuate()
    }
  }

  // 方向向量
  getVector(direction) {
    const map = {
      0: { x: -1, y: 0 }, // 上
      1: { x: 0, y: 1 },  // 右
      2: { x: 1, y: 0 },  // 下
      3: { x: 0, y: -1 }  // 左
    }
    return map[direction]
  }

  // 构建遍历顺序（确保从移动方向的远端开始）
  buildTraversals(vector) {
    const traversals = { x: [], y: [] }
    for (let pos = 0; pos < this.size; pos++) {
      traversals.x.push(pos)
      traversals.y.push(pos)
    }
    // 如果向右/下移动，需要反转遍历顺序
    if (vector.x === 1) traversals.x.reverse()
    if (vector.y === 1) traversals.y.reverse()
    return traversals
  }

  // 找到方块在指定方向上能到达的最远位置
  findFarthestPosition(cell, vector) {
    let previous
    let current = { x: cell.x, y: cell.y }

    do {
      previous = current
      current = { x: previous.x + vector.x, y: previous.y + vector.y }
    } while (this.grid.withinBounds(current) && this.grid.cellAvailable(current))

    return {
      farthest: previous,
      next: current // 可能越界或被占用
    }
  }

  // 检查是否还有可用的移动
  movesAvailable() {
    return this.grid.cellsAvailable() || this.tileMatchesAvailable()
  }

  // 检查是否有相邻的相同值方块
  tileMatchesAvailable() {
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        const tile = this.grid.cellContent({ x, y })
        if (tile) {
          for (let direction = 0; direction < 4; direction++) {
            const vector = this.getVector(direction)
            const other = this.grid.cellContent({
              x: x + vector.x,
              y: y + vector.y
            })
            if (other && other.value === tile.value) {
              return true
            }
          }
        }
      }
    }
    return false
  }
}
