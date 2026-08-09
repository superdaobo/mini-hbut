use std::path::{Path, PathBuf};
use std::sync::Arc;

use tokio::sync::RwLock;

use crate::http_client::HbutClient;

#[derive(Clone)]
pub struct ApplicationContext {
    client: Arc<RwLock<HbutClient>>,
    db_path: PathBuf,
}

impl ApplicationContext {
    pub fn new(client: Arc<RwLock<HbutClient>>, db_path: impl AsRef<Path>) -> Self {
        Self {
            client,
            db_path: db_path.as_ref().to_path_buf(),
        }
    }

    pub fn client_handle(&self) -> Arc<RwLock<HbutClient>> {
        self.client.clone()
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }

    /// Clone the client while holding the read guard only for the clone.
    /// Any following network await occurs after the guard has been dropped.
    pub async fn client_snapshot(&self) -> HbutClient {
        clone_under_read_lock(&self.client).await
    }
}

async fn clone_under_read_lock<T: Clone>(value: &RwLock<T>) -> T {
    value.read().await.clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn snapshot_releases_read_lock_before_external_await() {
        let value = Arc::new(RwLock::new(String::from("before")));
        let snapshot = clone_under_read_lock(&value).await;
        let writer_value = value.clone();
        let writer = tokio::spawn(async move {
            let mut guard = writer_value.write().await;
            *guard = String::from("after");
        });
        tokio::time::timeout(Duration::from_millis(250), writer)
            .await
            .expect("writer must not be blocked by a leaked read guard")
            .expect("writer task");
        assert_eq!(snapshot, "before");
        assert_eq!(&*value.read().await, "after");
    }
}
