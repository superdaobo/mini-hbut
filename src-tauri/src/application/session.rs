use serde_json::{json, Value};

use super::ApplicationContext;

#[derive(Clone)]
pub struct SessionService {
    context: ApplicationContext,
}

impl SessionService {
    pub fn new(context: ApplicationContext) -> Self {
        Self { context }
    }

    pub async fn health(&self) -> Value {
        let client = self.context.client_snapshot().await;
        json!({
            "success": true,
            "logged_in": client.user_info.is_some()
        })
    }

    pub async fn export_cookie_snapshot(&self) -> Value {
        let client = self.context.client_snapshot().await;
        json!({
            "success": true,
            "data": client.get_cookie_snapshot()
        })
    }
}
