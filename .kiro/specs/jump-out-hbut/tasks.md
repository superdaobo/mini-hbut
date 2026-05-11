# 实现计划：跳出湖工大

## 概述

基于 Vue 3 + Three.js + Vite 技术栈，实现"跳出湖工大"2.5D 等距视角跳一跳小游戏模块。按依赖链从底层核心逻辑到顶层集成逐步构建，每个任务可独立执行和验证。

## 任务列表

- [x] 1. 项目骨架与配置
  - [x] 1.1 创建模块目录结构与 module.json
    - 创建 `website/modules-src/jump_out_hbut/` 目录
    - 创建 `module.json`，配置 id="jump_out_hbut"、name="跳出湖工大"、icon="🦘"、entry_path="index.html"、source_dir="project"
    - 创建 `project/` 目录及子目录：src/、src/components/、src/game/、src/renderer/、src/renderer/buildings/、src/services/、src/utils/、src/assets/audio/
    - _Requirements: 10.1, 10.2_
    - **DoD**: module.json 存在且 JSON 格式合法；目录结构与 design.md 一致

  - [x] 1.2 创建 package.json、vite.config.js、index.html
    - 创建 `project/package.json`：声明 vue ^3.4.0、three ^0.160.0 为 dependencies；@vitejs/plugin-vue ^5.0.0、vite ^5.0.0、vitest ^1.0.0、fast-check ^3.15.0、@vue/test-utils ^2.4.0、jsdom ^24.0.0 为 devDependencies
    - 创建 `project/vite.config.js`：base="./"、stripCrossOrigin 插件、Three.js manualChunks 分包
    - 创建 `project/index.html`：标准 Vue 3 入口 HTML
    - _Requirements: 10.3, 10.4, 10.5, 12.2, 12.3_
    - **DoD**: `npm install` 成功无报错；`vite build` 能执行（即使无源码也不报配置错误）

  - [x] 1.3 创建游戏常量与数学工具模块
    - 创建 `src/utils/constants.js`：定义 MAX_CHARGE_MS=2000、MIN_JUMP_DISTANCE=1.5、MAX_JUMP_DISTANCE=6.0、JUMP_HEIGHT 公式参数、连击倍率表、建筑尺寸/分数/颜色数据表、相机配置参数
    - 创建 `src/utils/math.js`：clamp()、lerp()、randomRange()、normalize2D()、computeParabolicY() 等纯数学工具函数
    - _Requirements: 1.2, 1.4, 3.5, 4.2, 12.4_
    - **DoD**: 导入无报错；constants 中所有数值与 design.md 一致；math.js 中每个函数可被单独调用


- [x] 2. 游戏核心逻辑（纯函数层）
  - [x] 2.1 实现 ChargeSystem（蓄力系统）
    - 创建 `src/game/ChargeSystem.js`
    - 实现 startCharge()、stopCharge()、getChargePercent()、isCharging()、reset()
    - 蓄力百分比 = clamp(elapsedTime / 2000, 0, 1)，线性累积
    - 达到 2000ms 自动锁定为 100%
    - _Requirements: 1.1, 1.2, 1.3_
    - **DoD**: 单元测试验证 0ms→0%、1000ms→50%、2000ms→100%、3000ms→100%

  - [ ]* 2.2 Property 1 属性测试：蓄力线性累积
    - **Property 1: 蓄力线性累积**
    - 使用 fast-check 生成 fc.integer({ min: 0, max: 5000 })
    - 验证 computePercent(t) === clamp(t / 2000, 0, 1)
    - **Validates: Requirements 1.2, 1.3**
    - **DoD**: `vitest --run` 通过，100+ 迭代无失败

  - [x] 2.3 实现 JumpController（跳跃控制器）
    - 创建 `src/game/JumpController.js`
    - 实现 jump(chargePercent, direction)、getProgress()、isJumping()、update(deltaTime)
    - 跳跃距离 = 1.5 + chargePercent * 4.5
    - 抛物线轨迹：y(t) = startY + height * 4 * t * (1-t)
    - 跳跃时长 = 400 + chargePercent * 200 ms
    - _Requirements: 1.4, 1.5, 12.4_
    - **DoD**: 给定 chargePercent=0.5，计算出 distance=3.75、duration=500ms；轨迹起点和终点 y 值相等

  - [ ]* 2.4 Property 2 属性测试：跳跃距离与蓄力成正比
    - **Property 2: 跳跃距离与蓄力成正比**
    - 使用 fast-check 生成 fc.double({ min: 0, max: 1, noNaN: true })
    - 验证 computeDistance(p) === 1.5 + p * 4.5
    - **Validates: Requirements 1.4**
    - **DoD**: `vitest --run` 通过，100+ 迭代无失败

  - [x] 2.5 实现 LandingDetector（落点判定器）
    - 创建 `src/game/LandingDetector.js`
    - 实现 detect(position, platforms) → LandingResult
    - 判定逻辑：maxOffset = max(|dx|/(w/2), |dz|/(d/2))
    - maxOffset <= 0.3 → perfect；0.3 < maxOffset <= 1.0 → normal；> 1.0 → miss
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
    - **DoD**: 单元测试覆盖中心点→perfect、边缘→normal、超出→miss 三种情况

  - [ ]* 2.6 Property 3 属性测试：落点判定分类正确性
    - **Property 3: 落点判定分类正确性**
    - 使用 fast-check 生成 fc.record({ dx, dz, width, depth })
    - 验证分类结果与 maxOffset 阈值一致
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
    - **DoD**: `vitest --run` 通过，100+ 迭代无失败

  - [x] 2.7 实现 ComboSystem（连击系统）
    - 创建 `src/game/ComboSystem.js`
    - 实现 recordLanding(type)、getState()、reset()
    - 连续 perfect → count++；normal → count=0
    - 倍率表：count<=1→1.0, 2→1.5, 3→2.0, >=4→2.5
    - _Requirements: 4.1, 4.2, 4.3, 11.2_
    - **DoD**: 单元测试验证连续 perfect 序列倍率递增、normal 重置、倍率不超过 2.5

  - [ ]* 2.8 Property 4 属性测试：连击状态机正确性
    - **Property 4: 连击状态机正确性**
    - 使用 fast-check 生成 fc.array(fc.constantFrom('perfect', 'normal'))
    - 验证任意序列下 multiplier 始终在 [1.0, 2.5] 且状态转换正确
    - **Validates: Requirements 4.1, 4.2, 4.3, 11.2**
    - **DoD**: `vitest --run` 通过，100+ 迭代无失败

  - [x] 2.9 实现 ScoreManager（分数管理器）
    - 创建 `src/game/ScoreManager.js`
    - 实现 addScore(baseScore, multiplier)、getTotal()、reset()
    - 本次得分 = floor(baseScore × multiplier)
    - 总分 = 所有单次得分之和
    - _Requirements: 3.6, 4.5, 11.1, 11.5_
    - **DoD**: 单元测试验证累加正确性、floor 取整、score 始终为非负整数

  - [ ]* 2.10 Property 5 属性测试：分数累积不变量
    - **Property 5: 分数累积不变量**
    - 使用 fast-check 生成 fc.array(fc.record({ baseScore: fc.integer({min:1,max:4}), multiplier: fc.constantFrom(1.0,1.5,2.0,2.5) }))
    - 验证 total === sum(floor(baseScore_i × multiplier_i))
    - **Validates: Requirements 3.6, 4.5, 11.1**
    - **DoD**: `vitest --run` 通过，100+ 迭代无失败

  - [x] 2.11 实现 PlatformGenerator（平台生成器）
    - 创建 `src/game/PlatformGenerator.js`
    - 实现 generateNext(currentPlatform, score)、getInitialPlatform()、reset()
    - 方向随机 left/right（±45°）
    - 距离 = currentWidth * randomRange(1.2, 3.0)，高分时 ×1.0~1.3
    - 建筑类型按分数阶段概率分布选择
    - _Requirements: 3.2, 3.4, 3.5_
    - **DoD**: 生成 100 个平台，验证距离均在合法范围内、类型分布符合分数阶段规则

  - [ ]* 2.12 Property 6 属性测试：平台生成距离约束
    - **Property 6: 平台生成距离约束**
    - 使用 fast-check 生成 fc.record({ width: fc.double({min:1,max:4}), score: fc.integer({min:0,max:3000}) })
    - 验证生成平台距离在 [1.2*w, 3.0*w*1.3] 范围内，方向为 ±45°
    - **Validates: Requirements 3.4**
    - **DoD**: `vitest --run` 通过，100+ 迭代无失败


- [ ] 3. Checkpoint - 核心逻辑验证
  - 确保所有核心逻辑模块的单元测试和属性测试通过
  - 运行 `vitest --run`，确认无失败用例
  - 如有问题请询问用户

- [x] 4. Three.js 渲染层
  - [x] 4.1 实现 SceneManager（场景管理器）
    - 创建 `src/renderer/SceneManager.js`
    - 初始化 Three.js 场景：WebGLRenderer、Scene、环境光 + 平行光
    - 配置阴影：shadowMap enabled、分辨率 512×512
    - 实现 render loop（requestAnimationFrame）
    - 实现 resize 响应式适配（debounce 100ms）
    - 设置 pixelRatio = min(devicePixelRatio, 2)
    - _Requirements: 5.1, 5.4, 9.4, 12.1_
    - **DoD**: 在浏览器中能渲染出空场景（带光照）；resize 时画面不变形

  - [x] 4.2 实现 CameraController（相机控制器）
    - 创建 `src/renderer/CameraController.js`
    - 使用 OrthographicCamera，frustumSize=12
    - 等距视角：position(10,10,10) lookAt(0,0,0)
    - 实现 followTarget(targetPos, duration=300ms) 缓动跟随（easeOutCubic）
    - 实现 resize(width, height) 更新视锥体
    - _Requirements: 5.3, 9.4, 12.1_
    - **DoD**: 相机能跟随目标平滑移动；窗口 resize 后画面比例正确

  - [x] 4.3 实现 PlayerRenderer（角色渲染器）
    - 创建 `src/renderer/PlayerRenderer.js`
    - 创建角色几何体（CylinderGeometry / 胶囊体）
    - 实现蓄力压缩动画：Y 轴 scale = 1.0 - 0.4 * chargePercent
    - 实现跳跃飞行时位置更新
    - 实现落地恢复动画
    - _Requirements: 5.5, 1.1_
    - **DoD**: 角色可见；蓄力时 Y 轴缩放从 1.0 到 0.6 线性变化

  - [ ]* 4.4 Property 9 属性测试：角色蓄力压缩动画
    - **Property 9: 角色蓄力压缩动画**
    - 使用 fast-check 生成 fc.double({ min: 0, max: 1, noNaN: true })
    - 验证 computeScale(p) === 1.0 - 0.4 * p
    - **Validates: Requirements 5.5**
    - **DoD**: `vitest --run` 通过，100+ 迭代无失败

  - [x] 4.5 实现 ParticleSystem（粒子特效系统）
    - 创建 `src/renderer/ParticleSystem.js`
    - 实现对象池（预分配 50 个粒子）
    - 实现 emit(position, count=20~30)：完美着陆时粒子从落点向四周扩散
    - 粒子生命周期 400ms，自动回收到池中
    - _Requirements: 5.6, 2.2_
    - **DoD**: 调用 emit() 后粒子可见并在 400ms 后消失；对象池无内存泄漏

  - [x] 4.6 实现 BuildingFactory 入口
    - 创建 `src/renderer/buildings/BuildingFactory.js`
    - 实现 create(type) → THREE.Group、getSize(type)、getBaseScore(type)
    - 根据 BuildingType 分发到对应建筑模块
    - 尺寸和分数数据从 constants.js 读取
    - _Requirements: 3.1, 3.3, 3.5_
    - **DoD**: 调用 create('library') 返回有效 THREE.Group；getSize/getBaseScore 返回值与 design.md 数据表一致


- [x] 5. 12 种建筑 Low-Poly 模型
  - [x] 5.1 实现图书馆（Library）模型
    - 创建 `src/renderer/buildings/Library.js`
    - 3 层方块堆叠（底宽中窄顶最窄）+ 正面半透明蓝色玻璃幕墙
    - 主色 #5B7B8A，玻璃 #87CEEB（opacity: 0.6）
    - 尺寸 3.0×2.5×2.0
    - _Requirements: 3.1, 3.3_
    - **DoD**: create() 返回 THREE.Group，子 mesh 数量 >= 3；boundingBox 尺寸近似 3.0×2.5×2.0

  - [x] 5.2 实现工程技术综合楼（EngineeringBuilding）模型
    - 创建 `src/renderer/buildings/EngineeringBuilding.js`
    - 高层主体 + 侧翼低矮方块 + 顶部设备层
    - 主色 #8B4513，尺寸 2.8×2.2×2.5
    - _Requirements: 3.1, 3.3_
    - **DoD**: create() 返回有效 THREE.Group；材质颜色正确

  - [x] 5.3 实现体育馆（Gymnasium）模型
    - 创建 `src/renderer/buildings/Gymnasium.js`
    - 方形基座 + 半球体屋顶 + 4 根柱子
    - 主色 #A8A8A8，尺寸 3.2×3.2×1.8
    - _Requirements: 3.1, 3.3_
    - **DoD**: create() 返回有效 THREE.Group；含 SphereGeometry 子对象

  - [x] 5.4 实现南门（SouthGate）模型
    - 创建 `src/renderer/buildings/SouthGate.js`
    - 两侧门柱 + 顶部横梁 + 牌匾
    - 主色 #8B0000，牌匾 #FFD700，尺寸 2.2×1.5×1.8
    - _Requirements: 3.1, 3.3_
    - **DoD**: create() 返回有效 THREE.Group

  - [x] 5.5 实现北门（NorthGate）模型
    - 创建 `src/renderer/buildings/NorthGate.js`
    - 现代风格斜柱 + 水平横梁
    - 主色 #4A4A4A，尺寸 2.0×1.5×1.6
    - _Requirements: 3.1, 3.3_
    - **DoD**: create() 返回有效 THREE.Group

  - [x] 5.6 实现食堂（Canteen）模型
    - 创建 `src/renderer/buildings/Canteen.js`
    - 扁平宽大方块 + 暖色调斜屋顶
    - 主色 #D2691E，屋顶 #FF8C00，尺寸 2.5×2.0×1.2
    - _Requirements: 3.1, 3.3_
    - **DoD**: create() 返回有效 THREE.Group

  - [x] 5.7 实现教学楼（TeachingBuilding）模型
    - 创建 `src/renderer/buildings/TeachingBuilding.js`
    - 标准方块 + 正面 3×4 窗户凹槽阵列
    - 主色 #6B8E9B，窗户 #1C3A4A，尺寸 2.2×1.8×1.8
    - _Requirements: 3.1, 3.3_
    - **DoD**: create() 返回有效 THREE.Group；含窗户子对象

  - [x] 5.8 实现实验楼（Laboratory）模型
    - 创建 `src/renderer/buildings/Laboratory.js`
    - 灰白色方块 + 屋顶 2-3 个圆柱烟囱
    - 主色 #B0B0B0，烟囱 #808080，尺寸 2.0×1.8×2.0
    - _Requirements: 3.1, 3.3_
    - **DoD**: create() 返回有效 THREE.Group；含 CylinderGeometry 子对象

  - [x] 5.9 实现宿舍楼（Dormitory）模型
    - 创建 `src/renderer/buildings/Dormitory.js`
    - 窄高方块 + 侧面 4-6 层阳台凸起
    - 主色 #CD5C5C，阳台 #E8A0A0，尺寸 1.5×1.2×2.2
    - _Requirements: 3.1, 3.3_
    - **DoD**: create() 返回有效 THREE.Group

  - [x] 5.10 实现行政楼（AdminBuilding）模型
    - 创建 `src/renderer/buildings/AdminBuilding.js`
    - 对称方块 + 中央门廊凸出
    - 主色 #F5DEB3，门廊 #DEB887，尺寸 2.2×1.8×1.6
    - _Requirements: 3.1, 3.3_
    - **DoD**: create() 返回有效 THREE.Group

  - [x] 5.11 实现活动中心（ActivityCenter）模型
    - 创建 `src/renderer/buildings/ActivityCenter.js`
    - 不规则多边形组合 + 圆柱装饰
    - 主色 #4682B4，装饰 #5F9EA0，尺寸 2.0×2.0×1.5
    - _Requirements: 3.1, 3.3_
    - **DoD**: create() 返回有效 THREE.Group

  - [x] 5.12 实现地铁站（MetroStation）模型
    - 创建 `src/renderer/buildings/MetroStation.js`
    - 低矮方块 + 圆形 M 标志 + 斜坡入口
    - 主色 #003DA5，标志 #FFD700，尺寸 1.5×1.5×0.8
    - _Requirements: 3.1, 3.3_
    - **DoD**: create() 返回有效 THREE.Group

  - [x] 5.13 实现南湖桥（NanhuBridge）模型
    - 创建 `src/renderer/buildings/NanhuBridge.js`
    - 长条弧形桥面 + 两侧栏杆 + 弧形装饰（TubeGeometry）
    - 主色 #808080，栏杆 #A0A0A0，尺寸 4.0×1.0×0.5
    - _Requirements: 3.1, 3.3_
    - **DoD**: create() 返回有效 THREE.Group；宽度明显大于深度


- [ ] 6. Checkpoint - 渲染层验证
  - 确保 SceneManager 可初始化、所有 13 种建筑模型可创建
  - BuildingFactory.create(type) 对所有 type 返回有效 THREE.Group
  - 如有问题请询问用户

- [x] 7. 服务层
  - [x] 7.1 实现 InputHandler（输入处理器）
    - 创建 `src/services/InputHandler.js`
    - 统一处理 pointer events（兼容触摸和鼠标）
    - 暴露 onPressStart / onPressEnd 回调
    - 防止触摸和鼠标事件同时触发（互斥标志）
    - 处理页面失焦（visibilitychange）暂停
    - _Requirements: 1.1, 9.3_
    - **DoD**: 在桌面浏览器中 mousedown/mouseup 能触发回调；触摸事件同理

  - [x] 7.2 实现 AudioManager（音效管理器）
    - 创建 `src/services/AudioManager.js`
    - 使用 Web Audio API 加载和播放音效
    - 支持 6 种音效：charge、jump、land、perfect、fall、combo
    - 实现静音开关 + localStorage 持久化
    - 首次用户交互时 resume AudioContext
    - 音效加载失败时静默降级
    - _Requirements: 7.1, 7.2, 7.3, 12.5_
    - **DoD**: play('jump') 不报错；setMuted(true) 后 isMuted() 返回 true；localStorage 中有 muted 状态

  - [x] 7.3 实现 PerformanceMonitor（性能监控器）
    - 创建 `src/services/PerformanceMonitor.js`
    - 每帧记录帧率，计算滑动窗口平均值
    - 连续 10 帧 < 45fps → 降级 Level 1（关闭阴影、粒子减半）
    - 连续 10 帧 < 30fps → 降级 Level 2（关闭粒子、简化几何体）
    - 暴露 getLevel() 和 onLevelChange 回调
    - _Requirements: 5.2, 9.5_
    - **DoD**: 模拟低帧率输入后 getLevel() 返回正确降级等级

  - [x] 7.4 复制并适配 game_rank.js
    - 从现有模块复制 `game_rank.js` 到 `src/utils/game_rank.js`
    - 适配接口：readGameModuleContext()、createRunId()、submitGameRank()、fetchGameLeaderboard()
    - 确保 game_id 为 "jump_out_hbut"
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
    - **DoD**: 导入无报错；readGameModuleContext() 可调用（返回默认值或从 URL/localStorage 读取）


- [x] 8. GameEngine 主控与状态机
  - [x] 8.1 实现 StateMachine（游戏状态机）
    - 创建 `src/game/StateMachine.js`
    - 状态：idle → charging → jumping → landed → gameover
    - 状态转换规则严格按 design.md 状态图
    - 仅在 idle 状态接受新的蓄力输入（防快速连点）
    - _Requirements: 8.1, 1.5_
    - **DoD**: 单元测试验证合法/非法状态转换；idle→charging→jumping→landed→idle 循环正确

  - [x] 8.2 实现 GameEngine（游戏引擎主控）
    - 创建 `src/game/GameEngine.js`
    - 整合所有核心模块：ChargeSystem、JumpController、LandingDetector、ComboSystem、ScoreManager、PlatformGenerator
    - 整合渲染层：SceneManager、CameraController、PlayerRenderer、ParticleSystem、BuildingFactory
    - 整合服务层：InputHandler、AudioManager、PerformanceMonitor
    - 实现 init(container)、start()、reset()、destroy() 生命周期
    - 实现 update loop：每帧调用各子系统 update
    - 实现事件系统：on/off(event, handler)
    - 触觉反馈：Vibration API（普通着陆 50ms、完美 100ms、失败 200ms）
    - _Requirements: 1.5, 1.6, 2.4, 5.2, 7.4, 8.1_
    - **DoD**: GameEngine.init() 不报错；start() 后状态为 idle；输入触发完整 charge→jump→land 流程


- [ ] 9. Checkpoint - 游戏引擎集成验证
  - GameEngine 可初始化并启动游戏循环
  - 输入 → 蓄力 → 跳跃 → 落地 → 计分 全链路可运行
  - 确保所有测试通过，如有问题请询问用户

- [x] 10. Vue 组件层
  - [x] 10.1 实现 main.js 与 App.vue（根组件）
    - 创建 `src/main.js`：Vue 3 createApp 入口
    - 创建 `src/App.vue`：根组件，管理游戏状态路由（start / playing / gameover / leaderboard）
    - 创建 `src/style.css`：全局样式（reset + 游戏容器全屏）
    - 通过 reactive state 控制显示哪个子组件
    - _Requirements: 8.1, 12.2_
    - **DoD**: 浏览器中能渲染出 App 组件；状态切换时显示对应子组件

  - [x] 10.2 实现 StartScreen.vue（开始界面）
    - 创建 `src/components/StartScreen.vue`
    - 显示游戏标题"跳出湖工大"、最高分记录、"开始游戏"按钮、"排行榜"按钮
    - 首次进入显示操作提示"按住蓄力，松开跳跃"（3s 后自动消失）
    - emit 事件：startGame、showLeaderboard
    - _Requirements: 8.2, 8.5_
    - **DoD**: 组件渲染正确；点击"开始游戏"触发 startGame 事件

  - [x] 10.3 实现 GameHUD.vue（游戏中 HUD）
    - 创建 `src/components/GameHUD.vue`
    - 显示当前分数、连击数（带动画）、跳跃次数
    - 蓄力进度条（达到 100% 变色闪烁）
    - 静音按钮
    - UI 元素定位在屏幕顶部，不遮挡游戏主体
    - _Requirements: 8.3, 1.3, 4.4, 7.2_
    - **DoD**: 组件渲染正确；分数/连击数响应式更新；静音按钮可切换

  - [x] 10.4 实现 GameOverScreen.vue（游戏结束界面）
    - 创建 `src/components/GameOverScreen.vue`
    - 显示本次得分、最高分、跳跃次数、游戏时长
    - "再来一局"按钮、"查看排行榜"按钮
    - 显示本次排名（从排名服务获取）
    - emit 事件：restart、showLeaderboard
    - _Requirements: 8.4, 6.3_
    - **DoD**: 组件渲染正确；点击按钮触发对应事件

  - [x] 10.5 实现 LeaderboardPanel.vue（排行榜面板）
    - 创建 `src/components/LeaderboardPanel.vue`
    - 调用 fetchGameLeaderboard() 获取班级排行榜（scope="class", limit=20）
    - 列表展示排名、玩家名、分数
    - 加载中/错误/空状态处理
    - 网络失败显示"排行榜暂时不可用" + 重试按钮
    - emit 事件：close
    - _Requirements: 6.4, 6.5_
    - **DoD**: 组件渲染正确；模拟数据时列表正确展示；错误状态显示友好提示


- [x] 11. 排名系统集成
  - [x] 11.1 集成 readGameModuleContext 上下文读取
    - 在 GameEngine 或 App.vue 初始化时调用 readGameModuleContext()
    - 读取 student_id、player_name、class_name、rank_api
    - 缺失参数时使用默认值，排名功能降级但游戏可玩
    - _Requirements: 6.1_
    - **DoD**: 启动时能读取上下文；缺失参数不导致崩溃

  - [x] 11.2 集成 submitGameRank 分数提交
    - 游戏结束时调用 submitGameRank()
    - payload：game_id="jump_out_hbut"、score、max_level=跳跃次数、duration_ms、move_count=跳跃次数、ended_reason="fall"
    - 每局开始调用 createRunId() 生成唯一 run_id
    - 提交失败时显示友好提示，不阻塞游戏
    - _Requirements: 6.2, 6.5, 6.6, 11.3, 11.4, 11.5_
    - **DoD**: 游戏结束后 submitGameRank 被调用且参数格式正确；网络失败时不崩溃

  - [ ]* 11.3 Property 7 & 8 属性测试：Run ID 唯一性与提交数据有效性
    - **Property 7: Run ID 唯一性**
    - 使用 fast-check 生成 fc.integer({ min: 10, max: 1000 })
    - 验证 N 次 createRunId() 返回值全部不同
    - **Property 8: 分数提交数据有效性**
    - 使用 fast-check 生成 fc.record({ score, jumps, duration })
    - 验证 score>=0 整数、move_count>=0 整数、duration_ms>0 整数、score <= move_count * 10
    - **Validates: Requirements 6.6, 11.4, 11.5**
    - **DoD**: `vitest --run` 通过，100+ 迭代无失败

  - [x] 11.4 集成 fetchGameLeaderboard 排行榜获取
    - LeaderboardPanel 中调用 fetchGameLeaderboard({ scope: "class", limit: 20 })
    - 处理加载/成功/失败三种状态
    - 超时 12s 使用 AbortController 取消
    - _Requirements: 6.4, 6.5_
    - **DoD**: 排行榜面板能展示数据或错误提示；超时后请求被取消


- [ ] 12. Checkpoint - 全功能集成验证
  - Vue 组件层 + GameEngine + 排名服务全部连通
  - 完整游戏流程可运行：开始 → 游戏 → 结束 → 排行榜
  - 确保所有测试通过，如有问题请询问用户

- [ ] 13. 测试补全与质量保障
  - [ ]* 13.1 补全所有 Property 1-9 的 fast-check 属性测试
    - 确保 `src/__tests__/` 或同级 `*.test.js` 中包含所有 9 个属性测试
    - 每个属性测试至少 100 次迭代
    - 测试文件头部注释标注对应 Property 编号
    - **Validates: Requirements 1.2, 1.3, 1.4, 2.1-2.4, 3.4, 4.1-4.3, 6.6, 11.1-11.5, 5.5**
    - **DoD**: `vitest --run` 全部通过

  - [ ]* 13.2 补全单元测试（边界值）
    - ChargeSystem：0ms、1ms、1999ms、2000ms、2001ms
    - JumpController：chargePercent=0、0.5、1.0 的轨迹关键点
    - LandingDetector：恰好在 0.3 线上、恰好在 1.0 线上
    - ComboSystem：空序列、全 perfect、全 normal、交替序列
    - ScoreManager：baseScore=0、multiplier=2.5、大量累加溢出检查
    - PlatformGenerator：score=0/500/1500 边界的类型分布
    - **DoD**: `vitest --run` 全部通过；覆盖所有边界条件

  - [ ]* 13.3 构建验证
    - 运行 `vite build`，确认无报错
    - 检查 dist/ 产物结构：index.html + assets/
    - 验证产物中无 crossorigin 属性
    - 验证 gzip 后总大小（不含 three.js chunk）< 800KB
    - _Requirements: 10.3, 10.4, 10.5_
    - **DoD**: `vite build` 成功；产物符合大小约束

- [x] 14. 部署与集成
  - [x] 14.1 更新 catalog.json
    - 在 `website/public/modules/main/catalog.json` 中添加 jump_out_hbut 模块条目
    - 确保 order、id、name、icon 等字段正确
    - _Requirements: 10.1, 10.2_
    - **DoD**: catalog.json 合法 JSON；包含 jump_out_hbut 条目

  - [x] 14.2 最终构建产物验证
    - 运行完整构建流程
    - 验证 dist/ 可被宿主应用 iframe 加载
    - 确认模块在 catalog 中可被发现
    - _Requirements: 10.3, 10.4, 10.5, 9.2_
    - **DoD**: 构建成功；产物结构完整；gzip 总大小 < 800KB

- [ ] 15. Final Checkpoint - 全部完成
  - 所有测试通过（`vitest --run`）
  - 构建成功（`vite build`）
  - 模块可被宿主应用加载
  - 确保所有测试通过，如有问题请询问用户

## 备注

- 标记 `*` 的子任务为可选测试任务，可跳过以加速 MVP 交付
- 每个任务引用具体需求编号（Requirements X.Y）以确保可追溯性
- Checkpoint 任务确保增量验证，及早发现问题
- 属性测试验证设计文档中定义的 Correctness Properties
- 单元测试验证边界条件和特定示例
