# 首页天气修复任务清单

> 每轮只执行第一个未完成任务。每个任务完成后记录：实际变更、验证结果、剩余风险、下一步。

## Task 1 - 读取 goal 文件并建立当前轮 todo

- [x] 状态：已完成
- 目标：完整读取 `goal-6/input.md`、`goal-6/plan.md`、`goal-6/tasks.md`，确认当前轮只执行 Task 1。
- 验证：确认三份文件内容可读，且没有开始修改业务代码。
- 实际变更：完整读取了 `goal-6/input.md`、`goal-6/plan.md`、`goal-6/tasks.md`，并建立本轮 todo：读取文件、更新 Task 1 记录、检查 worktree。
- 验证结果：三份文件均可正常读取；本轮未修改天气页面、组件、样式、测试或构建配置等业务代码。
- 剩余风险：尚未定位天气首页实现，温度条和图标问题仍未修复。
- 下一步：Task 2 定位天气首页相关代码，找出未来天气列表、温度条计算、天气图标渲染和数据来源。

## Task 2 - 定位天气首页相关代码

- [x] 状态：已完成
- 目标：找到天气首页组件、未来天气列表、温度条样式、天气图标渲染和数据字段来源。
- 验证：列出关键文件路径、函数/组件名、当前温度条计算逻辑证据。
- 实际变更：只读定位天气相关代码，并将定位结果记录到本任务；未修改天气业务实现。
- 验证结果：
  - 前端首页天气位于 `src/components/Dashboard.vue`。
  - 天气状态数据：`weatherData` 定义在 `Dashboard.vue:575`，字段包含 `temp`、`condition`、`icon`、`humidity`、`wind`、`aqi`、`forecast`。
  - 首页右上角天气入口：`Dashboard.vue:1129` 到 `Dashboard.vue:1135`，使用 `weatherData.icon` 与 `weatherIconColor`。
  - 天气详情弹窗：`Dashboard.vue:1437` 到 `Dashboard.vue:1501`。
  - 逐时预报列表：`Dashboard.vue:1472` 到 `Dashboard.vue:1481`，图标颜色调用 `getWeatherIconColor(h.condition)`。
  - 未来天气列表：`Dashboard.vue:1483` 到 `Dashboard.vue:1498`，遍历 `weatherData.forecast`，字段使用 `f.temp_low`、`f.temp_high`、`f.condition`、`f.icon`。
  - 当前图标颜色映射：`weatherIconColor` 在 `Dashboard.vue:588`，`getWeatherIconColor` 在 `Dashboard.vue:600`。现状是晴 `#f59e0b`、阴 `#4b5563`、小/中雨 `#3b82f6`、大雨/雷阵雨 `#1e40af`，颜色明暗与饱和差距较大。
  - 当前温度条计算：`getTempBarStyle` 在 `Dashboard.vue:611`，固定假设 `minRange = -5`、`maxRange = 42`，返回 `{ left, right }`；没有根据 `weatherData.forecast` 的真实全局最低/最高温动态缩放。
  - 当前温度条模板：`Dashboard.vue:1491` 到 `Dashboard.vue:1495`，低温文本固定 `text-blue-500`，高温文本固定 `text-red-500`，条形固定使用 `from-blue-400 via-green-400 to-red-400`。
  - 天气数据来源：`src-tauri/src/modules/weather.rs` 的 `WeatherData` 在第 29 行，`ForecastDay` 在第 52 行。
  - 后端预报字段：`ForecastDay` 暴露 `temp_high`、`temp_low`、`condition`、`icon`；Open-Meteo 的 `temperature_2m_max` 和 `temperature_2m_min` 在 `weather.rs:195` 到 `weather.rs:202` 解析，并在 `weather.rs:230` 到 `weather.rs:236` 写入 `forecast`。
- 剩余风险：尚未确认是否已有专门的天气纯函数测试入口；温度条、温度颜色、图标色调问题仍未修复。`rg` 大范围搜索被 `website/public`、`website/dist` 和 `node_modules` 产物干扰，后续应限定 `src`、`src-tauri` 和测试目录。
- 下一步：Task 3 设计最小可测接口，确定温度范围缩放、温度颜色映射、天气图标色调应抽到哪些纯函数或组件接口。

## Task 3 - 设计最小可测接口

- [x] 状态：已完成
- 目标：确定温度缩放、温度颜色、天气图标色调应落在哪些纯函数或组件接口上。
- 验证：形成明确的测试入口，不修改生产实现。
- 实际变更：确认后续应新增独立纯函数模块作为测试入口，并只让 `Dashboard.vue` 绑定纯函数结果；本轮未修改生产实现。
- 验证结果：
  - 项目测试框架是 Vitest，根目录 `package.json` 中 `test` 脚本为 `vitest run`。
  - 现有测试主要放在 `src/utils/*.spec.ts`、`src/styles/*.spec.ts`、`src/components/*.spec.ts`；其中 `src/utils/widget_snapshot_pickRows.spec.ts`、`src/utils/capture_service.spec.ts` 是纯函数测试参考，`src/styles/home_dashboard_contract.spec.ts` 是源码契约测试参考。
  - 最小可测接口建议新增 `src/utils/weather_visuals.ts`，对应测试文件为 `src/utils/weather_visuals.spec.ts`。
  - 建议导出 `getForecastTemperatureBounds(forecast)`：输入 `weatherData.forecast`，输出 `{ min, max, span }`，忽略无效温度并处理空数组兜底。
  - 建议导出 `getTemperatureRangeScale(low, high, bounds)`：基于全局 `bounds.min/max` 计算每日条形 `leftPct` 与 `widthPct`；`span === 0` 或无效数据时返回稳定兜底，避免除零。
  - 建议导出 `getTemperatureColor(temp, usage)`：根据实际温度映射柔和色阶，`usage` 可区分 `bar` 和 `text`，保证偏热最低温不会固定蓝色。
  - 建议导出 `getTemperatureRangeStyle(low, high, bounds)`：组合缩放与颜色，返回可直接绑定到 Vue `:style` 的 `{ left, width, background }`；后续替代现有 `getTempBarStyle` 的固定 `-5 ~ 42` 逻辑。
  - 建议导出 `getWeatherIconTone(condition)`：把天气描述归类为 `sunny/cloudy/overcast/rain/heavyRain/snow/fog/default` 等，返回低饱和、明度接近的图标主色；`Dashboard.vue` 中 `weatherIconColor` 和 `getWeatherIconColor(condition)` 后续都应复用它。
  - 组件绑定建议：新增 `forecastTemperatureBounds = computed(() => getForecastTemperatureBounds(weatherData.value.forecast))`；未来天气条使用 `getTemperatureRangeStyle(f.temp_low, f.temp_high, forecastTemperatureBounds.value)`；最低/最高温文本使用 `getTemperatureColor(f.temp_low, 'text')` 与 `getTemperatureColor(f.temp_high, 'text')`；逐时和当前天气图标使用 `getWeatherIconTone(...).color`。
- 剩余风险：尚未实际创建 `weather_visuals.ts` 和测试文件；后续 Task 4-6 需要先写失败测试并确认红灯，之后才能实现生产代码。由于 Font Awesome 图标当前是单色 `<i>`，图标“过渡效果”主要通过柔和语义色和一致明度控制实现，除非后续改成自定义 SVG 才能做多色渐变。
- 下一步：执行大型全面检查 1，复核 Task 1-3 是否偏离需求、定位是否完整、测试入口是否合理。

## 大型全面检查 1（Task 1-3 后）

- [x] 状态：已完成
- 检查范围：需求是否偏离、定位是否完整、测试入口是否合理、是否存在未识别的数据字段风险。
- 检查结果：
  - 需求未偏离：Task 1-3 均围绕首页天气详情中的未来天气温度条缩放、温度驱动配色、天气图标柔和色调展开，没有扩大到后端天气接口、定位、缓存或其他首页模块。
  - 定位完整：复核命令 `rg -n "getTempBarStyle|weatherIconColor|getWeatherIconColor|weatherData\.forecast|temp_low|temp_high|bg-gradient-to-r from-blue-400" src/components/Dashboard.vue` 确认问题点仍集中在 `Dashboard.vue:588`、`Dashboard.vue:600`、`Dashboard.vue:611`、`Dashboard.vue:1487` 到 `Dashboard.vue:1495`。
  - 数据字段明确：复核命令 `rg -n "ForecastDay|temp_high|temp_low|temperature_2m_max|temperature_2m_min|condition_to_icon" src-tauri/src/modules/weather.rs` 确认后端预报结构稳定提供 `temp_high`、`temp_low`、`condition`、`icon`，Open-Meteo 字段来源为 `temperature_2m_max` 和 `temperature_2m_min`。
  - 测试入口合理：复核命令 `rg -n "weather_visuals|getForecastTemperatureBounds|getTemperatureRangeScale|getTemperatureColor|getWeatherIconTone" src -g "*.ts" -g "*.js" -g "*.vue"` 未命中，说明当前没有现成天气视觉纯函数模块；Task 3 设计的 `src/utils/weather_visuals.ts` 与 `src/utils/weather_visuals.spec.ts` 是合适的最小新增边界。
  - 字段风险可控：前端和后端字段名称一致，后续测试可直接构造 `forecast` 数组，不依赖网络、缓存或 Tauri invoke。
- 修复动作：本轮只做检查并记录结果，没有修改生产代码；未发现需要回滚 Task 1-3 设计的偏差。
- 剩余风险：尚未创建失败测试，尚未实现 `weather_visuals.ts`，也尚未把 `Dashboard.vue` 从固定 `-5 ~ 42` 范围、固定蓝/红文本和高反差图标色迁移到新纯函数。后续 Task 4 必须先写温度条缩放失败测试并观察红灯。

## Task 4 - 编写温度条缩放失败测试

- [x] 状态：已完成
- 目标：补充测试证明当前温度条没有按全局最高/最低气温正确缩放。
- 验证：测试先失败，失败原因与现有逻辑缺陷一致。
- 实际变更：在 `src/styles/home_dashboard_contract.spec.ts` 新增首页天气温度条缩放契约测试，要求 `Dashboard.vue` 使用 `getForecastTemperatureBounds`、`forecastTemperatureBounds` 和 `getTemperatureRangeStyle(f.temp_low, f.temp_high, forecastTemperatureBounds.value)`，并禁止继续保留固定 `const minRange = -5`、`const maxRange = 42` 与基于固定范围的 `right` 计算。
- 验证结果：已运行 `npx.cmd vitest run src\styles\home_dashboard_contract.spec.ts --testTimeout 60000`，结果为预期红灯：1 failed / 4 passed。失败用例为 `scales forecast temperature bars from displayed daily forecast bounds`，失败信息是当前 `Dashboard.vue` 不包含 `getForecastTemperatureBounds`，证明现有实现尚未按未来天气全局最低/最高温缩放。
- 剩余风险：本轮只建立红灯契约，没有实现 `weather_visuals.ts`，也没有修改 `Dashboard.vue`。该测试是组件源码契约级红灯，后续 Task 7 实现时仍建议补纯函数数值测试覆盖实际 `leftPct/widthPct` 边界。
- 下一步：Task 5 编写温度颜色失败测试，覆盖偏热最低温不应固定为蓝色。

## Task 5 - 编写温度颜色失败测试

- [x] 状态：已完成
- 目标：补充测试证明最低温颜色由温度决定，而不是固定蓝色。
- 验证：测试先失败，至少覆盖偏热最低温应映射为暖色。
- 实际变更：在 `src/styles/home_dashboard_contract.spec.ts` 新增未来天气温度文本颜色契约测试，要求低温/高温文本不再固定使用 `text-blue-500` 和 `text-red-500`，而是分别绑定 `getTemperatureColor(f.temp_low, 'text')` 与 `getTemperatureColor(f.temp_high, 'text')`。
- 验证结果：已运行 `npx.cmd vitest run src\styles\home_dashboard_contract.spec.ts -t "derives forecast low and high temperature text colors from actual temperatures" --testTimeout 60000`，结果为预期红灯：1 failed / 5 skipped。失败信息是当前 `Dashboard.vue` 仍包含 `text-xs text-blue-500 font-medium w-8 text-right`，证明最低温文本颜色仍固定为蓝色，而不是由实际气温决定。
- 剩余风险：本轮只建立红灯契约，没有实现 `getTemperatureColor`，也没有修改 `Dashboard.vue` 的未来天气文本绑定。该测试是源码契约级红灯，后续实现仍需用纯函数测试覆盖偏热最低温映射为暖色的具体色值。
- 下一步：Task 6 编写天气图标色调失败测试或视觉断言，约束雨、阴、晴图标使用柔和语义色，不出现过大反差。

## Task 6 - 编写天气图标色调失败测试或视觉断言

- [x] 状态：已完成
- 目标：补充测试或可执行断言，约束雨、阴、晴图标使用柔和语义色，不出现过大反差。
- 验证：测试或断言先失败，能体现现有色值问题。
- 实际变更：在 `src/styles/home_dashboard_contract.spec.ts` 新增首页天气图标色调契约测试，要求 `Dashboard.vue` 复用 `getWeatherIconTone`，并禁止继续保留阴天 `#4b5563`、小/中雨 `#3b82f6`、大雨/雷阵雨 `#1e40af` 这类明暗与饱和差异过大的硬编码色值。
- 验证结果：已运行 `npx.cmd vitest run src\styles\home_dashboard_contract.spec.ts -t "uses unified soft weather icon tones instead of high-contrast hardcoded colors" --testTimeout 60000`，结果为预期红灯：1 failed / 6 skipped。失败原因是当前 `Dashboard.vue` 仍包含 `if (c === '阴') return '#4b5563'`，证明现有图标颜色仍是高反差硬编码映射，尚未迁移到柔和语义色调。
- 剩余风险：本轮只建立红灯契约，没有实现 `getWeatherIconTone`，也没有修改 `Dashboard.vue` 的当前天气与逐时天气图标颜色绑定。该测试属于源码契约级红灯，后续 Task 9 实现时仍需结合视觉检查确认晴、阴、雨在浅色背景下有足够辨识度且过渡自然。
- 下一步：执行大型全面检查 2，复核 Task 4-6 的红灯测试是否覆盖温度条缩放、温度驱动配色和天气图标柔和色调，并确认失败原因都指向真实缺陷。

## 大型全面检查 2（Task 4-6 后）

- [x] 状态：已完成
- 检查范围：测试是否真的失败、失败原因是否正确、是否覆盖主要边界、是否误测实现细节。
- 检查结果：
  - 温度条缩放红灯有效：重新运行 `npx.cmd vitest run src\styles\home_dashboard_contract.spec.ts -t "scales forecast temperature bars from displayed daily forecast bounds" --testTimeout 60000`，结果为 1 failed / 6 skipped；失败原因是 `Dashboard.vue` 仍不包含 `getForecastTemperatureBounds`，对应当前 `getTempBarStyle` 仍使用固定范围而非未来天气全局最低/最高温。
  - 温度驱动配色红灯有效：重新运行 `npx.cmd vitest run src\styles\home_dashboard_contract.spec.ts -t "derives forecast low and high temperature text colors from actual temperatures" --testTimeout 60000`，结果为 1 failed / 6 skipped；失败原因是未来天气最低温仍包含 `text-xs text-blue-500 font-medium w-8 text-right`，证明最低温仍固定蓝色。
  - 天气图标色调红灯有效：重新运行 `npx.cmd vitest run src\styles\home_dashboard_contract.spec.ts -t "uses unified soft weather icon tones instead of high-contrast hardcoded colors" --testTimeout 60000`，结果为 1 failed / 6 skipped；失败原因是当前天气图标颜色仍包含 `if (c === '阴') return '#4b5563'`。
  - 源码证据一致：运行 `rg -n "scales forecast|derives forecast|uses unified|getTempBarStyle|weatherIconColor|getWeatherIconColor|text-blue-500|text-red-500|#4b5563|#3b82f6|#1e40af" src\styles\home_dashboard_contract.spec.ts src\components\Dashboard.vue`，确认契约测试与 `Dashboard.vue` 当前问题点一一对应。
  - 测试边界评估：Task 4-6 目前是源码契约红灯，能防止继续使用固定范围、固定蓝/红文本和高反差硬编码图标色；但还缺纯函数数值测试覆盖等温、无效温度、小温差、偏热低温等边界，后续实现任务需要补上。
- 修复动作：本轮只做大型全面检查并记录结果，没有修改 `Dashboard.vue` 或新增生产代码；未发现 Task 4-6 红灯测试偏离用户需求。
- 剩余风险：红灯测试仍偏契约层，尚未验证最终视觉效果；后续 Task 7 应先实现并测试温度条全局范围缩放，且补足纯函数边界测试，再逐步推进温度配色和图标柔和色调实现。

## Task 7 - 实现温度条全局范围缩放

- [x] 状态：已完成
- 目标：修复未来天气温度条偏移和宽度计算，覆盖等温、缺失值、小温差等边界。
- 验证：Task 4 相关测试通过。
- 实际变更：新增 `src/utils/weather_visuals.ts` 和 `src/utils/weather_visuals.spec.ts`，实现并测试 `getForecastTemperatureBounds`、`getTemperatureRangeScale`、`getTemperatureRangeStyle`；`Dashboard.vue` 已导入这些函数，新增 `forecastTemperatureBounds`，并将未来天气温度条从固定 `-5 ~ 42` 范围的 `getTempBarStyle` 改为 `getTemperatureRangeStyle(f.temp_low, f.temp_high, forecastTemperatureBounds.value)`。
- 验证结果：先运行 `npx.cmd vitest run src\utils\weather_visuals.spec.ts --testTimeout 60000` 得到预期红灯：缺少 `./weather_visuals` 实现。实现后重新运行同一命令，结果为 1 passed / 6 tests passed；运行 `npx.cmd vitest run src\styles\home_dashboard_contract.spec.ts -t "scales forecast temperature bars from displayed daily forecast bounds" --testTimeout 60000`，结果为 1 passed / 6 skipped。复核 `rg -n "getTempBarStyle|const minRange|const maxRange|forecastTemperatureBounds|getForecastTemperatureBounds|getTemperatureRangeStyle|100 - \(\(high - minRange\)" src\components\Dashboard.vue src\utils\weather_visuals.ts src\utils\weather_visuals.spec.ts`，确认旧固定范围函数和 `right` 计算不再存在，新的全局范围缩放绑定存在。
- 剩余风险：本轮只完成温度条缩放，条形渐变仍暂时沿用固定蓝绿红，最低/最高温文本也仍是固定蓝/红；这些属于 Task 8。天气图标柔和色调仍未实现，属于 Task 9。最终视觉效果仍需后续浏览器验证。
- 下一步：Task 8 实现温度驱动配色，让温度条起止颜色和温度文本颜色由实际气温映射得到。

## Task 8 - 实现温度驱动配色

- [x] 状态：已完成
- 目标：让温度条起止颜色和必要文本颜色由实际温度映射得到，不固定最低温为蓝色。
- 验证：Task 5 相关测试通过，并检查浅色背景可读性。
- 实际变更：在 `src/utils/weather_visuals.ts` 新增 `getTemperatureColor`，为文本和条形分别提供柔和温度色阶；`getTemperatureRangeStyle` 现在返回由低温/高温实际温度生成的 `linear-gradient(...)` 背景。`Dashboard.vue` 已导入 `getTemperatureColor`，未来天气低/高温文本改为内联温度色，温度条移除固定 `from-blue-400 via-green-400 to-red-400` 渐变类，改用 `getTemperatureRangeStyle(...)` 返回的背景。
- 验证结果：先运行 `npx.cmd vitest run src\utils\weather_visuals.spec.ts --testTimeout 60000` 得到预期红灯：`getTemperatureColor is not a function`，且条形样式缺少 `background`。实现后重新运行同一命令，结果为 1 passed / 8 tests passed；运行 `npx.cmd vitest run src\styles\home_dashboard_contract.spec.ts -t "derives forecast low and high temperature text colors from actual temperatures" --testTimeout 60000`，结果为 1 passed / 6 skipped。复核 `rg -n "text-xs text-blue-500 font-medium w-8 text-right|text-xs text-red-500 font-medium w-8|from-blue-400 via-green-400 to-red-400|getTemperatureColor\(f\.temp_low, 'text'\)|getTemperatureColor\(f\.temp_high, 'text'\)|linear-gradient\(90deg" src\components\Dashboard.vue src\utils\weather_visuals.ts src\utils\weather_visuals.spec.ts`，确认固定低温蓝色、高温红色和固定蓝绿红条形渐变不再用于未来天气温度显示。
- 剩余风险：温度颜色已由实际气温驱动，但天气图标色调仍未改，属于 Task 9；最终 UI 视觉仍需后续浏览器验证确认浅色背景下的整体观感。
- 下一步：Task 9 调整天气图标柔和过渡色，统一晴、阴、雨等图标的饱和度、明度和语义色。

## Task 9 - 调整天气图标柔和过渡色

- [x] 状态：已完成
- 目标：统一晴、阴、雨等图标的饱和度、明度和语义色，使视觉过渡更自然。
- 验证：Task 6 相关测试或断言通过。
- 实际变更：在 `src/utils/weather_visuals.ts` 新增 `getWeatherIconTone`，把晴、多云、阴、雨、大雨/雷阵雨、雪、雾霾和默认天气映射到低饱和、明度接近的语义色；`Dashboard.vue` 已导入并复用该函数，当前天气图标、逐时天气图标和未来天气图标都改为通过 `getWeatherIconTone(...).color` 取色，移除天气图标专用的高反差硬编码色映射。
- 验证结果：先运行 `npx.cmd vitest run src\utils\weather_visuals.spec.ts --testTimeout 60000` 得到预期红灯：`getWeatherIconTone is not a function`。实现后重新运行同一命令，结果为 1 passed / 10 tests passed；运行 `npx.cmd vitest run src\styles\home_dashboard_contract.spec.ts -t "uses unified soft weather icon tones instead of high-contrast hardcoded colors" --testTimeout 60000`，结果为 1 passed / 6 skipped。复核 `rg -n "getWeatherIconTone|weatherIconColor|getWeatherIconColor|if \(c === '阴'\)|if \(condition === '阴'\)|#4b5563|#3b82f6|#1e40af" src\components\Dashboard.vue src\utils\weather_visuals.ts src\utils\weather_visuals.spec.ts src\styles\home_dashboard_contract.spec.ts`，确认天气图标逻辑已迁移到 `getWeatherIconTone`，旧的阴天/雨天高反差硬编码色不再用于天气图标映射。
- 剩余风险：图标色调已统一为柔和语义色，但尚未进行浏览器视觉验证；后续大型全面检查 3 需要整体复核温度条缩放、温度配色和图标色调是否一起满足用户视觉要求。
- 下一步：执行大型全面检查 3，复核 Task 7-9 的实现是否完整、测试是否通过、视觉风险是否可控。

## 大型全面检查 3（Task 7-9 后）

- [x] 状态：已完成
- 检查范围：需求是否完整实现、缩放是否正确、颜色是否可读、图标是否自然、是否引入视觉或性能问题。
- 检查结果：
- 需求实现复核：Task 7-9 已覆盖用户要求的三项核心问题：未来天气温度条基于展示预报的全局最低/最高温缩放，温度条与低/高温文本颜色由实际气温映射，晴/阴/雨等天气图标改为统一柔和语义色。
- 缩放验证：运行 `npx.cmd vitest run src\styles\home_dashboard_contract.spec.ts -t "scales forecast temperature bars from displayed daily forecast bounds" --testTimeout 60000`，结果为 1 passed / 6 skipped；运行 `npx.cmd vitest run src\utils\weather_visuals.spec.ts --testTimeout 60000`，结果为 10 passed，覆盖全局范围、无效值、等温和小温差兜底。
- 温度配色验证：运行 `npx.cmd vitest run src\styles\home_dashboard_contract.spec.ts -t "derives forecast low and high temperature text colors from actual temperatures" --testTimeout 60000`，结果为 1 passed / 6 skipped；源码确认未来天气低温和高温文本分别绑定 `getTemperatureColor(f.temp_low, 'text')` 与 `getTemperatureColor(f.temp_high, 'text')`，不再固定最低温蓝色。
- 图标色调验证：运行 `npx.cmd vitest run src\styles\home_dashboard_contract.spec.ts -t "uses unified soft weather icon tones instead of high-contrast hardcoded colors" --testTimeout 60000`，结果为 1 passed / 6 skipped；源码确认当前天气、逐时天气和未来天气图标均通过 `getWeatherIconTone(...).color` 取色。
- 源码回归检查：运行 `rg -n "getTempBarStyle|const minRange|const maxRange|from-blue-400 via-green-400 to-red-400|text-xs text-blue-500 font-medium w-8 text-right|text-xs text-red-500 font-medium w-8|if \(c === '阴'\).*#4b5563|if \(condition === '阴'\).*#4b5563|getWeatherIconTone|getTemperatureColor|getTemperatureRangeStyle|forecastTemperatureBounds" src\components\Dashboard.vue src\utils\weather_visuals.ts src\utils\weather_visuals.spec.ts src\styles\home_dashboard_contract.spec.ts`，只命中新工具函数、测试断言和新绑定；旧固定范围、固定蓝/红文本类、固定蓝绿红条形渐变和旧高反差阴/雨图标色映射未命中为生产实现。
- 性能与安全评估：新增逻辑是纯前端数值计算和常量色阶映射，作用范围限于首页天气展示；没有新增网络请求、权限、文件 IO、系统配置或后端数据写入。
- 修复动作：
- 本轮为大型全面检查，仅补充检查记录；未修改天气业务代码。
- 剩余风险：
- 尚未执行项目级完整验证、类型检查或构建；按任务拆分留给 Task 10。
- 尚未启动本地前端进行浏览器视觉验证，浅色背景下的最终观感、真实数据布局和图标过渡效果仍需 Task 11 通过页面检查确认。
- 当前存在 `website/public/modules/...`、`website/public/modules/latest/...`、`website/public/modules/main/...` 等无关脏改动，本轮未触碰也未回滚。

## Task 10 - 运行项目级验证

- [x] 状态：已完成
- 目标：运行可用的测试、类型检查、构建或 lint 命令，单个命令不超过 60s。
- 验证：记录命令、结果摘要、失败时的根因与处理。
- 实际变更：
- 本轮只运行项目级验证并记录结果；未修改天气业务代码、测试代码或构建配置。
- 验证结果：
- 完整测试：运行 `npx.cmd vitest run --testTimeout 60000`，结果为失败，32 个测试文件中 28 passed / 4 failed，203 个测试中 192 passed / 11 failed。失败集中在 `src/utils/hbut_memory_match_game.spec.ts`、`src/utils/hbut_monopoly_game.spec.ts`、`src/utils/module_center.spec.ts`、`src/utils/remote_config.spec.ts`，涉及小游戏状态、小游戏样式契约和模块中心内置游戏顺序，不涉及本次天气温度条或天气图标改动。天气相关的 `src/utils/weather_visuals.spec.ts` 和 `src/styles/home_dashboard_contract.spec.ts` 在完整测试中通过。
- 类型检查：运行 `npx.cmd vue-tsc --noEmit --skipLibCheck`，结果为失败，`vue-tsc` 在启动阶段抛出 `Search string not found: "/supportedTSExtensions = .*(?=;)/"`。环境确认 `node.exe -v` 为 `v24.12.0`，`npx.cmd tsc --version` 为 `Version 5.9.3`；该失败发生在 `vue-tsc` 自身启动逻辑，未产出项目类型诊断。
- 构建：运行 `npm.cmd run build`，结果为通过，`vite build` 完成并输出 `built in 7.83s`。构建期间存在 CSS minify 的 `Unexpected "@media"` 警告，以及 Capacitor/Tauri/widget_bridge 动静态混合导入 chunk 警告；这些警告没有阻止构建产物生成。
- 工作区状态：验证后运行 `git status --short` 和 `git diff --name-only`，仍显示 `website/public/modules/...`、`website/public/modules/latest/...`、`website/public/modules/main/...` 等无关脏改动；本轮未触碰或回滚这些文件。
- 剩余风险：
- 项目级完整 Vitest 当前不是绿灯，失败项位于非天气模块；本 goal 不应在未验证清楚前声称整个项目测试全通过。
- `vue-tsc` 在当前 Node 24 + TypeScript 5.9.3 环境下无法启动，类型检查证据缺失；后续最终 review 需要决定是记录环境兼容风险，还是在不扩大本次天气修复范围的前提下做替代验证。
- 构建虽然通过，但 CSS/chunk 警告仍存在；本次天气改动没有处理这些既有构建警告。
- 下一步：
- Task 11 浏览器视觉验证首页天气，确认真实页面中温度条缩放、温度驱动配色和天气图标柔和色调没有明显重叠、溢出或反差过强问题。

## Task 11 - 浏览器视觉验证首页天气

- [x] 状态：已完成
- 目标：启动本地前端或可访问页面，用浏览器验证首页天气温度条和图标效果。
- 验证：截图或 DOM/样式检查显示修复生效，无明显重叠、溢出、对比过强问题。
- 实际变更：
- 启动 `npm.cmd run dev -- --host 127.0.0.1` 并通过浏览器打开 `http://127.0.0.1:1420/#/`，关闭首页公告后打开天气详情弹窗进行桌面与移动视口验证。
- 浏览器初次验证发现实际未来天气条仍为兜底样式 `left: 46%; width: 8%`。根因是 Vue 模板会自动解包 `computed`，模板中传入 `forecastTemperatureBounds.value` 会在运行时变成对已解包对象继续取 `.value`，导致 `getTemperatureRangeStyle(...)` 收到 `undefined` bounds 并走兜底。
- 修复 `src/components/Dashboard.vue`：未来天气温度条调用从 `getTemperatureRangeStyle(f.temp_low, f.temp_high, forecastTemperatureBounds.value)` 改为 `getTemperatureRangeStyle(f.temp_low, f.temp_high, forecastTemperatureBounds)`。
- 更新 `src/styles/home_dashboard_contract.spec.ts`：契约测试要求模板使用自动解包后的 `forecastTemperatureBounds`，并禁止再次出现 `forecastTemperatureBounds.value`。
- 验证结果：
- 相关自动化测试：运行 `npx.cmd vitest run src\utils\weather_visuals.spec.ts --testTimeout 60000`，结果为 1 passed / 10 tests passed；运行 `npx.cmd vitest run src\styles\home_dashboard_contract.spec.ts --testTimeout 60000`，结果为 1 passed / 7 tests passed。
- 桌面浏览器验证：在 `1036x854` 视口打开天气详情，未来天气实际数据为 `明天 多云 18°/28°`、`后天 小雨 16°/25°`。DOM 样式显示温度条分别为 `left: 16.67%; width: 83.33%` 与 `left: 0%; width: 75%`，符合展示预报全局范围 `16°~28°` 的缩放结果，不再走兜底 `46%/8%`。
- 移动浏览器验证：在 `390x844` 视口复验同一弹窗，温度条仍分别为 `left: 16.67%; width: 83.33%` 与 `left: 0%; width: 75%`。每行子元素重叠检测结果为空，未发现温度文本、条形轨道、天气图标互相覆盖。
- 颜色验证：低温文本 `18°/16°` 为 `rgb(15, 118, 110)`，高温文本 `28°/25°` 为 `rgb(194, 65, 12)`；条形渐变为 `rgb(45, 212, 191)` 到 `rgb(251, 146, 60)`，由实际温度驱动，不固定最低温为蓝色。多云图标为 `rgb(123, 135, 152)`，小雨图标为 `rgb(79, 143, 191)`，色调低饱和且过渡自然。
- 截图证据：已保存 `weather-modal-desktop-task11.png` 和 `weather-modal-mobile-task11.png` 作为本轮视觉检查截图；未纳入提交。
- 控制台风险复核：浏览器控制台存在本地 Web 运行时不支持 Tauri `invoke: fetch_weather`、远程配置 CORS 和更新检查 403 等错误/警告；天气弹窗仍使用默认/兜底天气数据正常渲染，这些控制台问题未阻断本轮天气视觉验证。
- 服务收尾：已通过 `taskkill.exe /PID 95444 /PID 93300 /T /F` 停止本轮启动的 1420 dev server；端口复查只剩 `TimeWait`，没有监听进程。
- 剩余风险：
- 浏览器验证基于本地 Web/Vite 运行时和默认天气数据，未在 Tauri 原生运行时中验证真实 `fetch_weather` 返回数据；但本次修复的温度条缩放、颜色映射和图标色调均作用于前端渲染逻辑，已通过 DOM 样式和单元/契约测试覆盖。
- 项目级完整 Vitest 与 `vue-tsc` 仍存在 Task 10 记录的非天气相关失败/环境问题，最终 review 需要保留这些风险说明。
- 下一步：
- Task 12 最终 review、提交与 goal 完成前检查，复核代码、安全性、测试、构建、文档和回滚方案，并决定是否可标记 goal 完成。

## Task 12 - 最终 review、提交与 goal 完成

- [x] 状态：已完成
- 目标：全面 review C 端体验、代码、安全性、数据一致性、权限、错误处理、测试、构建、文档和回滚方案；若有代码修改则提交。
- 验证：无已知高风险问题，goal 标记完成。
- 实际变更：
- 本轮执行最终 review 前检查和验证记录；未修改天气业务代码、测试代码或构建配置。
- 按 goal 规则，本轮只完成 Task 12，不执行下方“最终最大 review”，因此本轮不调用 `update_goal` 标记完成。
- 验证结果：
- 需求覆盖复核：当前实现已覆盖原始目标的三项要求：未来天气温度条按展示预报全局最低/最高温缩放；温度条渐变和低/高温文本颜色由实际气温决定，最低温不固定为蓝色；晴、阴、多云、雨等天气图标使用 `getWeatherIconTone` 的低饱和语义色，避免旧高反差硬编码色。
- 源码回归检查：运行 `rg -n "forecastTemperatureBounds\.value|getTempBarStyle|const minRange|const maxRange|from-blue-400 via-green-400 to-red-400|text-xs text-blue-500 font-medium w-8 text-right|text-xs text-red-500 font-medium w-8|if \(c === '阴'\).*#4b5563|if \(condition === '阴'\).*#4b5563|getTemperatureRangeStyle\(f\.temp_low, f\.temp_high, forecastTemperatureBounds\)|getTemperatureColor\(f\.temp_low, 'text'\)|getTemperatureColor\(f\.temp_high, 'text'\)|getWeatherIconTone\(condition\)\.color" src\components\Dashboard.vue src\utils\weather_visuals.ts src\utils\weather_visuals.spec.ts src\styles\home_dashboard_contract.spec.ts`，结果只命中新绑定和测试断言；没有命中旧 `forecastTemperatureBounds.value`、固定范围函数、固定蓝/红温度类、固定蓝绿红渐变或旧阴/雨高反差图标生产映射。
- 天气纯函数测试：运行 `npx.cmd vitest run src\utils\weather_visuals.spec.ts --testTimeout 60000`，结果为 1 passed / 10 tests passed。
- 首页契约测试：运行 `npx.cmd vitest run src\styles\home_dashboard_contract.spec.ts --testTimeout 60000`，结果为 1 passed / 7 tests passed。
- 构建验证：运行 `npm.cmd run build`，结果为通过，`vite build` 输出 `built in 7.74s`。构建仍有 CSS minify 的 `Unexpected "@media"` 警告，以及 Capacitor/Tauri/widget_bridge 动静态混合导入 chunk 警告；这些警告未阻止构建。
- 类型检查验证：运行 `npx.cmd vue-tsc --noEmit --skipLibCheck`，仍在当前 Node `v24.12.0` 环境下启动失败，错误为 `Search string not found: "/supportedTSExtensions = .*(?=;)/"`，未产出项目类型诊断。
- 工作区复核：运行 `git status --short` 与 `git diff --name-only`，天气相关源码和测试文件在上一轮提交后保持干净；当前仍有 `website/public/modules/...` 无关脏改动，以及浏览器验证生成的 `.playwright-mcp/*.yml`、`weather-modal-desktop-task11.png`、`weather-modal-mobile-task11.png` 未跟踪文件。本轮未删除、未暂存、未回滚这些文件。
- C 端体验复核：Task 11 已用桌面 `1036x854` 和移动 `390x844` 浏览器视口验证天气弹窗，温度条分别渲染为 `16.67%/83.33%` 与 `0%/75%`，温度文本和条形颜色由实际气温驱动，图标色调柔和，且移动端无元素重叠。
- 安全与数据一致性复核：本次天气修复只调整前端展示纯函数与 Vue 样式绑定，没有新增网络请求、权限、认证、生产配置、数据库写入或后端数据结构变更；后端 `temp_low`/`temp_high` 字段仍作为原数据来源，前端只做展示归一化。
- 回滚方案复核：如需回滚，可回退天气相关提交，重点是 `src/utils/weather_visuals.ts`、`src/utils/weather_visuals.spec.ts`、`src/styles/home_dashboard_contract.spec.ts` 和 `src/components/Dashboard.vue` 的天气视觉绑定；若只需调整观感，可单独修改 `weather_visuals.ts` 中温度色阶或图标色阶。
- 剩余风险：
- 项目级完整 Vitest 在 Task 10 中仍有非天气相关失败，涉及 `hbut_memory_match_game`、`hbut_monopoly_game`、`module_center`、`remote_config`，不能声称整个项目测试全绿。
- `vue-tsc` 在当前环境无法启动，类型检查证据缺失；这属于工具链环境兼容风险，最终最大 review 仍需明确记录。
- 本地浏览器验证基于 Web/Vite 运行时和默认天气数据，未在 Tauri 原生运行时中验证真实 `fetch_weather` 数据；不过前端缩放、颜色和图标逻辑已通过纯函数、契约测试和浏览器 DOM 样式验证。
- 无关 `website/public/modules/...` 脏改动和本轮浏览器截图/临时文件仍留在工作区，未纳入本次提交，最终最大 review 前仍需说明或处理策略。
- 下一步：
- 执行“最终最大 review”，从 C 端体验、代码质量、安全性、数据一致性、权限、错误处理、测试、构建、文档和回滚角度做最后审计。只有最终最大 review 完成且证据足够时，才能调用 `update_goal(status="complete")`。

## 最终最大 review

- [x] 状态：已完成
- 检查范围：C 端体验、代码质量、安全性、数据一致性、权限、错误处理、测试、构建、文档、回滚。
- 检查结果：
- C 端体验：Task 11 已在桌面 `1036x854` 与移动 `390x844` 视口验证首页天气详情弹窗。未来天气实际数据 `18°/28°` 与 `16°/25°` 渲染为 `left: 16.67%; width: 83.33%` 和 `left: 0%; width: 75%`，符合展示预报全局范围 `16°~28°` 的缩放逻辑；移动端子元素重叠检测为空。
- 温度条缩放：最终源码回归命令确认生产代码不再出现 `forecastTemperatureBounds.value`、`getTempBarStyle`、固定 `const minRange`/`const maxRange`，未来天气条绑定为 `getTemperatureRangeStyle(f.temp_low, f.temp_high, forecastTemperatureBounds)`。
- 温度配色：最终源码回归命令确认未来天气低/高温文本分别绑定 `getTemperatureColor(f.temp_low, 'text')` 与 `getTemperatureColor(f.temp_high, 'text')`，旧固定 `text-blue-500`/`text-red-500` 未来天气温度类未命中；条形渐变由 `getTemperatureRangeStyle` 通过实际低/高温生成。
- 天气图标色调：最终源码回归命令确认图标颜色统一走 `getWeatherIconTone(condition).color`，旧阴天 `#4b5563`、雨天 `#3b82f6`/`#1e40af` 的天气图标生产映射未命中。
- 测试证据：运行 `npx.cmd vitest run src\utils\weather_visuals.spec.ts --testTimeout 60000`，结果为 1 passed / 10 tests passed；运行 `npx.cmd vitest run src\styles\home_dashboard_contract.spec.ts --testTimeout 60000`，结果为 1 passed / 7 tests passed。
- 完整测试门禁：运行 `npx.cmd vitest run --testTimeout 60000`，结果仍为失败，32 个测试文件中 28 passed / 4 failed，203 个测试中 192 passed / 11 failed。失败集中在 `hbut_memory_match_game`、`hbut_monopoly_game`、`module_center`、`remote_config`，天气相关测试在完整测试中通过；这些失败不属于本次首页天气目标范围。
- 构建证据：运行 `npm.cmd run build`，结果为通过，`vite build` 输出 `built in 8.40s`。仍有既有 CSS minify `Unexpected "@media"` 警告和 Capacitor/Tauri/widget_bridge 动静态混合导入 chunk 警告；未阻止构建。
- 类型检查证据：运行 `npx.cmd vue-tsc --noEmit --skipLibCheck`，仍因当前 Node `v24.12.0`/TypeScript 组合导致 `vue-tsc` 启动失败，错误为 `Search string not found: "/supportedTSExtensions = .*(?=;)/"`，未产出项目类型诊断。该风险已记录为工具链环境兼容问题。
- 安全性与权限：天气修复只涉及前端纯函数、单元/契约测试和 Vue 模板样式绑定；没有新增网络请求、敏感数据传输、认证/支付/权限逻辑、系统配置、数据库结构或后端写入。
- 数据一致性：后端天气数据字段 `temp_low`、`temp_high`、`condition`、`icon` 未变；前端只在展示层基于已展示 forecast 计算全局范围，不改变缓存、接口或持久化数据。
- 错误处理：`getForecastTemperatureBounds` 与 `getTemperatureRangeScale` 覆盖无效温度、缺失值、等温和小温差兜底，避免除零和不可见条形。
- 文档与追踪：`goal-6/input.md`、`goal-6/plan.md`、`goal-6/tasks.md` 已完整记录需求、方案、测试、浏览器验证、风险、回滚方案与每轮提交。
- 工作区状态：最终复核 `git status --short` 显示天气相关源码和测试文件无未提交改动；仍存在无关 `website/public/modules/...` 脏改动，以及 `.playwright-mcp/*.yml`、`weather-modal-desktop-task11.png`、`weather-modal-mobile-task11.png` 未跟踪文件。本次最终 review 未删除、未暂存、未回滚这些文件。
- 修复动作：
- 本轮最终最大 review 未再修改天气业务代码；仅记录最终审计结论。
- 此前 Task 11 已修复运行时发现的 Vue 模板自动解包问题：未来天气温度条从传入 `forecastTemperatureBounds.value` 改为传入 `forecastTemperatureBounds`。
- 最终结论：
- 首页天气目标已满足并有当前证据支撑：温度条按展示预报的真实最高/最低气温范围缩放，温度条与温度文本颜色由实际气温决定，天气图标色调统一为柔和语义色，桌面和移动浏览器验证未发现重叠或溢出。
- 剩余失败均为本目标之外的既有项目级测试/工具链风险：完整 Vitest 中小游戏与模块中心测试失败，以及当前环境下 `vue-tsc` 启动失败。它们不改变本次天气修复的完成状态，但应在后续独立任务中处理。
- 本 goal 可以标记完成。
