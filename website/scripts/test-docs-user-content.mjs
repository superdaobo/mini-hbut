import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

const quickStart = read('src/pages/docs/QuickStart.tsx');
const userGuide = read('src/pages/docs/UserGuide.tsx');
const academicServices = read('src/pages/docs/AcademicServices.tsx');
const campusLife = read('src/pages/docs/CampusLife.tsx');
const communityNotifications = read('src/pages/docs/CommunityNotifications.tsx');
const settingsData = read('src/pages/docs/SettingsData.tsx');

const failures = [];
const expectIncludes = (content, label, terms) => {
  for (const term of terms) {
    if (!content.includes(term)) {
      failures.push(`${label} 缺少内容关键词: ${term}`);
    }
  }
};

expectIncludes(quickStart, 'QuickStart', [
  '下载与安装',
  'Windows',
  'macOS',
  'Linux',
  'Android',
  'iOS',
  '统一身份认证',
  '学习通',
  '扫码临时登录',
  'Cookie',
  '自动恢复会话',
  '重新登录',
  '首页仪表盘',
  '今日安排',
  '快捷入口',
  '搜索服务、课程、资讯',
  '底部主 Tab',
  '返回仪表盘',
  '设置中心',
  '导出中心',
  '云同步',
  '离线缓存',
]);

expectIncludes(userGuide, 'UserGuide', [
  '普通用户阅读路径',
  '首页与全局导航',
  '教务服务',
  '一码通',
  '校园生活',
  '社区与通知',
  '扩展模块',
  '我的与设置',
  '需要登录',
  '无需登录',
  '加载中',
  '空状态',
  '登录过期',
  '离线',
  '成绩查询',
  '个人课表',
  '电费查询',
  '校园码',
  '图书查询',
  '资料分享',
  '论坛',
  '通知中心',
  '更多模块',
]);

expectIncludes(academicServices, 'AcademicServices', [
  '教务服务全量指南',
  '成绩查询',
  '成绩分布 Beta',
  '个人课表',
  '全校课表',
  '选课中心',
  '空教室',
  '考试安排',
  '绩点排名',
  '校历',
  '学业完成情况',
  '培养方案',
  '入口',
  '使用方法',
  '状态说明',
  '异常处理',
  '离线缓存',
  '登录过期',
  '会话已过期',
  '学期',
  '周次',
  '自定义课程',
  '导入 JSON',
  '导出 JSON',
  '日历导出',
  '云同步',
  '选课',
  '退课',
  '已选课程',
  '课程详情',
  '容量',
  '冲突状态',
  '楼栋',
  '节次',
  '查询日期',
  '倒计时',
  '座位号',
  'GPA',
  '平均分排名',
  '当前周',
  '学期开始',
  '毕业学分完成度',
  '课程性质完成度',
  '培养方案完成度',
  '教学计划完成度',
  '筛选项',
  '课程编号',
  '最低学分',
  '最高学分',
  '给分记录',
  '课程搜索',
  '挂科',
  '缓存更新时间',
  '课表预热',
  '学期锁',
  '缓存秒开',
  '课程冲突',
  '云上传',
  '云下载',
  'ICS',
  'Widget 快照',
  '班级课表',
  '筛选条件',
  '选课批次',
  '教师详情',
  '子教学班',
  '确认选课',
  '确认退课',
  '实时操作',
  '教学楼',
  '自动重试',
  '本学期暂无考试安排',
  '暂无排名数据',
  '临时登录会话',
  '分类树',
  '教研室',
  '课程归属',
  '分页',
  'fetchWithCache',
  'offline',
  'sync_time',
  'grades_cache',
  'schedule_cache',
  'qxzkb_public_cache',
  'classroom_cache',
  'training_plan_cache',
  'src-tauri/src/http_client/academic.rs',
  'src/utils/schedule_prefetch.js',
  'src/utils/grade_distribution.js',
  'src/components/GradeView.vue',
  'src/components/ScheduleView.vue',
  'src-tauri/src/lib.rs',
]);

expectIncludes(campusLife, 'CampusLife', [
  '校园生活全量指南',
  '校园码',
  '在线模式',
  '高能模式',
  '二维码状态',
  '余额不足',
  '电费查询',
  '照明用电',
  '空调用电',
  '宿舍楼层',
  'last_dorm_selection',
  'electricity_cache',
  '交易记录',
  '一卡通流水',
  '首次登录',
  '近一年',
  'transaction_cache',
  '图书查询',
  '馆藏检索',
  'ISBN',
  '分页',
  '图书详情',
  'library_public_cache',
  '校园地图',
  '缩放',
  '拖拽',
  '微信小程序',
  '静态地图图片',
  '资料分享',
  'WebDAV',
  '目录为空',
  '图片预览',
  'PDF 预览',
  'Office 在线预览',
  '直链下载',
  '校园助手',
  '本地 AI 服务',
  '流式输出',
  '文件上传',
  '20 MB',
  'ai_session_cache',
  'src/components/CampusCodeView.vue',
  'src/components/ElectricityView.vue',
  'src/components/TransactionHistory.vue',
  'src/components/LibraryView.vue',
  'src/components/CampusMapView.vue',
  'src/components/ResourceShareView.vue',
  'src/components/AiChatView.vue',
  'src-tauri/src/modules/electricity.rs',
  'src-tauri/src/modules/one_code.rs',
  'src-tauri/src/modules/ai.rs',
]);

expectIncludes(communityNotifications, 'CommunityNotifications', [
  '社区与通知全量指南',
  '论坛',
  '版块',
  '发帖',
  '回复',
  '评分',
  '收藏',
  '举报',
  '管理员',
  '用户主页',
  '社区资料',
  'hbu_forum_cache',
  '通知中心',
  '通知权限',
  '课程提醒',
  '电费提醒',
  '后台白名单',
  'hbu_notify_snapshot',
  '测试通知',
  '前台服务保活',
  'iOS 后台任务',
  'Android',
  'src/components/ForumView.vue',
  'src/components/NotificationView.vue',
  'src/utils/forum_api.js',
  'src/utils/notify_center.js',
  'src/platform/notification_actions.ts',
  'src-tauri/src/modules/notification.rs',
]);

expectIncludes(settingsData, 'SettingsData', [
  '设置与数据全量指南',
  '我的',
  '设置中心',
  '主题',
  '字体',
  '后端设置',
  '远程配置',
  '配置工具',
  'config_admin_ids',
  'OCR',
  '云同步',
  '调试日志',
  '网络测速',
  '自定义 CSS/JS',
  '导出中心',
  'JSON',
  '长图片',
  '缓存导出',
  '学期列表',
  '交易记录月份',
  '空教室缓存',
  '校园地图缓存',
  '意见反馈',
  '复制反馈链接',
  '最近错误',
  '官方帖子',
  '隐私政策',
  '退出登录',
  'src/components/SettingsView.vue',
  'src/components/ExportCenterView.vue',
  'src/components/FeedbackView.vue',
  'src/components/MeView.vue',
  'src/utils/cloud_sync.js',
  'src/utils/remote_config.js',
  'src/utils/app_settings.ts',
  'src/utils/ui_settings.ts',
  'src/utils/font_settings.ts',
]);

if (
  quickStart.includes('后续 Task 6') ||
  userGuide.includes('后续扩写来源') ||
  academicServices.includes('后续扩写来源') ||
  academicServices.includes('本页骨架职责') ||
  campusLife.includes('后续扩写来源') ||
  campusLife.includes('本页骨架职责') ||
  communityNotifications.includes('后续扩写来源') ||
  communityNotifications.includes('本页骨架职责') ||
  settingsData.includes('后续扩写来源') ||
  settingsData.includes('本页骨架职责')
) {
  failures.push('用户文档仍包含任务骨架或占位提示');
}

if (failures.length > 0) {
  console.error('docs user content contract failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('docs user content contract passed');
