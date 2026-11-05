//! 模块实例信任登记表（#1167 T06，供 T07 生命周期扩展）。
//!
//! 宿主在「准备模块 → 拿到 `trusted` 标记」时登记实例；受控请求只放行**已登记且 trusted**
//! 的实例。这样前端无法通过伪造请求参数把未验签模块说成可信。
//!
//! 内存态、进程级；进程退出即清空（模块实例本身也不跨进程存活）。

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModuleInstance {
    pub instance_id: String,
    /// 打开实例时的账号作用域（学号/身份键）。
    pub account_scope: String,
    /// 清单是否通过发布者验签（T05）。
    pub trusted: bool,
    /// 允许的能力 id 集合（空 = 不允许任何受控请求）。
    pub capabilities: Vec<String>,
}

fn table() -> &'static Mutex<HashMap<String, ModuleInstance>> {
    static TABLE: OnceLock<Mutex<HashMap<String, ModuleInstance>>> = OnceLock::new();
    TABLE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 登记（同 id 覆盖）。
pub fn register_instance(instance: ModuleInstance) {
    let mut guard = table()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.insert(instance.instance_id.clone(), instance);
}

/// 注销（关闭实例时调用）。
pub fn unregister_instance(instance_id: &str) {
    let mut guard = table()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.remove(instance_id);
}

/// 实例是否已登记且已验签。
pub fn is_trusted_instance(instance_id: &str) -> bool {
    let guard = table()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard
        .get(instance_id)
        .map(|instance| instance.trusted)
        .unwrap_or(false)
}

/// 该实例是否被授予某能力。
pub fn instance_allows(instance_id: &str, capability: &str) -> bool {
    let guard = table()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard
        .get(instance_id)
        .map(|instance| instance.capabilities.iter().any(|item| item == capability))
        .unwrap_or(false)
}

/// 该实例的账号作用域。
pub fn instance_account_scope(instance_id: &str) -> Option<String> {
    let guard = table()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard
        .get(instance_id)
        .map(|instance| instance.account_scope.clone())
}

/// 清空（切账号 / 退出登录时调用）。
pub fn clear_all() {
    let mut guard = table()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn instance(id: &str, trusted: bool) -> ModuleInstance {
        ModuleInstance {
            instance_id: id.to_string(),
            account_scope: "20230001".to_string(),
            trusted,
            capabilities: vec!["school.profile_online".to_string()],
        }
    }

    #[test]
    fn unregistered_instance_is_not_trusted() {
        assert!(!is_trusted_instance("inst_missing"));
    }

    #[test]
    fn only_trusted_instances_pass() {
        register_instance(instance("inst_a", true));
        register_instance(instance("inst_b", false));
        assert!(is_trusted_instance("inst_a"));
        assert!(!is_trusted_instance("inst_b"));
        unregister_instance("inst_a");
        assert!(!is_trusted_instance("inst_a"));
    }

    #[test]
    fn capabilities_are_per_instance() {
        register_instance(instance("inst_c", true));
        assert!(instance_allows("inst_c", "school.profile_online"));
        assert!(!instance_allows("inst_c", "school.grades"));
        assert!(!instance_allows("inst_missing", "school.profile_online"));
    }

    #[test]
    fn clear_all_drops_every_instance() {
        register_instance(instance("inst_d", true));
        clear_all();
        assert!(!is_trusted_instance("inst_d"));
        assert!(instance_account_scope("inst_d").is_none());
    }
}
