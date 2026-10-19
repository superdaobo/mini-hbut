/**
 * 图书馆预约 · 静音仓 / 研讨室面板接线契约（P1 修复回归防护）。
 *
 * 仓库未引入 @vue/test-utils、vitest 主配置为 node 环境（无 DOM），组件无法挂载，
 * 因此沿用仓库既有的「源码契约」测试风格：读取 .vue 源码断言关键接线；
 * 纯逻辑（错误文案 / 已选时段解析 / 日期边界）的断言见同目录 catalog.spec.ts。
 *
 * 覆盖：
 * - P1-1 未登录引导按钮的 @require-login 必须由宿主 App.vue 绑定（否则是死按钮）；
 * - P1-2 表单错误文案按错误 key 取限值（不得回退 `field.min ?? field.max`）；
 * - P1-4 **不得再向 `library_reserve_time_list` 下发日期范围**（#1081 修复
 *   「静音仓 / 研讨室每天都显示没有时段」：日期范围会被服务端过滤成 0 条）；
 * - #1081 座位面板：可视化时间片网格 + 本机提交（验证码 + 页面内签名）。
 */
import { describe, expect, it } from 'vitest'
import { readContractSource, readVueContractSource } from '../../utils/contract_source_test'

const signer = readContractSource('src/components/library-reserve/seatSigner.ts')

const app = readVueContractSource('src/App.vue')
const view = readVueContractSource('src/components/LibraryReserveView.vue')
const panel = readVueContractSource('src/components/library-reserve/ReserveRoomPanel.vue')
const formFields = readVueContractSource('src/components/library-reserve/ReserveFormFields.vue')
const minePanel = readVueContractSource('src/components/library-reserve/ReserveMinePanel.vue')
const seatPanel = readVueContractSource('src/components/library-reserve/ReserveSeatPanel.vue')
const seatSigner = readVueContractSource('src/components/library-reserve/seatSigner.ts')

/** 截取某个顶层 `const name = ...` 到下一个顶格 `}` 的代码块（用于断言函数体接线） */
const blockOf = (source: string, signature: string): string =>
  source.match(new RegExp(`${signature}[\\s\\S]*?\\n\\}`))?.[0] ?? ''

describe('P1-1 library_reserve 登录引导接线（死按钮修复）', () => {
  it('LibraryReserveView 未登录引导按钮派发 require-login', () => {
    expect(view).toContain("const goLogin = () => emit('require-login')")
    expect(view).toContain('@click="goLogin"')
  })

  it('App.vue 的 library_reserve 分支必须绑定 @require-login（与其它需登录视图一致）', () => {
    const line = app
      .split('\n')
      .find((row) => row.includes("currentView === 'library_reserve'"))
    expect(line, '未找到 library_reserve 渲染分支').toBeTruthy()
    expect(line).toContain('@require-login="handleRequireLogin"')
  })
})

describe('P1-2 表单错误文案按错误 key 取限值', () => {
  it('ReserveFormFields 不得回退 field.min ?? field.max，须改用 formatFieldErrorText', () => {
    expect(formFields).not.toContain('field.min ?? field.max')
    expect(formFields).toContain('formatFieldErrorText')
  })
})

describe('P1-3 切换房间 / 返回列表必须重置已选单元格与表单', () => {
  it('房间卡片走 selectRoom（而非直接赋值 selectedRoomKey）', () => {
    expect(panel).toContain('@click="selectRoom(view)"')
    expect(panel).not.toContain('@click="selectedRoomKey = view.key"')
  })

  it('selectRoom / backToList 重置已选单元格与表单', () => {
    expect(blockOf(panel, 'const selectRoom = ')).toContain('resetCellSelection()')
    expect(blockOf(panel, 'const backToList = ')).toContain('resetCellSelection()')
  })

  it('提交前摘要只取「当前已选单元格」（不与网格展示脱钩）', () => {
    const block = blockOf(panel, 'const confirmRows = computed')
    expect(block).toContain('selectedRoomView.value')
    expect(block).toContain('selectedCell.value')
  })
})

describe('P1-4 不得再向 time_list 下发日期范围（修复「每天都显示没有时段」）', () => {
  it('loadRooms 只传 app（不下发 start_time / end_time）', () => {
    const block = blockOf(panel, 'const loadRooms = async')
    expect(block, '未定位到 loadRooms 代码块').toContain("invokeNative('library_reserve_time_list'")
    expect(block, '不得下发日期边界（服务端会过滤成 0 条）').not.toContain('start_time')
    expect(block).not.toContain('end_time')
  })

  it('面板不再使用「按日期过滤时段」的旧链路（假空态根因）', () => {
    for (const legacy of ['buildSlotTimeRange', 'matchesDate', 'visibleSlots', 'slotsHaveDate', 'selectedDate']) {
      expect(panel, `旧链路残留：${legacy}`).not.toContain(legacy)
    }
    // 空态文案改为「未获取到时段配置」，不再断言「当日无时段」
    expect(panel).toContain('library.reserve.booking.noIntervals')
    expect(panel).not.toContain('library.reserve.booking.slotEmpty')
  })

  it('日期×时段网格由服务端 intervals 生成（纯函数 buildRoomGrid）', () => {
    expect(panel).toContain('buildRoomGrid')
    expect(panel).toContain('normalizeRoomList')
    expect(panel).toContain('@click="chooseCell(cell)"')
    // 单元格自带日期（否则选中态无法与已选比较，高亮恒不生效）
    expect(panel).toContain('picked.date === cell.date')
  })

  it('房间提交使用官方 reserve/multiple/submit 契约（reserveUsers + intervalIds）', () => {
    const block = blockOf(panel, 'const confirmSubmit = async')
    expect(block).toContain("invokeNative('library_reserve_submit'")
    // 实测（2026-10-19）：reserveUsers 是 JSON 字符串，元素带 intervalIds
    expect(block).toContain('reserveUsers')
    expect(block).toContain('intervalIds: JSON.stringify(intervalIds)')
    expect(block).toContain("reserveNum: '1'")
    expect(block).toContain('resolveRoomIntervalIds')
    // 旧「日期/时段直接透传」已被证明会被服务端当作无时段拒绝
    expect(block).not.toContain('startTime: cell.start')
    expect(block).not.toContain('date: cell.date')
  })

  it('真实时段 ID 来自 library_reserve_item_setting（commonIntervalMap）', () => {
    expect(panel).toContain("'library_reserve_item_setting'")
    expect(panel).toContain('normalizeRoomIntervalSlots')
    expect(panel).toContain('resolveRoomGridDays')
  })


  it('可约天数必须优先取预约项 advanceDays（房间值 14 是配置，不是窗口）', () => {
    // 实测（2026-10-19）：房间条目 advanceDays=14，但服务端只允许预约项 advanceDays=3 的范围
    // （静音仓 +3 天可约、+4 天被拒）。顺序颠倒会让网格多渲染 10 天 → 用户必然提交失败。
    const block = blockOf(panel, 'const advanceDays = computed')
    const itemAt = block.indexOf('itemInfo.value?.advanceDays')
    const roomAt = block.indexOf('selectedRoom.value?.advanceDays')
    expect(itemAt, '未找到 itemInfo.advanceDays').toBeGreaterThan(-1)
    expect(roomAt, '未找到 room.advanceDays').toBeGreaterThan(-1)
    expect(itemAt, '预约项必须排在房间之前').toBeLessThan(roomAt)
  })
})

describe('#1076 我的预约字段映射接线（静音仓 + 研讨室合并展示）', () => {
  it('合并静音仓与研讨室两套记录', () => {
    expect(minePanel).toContain("const APPS = ['quiet_room', 'seminar_room']")
    expect(minePanel).toContain('Promise.allSettled')
  })
  it('归一化走 catalog 的 normalizeMyReservation（不自行硬编码字段名）', () => {
    expect(minePanel).toContain('normalizeMyReservation')
    expect(minePanel).not.toContain('record.itemName ??')
    expect(minePanel).not.toContain('extractHm(record.startTime)')
  })

  it('状态徽标回落后端文案或状态 key（已取消可区分）', () => {
    expect(minePanel).toContain("item.statusName || t(item.statusKey)")
  })

  it('取消预约已接入（实测契约：记录 id + allCancel）', () => {
    expect(minePanel).toContain('invokeNative')
    expect(minePanel).toContain("'library_reserve_cancel'")
    // 实测（2026-10-19）：主键是记录 id，不是 aprvId
    expect(minePanel).toContain('id: item.recordId')
    expect(minePanel).toContain('canCancel')
    expect(minePanel).toContain('askCancel')
    expect(minePanel).toContain('confirmCancel')
    expect(minePanel).toContain('library.reserve.mine.cancel')
    // 不得再下发 aprv_id（实测恒为 0，不能作主键）
    expect(minePanel).not.toContain('aprv_id')
  })
})

describe('#1080 座位面板：余量查询接线 + 功能置顶（信息层级）', () => {
  it('接入余量相关命令（config / levels / time_range / match）', () => {
    for (const command of [
      'library_reserve_seat_config',
      'library_reserve_seat_levels',
      'library_reserve_seat_time_range',
      'library_reserve_seat_match'
    ]) {
      expect(seatPanel, `缺少 ${command} 调用`).toContain(`'${command}'`)
    }
  })

  it('区域筛选逐级联动（levelType 0/1/2 + 上级名称参数）', () => {
    expect(seatPanel).toContain('levelType')
    expect(seatPanel).toContain('firstLevelName')
    expect(seatPanel).toContain('secondLevelName')
  })

  it('命令层嵌套字段必须 snake_case（camelCase 会 missing field，实测踩过）', () => {
    // 实测报错：`invalid args 'req' for command 'library_reserve_seat_match': missing field 'start_time'`
    // 原因：Rust 侧请求结构体字段是 snake_case（仓库既有约定，同 `library_reserve_time_list`），
    // 而命令级 `rename_all = "camelCase"` 只作用于命令名与参数名，不影响嵌套结构体字段。
    const levelsBlock = blockOf(seatPanel, 'const loadLevels')
    const matchBlock = blockOf(seatPanel, 'const findSeat')
    expect(levelsBlock, '未定位到 loadLevels 代码块').toContain('level_type: levelType')
    expect(matchBlock, '未定位到 findSeat 代码块').toContain('start_time:')
    expect(matchBlock).toContain('end_time:')
    for (const [name, block] of [
      ['loadLevels', levelsBlock],
      ['findSeat', matchBlock]
    ] as const) {
      // 去掉函数签名行（形参本身叫 levelType，会误命中）
      const body = block.split('\n').slice(1).join('\n')
      expect(body, `${name} 不得下发 camelCase 字段`).not.toMatch(
        /\b(startTime|endTime|levelType|firstLevelName|secondLevelName|thirdLevelName)\s*[:,]/
      )
    }
  })

  it('功能置顶：查找空座位区块先于通知 / 规则区块出现', () => {
    const findIndex = seatPanel.indexOf('class="card func')
    const noticeIndex = seatPanel.indexOf('class="card notice')
    expect(findIndex, '未找到功能区区块').toBeGreaterThan(-1)
    expect(noticeIndex, '未找到通知区块').toBeGreaterThan(-1)
    expect(findIndex).toBeLessThan(noticeIndex)
  })

  it('不再展示「暂不支持」三段长文案，改为一句提示（且不再引导去超星 App 提交）', () => {
    expect(seatPanel).not.toContain('library.reserve.seat.unsupported.availability')
    expect(seatPanel).not.toContain('library.reserve.seat.unsupported.select')
    expect(seatPanel).not.toContain('library.reserve.seat.section.unsupported')
    expect(seatPanel).toContain('library.reserve.seat.unsupported.hint')
  })

  it('座位面板不涉及取消逻辑', () => {
    expect(seatPanel).not.toContain('library_reserve_cancel')
  })
})

describe('#1081 座位面板：可视化时间片网格（不再下拉选起止）', () => {
  it('时间片由 buildSeatTimeCells 渲染成可点网格', () => {
    expect(seatPanel).toContain('buildSeatTimeCells')
    expect(seatPanel).toContain('resolveSeatTimeCellClick')
    expect(seatPanel).toContain('@click="selectCell(cell)"')
    expect(seatPanel).toContain('class="grid"')
  })

  it('起止时间下拉框已移除（用户反馈：不要让用户自己选开始和结束时间）', () => {
    expect(seatPanel).not.toContain('v-model.number="startIndex"')
    expect(seatPanel).not.toContain('v-model.number="endIndex"')
    expect(seatPanel).not.toContain('endSliceOptions')
    expect(seatPanel).not.toContain('library.reserve.seat.find.start')
    expect(seatPanel).not.toContain('library.reserve.seat.find.end')
  })

  it('选中区间有明确反馈（已选区间文案 + 网格高亮态）', () => {
    expect(seatPanel).toContain('seatSelectionRangeText')
    expect(seatPanel).toContain('seatCellState')
    expect(seatPanel).toContain('library.reserve.seat.time.selected')
    expect(seatPanel).toContain('library.reserve.seat.time.gridHint')
  })
})

describe('#1081 座位面板：本机提交（验证码 + 页面内签名）', () => {
  it('结果卡片给出可用的「确认预约」按钮（不再是禁用死按钮 / 不再提示去超星 App）', () => {
    expect(seatPanel).toContain('@click="openSubmit"')
    expect(seatPanel).not.toContain('library.reserve.seat.find.submitHint')
    // 确认预约按钮本身不得带 disabled（仅弹窗内的提交按钮在忙碌时禁用）
    const line = seatPanel.split('\n').find((row) => row.includes('@click="openSubmit"'))
    expect(line, '未找到确认预约按钮').toBeTruthy()
    expect(line).not.toContain('disabled')
    // 匹配结果卡片不再出现「去超星 App 确认」类文案
    expect(seatPanel).not.toContain('Chaoxing')
  })

  it('接入 prepare / submit 两个命令（snake_case 字段）', () => {
    expect(seatPanel).toContain("'library_reserve_seat_submit_prepare'")
    const block = blockOf(seatPanel, 'const confirmSubmit = async')
    expect(block).toContain("invokeNative('library_reserve_seat_submit'")
    for (const field of ['room_id:', 'seat_num:', 'start_time:', 'end_time:', 'day:', 'captcha:', 'enc']) {
      expect(block, `提交参数缺少 ${field}`).toContain(field)
    }
    // 不得下发 camelCase（会 missing field）
    expect(block).not.toMatch(/\b(roomId|seatNum|startTime|endTime)\s*:/)
  })

  it('签名在本页面执行官方脚本（AMD shim + #submit_enc 隐藏输入）', () => {
    expect(seatPanel).toContain('buildSeatEnc')
    expect(seatPanel).toContain('id="submit_enc"')
    expect(seatSigner).toContain('office-static.chaoxing.com')
    expect(seatSigner).toContain('submitVerify.min.js')
    expect(seatSigner).toContain('define')
    expect(seatSigner).toContain('verifyParam')
    // 键集合与官方一致（顺序即序列化顺序）
    for (const key of ['roomId', 'startTime', 'endTime', 'day', 'captcha', 'seatNum', 'wyToken', 'wfwEngineEnc']) {
      expect(seatSigner, `签名参数缺少 ${key}`).toContain(`${key}:`)
    }
  })

  it('脚本只加载一次并缓存；失败分门别类给出可读文案（不静默）', () => {
    expect(seatSigner).toContain('modulePromise')
    for (const code of ['script_load', 'module_missing', 'sign_failed']) {
      expect(seatSigner).toContain(code)
    }
    for (const key of [
      'library.reserve.seat.submit.error.signScript',
      'library.reserve.seat.submit.error.signModule',
      'library.reserve.seat.submit.error.sign',
      'library.reserve.seat.submit.error.captcha',
      'library.reserve.seat.submit.error.submit',
      'library.reserve.seat.submit.captchaRequired'
    ]) {
      expect(seatPanel, `缺少失败文案 ${key}`).toContain(key)
    }
  })

  it('提交成功后刷新「当前预约」并给出结果（座位 / 时段）', () => {
    const block = blockOf(seatPanel, 'const confirmSubmit = async')
    expect(block).toContain('await loadConfig()')
    expect(block).toContain('submitSummary.value = {')
    expect(seatPanel).toContain('library.reserve.seat.submit.success')
  })
})

describe('2026-10-19 官方页面内嵌（座位 cxCaptcha 需人工验证，纯接口不可行）', () => {
  const embed = readVueContractSource('src/components/library-reserve/LibraryReserveEmbed.vue')

  it('座位面板挂载内嵌组件（live 页 = 真正的快速预约表单）', () => {
    expect(seatPanel).toContain('LibraryReserveEmbed')
    expect(seatPanel).toContain('app="seat"')
    expect(seatPanel).toContain('kind="live"')
  })

  it('组件调用 open / resize / close 三条命令', () => {
    for (const command of [
      'library_reserve_embed_open',
      'library_reserve_embed_resize',
      'library_reserve_embed_close'
    ]) {
      expect(embed, `缺少 ${command} 调用`).toContain(command)
    }
  })

  it('打开前先滚入视野（容器在屏外时原生浮层会完全不可见）', () => {
    expect(embed).toContain('scrollIntoView')
  })

  it('容器尺寸 / 位置变化要持续同步（原生浮层不会跟随 DOM）', () => {
    expect(embed).toContain('ResizeObserver')
    expect(embed).toContain("addEventListener('scroll'")
    expect(embed).toContain('setInterval')
  })

  it('卸载 / 切换应用时必须关闭浮层（否则会盖在新面板上）', () => {
    expect(embed).toContain('onBeforeUnmount')
    expect(embed).toMatch(/watch\([\s\S]*close\(\)/)
  })
})

describe('#1081 签名脚本依赖（缺 hex_md5 会 ReferenceError，实测踩过）', () => {
  it('seatSigner 必须先加载官方 md5 脚本，再注入签名脚本', () => {
    // 实测报错：`ReferenceError: hex_md5 is not defined`
    // 原因：`submitVerify.min.js` 内部调用全局 `hex_md5`，它由官方页面另行加载的
    // `js/lib/md5/md5.js` 定义；只注入签名脚本必然失败。
    expect(signer).toContain('js/lib/md5/md5.js')
    expect(signer).toContain('hex_md5')
    expect(signer).toContain('ensureMd5Global')
    // 依赖注入必须发生在签名脚本注入之前
    const ensureAt = signer.indexOf('await ensureMd5Global()')
    const signAt = signer.indexOf('injectScript(await fetchText(SIGN_SCRIPT_URL))')
    expect(ensureAt, '未找到 ensureMd5Global 调用').toBeGreaterThan(-1)
    expect(signAt, '未找到签名脚本注入').toBeGreaterThan(-1)
    expect(ensureAt).toBeLessThan(signAt)
  })
})

describe('#1080 静音仓 / 研讨室：实时占用接线（配置开放 ≠ 可预约）', () => {
  it('房间选中后同时拉「真实时段 + 实时占用」', () => {
    const block = blockOf(panel, 'const selectRoom = ')
    expect(block, '未定位到 selectRoom 代码块').toContain('loadRoomSetting(view.room.itemId)')
    expect(block).toContain('loadRoomOccupancy(view.room.itemId)')
  })

  it('占用走 library_reserve_item_occupancy，且字段一律 snake_case', () => {
    const block = blockOf(panel, 'const loadRoomOccupancy = async')
    expect(block, '未定位到 loadRoomOccupancy 代码块').toContain(
      "invokeNative('library_reserve_item_occupancy'"
    )
    for (const field of ['item_id:', 'start_time:', 'end_time:']) {
      expect(block, `占用查询缺少 ${field}`).toContain(field)
    }
    // 命令层嵌套结构体是 snake_case（camelCase 会 missing field，实测踩过）
    expect(block).not.toMatch(/\b(itemId|startTime|endTime)\s*:/)
    expect(block).toContain('normalizeRoomOccupancy')
  })

  it('占用合入网格判定（occupancyUsed + occupancyKnown 传给 buildRoomGrid）', () => {
    const block = blockOf(panel, 'const grid = computed')
    expect(block).toContain('occupancyUsed.value')
    expect(block).toContain('occupancyKnown.value')
  })

  it('占用未知 / 失败必须明确降级：整表置灰 + 提示 + 重试入口', () => {
    const block = blockOf(panel, 'const occupancyKnown = computed')
    // 占用查询失败、统计不完整、或没有真实时段 ID → 一律「未知」
    expect(block).toContain('occupancyLoaded.value')
    expect(block).toContain('occupancyError.value')
    expect(block).toContain('occupancyUnkeyed.value')
    expect(block).toContain('intervalSlots.value.length > 0')
    // 提示与重试
    expect(panel).toContain('library.reserve.booking.occupancyUnknown')
    expect(panel).toContain('library.reserve.booking.occupancyLoading')
    expect(panel).toContain('@click="loadRoomOccupancy(selectedRoomView.room.itemId)"')
    // 未知时不得允许提交
    const submitBlock = blockOf(panel, 'const requestSubmit = ')
    expect(submitBlock).toContain('occupancyKnown.value')
  })

  it('已满与未知在网格上有区分（cellState / 图例）', () => {
    expect(panel).toContain("if (cell.occupied) return 'full'")
    expect(panel).toContain("if (cell.unknown) return 'unknown'")
    expect(panel).toContain('gcell--full')
    expect(panel).toContain('gcell--unknown')
    expect(panel).toContain('library.reserve.booking.legendFull')
    expect(panel).toContain('library.reserve.toast.slotOccupied')
  })

  it('提交成功后立即刷新占用（否则刚约到的时段仍显示可约）', () => {
    const block = blockOf(panel, 'const confirmSubmit = async')
    expect(block).toContain('loadRoomOccupancy(room.itemId)')
  })
})
