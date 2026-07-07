import Link from 'next/link';

const academicModules = [
    {
        title: '成绩查询',
        entry: '首页 -> 教务服务 -> 成绩查询；也可从首页默认快捷入口进入。',
        source: 'src/components/GradeView.vue、src/components/GradeDistributionView.vue、src-tauri/src/modules/grades.rs、src-tauri/src/lib.rs',
        usage: [
            '进入页面后会展示课程成绩卡片，并按学期聚合成绩。页面会统计课程数、总学分、未通过课程等摘要。',
            '筛选栏支持全部学期/单学期切换、课程搜索、通过/未通过筛选、补考筛选和排序；重置按钮可恢复默认视图。',
            '成绩详情会展示课程名称、课程性质、学分、获得学分、绩点、学分绩点、补考/重修等标签，并解释“绩点 = 分数 / 10 - 5”“学分绩点 = 学分 × 绩点”。',
            '未通过课程会用挂科标签标出，统计区也会展示挂科数，便于区分“分数为空”“缓考/补考”和真实未通过课程。',
            '“成绩分布 Beta”作为成绩页内的独立 Tab，通过 GradeDistributionView 查询课程给分记录，用于观察某门课的分数段、教师和班级分布。',
        ],
        states: [
            '需要登录；如果教务 Cookie 失效，后端会返回会话已过期或登录相关错误，用户需要重新登录。',
            '支持离线缓存：offline 为真时页面显示“当前显示为离线数据”和 sync_time，说明来自本地缓存；缓存更新时间用于判断成绩是否还是上次同步结果。',
            '空状态通常表示当前筛选条件没有成绩，或教务侧尚未公布成绩；先清空筛选，再确认学期。',
        ],
    },
    {
        title: '个人课表',
        entry: '底部主 Tab -> 课表；也可从首页默认快捷入口进入。',
        source: 'src/components/ScheduleView.vue、src/utils/schedule_prefetch.js、src/utils/semester.js、src-tauri/src/modules/schedule.rs、src-tauri/src/lib.rs',
        usage: [
            '课表页以学期和周次为核心。顶部显示当前学期，周选择器用于切换教学周，课程网格按周一到周日和节次展示。',
            '课程卡片支持多种样式；点击课程可查看课程名称、教师、教室、周次、节次等课程详情。课程冲突会显示冲突提示，点开后列出重叠课程。',
            '抽屉中可以切换学期、切换课程样式、添加课程、管理自定义课程，并维护自定义课程的周次、星期、节次和地点。',
            '自定义课程支持云同步，也支持导出 JSON、导入 JSON；导出失败、导入失败、云上传失败、云下载失败都会通过 toast 或错误文本提示。',
            '课表支持日历导出，用户可导出本周或本学期，生成 ICS / iCalendar 链接后复制到浏览器打开导入手机日历。',
        ],
        states: [
            '启动时会优先读取本地渲染快照、学期锁定和 schedule 缓存，实现缓存秒开，再后台刷新。',
            '如果缺少学期开始日期，日历导出会提示暂无法导出；如果当前周没有课程，会提示当前周暂无可导出的课表数据。',
            '课表预热依赖 hbu_schedule_meta、resolveCurrentSemester 和 schedule_prefetch；自动锁定学期异常时会清理并重新探测。',
            'Android 小组件深链进入课表时会读取 Widget 快照定位日期和节次，命中课程后高亮对应格子。',
        ],
    },
    {
        title: '全校课表',
        entry: '首页 -> 教务服务 -> 全校课表。',
        source: 'src/components/GlobalScheduleView.vue、src-tauri/src/http_client/qxzkb.rs',
        usage: [
            '用于按课程名称、课程性质、课程类别、教师、班级等条件查询全校课程，适合查同名课程、行政班课表或空闲时间对照。',
            '查询结果可在课程列表中查看，也可以按班级聚合后进入班级课表视图，按周次切换并显示课程网格。',
            '课程详情会展示核心课程信息、教学班组成、上课时间地点、课程 ID 等字段；空字段会显示“当前记录无可展示详情字段”。',
        ],
        states: [
            '全量加载、选项加载、查询失败都有独立错误提示；离线数据会显示更新于 syncTime。',
            '班级课表会根据课程中的周次自动选择最接近当前周的周次；没有可展示周次时显示空状态。',
        ],
    },
    {
        title: '选课中心',
        entry: '首页 -> 教务服务 -> 选课中心。',
        source: 'src/components/CourseSelectionView.vue、src-tauri/src/modules/course_selection.rs、src-tauri/src/lib.rs',
        usage: [
            '入口分为“选课”和“信息查询”。选课模式会加载选课总览、选课批次、筛选项和课程列表；信息查询模式用于查询已选课程。',
            '筛选项覆盖课程性质、课程归属、教学模式、上课校区、课程类别、课程类型等；点击“查询课程”后展示课程卡片。',
            '课程卡片展示课程名称、教学班、学分、授课教师、上课时间地点、网课标识、容量、状态和冲突状态。',
            '课程详情会补充课程简介、教师详情、教学班组成、考试形式和标签；有子教学班时会先弹出子教学班选择器。',
            '选课操作会先弹出确认选课，提交后按教务系统规则实时校验容量和选课门数限制；已选课程会弹出确认退课，退课后刷新当前批次列表。',
            '信息查询默认匹配当前学期，支持学期、关键词、教师、课程性质、课程类型和选课方式筛选，并可勾选显示其他选课方式课程。',
        ],
        states: [
            'overview 失败显示“获取选课总览失败”；列表失败显示“获取选课列表失败”；没有开放批次时显示当前暂无选课批次或当前暂无可选课程。',
            'pcid、pcenc、jxbid 等关键参数缺失时，后端会返回不能为空错误；会话过期时提示会话已过期，请重新登录。',
            '选课中心是实时操作模块，不使用 SQLite 离线选课缓存；容量已满、不可选、已选和冲突课程会分别映射为状态标签，按钮会禁用不允许提交的动作。',
        ],
    },
    {
        title: '空教室',
        entry: '首页 -> 教务服务 -> 空教室；也可从首页默认快捷入口进入。',
        source: 'src/components/ClassroomView.vue、src-tauri/src/modules/classroom.rs、src-tauri/src/lib.rs',
        usage: [
            '页面会先加载教学楼列表，再根据周次、星期、节次、楼栋查询空教室。节次支持多选，也能按当前时间推荐剩余节次。',
            '查询结果展示教室名称、类型/校区、容量、楼栋等信息；结果过多时使用“加载更多”逐步展开。',
            '顶部结果摘要会显示找到多少个空教室，并展示查询日期，方便判断数据是否对应当前时间。',
        ],
        states: [
            '未登录时，如果已有结果，会保留上一屏并提示当前显示上次查询结果；没有结果时提示请先登录后再查询空教室。',
            '查询使用短 TTL 缓存，因为空教室数据变化频繁；服务器预热中会自动重试，超时或连接失败时会尽量保留上次成功结果。',
            '会话已过期时提示重新登录；当前条件无结果时显示“当前条件下没有找到空教室”。',
        ],
    },
    {
        title: '考试安排',
        entry: '首页 -> 教务服务 -> 考试安排。',
        source: 'src/components/ExamView.vue、src-tauri/src/modules/exam.rs、src-tauri/src/lib.rs',
        usage: [
            '页面先加载学期列表，再按所选学期查询考试安排。考试卡片展示课程名称、考试性质、考试日期、考试时间、地点和座位号。',
            '未结束考试按日期升序排列，已结束考试按日期倒序排列并弱化显示；未来考试会显示倒计时，例如今天、明天或剩余天数。',
            '页面会统计待考与已结束数量，并把最近未来考试写入小组件快照。',
        ],
        states: [
            '加载中显示“正在获取考试安排”；没有考试时显示“本学期暂无考试安排”。',
            '支持离线缓存：离线时显示“当前显示为离线数据，更新于 sync_time”。',
            '如果后端解析失败、会话已过期或网络失败，会分别展示获取考试安排失败、会话已过期或网络错误。',
        ],
    },
    {
        title: '绩点排名',
        entry: '首页 -> 教务服务 -> 绩点排名；也可从首页默认快捷入口进入。',
        source: 'src/components/RankingView.vue、src-tauri/src/modules/ranking.rs、src-tauri/src/lib.rs',
        usage: [
            '用于查看指定学期或全部学期的 GPA、算术平均分、总学分，以及班级/专业/学院维度的排名。',
            '页面分为个人摘要、绩点排名和平均分排名。GPA 卡片展示平均学分绩点，平均分卡片展示 avg_score。',
            '学期下拉切换后会重新拉取排名，页面底部会显示数据更新时间。',
        ],
        states: [
            '获取排名带自动重试；如果错误包含会话已过期或登录，会尝试重试后再显示错误。',
            '没有排名数据时显示“暂无排名数据”，并提示该学期可能尚未公布排名。',
            '离线缓存会显示 sync_time；网络错误会提示稍后重试。',
        ],
    },
    {
        title: '校历',
        entry: '首页 -> 教务服务 -> 校历。',
        source: 'src/components/CalendarView.vue、src-tauri/src/modules/calendar.rs、src-tauri/src/lib.rs',
        usage: [
            '校历页按学期展示教学周表格，顶部展示当前周、学期开始日期、总周数等 meta 信息。',
            '表格按周列出每一周的日期、每日备注和周备注，当前周会高亮。',
            '在部分流程中会用临时登录会话获取校历或学期信息，成功后仍按普通校历数据展示给用户。',
            '学期列表来自 semesters 接口，当前学期通过 resolveCurrentSemester 与后端 meta 共同确定。',
        ],
        states: [
            '加载失败会显示获取校历失败；会话失效时显示会话已过期，请重新登录。',
            '离线缓存会提示当前显示为离线数据；空数据时表格为空，需要切换学期或稍后重试。',
        ],
    },
    {
        title: '学业完成情况',
        entry: '首页 -> 教务服务 -> 学业情况。',
        source: 'src/components/AcademicProgressView.vue、src-tauri/src/lib.rs',
        usage: [
            '完成度类型支持课程性质完成度、培养方案完成度、教学计划完成度和毕业学分完成度。',
            '页面展示摘要、分类树和课程列表。课程详情会展示课程名称、课程编号、学分、获得学分、课程性质、课程类别、完成状态等字段。',
            '分类树会根据最低学分、最高学分、完成状态聚合课程，帮助判断哪些模块已修、未修或未通过。',
        ],
        states: [
            '查询失败显示获取学业完成情况失败；网络失败显示网络错误。',
            '暂无数据时显示暂无学业情况数据；离线时显示当前缓存和更新时间。',
        ],
    },
    {
        title: '培养方案',
        entry: '首页 -> 教务服务 -> 培养方案。',
        source: 'src/components/TrainingPlanView.vue、src-tauri/src/modules/training_plan.rs、src-tauri/src/lib.rs',
        usage: [
            '页面先加载培养方案筛选项，再按年级、开课学期、开课院系、教研室、课程性质、课程归属、课程编号、课程名称等条件查询课程。',
            '筛选项中的院系会联动教研室；即使没有选择院系也允许查询课程。',
            '课程卡片展示课程名称、课程编号、课程性质、课程归属和学分；结果支持分页，详情弹窗补充更多字段。',
        ],
        states: [
            '获取筛选项失败、获取教研室失败和获取培养方案失败都会写入错误状态。',
            '支持 training_plan_cache 离线缓存；离线时显示 sync_time。',
            '筛选条件过窄时结果为空，建议先清空课程编号/课程名称，再逐步增加筛选。',
        ],
    },
];

const commonStates = [
    {
        title: '登录与会话',
        desc: '教务服务大多需要登录。未登录会提示先登录；会话已过期会要求重新登录。成绩、考试、排名、校历、空教室、选课等后端 command 都会把教务系统的登录状态转换成用户可读错误。',
    },
    {
        title: '离线缓存',
        desc: '成绩、课表、考试、排名、校历、空教室、学业完成情况、培养方案等会把成功响应写入本地缓存。前端常用 fetchWithCache，后端失败时会带回 offline 和 sync_time；网络失败、教务维护或接口异常时，页面可能展示离线缓存和同步时间。',
    },
    {
        title: '学期与周次',
        desc: '个人课表、考试、排名、校历、全校课表都围绕学期；课表、全校课表、空教室和校历还会使用周次。遇到学期不对，先检查顶部学期选择器和课表抽屉中的学期设置。',
    },
    {
        title: '空状态',
        desc: '空状态不一定是错误：本学期暂无考试安排、当前条件下没有找到空教室、没有开放选课批次、该学期尚未公布排名、筛选条件过窄都会产生空结果。',
    },
];

const workflowTips = [
    '先登录，再从首页教务服务或底部课表进入模块。需要身份的页面不要直接刷新网页入口，应从应用内导航进入。',
    '查成绩时先确认学期筛选，再看通过/补考/重修标签。想看给分记录时进入成绩分布 Beta。',
    '查课表时先确认学期和周次；如果课程不完整，打开课表抽屉切换学期或触发后台刷新。',
    '选课前先看课程详情、容量、冲突状态和教学班；提交前确认课程名称和教学班，退课也会实时刷新当前批次。',
    '空教室查询建议先用默认推荐节次，再缩小到楼栋；如果当前显示上次结果，按提示重新登录或刷新。',
    '考试、排名、学业进度和培养方案都依赖教务系统公布进度；没有数据时先换学期，再判断是否尚未发布。',
];

const sourceEvidence = [
    '入口与模块分组：src/components/Dashboard.vue 中教务服务分组包含 grades、exams、ranking、academic、qxzkb、course_selection、training、classroom、calendar，底部 Tab 直接进入 schedule。',
    '视图注册：src/App.vue 注册 GradeView、ScheduleView、GlobalScheduleView、CourseSelectionView、ClassroomView、ExamView、RankingView、CalendarView、AcademicProgressView、TrainingPlanView。',
    '缓存与离线：src-tauri/src/lib.rs 的 sync_grades、sync_schedule、fetch_exams、fetch_ranking、fetch_classrooms、fetch_training_plan_courses、fetch_calendar_data、fetch_academic_progress 等 command 会保存缓存并在失败时读取缓存。',
    '缓存表边界：src-tauri/src/db.rs 和 src-tauri/src/lib.rs 使用 grades_cache、schedule_cache、qxzkb_public_cache、classroom_cache、training_plan_cache 等表名区分私有数据和公共教务数据。',
    '课表增强：src/components/ScheduleView.vue 负责自定义课程、导入 JSON、导出 JSON、云同步和日历导出；src/utils/schedule_prefetch.js 负责学期预热、缓存快照和学期锁定。',
    '成绩分布：src/utils/grade_distribution.js 直接调用 hbu_ocr_endpoint 派生出的远程 /api/grade-distribution 服务，不经过 Tauri command；页面入口在 src/components/GradeDistributionView.vue。',
    '教务后端：src-tauri/src/http_client/academic.rs 与 src-tauri/src/modules/grades.rs、schedule.rs、exam.rs、ranking.rs、classroom.rs、training_plan.rs、course_selection.rs、calendar.rs 负责解析教务系统响应。',
];

const AcademicServices = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">用户文档</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                教务服务全量指南
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                本页覆盖 Mini-HBUT 中所有用户可见的教务服务：成绩查询、成绩分布 Beta、个人课表、全校课表、选课中心、空教室、考试安排、绩点排名、校历、学业完成情况和培养方案。
                内容基于当前 Vue 组件、Tauri command 与 Rust 模块整理，重点说明入口、使用方法、状态说明、异常处理、离线缓存和登录过期边界。
            </p>
        </header>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">快速使用顺序</h2>
            <div className="rounded-lg border border-cyan/20 bg-cyan/5 p-5">
                <ol className="space-y-3 text-gray-300">
                    {workflowTips.map((tip) => (
                        <li key={tip} className="leading-8">{tip}</li>
                    ))}
                </ol>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">通用状态说明</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {commonStates.map((state) => (
                    <article key={state.title} className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="mb-2 text-lg font-semibold text-cyan">{state.title}</h3>
                        <p className="text-sm leading-7 text-gray-300">{state.desc}</p>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">功能入口、使用方法与异常处理</h2>
            {academicModules.map((module) => (
                <article key={module.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                    <div className="mb-4 flex flex-col gap-2 border-b border-white/10 pb-4">
                        <h3 className="text-2xl font-bold text-white">{module.title}</h3>
                        <div className="text-sm leading-7 text-gray-400">
                            <strong className="text-cyan">入口：</strong>{module.entry}
                        </div>
                        <div className="text-xs leading-6 text-gray-500">
                            <strong className="text-gray-300">源码证据：</strong>{module.source}
                        </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                            <h4 className="mb-2 text-lg font-semibold text-cyan">使用方法</h4>
                            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                                {module.usage.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4 className="mb-2 text-lg font-semibold text-purple">状态说明与异常处理</h4>
                            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                                {module.states.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </article>
            ))}
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">源码证据索引</h2>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    {sourceEvidence.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
            <Link
                href="/docs/user-guide"
                className="rounded-lg border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50"
            >
                <div className="mb-2 text-lg font-semibold text-cyan">返回用户手册</div>
                <p className="text-sm leading-7 text-gray-300">查看首页、全局导航、功能分类地图和通用状态说明。</p>
            </Link>
            <Link
                href="/docs/troubleshooting"
                className="rounded-lg border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50"
            >
                <div className="mb-2 text-lg font-semibold text-cyan">继续排查问题</div>
                <p className="text-sm leading-7 text-gray-300">登录失败、网络错误、通知异常、缓存清理和平台差异会在故障排查中继续展开。</p>
            </Link>
        </section>
    </div>
);

export default AcademicServices;
