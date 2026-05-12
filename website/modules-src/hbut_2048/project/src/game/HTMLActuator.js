/**
 * HTMLActuator - 将游戏状态渲染到 DOM
 */
export class HTMLActuator {
  constructor() {
    this.tileContainer = document.querySelector('.tile-container')
    this.scoreContainer = document.getElementById('score-value')
    this.bestContainer = document.getElementById('best-value')
    this.messageContainer = document.querySelector('.game-message')
    this.score = 0
  }

  // 渲染游戏状态
  actuate(grid, metadata) {
    window.requestAnimationFrame(() => {
      this.clearContainer(this.tileContainer)

      grid.eachCell((x, y, tile) => {
        if (tile) {
          this.addTile(tile)
        }
      })

      this.updateScore(metadata.score)
      this.updateBestScore(metadata.bestScore)

      if (metadata.terminated) {
        if (metadata.over) {
          this.message(false) // 游戏结束
        } else if (metadata.won) {
          this.message(true) // 胜利
        }
      }
    })
  }

  // 继续游戏（清除消息）
  continueGame() {
    this.clearMessage()
  }

  // 清空容器
  clearContainer(container) {
    while (container.firstChild) {
      container.removeChild(container.firstChild)
    }
  }

  // 添加 tile 到 DOM
  addTile(tile) {
    const wrapper = document.createElement('div')
    const inner = document.createElement('div')
    const position = tile.previousPosition || tile.position
    const positionClass = this.positionClass(position)

    // 基础类
    const classes = ['tile', `tile-${tile.value}`, positionClass]

    // 超过 2048 的特殊样式
    if (tile.value > 2048) {
      classes.push('tile-super')
    }

    this.applyClasses(wrapper, classes)
    inner.classList.add('tile-inner')
    inner.textContent = tile.value

    if (tile.previousPosition) {
      // 移动动画：先放在旧位置，然后更新到新位置
      window.requestAnimationFrame(() => {
        classes[2] = this.positionClass(tile.position)
        this.applyClasses(wrapper, classes)
      })
    } else if (tile.mergedFrom) {
      // 合并动画
      classes.push('tile-merged')
      this.applyClasses(wrapper, classes)

      // 渲染合并来源的 tile（用于弹出动画）
      tile.mergedFrom.forEach((merged) => {
        this.addTile(merged)
      })
    } else {
      // 新 tile 出现动画
      classes.push('tile-new')
      this.applyClasses(wrapper, classes)
    }

    wrapper.appendChild(inner)
    this.tileContainer.appendChild(wrapper)
  }

  // 应用 CSS 类
  applyClasses(element, classes) {
    element.setAttribute('class', classes.join(' '))
  }

  // 位置 CSS 类名（注意：CSS 中 position 是 1-based）
  positionClass(position) {
    return `tile-position-${position.y + 1}-${position.x + 1}`
  }

  // 更新分数
  updateScore(score) {
    this.clearContainer(this.scoreContainer)

    const difference = score - this.score
    this.score = score
    this.scoreContainer.textContent = this.score

    if (difference > 0) {
      // 分数增加动画
      const addition = document.createElement('div')
      addition.classList.add('score-addition')
      addition.textContent = `+${difference}`
      this.scoreContainer.parentNode.appendChild(addition)
      // 动画结束后移除
      window.setTimeout(() => {
        if (addition.parentNode) {
          addition.parentNode.removeChild(addition)
        }
      }, 600)
    }
  }

  // 更新最高分
  updateBestScore(bestScore) {
    this.bestContainer.textContent = bestScore
  }

  // 显示游戏结束/胜利消息
  message(won) {
    const type = won ? 'game-won' : 'game-over'
    const message = won ? '🎉 恭喜达到 2048！' : '游戏结束！'

    this.messageContainer.classList.add(type)
    this.messageContainer.querySelector('.message-text').textContent = message
    this.messageContainer.style.display = 'flex'
  }

  // 清除消息
  clearMessage() {
    this.messageContainer.classList.remove('game-won', 'game-over')
    this.messageContainer.style.display = 'none'
  }
}
