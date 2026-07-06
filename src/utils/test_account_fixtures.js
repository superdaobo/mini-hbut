import { TEST_ACCOUNT, isTestAccountCredentials } from './test_account.js'

const TEST_STUDENT_ID = TEST_ACCOUNT.studentId
const TEST_SEMESTER = '2025-2026-1'
const TEST_SYNC_TIME = '2026-07-06T08:00:00+08:00'
const DEMO_DISABLED_MESSAGE = '演示账号不执行真实操作'

const clone = (value) => {
  if (value == null) return value
  return JSON.parse(JSON.stringify(value))
}

const success = (payload = {}) => ({
  success: true,
  sync_time: TEST_SYNC_TIME,
  ...payload
})

const demoDisabled = (message = DEMO_DISABLED_MESSAGE) => ({
  success: false,
  demo_disabled: true,
  error: message,
  message
})

const resourceShareDisabled = () => ({
  ...demoDisabled(),
  url: 'data:text/plain;charset=utf-8,Mini-HBUT%20TestFlight%20demo%20resource',
  needAuth: false
})

const semestersPayload = success({
  semesters: ['2025-2026-1', '2024-2025-2', '2024-2025-1'],
  current: TEST_SEMESTER
})

const studentInfo = {
  student_id: TEST_STUDENT_ID,
  name: TEST_ACCOUNT.displayName,
  gender: '男',
  grade: '2026',
  college: '计算机学院',
  major: '软件工程',
  class_name: '软工2601',
  ethnicity: '汉族',
  birth_date: '2006-09-01',
  phone: '138****2026',
  email: 'reviewer@example.com',
  id_number: '4201************26'
}

const studentInfoPayload = success({
  data: studentInfo,
  student_id: TEST_STUDENT_ID,
  name: TEST_ACCOUNT.displayName
})

const grades = [
  {
    xnxq: TEST_SEMESTER,
    term: TEST_SEMESTER,
    kcbh: 'HBUT-DEMO-001',
    kcmc: '高等数学 A',
    course_name: '高等数学 A',
    xf: '4.0',
    course_credit: '4.0',
    hdxf: '4.0',
    earned_credit: '4.0',
    zhcj: '92',
    final_score: '92',
    xfjd: '4.20',
    kcxz: '必修',
    skjs: '演示教师'
  },
  {
    xnxq: TEST_SEMESTER,
    term: TEST_SEMESTER,
    kcbh: 'HBUT-DEMO-002',
    kcmc: '程序设计基础',
    course_name: '程序设计基础',
    xf: '3.0',
    course_credit: '3.0',
    hdxf: '3.0',
    earned_credit: '3.0',
    zhcj: '88',
    final_score: '88',
    xfjd: '3.80',
    kcxz: '必修',
    skjs: '演示教师'
  },
  {
    xnxq: '2024-2025-2',
    term: '2024-2025-2',
    kcbh: 'HBUT-DEMO-003',
    kcmc: '大学英语',
    course_name: '大学英语',
    xf: '2.0',
    course_credit: '2.0',
    hdxf: '2.0',
    earned_credit: '2.0',
    zhcj: '优秀',
    final_score: '优秀',
    xfjd: '4.50',
    kcxz: '公共基础',
    skjs: '演示教师'
  }
]

const gradesPayload = success({ data: grades })

const scheduleCourses = [
  {
    id: 'demo-schedule-1',
    name: '高等数学 A',
    teacher: '演示教师',
    room: '一教 301',
    room_code: '一教 301',
    building: '第一教学楼',
    class_name: '软工2601',
    weekday: 1,
    period: 1,
    start_period: 1,
    end_period: 2,
    djs: 2,
    weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    week_text: '1-16周'
  },
  {
    id: 'demo-schedule-2',
    name: '程序设计基础',
    teacher: '演示教师',
    room: '实训楼 502',
    room_code: '实训楼 502',
    building: '实训楼',
    class_name: '软工2601',
    weekday: 3,
    period: 5,
    start_period: 5,
    end_period: 6,
    djs: 2,
    weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    week_text: '1-16周'
  },
  {
    id: 'demo-schedule-3',
    name: '大学英语',
    teacher: '演示教师',
    room: '三教 204',
    room_code: '三教 204',
    building: '第三教学楼',
    class_name: '软工2601',
    weekday: 5,
    period: 3,
    start_period: 3,
    end_period: 4,
    djs: 2,
    weeks: [1, 3, 5, 7, 9, 11, 13, 15],
    week_text: '单周'
  }
]

const schedulePayload = success({
  data: scheduleCourses,
  meta: {
    semester: TEST_SEMESTER,
    start_date: '2026-03-02',
    current_week: 8,
    total_weeks: 20,
    vacation_notice: ''
  }
})

const examsPayload = success({
  data: [
    {
      course_name: '高等数学 A',
      exam_date: '2026-07-15',
      exam_time: '09:00-11:00',
      location: '一教 201',
      seat_no: '18'
    },
    {
      course_name: '程序设计基础',
      exam_date: '2026-07-18',
      exam_time: '14:00-16:00',
      location: '实训楼 401',
      seat_no: '06'
    }
  ]
})

const rankingPayload = success({
  data: {
    student_id: TEST_STUDENT_ID,
    name: TEST_ACCOUNT.displayName,
    major: '软件工程',
    gpa: '3.86',
    avg_score: '90.2',
    gpa_class_rank: 3,
    gpa_class_total: 42,
    gpa_major_rank: 12,
    gpa_major_total: 180,
    gpa_college_rank: 36,
    gpa_college_total: 640,
    avg_class_rank: 4,
    avg_class_total: 42,
    avg_major_rank: 15,
    avg_major_total: 180,
    avg_college_rank: 41,
    avg_college_total: 640
  }
})

const calendarPayload = success({
  data: [
    {
      ny: '2026-03',
      zc: 1,
      monday: '2',
      tuesday: '3',
      wednesday: '4',
      thursday: '5',
      friday: '6',
      saturday: '7',
      sunday: '8',
      bz: '开学周'
    },
    {
      ny: '2026-03',
      zc: 2,
      monday: '9',
      tuesday: '10',
      wednesday: '11',
      thursday: '12',
      friday: '13',
      saturday: '14',
      sunday: '15',
      bz: ''
    }
  ],
  meta: {
    semester: TEST_SEMESTER,
    current_week: 8
  }
})

const academicPayload = success({
  data: {
    summary: {
      gpa: '3.86',
      pjcj: '90.2',
      hdzxf: '9.0',
      yxkms: '3',
      bjgms: '0',
      gpazypm: '12/180',
      xwjdpm: '12/180'
    },
    tree: [
      {
        nodeId: 'demo-required',
        nodeName: '公共基础与专业基础',
        yqzdxf: '9',
        yqzgxf: '12',
        kcList: grades.map((item) => ({
          kcbh: item.kcbh,
          kcmc: item.kcmc,
          xf: item.xf,
          hdxf: item.hdxf,
          xfjd: item.xfjd,
          zhcj: item.zhcj,
          xnxq: item.xnxq,
          kcxz: item.kcxz,
          skjs: item.skjs,
          wczt: '已修通过'
        }))
      }
    ]
  }
})

const trainingOptionsPayload = success({
  options: {
    grade: [{ value: '2026', label: '2026级' }],
    kkxq: [{ value: TEST_SEMESTER, label: TEST_SEMESTER }],
    kkyx: [{ value: 'demo-college', label: '计算机学院' }],
    kkjys: [{ value: 'demo-jys', label: '软件工程系' }],
    kcxz: [{ value: '必修', label: '必修' }, { value: '公共基础', label: '公共基础' }],
    kcgs: [{ value: '理论', label: '理论' }, { value: '实验', label: '实验' }]
  },
  defaults: {
    grade: '2026',
    kkxq: TEST_SEMESTER,
    kkyx: 'demo-college',
    kkjys: 'demo-jys'
  }
})

const trainingCoursesPayload = success({
  data: grades.map((item, index) => ({
    id: `demo-training-${index + 1}`,
    kcbh: item.kcbh,
    kcmc: item.kcmc,
    xf: item.xf,
    kcxz: item.kcxz,
    kcgs: index === 1 ? '实验' : '理论',
    kkyxmc: '计算机学院',
    kkjysmc: '软件工程系',
    kkxq: item.xnxq
  })),
  page: 1,
  total: grades.length,
  totalPages: 1
})

const electricityPayload = success({
  balance: '42.60',
  quantity: '128.50',
  status: '正常'
})

const classroomBuildingsPayload = success({
  data: ['第一教学楼', '第三教学楼', '实训楼']
})

const classroomPayload = success({
  data: [
    { building: '第一教学楼', room: '101', room_name: '一教 101', capacity: 80, seats: 80 },
    { building: '第一教学楼', room: '203', room_name: '一教 203', capacity: 60, seats: 60 },
    { building: '第三教学楼', room: '204', room_name: '三教 204', capacity: 72, seats: 72 }
  ],
  meta: {
    date_str: '2026-07-06',
    week: 8,
    weekday: 1,
    weekday_name: '周一',
    semester: TEST_SEMESTER,
    periods: [1, 2, 3, 4]
  }
})

const loginAccessPayload = success({
  data: {
    current_login: {
      client_ip: '127.0.0.1',
      ip_location: 'TestFlight 演示环境',
      login_time: TEST_SYNC_TIME,
      browser: 'Mini HBUT Demo'
    },
    current_logins: [
      {
        client_ip: '127.0.0.1',
        ip_location: 'TestFlight 演示环境',
        login_time: TEST_SYNC_TIME,
        browser: 'Mini HBUT Demo'
      }
    ],
    app_access_records: [
      {
        app_name: 'mini-hbut',
        access_time: TEST_SYNC_TIME,
        auth_result: '成功',
        browser: 'Mini HBUT Demo'
      }
    ],
    auth_info: {
      phone_verified: true,
      phone: '138****2026',
      email_verified: true,
      email: 'reviewer@example.com',
      password_hint: '演示账号'
    },
    app_access_pagination: {
      page: 1,
      page_size: 10,
      total: 1,
      total_pages: 1
    }
  }
})

const libraryDictPayload = success({
  data: {
    resourceType: [{ code: 'BK', name: '图书' }],
    publisher: [{ code: 'demo-publisher', name: '高等教育出版社' }],
    author: [{ code: 'demo-author', name: '演示作者' }],
    discode1: [{ code: 'TP', name: '计算机技术' }],
    langCode: [{ code: 'chi', name: '中文' }],
    countryCode: [{ code: 'CN', name: '中国' }],
    locationId: [{ code: 'demo-lib', name: '南湖校区图书馆' }]
  }
})

const libraryBook = {
  recordId: 'demo-book-1',
  title: '软件工程导论',
  author: '演示作者',
  publisher: '高等教育出版社',
  publishYear: '2024',
  isbn: '9787040000000',
  callNo: ['TP311.5/DEMO'],
  locationName: '南湖校区图书馆',
  processTypeName: '可借'
}

const librarySearchPayload = success({
  data: {
    searchResult: [libraryBook],
    numFound: 1,
    facetResult: {
      resourceType: { BK: 1 },
      publisher: { demo_publisher: 1 },
      author: { demo_author: 1 },
      discode1: { TP: 1 },
      langCode: { chi: 1 },
      countryCode: { CN: 1 },
      locationId: { demo_lib: 1 }
    }
  }
})

const libraryDetailPayload = success({
  data: {
    detail: {
      ...libraryBook,
      adstract: '这是演示账号预置的图书详情，用于 TestFlight 审核浏览。'
    },
    holding: {
      orderFlag: '0'
    },
    holding_items: [
      {
        locationName: '南湖校区图书馆',
        callNo: 'TP311.5/DEMO',
        statusName: '在架'
      }
    ]
  }
})

const courseSelectionOverviewPayload = success({
  data: {
    tabs: [
      {
        xkgzid: 'demo-batch',
        xkgzMc: '演示选课批次',
        kklx: '01'
      }
    ],
    pcencs: {
      'demo-batch': 'demo-pcenc'
    },
    has_valid_pcencs: true,
    message: '演示账号仅展示选课流程，不允许提交真实选课。'
  }
})

const courseSelectionListPayload = success({
  data: {
    condition: {},
    available_ratio: '100',
    occupied_slots: [],
    count: 1,
    courses: [
      {
        id: 'demo-course-selection-1',
        jxbid: 'demo-course-selection-1',
        kcmc: '创新创业基础',
        kcbh: 'DEMO-XK-001',
        teacher: '演示教师',
        xf: '2.0',
        kcxz: '通识选修',
        schedule: '周二第7-8节',
        capacity: 80,
        selected: 12
      }
    ],
    message: ''
  }
})

const campusCodeConfigPayload = success({
  resultData: {
    disableOnline: false,
    enableOffline: true,
    refreshSecond: 60
  }
})

const campusCodePayload = success({
  resultData: {
    qrcode: `MINI-HBUT-DEMO-${TEST_STUDENT_ID}`,
    balance: '88.80',
    idSerial: TEST_STUDENT_ID,
    userName: TEST_ACCOUNT.displayName
  }
})

const qxzkbOptionsPayload = success({
  data: {
    xnxq: [{ value: TEST_SEMESTER, label: TEST_SEMESTER }],
    yx: [{ value: 'demo-college', label: '计算机学院' }],
    nj: [{ value: '2026', label: '2026级' }]
  }
})

const onlineLearningPayload = success({
  data: {
    connected: true,
    status: 'ready',
    message: '演示账号学习平台数据',
    courses: [
      {
        id: 'demo-online-1',
        course_id: 'demo-online-course',
        clazz_id: 'demo-online-class',
        title: '软件工程导论',
        teacher: '演示教师',
        progress_text: '已完成 65%',
        progress_rate: 65,
        pending_count: 2
      }
    ]
  }
})

const onlineOutlinePayload = success({
  data: {
    sections: [
      {
        id: 'demo-section-1',
        title: '第一章 软件工程概述',
        tasks: [
          {
            id: 'demo-task-1',
            title: '课程导学',
            type: 'video',
            status: '已完成',
            progress: '100%'
          },
          {
            id: 'demo-task-2',
            title: '章节测验',
            type: 'quiz',
            status: '未完成',
            progress: '0%'
          }
        ]
      }
    ]
  }
})

const schoolInboxPayload = {
  items: [
    {
      id: 'demo-inbox-1',
      title: 'TestFlight 演示通知',
      summary: '这是演示账号的预置消息。',
      body: '<p>这是演示账号的预置消息内容，用于审核人员浏览学校消息模块。</p>',
      createdAt: TEST_SYNC_TIME,
      isRead: false,
      source: 'portal'
    }
  ],
  fetchedAt: TEST_SYNC_TIME,
  source: 'portal'
}

const forumCategories = [
  { id: 1, slug: 'campus', name: '校园广场', description: 'TestFlight 演示校园交流' },
  { id: 2, slug: 'study', name: '学习互助', description: '演示账号预置学习讨论' }
]

const forumThreads = [
  {
    id: 101,
    category_id: 1,
    title: 'TestFlight 演示帖',
    content_md: '这是演示账号预置的社区帖子，不会连接真实论坛服务。',
    author_student_id: TEST_STUDENT_ID,
    created_at: TEST_SYNC_TIME,
    updated_at: TEST_SYNC_TIME,
    reply_count: 1,
    up_count: 3,
    down_count: 0,
    attachment_ids: []
  },
  {
    id: 102,
    category_id: 2,
    title: '课程资料互助演示',
    content_md: '这里展示学习互助模块的本地演示内容。',
    author_student_id: '2026000002',
    created_at: TEST_SYNC_TIME,
    updated_at: TEST_SYNC_TIME,
    reply_count: 0,
    up_count: 1,
    down_count: 0,
    attachment_ids: ['demo-forum-attachment']
  }
]

const forumReplies = [
  {
    id: 201,
    thread_id: 101,
    content_md: '这是一条本地演示回复。',
    author_student_id: '2026000002',
    created_at: TEST_SYNC_TIME,
    up_count: 2,
    down_count: 0,
    attachment_ids: []
  }
]

const forumPolls = [
  {
    id: 301,
    title: 'TestFlight 审核体验投票',
    description: '本地演示投票，不会写入远端。',
    status: 'active',
    created_at: TEST_SYNC_TIME,
    my_vote_option_id: null,
    options: [
      { id: 1, label: '界面清晰', score: 10, votes: 8 },
      { id: 2, label: '功能完整', score: 9, votes: 6 },
      { id: 3, label: '需要改进', score: 3, votes: 1 }
    ]
  }
]

const forumProfile = {
  student_id: TEST_STUDENT_ID,
  nickname: TEST_ACCOUNT.displayName,
  avatar_url: '',
  bio: 'TestFlight 本地演示社区资料',
  is_admin: false
}

const forumStats = {
  thread_count: 1,
  reply_count: 1,
  bookmark_count: 1,
  checkin_count: 3
}

const forumBadges = [
  { badge_key: 'reviewer', display_name: '审核体验官' }
]

const forumDemoDisabled = (message = '未知测试账号 forum 请求已拦截') => ({
  success: false,
  demo_disabled: true,
  error: message,
  message
})

const resourceShareXml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype><d:getcontentlength>0</d:getcontentlength></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/TestFlight演示资料/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype><d:getcontentlength>0</d:getcontentlength></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/TestFlight演示资料/使用说明.txt</d:href>
    <d:propstat><d:prop><d:resourcetype/><d:getcontentlength>128</d:getcontentlength><d:getcontenttype>text/plain</d:getcontenttype></d:prop></d:propstat>
  </d:response>
</d:multistatus>`

const cachePayloads = new Map([
  ['semesters', semestersPayload],
  [`grades:${TEST_STUDENT_ID}`, gradesPayload],
  [`schedule:${TEST_STUDENT_ID}`, schedulePayload],
  [`schedule:${TEST_STUDENT_ID}:${TEST_SEMESTER}`, schedulePayload],
  [`studentinfo:${TEST_STUDENT_ID}`, studentInfoPayload],
  [`student_info:${TEST_STUDENT_ID}`, studentInfoPayload],
  [`exams:${TEST_STUDENT_ID}:current`, examsPayload],
  [`exams:${TEST_STUDENT_ID}:${TEST_SEMESTER}`, examsPayload],
  [`ranking:${TEST_STUDENT_ID}`, rankingPayload],
  [`ranking:${TEST_STUDENT_ID}:all`, rankingPayload],
  [`ranking:${TEST_STUDENT_ID}:current`, rankingPayload],
  [`ranking:${TEST_STUDENT_ID}:${TEST_SEMESTER}`, rankingPayload],
  [`calendar:${TEST_STUDENT_ID}:current`, calendarPayload],
  [`calendar:${TEST_STUDENT_ID}:${TEST_SEMESTER}`, calendarPayload],
  [`academic:${TEST_STUDENT_ID}:1`, academicPayload],
  [`academic:${TEST_STUDENT_ID}:0`, academicPayload],
  [`academic:${TEST_STUDENT_ID}:2`, academicPayload],
  [`academic:${TEST_STUDENT_ID}:4`, academicPayload],
  [`training:options:${TEST_STUDENT_ID}`, trainingOptionsPayload],
  [`training:jys:${TEST_STUDENT_ID}:demo-college`, success({ data: trainingOptionsPayload.options.kkjys })],
  [`electricity:${TEST_STUDENT_ID}:light`, electricityPayload],
  ['classroom:buildings', classroomBuildingsPayload]
])

export const getTestAccountGrades = () => clone(grades)

export const seedTestAccountCaches = (setCachedData, studentId = TEST_STUDENT_ID) => {
  if (typeof setCachedData !== 'function') return []
  const sid = String(studentId || TEST_STUDENT_ID).trim() || TEST_STUDENT_ID
  const entries = [
    [`grades:${sid}`, gradesPayload],
    [`schedule:${sid}`, schedulePayload],
    [`schedule:${sid}:${TEST_SEMESTER}`, schedulePayload],
    [`studentinfo:${sid}`, studentInfoPayload],
    [`student_info:${sid}`, studentInfoPayload],
    [`exams:${sid}:current`, examsPayload],
    [`exams:${sid}:${TEST_SEMESTER}`, examsPayload],
    [`ranking:${sid}:current`, rankingPayload],
    [`ranking:${sid}:all`, rankingPayload],
    [`calendar:${sid}:current`, calendarPayload],
    [`calendar:${sid}:${TEST_SEMESTER}`, calendarPayload],
    [`academic:${sid}:1`, academicPayload],
    [`training:options:${sid}`, trainingOptionsPayload],
    [`training:jys:${sid}:demo-college`, success({ data: trainingOptionsPayload.options.kkjys })],
    [`training:${sid}:1:${JSON.stringify(trainingOptionsPayload.defaults)}`, trainingCoursesPayload],
    [`electricity:${sid}:light`, electricityPayload]
  ]

  entries.forEach(([key, payload]) => setCachedData(key, clone(payload)))
  return entries.map(([key]) => key)
}

export const resolveTestAccountCachePayload = (key) => {
  const text = String(key || '').trim()
  if (!text) return null
  if (cachePayloads.has(text)) return clone(cachePayloads.get(text))
  if (text.startsWith(`grades:${TEST_STUDENT_ID}`)) return clone(gradesPayload)
  if (text.startsWith(`schedule:${TEST_STUDENT_ID}`)) return clone(schedulePayload)
  if (text.startsWith(`studentinfo:${TEST_STUDENT_ID}`) || text.startsWith(`student_info:${TEST_STUDENT_ID}`)) return clone(studentInfoPayload)
  if (text.startsWith(`exams:${TEST_STUDENT_ID}`)) return clone(examsPayload)
  if (text.startsWith(`ranking:${TEST_STUDENT_ID}`)) return clone(rankingPayload)
  if (text.startsWith(`calendar:${TEST_STUDENT_ID}`)) return clone(calendarPayload)
  if (text.startsWith(`academic:${TEST_STUDENT_ID}`)) return clone(academicPayload)
  if (text.startsWith(`training:options:${TEST_STUDENT_ID}`)) return clone(trainingOptionsPayload)
  if (text.startsWith(`training:jys:${TEST_STUDENT_ID}`)) return success({ data: clone(trainingOptionsPayload.options.kkjys) })
  if (text.startsWith(`training:${TEST_STUDENT_ID}:`)) return clone(trainingCoursesPayload)
  if (text.startsWith(`electricity:${TEST_STUDENT_ID}:`)) return clone(electricityPayload)
  if (text.startsWith('classroom:')) return text === 'classroom:buildings' ? clone(classroomBuildingsPayload) : clone(classroomPayload)
  return null
}

export const resolveTestAccountHttpResponse = (method, url, data = {}) => {
  const httpMethod = String(method || '').toLowerCase()
  const path = String(url || '')

  if (httpMethod === 'post' && path.includes('/v2/start_login')) {
    if (!isTestAccountCredentials(data?.username, data?.password)) return null
    return success({
      data: {
        student_id: TEST_STUDENT_ID,
        name: TEST_ACCOUNT.displayName,
        login_method: 'test_account'
      }
    })
  }

  if (httpMethod === 'get' && path.includes('/v2/semesters')) return clone(semestersPayload)
  if (httpMethod === 'get' && path.includes('/v2/qxzkb/options')) return clone(qxzkbOptionsPayload)
  if (httpMethod === 'get' && path.includes('/v2/classroom/buildings')) return clone(classroomBuildingsPayload)

  if (httpMethod !== 'post') return null
  if (path.includes('/v2/quick_fetch')) return clone(gradesPayload)
  if (path.includes('/v2/grade_teacher')) return success({ by_kcbh: {}, semesters: {} })
  if (path.includes('/v2/schedule/custom/list')) return success({ data: [] })
  if (path.includes('/v2/schedule/custom/add') || path.includes('/v2/schedule/custom/update') || path.includes('/v2/schedule/custom/delete')) return demoDisabled()
  if (path.includes('/v2/schedule/export_calendar')) return success({ url: 'mini-hbut-demo-calendar://readonly' })
  if (path.includes('/v2/schedule/query')) return clone(schedulePayload)
  if (path.includes('/v2/student_login_access')) return clone(loginAccessPayload)
  if (path.includes('/v2/student_info')) return clone(studentInfoPayload)
  if (path.includes('/v2/exams')) return clone(examsPayload)
  if (path.includes('/v2/ranking')) return clone(rankingPayload)
  if (path.includes('/v2/calendar')) return clone(calendarPayload)
  if (path.includes('/v2/academic_progress')) return clone(academicPayload)
  if (path.includes('/v2/classroom/query')) return clone(classroomPayload)
  if (path.includes('/v2/training_plan/options')) return clone(trainingOptionsPayload)
  if (path.includes('/v2/training_plan/jys')) return success({ data: clone(trainingOptionsPayload.options.kkjys) })
  if (path.includes('/v2/training_plan')) return clone(trainingCoursesPayload)
  if (path.includes('/v2/electricity/balance')) return clone(electricityPayload)
  if (path.includes('/v2/campus_code/config')) return clone(campusCodeConfigPayload)
  if (path.includes('/v2/campus_code/qrcode')) return clone(campusCodePayload)
  if (path.includes('/v2/campus_code/order_status')) return success({ resultData: { status: '5' } })
  if (path.includes('/v2/library/dict')) return clone(libraryDictPayload)
  if (path.includes('/v2/library/search')) return clone(librarySearchPayload)
  if (path.includes('/v2/library/detail')) return clone(libraryDetailPayload)
  if (path.includes('/v2/qxzkb/jcinfo')) return success({ data: [] })
  if (path.includes('/v2/qxzkb/zyxx')) return success({ data: [] })
  if (path.includes('/v2/qxzkb/kkjys')) return success({ data: [] })
  if (path.includes('/v2/qxzkb/query')) return success({ data: [] })
  if (path.includes('/v2/course_selection/overview')) return clone(courseSelectionOverviewPayload)
  if (path.includes('/v2/course_selection/list')) return clone(courseSelectionListPayload)
  if (path.includes('/v2/course_selection/end_time')) return success({ data: { remaining_seconds: 3600, countdown_text: '01:00:00', is_preview: false } })
  if (path.includes('/v2/course_selection/selected_courses')) return success({ data: { courses: [] } })
  if (path.includes('/v2/course_selection/child_classes')) return success({ data: { classes: [] } })
  if (path.includes('/v2/course_selection/select') || path.includes('/v2/course_selection/withdraw')) return demoDisabled()
  if (path.includes('/v2/course_selection/detail_intro')) return success({ data: { intro: '演示课程说明。' } })
  if (path.includes('/v2/course_selection/detail_teacher')) return success({ data: { teachers: [{ name: '演示教师', title: '讲师' }] } })
  if (path.includes('/v2/online_learning/sync_now') || path.includes('/v2/online_learning/clear_cache')) return demoDisabled()
  if (path.includes('/v2/online_learning/overview')) return clone(onlineLearningPayload)
  if (path.includes('/v2/online_learning/sync_runs')) return success({ data: { runs: [] } })
  if (path.includes('/v2/chaoxing/session_status')) return success({ data: { connected: true, status: 'ready', message: '演示会话已连接' } })
  if (path.includes('/v2/chaoxing/courses') || path.includes('/v2/yuketang/courses')) return clone(onlineLearningPayload)
  if (path.includes('/v2/chaoxing/course_outline') || path.includes('/v2/yuketang/course_outline')) return clone(onlineOutlinePayload)
  if (path.includes('/v2/chaoxing/course_progress') || path.includes('/v2/yuketang/course_progress')) return success({ data: { percent: 65, progress_text: '已完成 65%' } })
  if (path.includes('/v2/chaoxing/knowledge_cards') || path.includes('/v2/chaoxing/video_status') || path.includes('/v2/yuketang/course_chapters') || path.includes('/v2/yuketang/leaf_info')) return clone(onlineOutlinePayload)
  if (path.includes('/v2/chaoxing/report_progress') || path.includes('/v2/yuketang/heartbeat') || path.includes('/v2/chaoxing/launch_url') || path.includes('/v2/yuketang/qr_login')) return demoDisabled()

  return null
}

export const resolveTestAccountNativeResponse = (command, args = {}) => {
  const name = String(command || '').trim()
  if (!name) return null

  if (name === 'fetch_student_info') return clone(studentInfoPayload)
  if (name === 'sync_grades') return clone(gradesPayload)
  if (name === 'sync_schedule') return clone(schedulePayload)
  if (name === 'fetch_semesters') return clone(semestersPayload)
  if (name === 'fetch_exams') return clone(examsPayload)
  if (name === 'fetch_ranking') return clone(rankingPayload)
  if (name === 'fetch_calendar_data') return clone(calendarPayload)
  if (name === 'fetch_academic_progress') return clone(academicPayload)
  if (name === 'fetch_training_plan_options') return clone(trainingOptionsPayload)
  if (name === 'fetch_training_plan_jys') return success({ data: clone(trainingOptionsPayload.options.kkjys) })
  if (name === 'fetch_training_plan_courses') return clone(trainingCoursesPayload)
  if (name === 'fetch_classroom_buildings') return clone(classroomBuildingsPayload)
  if (name === 'fetch_classrooms') return clone(classroomPayload)
  if (name === 'fetch_personal_login_access_info') return clone(loginAccessPayload)
  if (name === 'get_grade_teacher_cache' || name === 'sync_grade_teachers_current_semester') return success({ by_kcbh: {}, semesters: {} })
  if (name === 'list_custom_schedule_courses' || name === 'list_all_custom_schedule_courses') return success({ data: [] })
  if (name === 'add_custom_schedule_course' || name === 'update_custom_schedule_course' || name === 'delete_custom_schedule_course') return demoDisabled()
  if (name === 'export_schedule_calendar') return success({ url: 'mini-hbut-demo-calendar://readonly' })
  if (name === 'electricity_query_account') {
    return {
      success: true,
      resultData: {
        utilityStatusName: '正常',
        sync_time: TEST_SYNC_TIME,
        templateList: [
          { code: 'balance', value: '42.60' },
          { code: 'quantity', value: '128.50' }
        ]
      }
    }
  }
  if (name.startsWith('campus_code_')) {
    if (name.includes('config')) return clone(campusCodeConfigPayload)
    if (name.includes('qrcode')) return clone(campusCodePayload)
    return success({ resultData: { status: '5' } })
  }
  if (name.startsWith('fetch_library') || name.startsWith('search_library')) {
    if (name.includes('dict')) return clone(libraryDictPayload)
    return clone(librarySearchPayload)
  }
  if (name === 'fetch_library_book_detail') return clone(libraryDetailPayload)
  if (name.startsWith('fetch_qxzkb')) return success({ data: [] })
  if (name.includes('course_selection')) {
    if (name.includes('select_') || name.includes('withdraw')) return demoDisabled()
    return success({ data: {} })
  }
  if (name.startsWith('online_learning') || name.startsWith('chaoxing_') || name.startsWith('yuketang_')) {
    if (name.includes('sync') || name.includes('clear') || name.includes('report') || name.includes('heartbeat') || name.includes('qr_login')) return demoDisabled()
    return clone(onlineLearningPayload)
  }
  if (name === 'fetch_transaction_history') return success({ data: [] })
  if (name === 'school_inbox_fetch') return clone(schoolInboxPayload)
  if (name === 'school_inbox_detail_fetch') {
    const fallback = args?.fallback && typeof args.fallback === 'object' ? args.fallback : schoolInboxPayload.items[0]
    return { ...clone(fallback), body: fallback.body || schoolInboxPayload.items[0].body }
  }
  if (name === 'school_inbox_mark_read') return { success: true }
  if (name === 'resource_share_list_dir_native') return { success: true, xml: resourceShareXml }
  if (name === 'resource_share_direct_url_native') return resourceShareDisabled()
  if (name === 'resource_share_fetch_file_payload_native') return demoDisabled()
  if (name === 'get_cookies') return ''
  if (name === 'restore_session' || name === 'restore_latest_session' || name === 'login') return { student_id: TEST_STUDENT_ID, name: TEST_ACCOUNT.displayName }
  if (name === 'logout' || name === 'refresh_session' || name === 'set_offline_user_context') return { success: true }
  if (name === 'refresh_electricity_token') return { success: true }
  if (name === 'get_ocr_runtime_status') return { success: true, status: 'disabled', demo: true }
  if (name === 'hbut_ai_init' || name === 'hbut_ai_chat' || name === 'hbut_ai_upload') return demoDisabled('演示账号不调用 AI 服务')

  return null
}

const parseForumPath = (path) => {
  try {
    return new URL(String(path || '/'), 'https://mini-hbut.local')
  } catch {
    return new URL('/', 'https://mini-hbut.local')
  }
}

const isFormDataPayload = (value) =>
  typeof FormData !== 'undefined' && value instanceof FormData

const normalizeForumBody = (body) =>
  body && typeof body === 'object' && !isFormDataPayload(body) ? body : {}

const findForumThread = (threadId) => {
  const id = Number(threadId || 0)
  return forumThreads.find((thread) => Number(thread.id) === id) || forumThreads[0]
}

export const resolveTestAccountForumResponse = (path, options = {}) => {
  const method = String(options?.method || 'GET').toUpperCase()
  const url = parseForumPath(path)
  const pathname = url.pathname.replace(/\/+$/, '') || '/'
  const body = normalizeForumBody(options?.body)

  if (pathname === '/auth/token') {
    return {
      token: 'test-account-forum-token',
      expires_at: 4102444800
    }
  }

  if (method === 'GET' && pathname === '/categories') {
    return { items: clone(forumCategories) }
  }
  if (method === 'POST' && pathname === '/categories') {
    return {
      id: Number(body.id || 99),
      slug: String(body.slug || 'demo').trim() || 'demo',
      name: String(body.name || '演示版块').trim() || '演示版块',
      description: String(body.description || '').trim()
    }
  }

  if (method === 'GET' && pathname === '/threads/hot') {
    return { items: clone(forumThreads) }
  }
  if (method === 'GET' && pathname === '/threads') {
    const categoryId = Number(url.searchParams.get('category_id') || 0)
    const items = categoryId
      ? forumThreads.filter((thread) => Number(thread.category_id) === categoryId)
      : forumThreads
    return { items: clone(items) }
  }
  if (method === 'GET' && pathname === '/search') {
    const query = String(url.searchParams.get('q') || '').trim().toLowerCase()
    const items = query
      ? forumThreads.filter((thread) =>
        `${thread.title} ${thread.content_md}`.toLowerCase().includes(query)
      )
      : forumThreads
    return { items: clone(items) }
  }
  if (method === 'POST' && pathname === '/threads') {
    return {
      ...clone(forumThreads[0]),
      id: 901,
      category_id: Number(body.category_id || forumCategories[0].id),
      title: String(body.title || '演示新帖').trim() || '演示新帖',
      content_md: String(body.content_md || '演示账号本地发帖内容').trim(),
      attachment_ids: Array.isArray(body.attachment_ids) ? clone(body.attachment_ids) : [],
      reply_count: 0,
      created_at: TEST_SYNC_TIME,
      updated_at: TEST_SYNC_TIME
    }
  }

  const threadMatch = pathname.match(/^\/threads\/([^/]+)$/)
  if (method === 'GET' && threadMatch) {
    const thread = findForumThread(threadMatch[1])
    return {
      thread: clone(thread),
      replies: Number(thread.id) === 101 ? clone(forumReplies) : []
    }
  }

  const replyMatch = pathname.match(/^\/threads\/([^/]+)\/replies$/)
  if (method === 'POST' && replyMatch) {
    return {
      id: 902,
      thread_id: Number(replyMatch[1] || 0),
      content_md: String(body.content_md || '演示账号本地回复').trim(),
      author_student_id: TEST_STUDENT_ID,
      created_at: TEST_SYNC_TIME,
      up_count: 0,
      down_count: 0,
      attachment_ids: Array.isArray(body.attachment_ids) ? clone(body.attachment_ids) : []
    }
  }

  if (method === 'POST' && (
    /^\/posts\/[^/]+\/reactions$/.test(pathname) ||
    /^\/threads\/[^/]+\/bookmark$/.test(pathname) ||
    pathname === '/follows' ||
    pathname === '/reports' ||
    pathname === '/messages' ||
    pathname === '/checkins'
  )) {
    return { success: true, demo: true }
  }

  if (method === 'GET' && pathname === '/polls') {
    return { items: clone(forumPolls) }
  }
  if (method === 'POST' && /^\/polls\/[^/]+\/votes$/.test(pathname)) {
    return {
      ...clone(forumPolls[0]),
      my_vote_option_id: Number(body.option_id || forumPolls[0].options[0].id)
    }
  }
  if (method === 'POST' && pathname === '/admin/polls') {
    return {
      id: 903,
      title: String(body.title || '演示管理员投票').trim() || '演示管理员投票',
      description: String(body.description || '').trim(),
      status: 'active',
      created_at: TEST_SYNC_TIME,
      my_vote_option_id: null,
      options: Array.isArray(body.options)
        ? body.options.map((option, index) => ({
          id: index + 1,
          label: String(option.label || `选项 ${index + 1}`).trim(),
          score: Number(option.score || 0),
          votes: 0
        }))
        : clone(forumPolls[0].options)
    }
  }
  if (method === 'POST' && /^\/admin\/polls\/[^/]+\/close$/.test(pathname)) {
    return {
      ...clone(forumPolls[0]),
      status: 'closed'
    }
  }

  if (method === 'GET' && pathname === '/me/summary') {
    return {
      profile: clone(forumProfile),
      stats: clone(forumStats)
    }
  }
  if (method === 'GET' && pathname === '/me/threads') return { items: clone(forumThreads.slice(0, 1)) }
  if (method === 'GET' && pathname === '/me/replies') {
    return {
      items: forumReplies.map((reply) => ({
        ...clone(reply),
        thread_title: forumThreads.find((thread) => Number(thread.id) === Number(reply.thread_id))?.title || '演示帖子'
      }))
    }
  }
  if (method === 'GET' && pathname === '/me/bookmarks') return { items: clone(forumThreads.slice(1, 2)) }
  if (method === 'GET' && pathname === '/notifications') {
    return {
      items: [
        {
          id: 401,
          title: 'TestFlight 演示通知',
          content: '这是本地演示社区通知。',
          created_at: TEST_SYNC_TIME,
          is_read: 0
        }
      ]
    }
  }
  if (method === 'GET' && pathname === '/messages') {
    return {
      items: [
        {
          id: 501,
          sender_student_id: '2026000002',
          receiver_student_id: TEST_STUDENT_ID,
          content: '欢迎体验 Mini-HBUT 社区演示。',
          created_at: TEST_SYNC_TIME
        }
      ]
    }
  }
  if (method === 'GET' && pathname === '/badges') return { items: clone(forumBadges) }

  const userMatch = pathname.match(/^\/users\/([^/]+)$/)
  if (method === 'GET' && userMatch) {
    const target = decodeURIComponent(userMatch[1])
    return {
      profile: {
        ...clone(forumProfile),
        student_id: target,
        nickname: target === TEST_STUDENT_ID ? TEST_ACCOUNT.displayName : `演示用户 ${target.slice(-4)}`
      },
      stats: clone(forumStats),
      badges: clone(forumBadges)
    }
  }

  if (method === 'POST' && pathname === '/attachments') {
    return {
      attachment_id: 'demo-forum-attachment',
      url: 'data:text/plain;charset=utf-8,Mini-HBUT%20forum%20demo%20attachment'
    }
  }

  if (method === 'GET' && pathname === '/backups') return { items: [] }
  if (method === 'GET' && pathname === '/admin/reports') return { items: [] }
  if (method === 'GET' && pathname === '/admin/users') return { items: [] }
  if (method === 'GET' && pathname === '/admin/backups') return { items: [] }
  if (method === 'POST' && pathname.startsWith('/admin/')) {
    return { success: true, demo: true }
  }

  return forumDemoDisabled()
}
