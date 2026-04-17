<template>
  <div class="game-container">
    <div class="glass-header">
      <div class="header-content">
        <h1>合成湖工大</h1>
        <div class="header-right">
           <button class="history-btn" @click="toggleHistory">📜 记录</button>
           <div class="score-pill">
            <span class="score-label">得分</span>
            <span class="score-value">{{ score }}</span>
          </div>
        </div>
      </div>
      <p class="subtitle">清北只是起点，湖工大才是巅峰！</p>
    </div>

    <div class="game-area" ref="gameArea">
      <div class="game-canvas-wrapper" :style="{ width: canvasWidth + 'px', height: canvasHeight + 'px' }">
        <canvas 
          ref="gameCanvas" 
          class="game-canvas"
          :width="canvasWidth"
          :height="canvasHeight"
          @mousedown="handleInputStart"
          @mousemove="handleInputMove"
          @mouseup="handleInputEnd"
          @touchstart="handleInputStart"
          @touchmove="handleInputMove"
          @touchend="handleInputEnd"
        ></canvas>

        <div class="guide-line" :style="{ left: dropX + 'px' }" v-if="isDragging || !isMobile"></div>
        
        <div 
          class="current-ball" 
          v-if="!hasDropped"
          :style="{ 
            left: (dropX - schools[nextBallLevel].radius) + 'px', 
            top: '20px',
            width: schools[nextBallLevel].radius * 2 + 'px',
            height: schools[nextBallLevel].radius * 2 + 'px'
          }"
        >
          <img 
            :src="'/logos/' + schools[nextBallLevel].image" 
            :alt="schools[nextBallLevel].short"
            class="ball-img"
          />
        </div>

        <div class="next-preview glass-panel">
          <span>下个登场</span>
          <div class="preview-circle">
            <img 
              :src="'/logos/' + schools[previewBallLevel].image" 
              :alt="schools[previewBallLevel].short"
              class="preview-img"
            />
          </div>
        </div>

        <!-- Drama Toast -->
        <div class="drama-toast" :class="{ show: showToast }">
           <div class="drama-content">
             <span class="drama-text">{{ toastMessage }}</span>
           </div>
        </div>

        <!-- Overlays -->
        <div v-if="gameOver" class="overlay glass-overlay">
          <h2>🚧 挑战失败 🚧</h2>
          <p class="final-score">最终得分: {{ score }}</p>
          <p class="message">清北太多，挤不下了...</p>
          <div class="overlay-btns">
            <button class="restart-btn" @click="forceRestart">再战一局</button>
            <button class="history-btn-large" @click="toggleHistory">查看记录</button>
          </div>
        </div>
        
        <div v-if="hasWon" class="overlay glass-overlay win">
          <h2>🏆 恭喜圆梦！🏆</h2>
          <p class="message">你也是湖工大的骄傲！</p>
          <p class="final-score">最终得分: {{ score }}</p>
          <button class="restart-btn" @click="forceRestart">再刷亿次</button>
        </div>

        <!-- History Overlay -->
        <div v-if="showHistory" class="overlay glass-overlay history-overlay">
          <div class="history-panel glass-panel">
             <div class="history-header">
                <h3>📜 历史战绩</h3>
                <button class="close-btn" @click="toggleHistory">×</button>
             </div>
             <div class="history-list">
                <div v-if="historyRecords.length === 0" class="no-history">暂无记录，快去合成吧！</div>
                <div v-else class="history-item" v-for="(record, idx) in historyRecords" :key="idx">
                    <div class="history-info">
                       <span class="history-date">{{ formatDate(record.date) }}</span>
                       <span class="user-score">得分: {{ record.score }}</span>
                    </div>
                    <div class="history-badge">
                       <img :src="'/logos/' + schools[record.maxLevel].image" class="badge-img" />
                       <span>{{ schools[record.maxLevel].short }}</span>
                    </div>
                </div>
             </div>
             <button class="clear-history-btn" v-if="historyRecords.length > 0" @click="clearHistory">清空记录</button>
          </div>
        </div>
      </div>
    </div>
    
    <div class="legend-panel glass-panel">
      <div class="legend-scroll">
        <div 
          v-for="(school, index) in schools" 
          :key="index" 
          class="legend-item"
          :class="{ 'current-target': index === schools.length - 1 }"
        >
          <div class="legend-icon">
            <img :src="'/logos/' + school.image" :alt="school.short" />
          </div>
          <span class="legend-name">{{ school.short }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import Matter from 'matter-js'

export default {
  name: 'App',
  data() {
    return {
      canvasWidth: 360,
      canvasHeight: 600,
      dropX: 180,
      score: 0,
      gameOver: false,
      hasWon: false,
      nextBallLevel: 0,
      previewBallLevel: 0,
      isDragging: false,
      hasDropped: false,
      isMobile: false,
      showHistory: false,
      historyRecords: [],
      particles: [],
      
      // Drama System
      toastMessage: '',
      showToast: false,
      toastTimer: null,
      dramaScripts: {
         0: ["清华？就这？", "起步价而已", "勉强能看"],
         1: ["北大也一般般", "还差点意思", "继续努力"],
         2: ["复旦？小意思", "离目标还远", "稍微有点东西"],
         3: ["浙大？这也能叫好？", "还得练", "也就图一乐"],
         4: ["上交？马马虎虎", "还是太年轻", "这就是你的极限？"],
         5: ["中科大？还行吧", "稍微认真点", "快到碗里来"],
         6: ["南大？有点意思了", "别骄傲", "稳住，并在"],
         7: ["武大？樱花不错", "离巅峰一步之遥", "颤抖吧凡人"],
         8: ["华科？只要湖工大！", "清北皆浮云", "见证奇迹的时刻"],
         9: ["湖工大！神之降临！", "这才是学术巅峰！", "圆满了！"]
      },
      
      engine: null,
      render: null,
      runner: null,
      
      deathLineY: 100,
      schoolImages: {},
      schools: [
        { name: '清华大学', short: '清华', radius: 20, color: '#8e44ad', score: 1, image: 'qinghua.png' },
        { name: '北京大学', short: '北大', radius: 28, color: '#e74c3c', score: 2, image: 'beida.png' },
        { name: '复旦大学', short: '复旦', radius: 36, color: '#e67e22', score: 4, image: 'fudan.png' },
        { name: '浙江大学', short: '浙大', radius: 44, color: '#f1c40f', score: 8, image: 'zheda.png' },
        { name: '上海交通大学', short: '上交', radius: 52, color: '#2ecc71', score: 16, image: 'shangjiao.png' },
        { name: '中国科学技术大学', short: '中科大', radius: 60, color: '#1abc9c', score: 32, image: 'zhongkeda.png' },
        { name: '南京大学', short: '南大', radius: 66, color: '#3498db', score: 64, image: 'nanda.png' },
        { name: '武汉大学', short: '武大', radius: 72, color: '#9b59b6', score: 128, image: 'wuda.png' },
        { name: '华中科技大学', short: '华科', radius: 78, color: '#e91e63', score: 256, image: 'huake.png' },
        { name: '湖北工业大学', short: '湖工大', radius: 85, color: '#FFD700', score: 512, image: 'hugongda.png' }
      ]
    }
  },
  mounted() {
    this.checkMobile()
    window.addEventListener('resize', this.handleResize)
    // Auto-save on page close/refresh
    window.addEventListener('beforeunload', this.saveGame)
    
    this.initDimensions()
    this.loadHistory()
    
    this.loadImages().then(() => {
      this.initGame()
    })
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize)
    window.removeEventListener('beforeunload', this.saveGame)
    // Also save when component unmounts
    this.saveGame()
    this.stopGame()
  },
  methods: {
    checkMobile() {
      this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    },
    
    initDimensions() {
      const maxWidth = 500
      const padding = 20
      const availableHeight = window.innerHeight - 180 
      
      this.canvasWidth = Math.min(window.innerWidth - padding, maxWidth)
      this.canvasHeight = Math.max(400, Math.min(availableHeight, 800))
      
      this.dropX = this.canvasWidth / 2
      this.deathLineY = 120 
    },
    
    handleResize() {
      this.saveGame() // Save before resize reset
      this.stopGame()
      this.initDimensions()
      this.initGame() // Will try to load save
    },

    async loadImages() {
      const promises = this.schools.map((school, index) => {
        return new Promise((resolve) => {
          const img = new Image()
          img.onload = () => {
             this.schoolImages[index] = img
             resolve()
          }
          img.onerror = () => {
             this.schoolImages[index] = null 
             resolve()
          }
          img.src = `/logos/${school.image}`
        })
      })
      await Promise.all(promises)
    },

    stopGame() {
      if (this.render) {
        Matter.Render.stop(this.render)
        // Do NOT remove canvas element, Vue manages it
      }
      if (this.runner) {
        Matter.Runner.stop(this.runner)
      }
      if (this.engine) {
        Matter.Engine.clear(this.engine)
      }
    },

    initGame() {
      const Engine = Matter.Engine
      const Render = Matter.Render
      const World = Matter.World
      const Bodies = Matter.Bodies
      const Events = Matter.Events
      const Runner = Matter.Runner

      this.engine = Engine.create()
      this.engine.world.gravity.y = 1.2 

      this.render = Render.create({
        canvas: this.$refs.gameCanvas,
        engine: this.engine,
        options: {
          width: this.canvasWidth,
          height: this.canvasHeight,
          wireframes: false,
          background: 'transparent',
          pixelRatio: window.devicePixelRatio
        }
      })

      // Walls
      const wallThick = 60
      const wallOptions = { 
        isStatic: true, 
        render: { fillStyle: '#ffffff33' },
        friction: 0.1,
        restitution: 0.2
      }
      
      const walls = [
        Bodies.rectangle(this.canvasWidth / 2, this.canvasHeight + wallThick/2, this.canvasWidth, wallThick, wallOptions), // Floor
        Bodies.rectangle(-wallThick/2, this.canvasHeight / 2, wallThick, this.canvasHeight * 2, wallOptions), // Left
        Bodies.rectangle(this.canvasWidth + wallThick/2, this.canvasHeight / 2, wallThick, this.canvasHeight * 2, wallOptions) // Right
      ]
      World.add(this.engine.world, walls)

      // Events
      Events.on(this.engine, 'collisionStart', this.handleCollision)
      Events.on(this.render, 'afterRender', this.drawOverlay)

      // Try to Restore Game
      // If manually restarted (score=0), loadGame returns false because we cleared storage in forceRestart
      const restored = this.score > 0 ? this.loadGame() : false 
      // Actually loadGame checks storage. In forceRestart we clear storage. So loadGame returns false.
      // But we need to make sure we don't accidentally load a cleared save if logic differs.
      // loadGame() handles empty storage gracefully.

      const loadSuccess = this.loadGame()

      if (!loadSuccess) {
        this.nextBallLevel = this.getRandomBallLevel()
        this.previewBallLevel = this.getRandomBallLevel()
        this.score = 0
        this.gameOver = false
        this.hasWon = false
        this.hasDropped = false
      }

      // Run
      Render.run(this.render)
      this.runner = Runner.create()
      Runner.run(this.runner, this.engine)

      this.checkGameOver()
      
      // Auto-save periodically
      if(this.autoSaveInterval) clearInterval(this.autoSaveInterval)
      this.autoSaveInterval = setInterval(this.saveGame, 5000)
    },

    // --- Persistence & History ---

    saveGame() {
       if (this.gameOver || this.hasWon) {
         localStorage.removeItem('hbut_current_save')
         return
       }
       
       const bodies = Matter.Composite.allBodies(this.engine.world)
       const gameBodies = bodies
         .filter(b => b.schoolLevel !== undefined && !b.isRemoved)
         .map(b => ({
           x: b.position.x,
           y: b.position.y,
           level: b.schoolLevel,
           angle: b.angle
         }))
         
       const saveData = {
         score: this.score,
         nextBallLevel: this.nextBallLevel,
         previewBallLevel: this.previewBallLevel,
         bodies: gameBodies,
         timestamp: Date.now()
       }
       
       localStorage.setItem('hbut_current_save', JSON.stringify(saveData))
    },

    loadGame() {
      try {
        const raw = localStorage.getItem('hbut_current_save')
        if (!raw) return false
        
        const data = JSON.parse(raw)
        // Basic Reset
        this.score = data.score || 0
        this.nextBallLevel = data.nextBallLevel || 0
        this.previewBallLevel = data.previewBallLevel || 0
        
        // Restore bodies
        if (data.bodies && Array.isArray(data.bodies)) {
           data.bodies.forEach(b => {
              const school = this.schools[b.level]
              const ball = Matter.Bodies.circle(b.x, b.y, school.radius, {
                restitution: 0.3,
                friction: 0.1,
                angle: b.angle || 0,
                label: `ball_${b.level}`,
                render: {
                  fillStyle: 'transparent',
                  strokeStyle: 'transparent'
                }
              })
              ball.schoolLevel = b.level
              ball.dropTime = Date.now() // Treat as safe
              Matter.World.add(this.engine.world, ball)
           })
        }
        return true
      } catch (e) {
        console.error("Failed to load game", e)
        localStorage.removeItem('hbut_current_save')
        return false
      }
    },
    
    saveToHistory() {
       // Find max level
       const bodies = Matter.Composite.allBodies(this.engine.world)
       let maxLevel = 0
       bodies.forEach(b => {
         if (b.schoolLevel !== undefined && b.schoolLevel > maxLevel) {
           maxLevel = b.schoolLevel
         }
       })
       
       // If won, maxLevel should be top
       if (this.hasWon) {
          maxLevel = this.schools.length - 1
       }
       
       const record = {
         date: Date.now(),
         score: this.score,
         maxLevel: maxLevel
       }
       
       this.historyRecords.unshift(record)
       // Limit history size
       if (this.historyRecords.length > 20) {
         this.historyRecords = this.historyRecords.slice(0, 20)
       }
       
       localStorage.setItem('hbut_history', JSON.stringify(this.historyRecords))
       // Clear current save
       localStorage.removeItem('hbut_current_save')
    },
    
    loadHistory() {
      try {
        const raw = localStorage.getItem('hbut_history')
        if (raw) {
          this.historyRecords = JSON.parse(raw)
        }
      } catch(e) {
        console.error("Failed to load history", e)
      }
    },
    
    toggleHistory() {
      this.showHistory = !this.showHistory
    },
    
    clearHistory() {
      if(confirm('确定要清空历史记录吗？')) {
        this.historyRecords = []
        localStorage.removeItem('hbut_history')
      }
    },
    
    formatDate(ts) {
      const d = new Date(ts)
      return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`
    },
    
    forceRestart() {
      clearInterval(this.autoSaveInterval)
      localStorage.removeItem('hbut_current_save')
      this.restartGame()
    },

    // --- End Persistence ---

    getRandomBallLevel() {
      return Math.floor(Math.random() * 4) 
    },

    getEventX(e) {
      const rect = this.$refs.gameCanvas.getBoundingClientRect()
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      return clientX - rect.left
    },

    handleInputStart(e) {
      if (this.gameOver || this.hasWon || this.hasDropped) return
      e.preventDefault() 
      this.isDragging = true
      this.updateDropX(this.getEventX(e))
    },

    handleInputMove(e) {
      if (e.type === 'mousemove') {
        // Always track mouse movement for hover effect
        e.preventDefault()
        this.updateDropX(this.getEventX(e))
        return
      }
      
      // For touch, only track if dragging
      if (!this.isDragging) return
      e.preventDefault()
      this.updateDropX(this.getEventX(e))
    },

    handleInputEnd(e) {
      if (e.type === 'mouseup' || (this.isDragging && e.type === 'touchend')) {
         e.preventDefault()
         this.isDragging = false
         this.dropBall()
      }
    },

    updateDropX(x) {
      const radius = this.schools[this.nextBallLevel].radius
      this.dropX = Math.max(radius, Math.min(this.canvasWidth - radius, x))
    },

    dropBall() {
        if(this.hasDropped || this.gameOver) return;

        this.hasDropped = true;
        const currentLevel = this.nextBallLevel
        const school = this.schools[currentLevel]
        
        const ball = Matter.Bodies.circle(this.dropX, 40, school.radius, {
          restitution: 0.3,
          friction: 0.1,
          label: `ball_${currentLevel}`,
          render: {
            fillStyle: 'transparent', 
            strokeStyle: 'transparent'
          }
        })
        
        ball.schoolLevel = currentLevel
        ball.dropTime = Date.now()
        Matter.World.add(this.engine.world, ball)

        this.nextBallLevel = this.previewBallLevel
        this.previewBallLevel = this.getRandomBallLevel()
        
        // Save state immediately after drop setup
        this.saveGame()

        setTimeout(() => {
          if (!this.gameOver) this.hasDropped = false
        }, 600) 
    },

    handleCollision(event) {
      const pairs = event.pairs
      pairs.forEach(pair => {
        const bodyA = pair.bodyA
        const bodyB = pair.bodyB

        if (bodyA.schoolLevel !== undefined && bodyB.schoolLevel !== undefined) {
          if (bodyA.schoolLevel === bodyB.schoolLevel && bodyA.schoolLevel < this.schools.length - 1) {
            
            if(bodyA.isRemoved || bodyB.isRemoved) return;
            bodyA.isRemoved = true;
            bodyB.isRemoved = true;

            const newLevel = bodyA.schoolLevel + 1
            const newSchool = this.schools[newLevel]
            
            const newX = (bodyA.position.x + bodyB.position.x) / 2
            const newY = (bodyA.position.y + bodyB.position.y) / 2

            Matter.World.remove(this.engine.world, [bodyA, bodyB])
            
            const newBall = Matter.Bodies.circle(newX, newY, newSchool.radius, {
              restitution: 0.3,
              friction: 0.1,
              label: `ball_${newLevel}`,
              render: {
                 fillStyle: 'transparent',
                 strokeStyle: 'transparent'
              }
            })
            newBall.schoolLevel = newLevel
            newBall.dropTime = Date.now() 
            Matter.World.add(this.engine.world, newBall)

            this.score += newSchool.score
            this.saveGame() // Save on merge
            
            this.createMergeEffect(newX, newY, this.schools[newLevel].color)
            this.triggerDrama(newLevel)
            
            if (newLevel === this.schools.length - 1) {
              this.hasWon = true
              this.saveToHistory() // Save history on win
            }
          }
        }
      })
    },

    triggerDrama(level) {
       // Only trigger for larger balls (level >= 3, which is Fudan and above)
       // Increase chance for very large balls
       if (level < 3) return // Ignore small merges
       
       const scripts = this.dramaScripts[level]
       if (!scripts) return
       
       const text = scripts[Math.floor(Math.random() * scripts.length)]
       
       this.toastMessage = text
       this.showToast = true
       
       if (this.toastTimer) clearTimeout(this.toastTimer)
       this.toastTimer = setTimeout(() => {
         this.showToast = false
       }, 3000)
    },

    createMergeEffect(x, y, color) {
       // 1. Visual Particles
       for (let i = 0; i < 12; i++) {
         const angle = (Math.PI * 2 * i) / 12
         const speed = 2 + Math.random() * 3
         this.particles.push({
           x: x,
           y: y,
           vx: Math.cos(angle) * speed,
           vy: Math.sin(angle) * speed,
           life: 1.0,
           color: color,
           size: 3 + Math.random() * 3
         })
       }
       
       // 2. Physics Shockwave
       const blastRadius = 150
       const blastForce = 0.05
       const bodies = Matter.Composite.allBodies(this.engine.world)
       
       bodies.forEach(body => {
         if (body.isStatic || body.schoolLevel === undefined) return
         
         const dx = body.position.x - x
         const dy = body.position.y - y
         const dist = Math.sqrt(dx * dx + dy * dy)
         
         if (dist < blastRadius && dist > 10) {
           const forceMagnitude = (1 - dist / blastRadius) * blastForce * body.mass
           Matter.Body.applyForce(body, body.position, {
             x: (dx / dist) * forceMagnitude,
             y: (dy / dist) * forceMagnitude
           })
         }
       })
    },

    checkGameOver() {
      setInterval(() => {
        if (this.gameOver || this.hasWon) return
        
        const bodies = Matter.Composite.allBodies(this.engine.world)
        const now = Date.now()
        
        for (let body of bodies) {
          if (body.schoolLevel !== undefined && body.dropTime && !body.isRemoved) {
             if (now - body.dropTime > 2000) {
                if (body.position.y - this.schools[body.schoolLevel].radius < this.deathLineY) {
                   if (body.speed < 0.2) {
                     this.gameOver = true
                     this.saveToHistory()
                   }
                }
             }
          }
        }
      }, 1000)
    },

    restartGame() {
      this.stopGame()
      this.initGame()
    },

    drawOverlay() {
      const ctx = this.$refs.gameCanvas.getContext('2d')
      
      // Update and Draw Particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i]
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.1 // Gravity for particles
        p.life -= 0.02
        
        if (p.life <= 0) {
          this.particles.splice(i, 1)
          continue
        }
        
        ctx.save()
        ctx.globalAlpha = p.life
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      // Draw Death Line
      ctx.save()
      ctx.strokeStyle = '#ff6b6b'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(0, this.deathLineY)
      ctx.lineTo(this.canvasWidth, this.deathLineY)
      ctx.stroke()
      ctx.fillStyle = '#ff6b6b'
      ctx.font = '12px Arial'
      ctx.fillText('WARNING LINE', 10, this.deathLineY - 5)
      ctx.restore()

      // Draw Balls
      const bodies = Matter.Composite.allBodies(this.engine.world)
      bodies.forEach(body => {
        if (body.schoolLevel !== undefined && !body.isRemoved) {
          const school = this.schools[body.schoolLevel]
          const img = this.schoolImages[body.schoolLevel]
          const x = body.position.x
          const y = body.position.y
          const r = school.radius

          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(body.angle)
          
          if (img) {
            // Draw white background circle first
            ctx.beginPath()
            ctx.arc(0, 0, r, 0, Math.PI * 2)
            ctx.fillStyle = '#ffffff'
            ctx.fill()
            
            // Clip and draw image
            ctx.beginPath()
            ctx.arc(0, 0, r, 0, Math.PI * 2)
            ctx.clip()
            ctx.drawImage(img, -r, -r, r * 2, r * 2)
            
            // Add border
            ctx.strokeStyle = 'rgba(0,0,0,0.1)'
            ctx.lineWidth = 1
            ctx.stroke()
          } else {
            ctx.beginPath()
            ctx.arc(0, 0, r, 0, Math.PI * 2)
            ctx.fillStyle = school.color
            ctx.fill()
            ctx.fillStyle = '#fff'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(school.short, 0, 0)
          }
          ctx.restore()
        }
      })
    }
  }
}
</script>
