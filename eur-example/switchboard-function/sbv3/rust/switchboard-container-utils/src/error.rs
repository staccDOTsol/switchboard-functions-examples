use std::error::Error;
use std::fmt;
use switchboard_common::SbError;

#[derive(Debug)]
pub enum ContainerError {
    Message(String),
    Io(std::io::Error),
    Bollard(bollard::errors::Error),
}

impl From<bollard::errors::Error> for ContainerError {
    fn from(val: bollard::errors::Error) -> Self {
        ContainerError::Bollard(val)
    }
}
impl From<std::io::Error> for ContainerError {
    fn from(val: std::io::Error) -> Self {
        ContainerError::Io(val)
    }
}

impl fmt::Display for ContainerError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            ContainerError::Message(message) => write!(f, "Error: {}", message),
            ContainerError::Io(err) => write!(f, "IO Error: {}", err),
            ContainerError::Bollard(err) => write!(f, "Bollard Error: {}", err),
            // Handle other error variants as needed.
        }
    }
}

impl Error for ContainerError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            ContainerError::Message(_message) => None,
            ContainerError::Io(err) => Some(err),
            ContainerError::Bollard(err) => Some(err),
        }
    }
}

impl From<ContainerError> for SbError {
    fn from(val: ContainerError) -> Self {
        // SbError::ContainerError(std::sync::Arc::new(self))
        match val {
            ContainerError::Message(message) => SbError::CustomMessage(message),
            ContainerError::Io(err) => SbError::CustomError {
                message: "IO Error".to_string(),
                source: std::sync::Arc::new(err),
            },
            ContainerError::Bollard(err) => SbError::CustomError {
                message: "Bollard Error".to_string(),
                source: std::sync::Arc::new(err),
            },
        }
    }
}

pub fn handle_bollard_error(err: bollard::errors::Error) -> SbError {
    SbError::ContainerError(std::sync::Arc::new(ContainerError::Bollard(err)))
}

pub type ContainerResult<T> = miette::Result<T, SbError>;
