//! 学期目录：学期键与单调序号的互转、按日期推算当前学期、生成「最近学期」列表。
//!
//! 全校课表（`qxzkb_options`）与日历/考试/导出等页面（`fetch_semesters`）共用同一口径，
//! 避免学期列表在各模块里硬编码、随学年推进而失效（issue #1044）。

use chrono::{Datelike, Local, NaiveDate};

/// 学期键 → 单调序号：`起始学年 * 2 + (学期 - 1)`。
///
/// 例如 `2026-2027-1` → 4052、`2026-2027-2` → 4053；序号每 +1 即下一个学期，
/// 可直接用于排序与区间生成。格式非法返回 `None`。
pub(crate) fn semester_index(semester: &str) -> Option<i32> {
    let mut parts = semester.trim().split('-');
    let start_year = parts.next()?.trim().parse::<i32>().ok()?;
    let end_year = parts.next()?.trim().parse::<i32>().ok()?;
    let term = parts.next()?.trim().parse::<i32>().ok()?;
    if parts.next().is_some() || end_year != start_year + 1 || !(term == 1 || term == 2) {
        return None;
    }
    Some(start_year * 2 + (term - 1))
}

/// 按日期推算学期：9 月起为第一学期，3 月起（含 2 月 15 日）为第二学期。
pub(crate) fn semester_by_date(today: NaiveDate) -> String {
    let year = today.year();
    let month = today.month();
    let day = today.day();
    let (start_year, term) = if month >= 9 {
        (year, 1)
    } else if month >= 3 || (month == 2 && day >= 15) {
        (year - 1, 2)
    } else {
        (year - 1, 1)
    };
    format!("{}-{}-{}", start_year, start_year + 1, term)
}

/// 按当前日期推算当前学期。
pub(crate) fn current_semester_by_date() -> String {
    semester_by_date(Local::now().date_naive())
}

/// 生成「最近学期」列表：当前学期置顶，其余按时间倒序（最新在前）。
///
/// 窗口以 `current` 所在学年为基准，向前 5 个学年、向后 1 个学年，共 14 个学期。
/// `current` 格式非法时退回按日期推算；只要 `current` 非空，它一定出现在首位。
pub(crate) fn build_recent_semesters(current: &str) -> Vec<String> {
    let trimmed = current.trim();
    let base = semester_index(trimmed)
        .or_else(|| semester_index(&current_semester_by_date()))
        .unwrap_or(0);
    let start_year = base / 2;
    let mut list = Vec::with_capacity(15);
    // 学年递减、年内先第二学期后第一学期，直接得到时间倒序
    for year in ((start_year - 5)..=(start_year + 1)).rev() {
        list.push(format!("{}-{}-2", year, year + 1));
        list.push(format!("{}-{}-1", year, year + 1));
    }
    // 当前学期置顶：选择器展开时第一项即当前学期；格式非法（不在生成窗口内）时也置顶保留
    if !trimmed.is_empty() {
        match list.iter().position(|semester| semester == trimmed) {
            Some(position) => {
                let current_semester = list.remove(position);
                list.insert(0, current_semester);
            }
            None => list.insert(0, trimmed.to_string()),
        }
    }
    list
}

#[cfg(test)]
mod tests {
    // 测试内断言失败即 panic 是期望行为，豁免 Cargo.toml 中启用的 expect/unwrap lint
    #![allow(clippy::expect_used)]

    use super::*;

    fn date(year: i32, month: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(year, month, day).expect("valid date")
    }

    #[test]
    fn index_orders_semesters_monotonically() {
        assert_eq!(semester_index("2026-2027-1"), Some(4052));
        assert_eq!(semester_index("2026-2027-2"), Some(4053));
        assert!(semester_index("2026-2027-2") > semester_index("2026-2027-1"));
        assert!(semester_index("2026-2027-1") > semester_index("2025-2026-2"));
        assert!(semester_index("2025-2026-2") > semester_index("2021-2022-1"));
    }

    #[test]
    fn index_rejects_malformed_input() {
        for bad in [
            "",
            "2026-2027",
            "2026-2027-3",
            "2026-2028-1",
            "abc",
            "2026-2027-1-1",
        ] {
            assert!(semester_index(bad).is_none(), "{bad} should be rejected");
        }
    }

    #[test]
    fn semester_by_date_respects_boundaries() {
        assert_eq!(semester_by_date(date(2026, 9, 1)), "2026-2027-1");
        assert_eq!(semester_by_date(date(2026, 10, 12)), "2026-2027-1");
        assert_eq!(semester_by_date(date(2027, 1, 10)), "2026-2027-1");
        assert_eq!(semester_by_date(date(2027, 2, 14)), "2026-2027-1");
        assert_eq!(semester_by_date(date(2027, 2, 15)), "2026-2027-2");
        assert_eq!(semester_by_date(date(2027, 7, 15)), "2026-2027-2");
    }

    #[test]
    fn recent_semesters_put_current_first_and_descend_after() {
        let list = build_recent_semesters("2026-2027-1");
        assert_eq!(list.len(), 14);
        assert_eq!(list.first().map(String::as_str), Some("2026-2027-1"));

        let rest: Vec<i32> = list[1..]
            .iter()
            .map(|semester| semester_index(semester).expect("generated semester is valid"))
            .collect();
        assert!(
            rest.windows(2).all(|pair| pair[0] > pair[1]),
            "semesters after the current one should strictly descend: {list:?}"
        );

        let mut unique = list.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(
            unique.len(),
            list.len(),
            "list should not contain duplicates"
        );
    }

    #[test]
    fn recent_semesters_fall_back_when_current_is_invalid() {
        let list = build_recent_semesters("");
        assert!(list.contains(&current_semester_by_date()));
    }

    #[test]
    fn recent_semesters_keep_malformed_current_on_top() {
        let list = build_recent_semesters("2026-2027-9");
        assert_eq!(list.first().map(String::as_str), Some("2026-2027-9"));
        assert_eq!(list.iter().filter(|item| *item == "2026-2027-9").count(), 1);
    }
}
