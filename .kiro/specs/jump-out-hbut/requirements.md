# Requirements Document

## Introduction

"跳出湖工大"是一款类似微信"跳一跳"的 2.5D 等距视角跳跃小游戏模块。玩家通过按住蓄力、松开跳跃的方式，在以湖北工业大学标志性建筑为原型的平台之间跳跃，获取分数并挑战排行榜。游戏以 Low-Poly 风格呈现校园建筑，部署为 `website/modules-src/jump_out_hbut/` 下的独立模块，技术栈采用 Vue 3 + Vite + Three.js。

## Glossary

- **Game_Engine**: 基于 Three.js 的 2.5D 等距视角渲染引擎，负责场景渲染、相机控制和动画循环
- **Player_Character**: 玩家控制的跳跃角色，以简约几何体（圆柱/胶囊体）表示
- **Building_Platform**: 以湖工大真实建筑为原型的跳跃平台，具有不同尺寸、形状和分数权重
- **Charge_System**: 蓄力跳跃系统，按住时间决定跳跃距离和高度
- **Landing_Detector**: 落点判定系统，检测角色是否成功落在目标平台上
- **Combo_System**: 连击奖励系统，连续精准落在平台中心区域时触发额外分数
- **Score_Manager**: 分数管理器，负责计算、累加和展示当前分数
- **Rank_Service**: 排名服务客户端，基于 game_rank.js 工具库与后端排行榜 API 通信
- **Platform_Generator**: 平台生成器，按照预设规则随机生成下一个建筑平台的位置和类型
- **Camera_Controller**: 相机控制器，跟随角色跳跃平滑移动视角
- **Audio_Manager**: 音效管理器，负责播放蓄力、跳跃、落地、失败等音效
- **Module_Shell**: 模块外壳，负责与宿主应用通信、读取 URL 参数、管理生命周期

## Requirements

### Requirement 1: 游戏核心跳跃机制

**User Story:** As a 玩家, I want 通过按住屏幕蓄力并松开来控制角色跳跃, so that 我可以精确控制跳跃距离落在目标平台上

#### Acceptance Criteria

1. WHEN 玩家按下（触摸/鼠标左键）屏幕任意位置, THE Charge_System SHALL 开始蓄力并以线性速率累积跳跃能量，同时播放蓄力动画（角色压缩变形）
2. WHILE 玩家持续按住屏幕, THE Charge_System SHALL 在 0ms 到 2000ms 范围内线性累积能量值（0% 到 100%），并通过蓄力进度条向玩家展示当前能量百分比
3. WHEN 蓄力时间达到 2000ms 上限, THE Charge_System SHALL 自动锁定能量值为 100% 并通过视觉反馈（进度条变色/闪烁）提示玩家已达最大蓄力
4. WHEN 玩家松开（触摸结束/鼠标抬起）, THE Player_Character SHALL 根据当前蓄力百分比沿 45 度抛物线轨迹跳出，跳跃距离与蓄力百分比成正比
5. WHILE Player_Character 处于跳跃飞行状态, THE Game_Engine SHALL 以 60fps 渲染抛物线运动轨迹，并禁止玩家再次输入直到落地判定完成
6. WHEN Player_Character 落地, THE Landing_Detector SHALL 在 50ms 内完成落点判定并返回判定结果（成功落在平台上/落空失败）

### Requirement 2: 落点判定与失败处理

**User Story:** As a 玩家, I want 获得清晰的落点反馈, so that 我知道跳跃是否成功以及精准程度

#### Acceptance Criteria

1. WHEN Player_Character 落在 Building_Platform 表面范围内, THE Landing_Detector SHALL 判定为成功着陆并触发落地动画（角色恢复形状 + 平台轻微下沉回弹）
2. WHEN Player_Character 落在 Building_Platform 中心区域（平台宽度 30% 范围内）, THE Landing_Detector SHALL 判定为"完美着陆"并触发特殊视觉特效（粒子爆发 + 屏幕闪光）
3. WHEN Player_Character 落在 Building_Platform 边缘区域（平台宽度 30%-100% 范围）, THE Landing_Detector SHALL 判定为"普通着陆"并触发标准落地动画
4. WHEN Player_Character 未落在任何 Building_Platform 上, THE Landing_Detector SHALL 判定为失败，触发坠落动画（角色下坠消失），并在 800ms 后显示游戏结束界面
5. IF Player_Character 落在平台边缘且重心超出平台边界, THEN THE Landing_Detector SHALL 判定为失败并播放滑落动画

### Requirement 3: 建筑平台系统

**User Story:** As a 玩家, I want 在湖工大标志性建筑之间跳跃, so that 我在游戏中感受到校园文化氛围

#### Acceptance Criteria

1. THE Platform_Generator SHALL 提供至少 12 种不同的建筑平台类型，每种以 Three.js 几何体组合（BoxGeometry / CylinderGeometry / 组合体）搭建简化 Low-Poly 3D 模型（非纯贴图）：
   - **图书馆**（大型）— 多层方块堆叠 + 玻璃幕墙材质，蓝灰色
   - **工程技术综合楼**（大型）— 高层方块群组合，红棕色外墙
   - **体育馆**（大型）— 半球体/圆弧屋顶 + 方形基座
   - **南门**（中型）— 拱形门洞结构 + 校名牌匾
   - **北门**（中型）— 现代风格门柱 + 横梁
   - **学生餐厅/食堂**（中型）— 扁平方块 + 暖色调屋顶
   - **教学楼**（中型）— 标准蓝灰色方块 + 窗户凹槽阵列
   - **实验楼**（中型）— 灰白色方块 + 屋顶设备/烟囱凸起
   - **学生宿舍楼**（小型）— 窄高方块 + 阳台凸起层，红/橙色
   - **行政楼**（中型）— 对称方块 + 中央入口凸出
   - **大学生活动中心**（中型）— 不规则多边形组合，现代感
   - **地铁站（七号线湖工大站）**（小型）— 圆形 M 标志 + 地下入口斜坡
   - **南湖桥/景观桥**（特殊长条形）— 长条弧形平台，跨度大但宽度窄
2. WHEN 生成新平台时, THE Platform_Generator SHALL 根据当前分数阶段调整平台尺寸分布：0-500 分以大中型为主（70%），500-1500 分大中小均匀分布，1500 分以上小型平台占比提升至 50%
3. THE Building_Platform SHALL 以 Low-Poly 风格的 3D 几何体呈现，每种建筑具有独特的颜色方案和简化轮廓特征（如图书馆为蓝灰色方块带书本装饰，体育馆为圆顶结构）
4. WHEN 生成下一个平台时, THE Platform_Generator SHALL 将新平台放置在当前平台的左前方或右前方（随机二选一），距离范围为当前平台宽度的 1.2 倍到 3.0 倍之间
5. THE Building_Platform SHALL 具有与建筑类型对应的分数权重：小型平台（宿舍楼/地铁站）基础分 3 分，中型平台（教学楼/食堂/实验楼/行政楼/活动中心/南门/北门）基础分 2 分，大型平台（图书馆/体育馆/工程技术综合楼）基础分 1 分，特殊平台（南湖桥）基础分 4 分
6. WHEN 玩家成功着陆, THE Score_Manager SHALL 将该平台的基础分乘以连击倍率后累加到总分

### Requirement 4: 连击奖励系统

**User Story:** As a 玩家, I want 连续精准跳跃时获得额外奖励, so that 我有动力追求更高的操作精度

#### Acceptance Criteria

1. WHEN 玩家连续完成"完美着陆"（落在平台中心 30% 区域）, THE Combo_System SHALL 累加连击计数器并显示当前连击数（如 "x2", "x3"）
2. THE Combo_System SHALL 按以下规则计算连击倍率：连击 1 次倍率 1.0，连击 2 次倍率 1.5，连击 3 次倍率 2.0，连击 4 次及以上倍率 2.5（封顶）
3. WHEN 玩家完成"普通着陆"（非中心区域）, THE Combo_System SHALL 将连击计数器重置为 0，倍率恢复为 1.0
4. WHEN 连击计数器增加, THE Combo_System SHALL 在屏幕上方显示连击数动画（数字放大弹出 + 渐隐），持续 600ms
5. FOR ALL 分数计算, THE Score_Manager SHALL 使用公式：本次得分 = 平台基础分 × 连击倍率，且最终得分为整数（向下取整）

### Requirement 5: 视觉渲染与动效

**User Story:** As a 玩家, I want 看到流畅美观的 Low-Poly 风格校园场景, so that 游戏体验愉悦且具有辨识度

#### Acceptance Criteria

1. THE Game_Engine SHALL 使用 Three.js 以等距视角（Isometric，相机俯角约 45 度）渲染游戏场景
2. THE Game_Engine SHALL 维持 60fps 的渲染帧率，当检测到连续 10 帧低于 45fps 时自动降低渲染质量（减少粒子数量、简化阴影）
3. THE Camera_Controller SHALL 在角色跳跃后以 300ms 的缓动动画（ease-out）平滑跟随角色移动到新平台位置
4. THE Game_Engine SHALL 使用柔和的环境光 + 平行光照明方案，投射简化阴影以增强立体感
5. WHEN Player_Character 蓄力时, THE Game_Engine SHALL 播放角色压缩动画（Y 轴缩放从 1.0 线性降至 0.6）和当前平台轻微下沉动画（Y 轴位移 -0.05 单位）
6. WHEN Player_Character 完美着陆, THE Game_Engine SHALL 播放粒子爆发特效（20-30 个彩色粒子从落点向四周扩散，持续 400ms）

### Requirement 6: 排名系统集成

**User Story:** As a 玩家, I want 游戏结束后提交分数并查看排行榜, so that 我可以与同学比较成绩

#### Acceptance Criteria

1. THE Module_Shell SHALL 在游戏启动时通过 URL 参数和 localStorage 读取玩家上下文信息（student_id、player_name、class_name、rank_api），使用 readGameModuleContext() 接口
2. WHEN 游戏结束, THE Rank_Service SHALL 调用 submitGameRank() 提交分数，payload 包含：game_id 为 "jump_out_hbut"、score 为最终总分、max_level 为跳跃次数、duration_ms 为游戏时长、move_count 为跳跃次数、ended_reason 为 "fall"（坠落）或 "finished"（主动结束）
3. WHEN 分数提交成功, THE Rank_Service SHALL 在游戏结束界面显示玩家本次排名和历史最高分
4. WHEN 玩家点击"排行榜"按钮, THE Rank_Service SHALL 调用 fetchGameLeaderboard() 获取班级排行榜（默认 scope 为 "class"，limit 为 20）并以列表形式展示
5. IF 网络请求失败或超时, THEN THE Rank_Service SHALL 显示友好的错误提示（"排行榜暂时不可用"），不阻塞游戏流程，玩家仍可重新开始游戏
6. THE Rank_Service SHALL 在每次游戏开始时调用 createRunId() 生成唯一的 run_id，用于标识本次游戏会话

### Requirement 7: 音效与触觉反馈

**User Story:** As a 玩家, I want 听到与操作对应的音效反馈, so that 游戏操作手感更加丰富

#### Acceptance Criteria

1. THE Audio_Manager SHALL 在以下事件播放对应音效：蓄力开始（低频持续音）、跳跃起飞（弹跳音）、普通着陆（沉稳落地音）、完美着陆（清脆高音 + 奖励音）、坠落失败（下坠音）、连击触发（递进音阶）
2. THE Audio_Manager SHALL 支持静音开关，玩家可通过界面按钮切换，静音状态持久化到 localStorage
3. THE Audio_Manager SHALL 使用 Web Audio API 播放音效，所有音效文件总大小不超过 500KB
4. WHEN 玩家在支持 Vibration API 的移动设备上操作, THE Game_Engine SHALL 在跳跃落地时触发短振动反馈（普通着陆 50ms，完美着陆 100ms，失败 200ms）

### Requirement 8: 游戏界面与流程

**User Story:** As a 玩家, I want 清晰的游戏界面和流畅的流程引导, so that 我可以快速上手并反复游玩

#### Acceptance Criteria

1. THE Module_Shell SHALL 提供以下游戏界面状态：开始界面、游戏进行中、游戏结束界面
2. WHEN 游戏处于开始界面, THE Module_Shell SHALL 显示游戏标题"跳出湖工大"、最高分记录、"开始游戏"按钮和"排行榜"按钮
3. WHILE 游戏进行中, THE Module_Shell SHALL 在屏幕顶部显示当前分数、连击数和跳跃次数，UI 元素不遮挡游戏主体区域
4. WHEN 游戏结束, THE Module_Shell SHALL 显示本次得分、最高分、跳跃次数、游戏时长，以及"再来一局"和"查看排行榜"按钮
5. THE Module_Shell SHALL 在首次进入游戏时显示简短操作提示（"按住蓄力，松开跳跃"），3 秒后自动消失或玩家点击后消失

### Requirement 9: 性能与兼容性

**User Story:** As a 玩家, I want 游戏在手机和电脑上都能流畅运行, so that 我可以在任何设备上游玩

#### Acceptance Criteria

1. THE Game_Engine SHALL 在主流移动设备（iOS Safari 15+、Android Chrome 90+）和桌面浏览器（Chrome 90+、Firefox 90+、Edge 90+）上正常运行
2. THE Game_Engine SHALL 确保首屏加载时间不超过 3 秒（在 4G 网络环境下，资源总大小不超过 2MB）
3. THE Game_Engine SHALL 同时支持触摸事件（touchstart/touchend）和鼠标事件（mousedown/mouseup），两种输入方式体验一致
4. THE Game_Engine SHALL 响应式适配不同屏幕尺寸（最小支持 320px 宽度），游戏画面自动缩放且不出现裁切
5. IF 设备 GPU 性能不足导致帧率持续低于 30fps, THEN THE Game_Engine SHALL 自动切换到简化渲染模式（关闭阴影、减少多边形数量、禁用粒子特效）

### Requirement 10: 模块打包与部署

**User Story:** As a 开发者, I want 游戏模块遵循项目统一的构建和部署规范, so that 模块可以无缝集成到宿主应用中

#### Acceptance Criteria

1. THE Module_Shell SHALL 以 `website/modules-src/jump_out_hbut/` 为模块根目录，包含 `module.json` 配置文件和 `project/` 源码目录
2. THE Module_Shell SHALL 提供 module.json 配置：id 为 "jump_out_hbut"、name 为 "跳出湖工大"、icon 为 "🦘"、entry_path 为 "index.html"、source_dir 为 "project"
3. THE Module_Shell SHALL 使用 Vite 构建工具，配置 base 为 "./"（相对路径），输出目录为 dist/，构建产物为纯静态 HTML/JS/CSS
4. THE Module_Shell SHALL 在 Vite 配置中移除 crossorigin 属性（与现有模块一致），确保在 Capacitor WebView iframe 中正常加载
5. THE Module_Shell SHALL 使用 Vue 3 作为 UI 框架，Three.js 作为 3D 渲染引擎，构建产物 gzip 后总大小不超过 800KB（不含 Three.js 库本身的 CDN 加载场景）

### Requirement 11: 分数计算正确性与防作弊

**User Story:** As a 系统管理员, I want 分数计算逻辑正确且具备基本防作弊能力, so that 排行榜数据真实可信

#### Acceptance Criteria

1. FOR ALL 游戏会话, THE Score_Manager SHALL 保证总分等于所有成功着陆的单次得分之和，且单次得分 = 平台基础分 × 连击倍率（向下取整）
2. THE Score_Manager SHALL 保证连击倍率始终在 1.0 到 2.5 范围内，不会出现超出范围的异常值
3. WHEN 提交分数时, THE Rank_Service SHALL 附带 duration_ms（游戏时长）和 move_count（跳跃次数），服务端可据此验证分数合理性（如平均每次跳跃得分不超过理论最大值 3 × 2.5 = 7.5 分）
4. THE Rank_Service SHALL 为每次游戏会话生成唯一 run_id，防止同一局游戏重复提交分数
5. FOR ALL 分数提交, THE Score_Manager SHALL 确保 score 为非负整数，max_level 和 move_count 为非负整数，duration_ms 为正整数

### Requirement 12: 技术选型约束

**User Story:** As a 开发者, I want 明确的技术选型指导, so that 开发过程中技术决策一致且高效

#### Acceptance Criteria

1. THE Game_Engine SHALL 使用 Three.js（版本 >= 0.150）作为 3D 渲染引擎，采用等距正交相机（OrthographicCamera）实现 2.5D 视角
2. THE Module_Shell SHALL 使用 Vue 3（版本 >= 3.4）作为 UI 框架，管理游戏状态界面（开始/结束/排行榜）
3. THE Module_Shell SHALL 使用 Vite（版本 >= 5.0）作为构建工具，配置与现有模块（hecheng_hugongda）保持一致
4. THE Game_Engine SHALL 不引入额外物理引擎，跳跃抛物线运动通过数学公式（二次函数）直接计算
5. THE Audio_Manager SHALL 使用 Web Audio API 或 Howler.js（<= 30KB gzip）管理音效，不引入大型音频库
6. THE Game_Engine SHALL 使用 GSAP 或 Tween.js（<= 15KB gzip）处理 UI 动画和缓动效果，Three.js 内置动画系统处理 3D 对象动画
