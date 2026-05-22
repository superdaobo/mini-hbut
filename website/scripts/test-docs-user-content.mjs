import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

const quickStart = read('src/pages/docs/QuickStart.tsx');
const userGuide = read('src/pages/docs/UserGuide.tsx');
const academicServices = read('src/pages/docs/AcademicServices.tsx');

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

if (
  quickStart.includes('后续 Task 6') ||
  userGuide.includes('后续扩写来源') ||
  academicServices.includes('后续扩写来源') ||
  academicServices.includes('本页骨架职责')
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
