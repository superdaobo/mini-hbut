import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useGameStore = defineStore('game', () => {
  // 游戏状态
  const gameState = ref('menu')
  const gamePhase = ref('exploration')
  
  // 玩家系统
  const player = ref({
    name: '特种兵',
    class: null,
    level: 1,
    exp: 0,
    expToNext: 100,
    hp: 100,
    maxHp: 100,
    stamina: 100,
    maxStamina: 100,
    attack: 20,
    defense: 10,
    accuracy: 80,
    critRate: 10,
    critDamage: 150,
    evasion: 15,
    x: 2,
    y: 2,
    facing: 'down',
    kills: 0,
    itemsLooted: 0
  })
  
  // 职业定义
  const classes = {
    assault: { name: '突击兵', icon: '⚡', color: '#ff6b6b', stats: { hp: 120, attack: 25, defense: 15, accuracy: 75, critRate: 15, evasion: 10 }},
    sniper: { name: '狙击手', icon: '🎯', color: '#4ecdc4', stats: { hp: 80, attack: 35, defense: 8, accuracy: 95, critRate: 25, evasion: 20 }},
    medic: { name: '医疗兵', icon: '💚', color: '#95e1d3', stats: { hp: 90, attack: 15, defense: 12, accuracy: 85, critRate: 5, evasion: 15 }},
    engineer: { name: '工程师', icon: '🔧', color: '#f38181', stats: { hp: 100, attack: 18, defense: 18, accuracy: 80, critRate: 10, evasion: 12 }}
  }
  
  // 地图系统
  const mapSize = { width: 10, height: 10 }
  const mapData = ref([])
  
  // 地形类型
  const terrainTypes = {
    floor: { name: '地面', color: '#3a3a5c', walkable: true },
    wall: { name: '墙壁', color: '#5c5c7a', walkable: false },
    cover: { name: '掩体', color: '#4a5568', walkable: true, cover: 50 },
    bush: { name: '灌木丛', color: '#2d5016', walkable: true },
    exit: { name: '撤离点', color: '#00d9ff', walkable: true }
  }
  
  // 战斗系统
  const combat = ref({ active: false, turn: 1, currentTurn: 'player', enemies: [], actionPoints: 2 })
  
  // 背包系统
  const inventory = ref([])
  const maxInventorySlots = 12
  const equipped = ref({ weapon: null, armor: null })
  
  // 物品数据库
  const itemDatabase = {
    weapon_knife: { name: '战术匕首', type: 'weapon', damage: 15, range: 1, accuracy: 95, icon: '🗡️' },
    weapon_pistol: { name: '手枪', type: 'weapon', damage: 25, range: 4, accuracy: 85, icon: '🔫' },
    weapon_rifle: { name: '突击步枪', type: 'weapon', damage: 40, range: 6, accuracy: 80, icon: '🔫' },
    weapon_sniper: { name: '狙击步枪', type: 'weapon', damage: 80, range: 10, accuracy: 90, icon: '🎯' },
    armor_light: { name: '轻型护甲', type: 'armor', defense: 10, icon: '🦺' },
    armor_medium: { name: '中型护甲', type: 'armor', defense: 20, icon: '🛡️' },
    medkit_small: { name: '急救包', type: 'consumable', heal: 40, icon: '💊' },
    medkit_large: { name: '医疗箱', type: 'consumable', heal: 80, icon: '💉' },
    grenade: { name: '手雷', type: 'throwable', damage: 50, icon: '💣' }
  }
  
  // 敌人系统
  const enemyTypes = {
    scout: { name: '侦察兵', icon: '👁️', hp: 40, attack: 15, defense: 5, exp: 20 },
    soldier: { name: '敌兵', icon: '💂', hp: 70, attack: 25, defense: 12, exp: 35 },
    heavy: { name: '重装兵', icon: '🛡️', hp: 120, attack: 30, defense: 25, exp: 60 },
    boss: { name: '精英指挥官', icon: '👹', hp: 200, attack: 40, defense: 20, exp: 150 }
  }
  
  // 日志系统
  const gameLog = ref([])
  
  // 初始化地图
  const initializeMap = () => {
    mapData.value = []
    for (let y = 0; y < mapSize.height; y++) {
      const row = []
      for (let x = 0; x < mapSize.width; x++) {
        row.push(generateCell(x, y))
      }
      mapData.value.push(row)
    }
    placeExit()
    populateMap()
  }
  
  const generateCell = (x, y) => {
    if (Math.abs(x - 2) + Math.abs(y - 2) <= 2) {
      return { x, y, type: 'floor', revealed: true, content: null, enemy: null }
    }
    const rand = Math.random()
    let type = 'floor'
    if (rand < 0.15) type = 'wall'
    else if (rand < 0.25) type = 'cover'
    return { x, y, type, revealed: false, content: null, enemy: null }
  }
  
  const placeExit = () => {
    mapData.value[mapSize.height - 2][mapSize.width - 2].type = 'exit'
    mapData.value[mapSize.height - 2][mapSize.width - 2].revealed = false
  }
  
  const populateMap = () => {
    // 放置敌人
    for (let i = 0; i < 8; i++) {
      let placed = false
      while (!placed) {
        const x = Math.floor(Math.random() * mapSize.width)
        const y = Math.floor(Math.random() * mapSize.height)
        const cell = mapData.value[y][x]
        const distFromStart = Math.abs(x - 2) + Math.abs(y - 2)
        if (distFromStart > 3 && cell.type === 'floor' && !cell.enemy && !cell.content) {
          cell.enemy = generateEnemy(x, y)
          placed = true
        }
      }
    }
    // 放置物品
    for (let i = 0; i < 10; i++) {
      let placed = false
      while (!placed) {
        const x = Math.floor(Math.random() * mapSize.width)
        const y = Math.floor(Math.random() * mapSize.height)
        const cell = mapData.value[y][x]
        if (cell.type === 'floor' && !cell.enemy && !cell.content) {
          cell.content = generateItem()
          placed = true
        }
      }
    }
  }
  
  const generateEnemy = (x, y) => {
    const rand = Math.random()
    let type = 'scout'
    if (rand < 0.4) type = 'scout'
    else if (rand < 0.7) type = 'soldier'
    else type = 'heavy'
    const template = enemyTypes[type]
    return { ...template, x, y, maxHp: template.hp, id: Date.now() + Math.random() }
  }
  
  const generateItem = () => {
    const keys = Object.keys(itemDatabase)
    const key = keys[Math.floor(Math.random() * keys.length)]
    return { ...itemDatabase[key], id: Date.now() + Math.random() }
  }
  
  // 移动系统
  const movePlayer = (dx, dy) => {
    const newX = player.value.x + dx
    const newY = player.value.y + dy
    if (newX < 0 || newX >= mapSize.width || newY < 0 || newY >= mapSize.height) return false
    const targetCell = mapData.value[newY][newX]
    if (!terrainTypes[targetCell.type].walkable) {
      addLog('前方不可通行！')
      return false
    }
    if (targetCell.enemy) {
      startCombat(targetCell.enemy)
      return false
    }
    player.value.x = newX
    player.value.y = newY
    revealArea(newX, newY)
    if (targetCell.content) {
      collectItem(targetCell.content)
      addLog(`拾取了 ${targetCell.content.name}`)
      targetCell.content = null
    }
    if (targetCell.type === 'exit') {
      if (player.value.kills >= 3) victory()
      else addLog(`需要击败至少3个敌人才能撤离！(当前: ${player.value.kills}/3)`)
    }
    return true
  }
  
  const revealArea = (x, y) => {
    const newMap = mapData.value.map((row, rowY) => {
      return row.map((cell, colX) => {
        const dist = Math.abs(colX - x) + Math.abs(rowY - y)
        if (dist <= 2) return { ...cell, revealed: true }
        return cell
      })
    })
    mapData.value = newMap
  }
  
  // 战斗系统
  const startCombat = (enemy) => {
    combat.value.active = true
    combat.value.turn = 1
    combat.value.currentTurn = 'player'
    combat.value.enemies = [enemy]
    combat.value.actionPoints = 2
    gameState.value = 'battle'
    addLog(`进入战斗！对手: ${enemy.name}`)
  }
  
  const combatAttack = () => {
    if (combat.value.currentTurn !== 'player' || combat.value.actionPoints <= 0) return false
    const weapon = equipped.value.weapon
    const enemy = combat.value.enemies[0]
    if (!enemy || enemy.hp <= 0) return false
    const hitChance = (player.value.accuracy + (weapon?.accuracy || 80)) / 100
    if (Math.random() > hitChance) {
      addLog(`攻击未命中！`)
      combat.value.actionPoints--
      if (combat.value.actionPoints <= 0) endPlayerTurn()
      return true
    }
    let damage = (weapon?.damage || player.value.attack) + Math.floor(Math.random() * 5)
    damage = Math.max(1, damage - enemy.defense)
    const critChance = player.value.critRate / 100
    if (Math.random() < critChance) {
      damage = Math.floor(damage * 1.5)
      addLog(`💥 暴击！造成 ${damage} 点伤害！`)
    } else {
      addLog(`造成 ${damage} 点伤害`)
    }
    enemy.hp -= damage
    if (enemy.hp <= 0) killEnemy(enemy)
    combat.value.actionPoints--
    if (combat.value.actionPoints <= 0) endPlayerTurn()
    return true
  }
  
  const killEnemy = (enemy) => {
    addLog(`✝️ 击杀了 ${enemy.name}！获得 ${enemy.exp} 经验值`)
    player.value.exp += enemy.exp
    player.value.kills++
    const newMap = mapData.value.map((row, rowY) => {
      return row.map((c, colX) => {
        if (colX === enemy.x && rowY === enemy.y) return { ...c, enemy: null }
        return c
      })
    })
    mapData.value = newMap
    combat.value.enemies = combat.value.enemies.filter(e => e.id !== enemy.id)
    checkLevelUp()
    if (combat.value.enemies.length === 0) endCombat()
  }
  
  const endPlayerTurn = () => {
    combat.value.currentTurn = 'enemy'
    setTimeout(enemyTurn, 1000)
  }
  
  const enemyTurn = () => {
    combat.value.enemies.forEach(enemy => {
      if (enemy.hp <= 0) return
      const hitChance = enemy.accuracy / 100
      if (Math.random() > hitChance) {
        addLog(`${enemy.name} 的攻击未命中！`)
        return
      }
      let damage = enemy.attack + Math.floor(Math.random() * 5)
      damage = Math.max(1, damage - player.value.defense)
      player.value.hp -= damage
      addLog(`${enemy.name} 造成 ${damage} 点伤害！`)
      if (player.value.hp <= 0) gameOver()
    })
    combat.value.turn++
    combat.value.currentTurn = 'player'
    combat.value.actionPoints = 2
  }
  
  const endCombat = () => {
    combat.value.active = false
    combat.value.enemies = []
    gameState.value = 'playing'
    addLog('战斗结束！')
  }
  
  const checkLevelUp = () => {
    if (player.value.exp >= player.value.expToNext) {
      player.value.level++
      player.value.exp -= player.value.expToNext
      player.value.expToNext = Math.floor(player.value.expToNext * 1.5)
      player.value.maxHp += 20
      player.value.hp = player.value.maxHp
      player.value.attack += 5
      player.value.defense += 2
      addLog(`🎉 升级了！达到等级 ${player.value.level}`)
    }
  }
  
  // 物品系统
  const collectItem = (item) => {
    if (inventory.value.length >= maxInventorySlots) {
      addLog('背包已满！')
      return false
    }
    inventory.value.push(item)
    player.value.itemsLooted++
    if (item.type === 'weapon') {
      const currentWeapon = equipped.value.weapon
      if (!currentWeapon || (currentWeapon.damage || 0) < item.damage) {
        equipped.value.weapon = item
        addLog(`自动装备了 ${item.name}`)
      }
    } else if (item.type === 'armor') {
      const currentArmor = equipped.value.armor
      if (!currentArmor || (currentArmor.defense || 0) < item.defense) {
        equipped.value.armor = item
        addLog(`自动装备了 ${item.name}`)
      }
    }
    return true
  }
  
  const useItem = (index) => {
    const item = inventory.value[index]
    if (!item) return false
    if (item.type === 'consumable' && item.heal) {
      player.value.hp = Math.min(player.value.maxHp, player.value.hp + item.heal)
      addLog(`使用了 ${item.name}，恢复 ${item.heal} 生命值`)
      inventory.value.splice(index, 1)
      return true
    }
    return false
  }
  
  const equipItem = (index) => {
    const item = inventory.value[index]
    if (!item) return false
    if (item.type === 'weapon') {
      if (equipped.value.weapon) inventory.value.push(equipped.value.weapon)
      equipped.value.weapon = item
      inventory.value.splice(index, 1)
      addLog(`装备了 ${item.name}`)
      return true
    } else if (item.type === 'armor') {
      if (equipped.value.armor) inventory.value.push(equipped.value.armor)
      equipped.value.armor = item
      inventory.value.splice(index, 1)
      addLog(`装备了 ${item.name}`)
      return true
    }
    return false
  }
  
  // 游戏控制
  const addLog = (message) => {
    gameLog.value.unshift({ text: message, time: Date.now() })
    if (gameLog.value.length > 20) gameLog.value.pop()
  }
  
  const selectClass = (classId) => {
    player.value.class = classId
    const classData = classes[classId]
    Object.assign(player.value, classData.stats)
    player.value.maxHp = player.value.hp
  }
  
  const startGame = () => {
    initializeMap()
    player.value.x = 2
    player.value.y = 2
    player.value.hp = player.value.maxHp
    player.value.kills = 0
    player.value.itemsLooted = 0
    player.value.exp = 0
    player.value.level = 1
    inventory.value = []
    equipped.value = { weapon: null, armor: null }
    gameLog.value = []
    gameState.value = 'playing'
    addLog('游戏开始！找到撤离点并击败至少3个敌人')
  }
  
  const victory = () => {
    gameState.value = 'victory'
    addLog('🎉 成功撤离！')
  }
  
  const gameOver = () => {
    gameState.value = 'gameover'
    addLog('💀 你阵亡了...')
  }
  
  const restart = () => {
    gameState.value = 'menu'
  }
  
  return {
    gameState,
    gamePhase,
    player,
    classes,
    mapData,
    mapSize,
    combat,
    inventory,
    maxInventorySlots,
    equipped,
    itemDatabase,
    gameLog,
    terrainTypes,
    movePlayer,
    combatAttack,
    useItem,
    equipItem,
    addLog,
    selectClass,
    startGame,
    victory,
    gameOver,
    restart,
    endCombat
  }
})