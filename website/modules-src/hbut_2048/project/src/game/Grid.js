/**
 * Grid - 4x4 游戏网格管理
 */
export class Grid {
  constructor(size = 4, previousState) {
    this.size = size
    this.cells = previousState ? this.fromState(previousState) : this.empty()
  }

  // 创建空网格
  empty() {
    const cells = []
    for (let x = 0; x < this.size; x++) {
      const row = []
      for (let y = 0; y < this.size; y++) {
        row.push(null)
      }
      cells.push(row)
    }
    return cells
  }

  // 从保存状态恢复
  fromState(state) {
    const cells = []
    for (let x = 0; x < this.size; x++) {
      const row = []
      for (let y = 0; y < this.size; y++) {
        const tile = state[x][y]
        row.push(tile ? { position: { x, y }, value: tile.value } : null)
      }
      cells.push(row)
    }
    return cells
  }

  // 获取所有可用（空）格子
  availableCells() {
    const cells = []
    this.eachCell((x, y, tile) => {
      if (!tile) {
        cells.push({ x, y })
      }
    })
    return cells
  }

  // 遍历所有格子
  eachCell(callback) {
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        callback(x, y, this.cells[x][y])
      }
    }
  }

  // 是否还有空格子
  cellsAvailable() {
    return this.availableCells().length > 0
  }

  // 指定位置是否可用
  cellAvailable(cell) {
    return !this.cellOccupied(cell)
  }

  // 指定位置是否被占用
  cellOccupied(cell) {
    return !!this.cellContent(cell)
  }

  // 获取指定位置的内容
  cellContent(cell) {
    if (this.withinBounds(cell)) {
      return this.cells[cell.x][cell.y]
    }
    return null
  }

  // 在指定位置插入 tile
  insertTile(tile) {
    this.cells[tile.position.x][tile.position.y] = tile
  }

  // 移除指定位置的 tile
  removeTile(tile) {
    this.cells[tile.position.x][tile.position.y] = null
  }

  // 检查位置是否在边界内
  withinBounds(position) {
    return (
      position.x >= 0 &&
      position.x < this.size &&
      position.y >= 0 &&
      position.y < this.size
    )
  }

  // 随机获取一个可用格子
  randomAvailableCell() {
    const cells = this.availableCells()
    if (cells.length) {
      return cells[Math.floor(Math.random() * cells.length)]
    }
    return null
  }

  // 序列化状态
  serialize() {
    const cellState = []
    for (let x = 0; x < this.size; x++) {
      const row = []
      for (let y = 0; y < this.size; y++) {
        const tile = this.cells[x][y]
        row.push(tile ? { position: tile.position, value: tile.value } : null)
      }
      cellState.push(row)
    }
    return { size: this.size, cells: cellState }
  }
}
