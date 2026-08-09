use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApplicationErrorKind {
    Unauthorized,
    Validation,
    Network,
    Storage,
    Internal,
}

#[derive(Debug, Error)]
#[error("{message}")]
pub struct ApplicationError {
    pub kind: ApplicationErrorKind,
    pub message: String,
}

impl ApplicationError {
    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self {
            kind: ApplicationErrorKind::Unauthorized,
            message: message.into(),
        }
    }

    pub fn network(message: impl Into<String>) -> Self {
        Self {
            kind: ApplicationErrorKind::Network,
            message: message.into(),
        }
    }

    pub fn storage(message: impl Into<String>) -> Self {
        Self {
            kind: ApplicationErrorKind::Storage,
            message: message.into(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            kind: ApplicationErrorKind::Internal,
            message: message.into(),
        }
    }
}
