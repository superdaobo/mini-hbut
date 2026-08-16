// SPDX-License-Identifier: GPL-3.0-or-later
// Portions of this module are ported from AneryCoft/course_helper (GPL-3.0-or-later).
// Upstream: https://github.com/AneryCoft/course_helper

//! 进行中签到请求注册表（幂等/并发合并）。
//!
//! 对同一 `active_id` 的重复签到请求，在 60s TTL 内只执行一次真实 HTTP 调用，
//! 后续请求直接返回缓存结果（标记为 `AlreadySigned`）。

use std::sync::Arc;
use std::time::Duration;

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use super::errors::CheckinErrorCode;

/// 签到提交结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckinSubmitResult {
    pub result: SubmitResultKind,
    pub message: String,
    pub error_code: Option<CheckinErrorCode>,
}

/// 签到结果类型枚举。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubmitResultKind {
    Success,
    AlreadySigned,
    Failure,
}

/// 进行中请求注册表，用于合并重复签到请求。
///
/// 内部使用 `DashMap` 实现无锁并发读写，每个 `active_id` 对应一个
/// `Arc<Mutex<Option<CheckinSubmitResult>>>` 槽位。首次调用执行真实操作并
/// 缓存结果，后续调用在 TTL 内直接返回 `AlreadySigned`。
pub struct InflightRegistry {
    map: DashMap<String, Arc<Mutex<Option<CheckinSubmitResult>>>>,
}

impl InflightRegistry {
    /// 创建空注册表。
    pub fn new() -> Self {
        Self {
            map: DashMap::new(),
        }
    }

    /// 执行签到操作，保证同一 `active_id` 在 60s 内只执行一次。
    ///
    /// - 首次调用：执行 `f()` 并缓存结果，60s 后自动清理。
    /// - 重复调用（TTL 内）：直接返回缓存结果，`result` 覆写为 `AlreadySigned`。
    pub async fn run<F, Fut>(&self, active_id: &str, f: F) -> CheckinSubmitResult
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = CheckinSubmitResult>,
    {
        let slot = self
            .map
            .entry(active_id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(None)))
            .clone();

        let mut guard = slot.lock().await;

        // 缓存命中：返回 AlreadySigned
        if let Some(cached) = guard.as_ref() {
            return CheckinSubmitResult {
                result: SubmitResultKind::AlreadySigned,
                message: cached.message.clone(),
                error_code: cached.error_code,
            };
        }

        // 首次执行真实操作
        let result = f().await;
        *guard = Some(result.clone());

        // 60s 后清理缓存
        let map_clone = self.map.clone();
        let key = active_id.to_string();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(60)).await;
            map_clone.remove(&key);
        });

        result
    }

    /// 清空所有缓存条目（用于测试或清除数据）。
    pub fn clear(&self) {
        self.map.clear();
    }
}

#[cfg(test)]
mod unit {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn make_success_result() -> CheckinSubmitResult {
        CheckinSubmitResult {
            result: SubmitResultKind::Success,
            message: "签到成功".to_string(),
            error_code: None,
        }
    }

    #[tokio::test]
    async fn basic_reuse() {
        let registry = InflightRegistry::new();
        let call_count = Arc::new(AtomicU32::new(0));

        // 第一次调用：执行真实操作
        let cc = call_count.clone();
        let r1 = registry
            .run("act_001", || async move {
                cc.fetch_add(1, Ordering::SeqCst);
                make_success_result()
            })
            .await;
        assert_eq!(r1.result, SubmitResultKind::Success);
        assert_eq!(call_count.load(Ordering::SeqCst), 1);

        // 第二次调用：应返回 AlreadySigned，不执行操作
        let cc = call_count.clone();
        let r2 = registry
            .run("act_001", || async move {
                cc.fetch_add(1, Ordering::SeqCst);
                make_success_result()
            })
            .await;
        assert_eq!(r2.result, SubmitResultKind::AlreadySigned);
        assert_eq!(call_count.load(Ordering::SeqCst), 1); // 仍为 1

        // 不同 active_id 应独立执行
        let cc = call_count.clone();
        let r3 = registry
            .run("act_002", || async move {
                cc.fetch_add(1, Ordering::SeqCst);
                make_success_result()
            })
            .await;
        assert_eq!(r3.result, SubmitResultKind::Success);
        assert_eq!(call_count.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn clear_resets_cache() {
        let registry = InflightRegistry::new();
        let call_count = Arc::new(AtomicU32::new(0));

        let cc = call_count.clone();
        registry
            .run("act_x", || async move {
                cc.fetch_add(1, Ordering::SeqCst);
                make_success_result()
            })
            .await;

        registry.clear();

        // 清除后应重新执行
        let cc = call_count.clone();
        let r = registry
            .run("act_x", || async move {
                cc.fetch_add(1, Ordering::SeqCst);
                make_success_result()
            })
            .await;
        assert_eq!(r.result, SubmitResultKind::Success);
        assert_eq!(call_count.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn concurrent_calls_merge() {
        let registry = Arc::new(InflightRegistry::new());
        let call_count = Arc::new(AtomicU32::new(0));

        let mut handles = Vec::new();
        for _ in 0..10 {
            let reg = registry.clone();
            let cc = call_count.clone();
            handles.push(tokio::spawn(async move {
                reg.run("act_concurrent", || async move {
                    cc.fetch_add(1, Ordering::SeqCst);
                    // 模拟网络延迟
                    tokio::time::sleep(Duration::from_millis(10)).await;
                    make_success_result()
                })
                .await
            }));
        }

        let results: Vec<_> = futures::future::join_all(handles)
            .await
            .into_iter()
            .map(|r| r.unwrap())
            .collect();

        // 真实调用次数 ≤ 1
        assert!(call_count.load(Ordering::SeqCst) <= 1);
        // 所有结果都是 success 或 already_signed
        for r in &results {
            assert!(
                r.result == SubmitResultKind::Success
                    || r.result == SubmitResultKind::AlreadySigned
            );
        }
    }
}

#[cfg(test)]
mod proptest_p2_idempotence_sequential {
    //! Property 2: 普通签到幂等性（顺序）
    //! **Validates: Requirements 4.4, 16.1, 16.2, 16.3**
    use super::*;
    use proptest::prelude::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(100))]
        #[test]
        fn sequential_calls_execute_once(
            active_id in "[a-z0-9]{4,16}",
            n in 2u32..=8u32,
        ) {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                let registry = InflightRegistry::new();
                let call_count = Arc::new(AtomicU32::new(0));

                let mut results = Vec::new();
                for _ in 0..n {
                    let cc = call_count.clone();
                    let r = registry.run(&active_id, || async move {
                        cc.fetch_add(1, Ordering::SeqCst);
                        CheckinSubmitResult {
                            result: SubmitResultKind::Success,
                            message: "签到成功".to_string(),
                            error_code: None,
                        }
                    }).await;
                    results.push(r);
                }

                // 远端 HTTP 真实调用次数 ≤ 1
                prop_assert!(call_count.load(Ordering::SeqCst) <= 1,
                    "HTTP 调用次数 {} > 1", call_count.load(Ordering::SeqCst));

                // 第一次结果为 Success
                prop_assert_eq!(results[0].result, SubmitResultKind::Success);

                // 后续结果为 AlreadySigned
                for r in &results[1..] {
                    prop_assert!(
                        r.result == SubmitResultKind::Success || r.result == SubmitResultKind::AlreadySigned,
                        "后续调用结果应为 success 或 already_signed，实际: {:?}", r.result
                    );
                }

                Ok(())
            })?;
        }
    }
}

#[cfg(test)]
mod proptest_p12_inflight_merge {
    //! Property 12: 并发合并
    //! **Validates: Requirements 14.3, 16.1, 16.3, 16.4**
    use super::*;
    use proptest::prelude::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(50))]
        #[test]
        fn concurrent_calls_merge_to_one_http(
            active_id in "[a-z0-9]{4,16}",
            n in 2u32..=64u32,
        ) {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                let registry = Arc::new(InflightRegistry::new());
                let call_count = Arc::new(AtomicU32::new(0));

                let mut handles = Vec::new();
                for _ in 0..n {
                    let reg = registry.clone();
                    let cc = call_count.clone();
                    let aid = active_id.clone();
                    handles.push(tokio::spawn(async move {
                        reg.run(&aid, || async move {
                            cc.fetch_add(1, Ordering::SeqCst);
                            // 模拟网络延迟
                            tokio::time::sleep(Duration::from_millis(5)).await;
                            CheckinSubmitResult {
                                result: SubmitResultKind::Success,
                                message: "签到成功".to_string(),
                                error_code: None,
                            }
                        }).await
                    }));
                }

                let results: Vec<_> = futures::future::join_all(handles)
                    .await
                    .into_iter()
                    .map(|r| r.unwrap())
                    .collect();

                // 真实 HTTP 调用次数 ≤ 1
                prop_assert!(call_count.load(Ordering::SeqCst) <= 1,
                    "HTTP 调用次数 {} > 1", call_count.load(Ordering::SeqCst));

                // 所有返回值 result ∈ {success, already_signed}
                for r in &results {
                    prop_assert!(
                        r.result == SubmitResultKind::Success || r.result == SubmitResultKind::AlreadySigned,
                        "并发结果应为 success 或 already_signed，实际: {:?}", r.result
                    );
                }

                // success 结果数 ≤ 1
                let success_count = results.iter()
                    .filter(|r| r.result == SubmitResultKind::Success)
                    .count();
                prop_assert!(success_count <= 1,
                    "success 结果数 {} > 1", success_count);

                Ok(())
            })?;
        }
    }
}
