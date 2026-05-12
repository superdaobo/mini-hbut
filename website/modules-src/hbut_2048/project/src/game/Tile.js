/**
 * Tile - 单个方块
 */
export class Tile {
  constructor(position, value) {
    this.position = { x: position.x, y: position.y }
    this.previousPosition = null
    this.value = value || 2
    this.mergedFrom = null // 记录合并来源（用于动画）
  }

  // 保存当前位置为上一个位置
  savePosition() {
    this.previousPosition = { x: this.position.x, y: this.position.y }
  }

  // 更新位置
  updatePosition(position) {
    this.position = { x: position.x, y: position.y }
  }

  // 序列化
  serialize() {
    return {
      position: { x: this.position.x, y: this.position.y },
      value: this.value
    }
  }
}
