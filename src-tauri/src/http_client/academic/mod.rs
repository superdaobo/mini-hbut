//! 教务域 HTTP 客户端实现（成绩/考试/排名/学籍/培养方案/课表/教室/校历/学业进度）。
//!
//! 本文件为按职责拆分后的组织入口（薄 facade）：所有业务方法均直接实现于
//! `HbutClient`（见各子模块），外部通过 `http_client::HbutClient` 统一调用，
//! 公共方法、参数、返回、serde 字段、错误与缓存语义均与拆分前保持一致。
//!
//! 子模块职责：
//! - `common`：解析/请求公共逻辑（JSON/HTML 辅助、select 选项提取）
//! - `semester`：学期推导、校历摘要、课表上下文
//! - `grades`：成绩
//! - `exams`：考试
//! - `ranking`：排名
//! - `student_info`：学籍与个人登录/访问记录
//! - `schedule`：课表与空教室、学期列表
//! - `training_plan`：培养方案
//! - `calendar`：校历数据
//! - `academic_progress`：学业进度
//!
//! 注意：
//! - 依赖登录 Cookie；未登录会返回错误或空数据
//! - 部分接口字段名较为混乱，解析逻辑集中在 `parser` 模块

mod academic_progress;
mod calendar;
mod common;
mod exams;
mod grades;
mod ranking;
mod schedule;
mod semester;
mod student_info;
mod training_plan;
