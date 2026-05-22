import DocSectionPage from './DocSectionPage';

const AcademicServices = () => (
    <DocSectionPage
        title="教务服务"
        audience="用户文档"
        subtitle="集中承载成绩、课表、考试、排名、选课、空教室、校历、学业进度和培养方案等教务功能说明。"
        coverage={['成绩与成绩分布 Beta', '个人课表与全校课表', '考试、排名、空教室', '学业进度、培养方案、选课']}
        sections={[
            {
                title: '后续扩写来源',
                items: ['GradeView、ScheduleView、GlobalScheduleView、CourseSelectionView、ClassroomView、ExamView 等组件。', 'src-tauri/src/modules 中的教务业务模块。'],
            },
            {
                title: '本页骨架职责',
                items: ['建立教务服务独立入口。', '为 Task 7 的全量教务用户文档提供落点。'],
            },
        ]}
    />
);

export default AcademicServices;
