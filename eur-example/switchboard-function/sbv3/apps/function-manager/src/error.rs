use bollard;
use std::error::Error;
use std::fmt;
use std::sync::Arc;

#[derive(Clone, Debug)]
pub enum Err {
    Generic,
    SgxError,
    QuoteParseError,
    DockerError,
    BollardError,
    ContainerStartError(Arc<bollard::errors::Error>),
    ContainerCreateError,
    AttachError,
    ContainerResultParseError,
    FunctionResultParseError,
    IllegalFunctionOutput,
    NetworkError,
    FunctionImageTooBigError,
    CheckSizeError,
    DockerFetchError,
    QvnError(Arc<String>),
    ContainerTimeout,
}

impl fmt::Display for Err {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Err::Generic => write!(f, "A generic error occurred"),
            Err::SgxError => write!(f, "An SGX error occurred"),
            Err::QuoteParseError => write!(f, "Error parsing the quote"),
            Err::DockerError => write!(f, "Docker encountered an error"),
            Err::BollardError => write!(f, "Bollard encountered an error"),
            Err::ContainerStartError(_) => write!(f, "Error starting the container"),
            Err::ContainerCreateError => write!(f, "Error creating the container"),
            Err::AttachError => write!(f, "Error attaching to the container"),
            Err::ContainerResultParseError => write!(f, "Error parsing container result"),
            Err::FunctionResultParseError => write!(f, "Error parsing function result"),
            Err::IllegalFunctionOutput => write!(f, "Function produced illegal output"),
            Err::NetworkError => write!(f, "Network error occurred"),
            Err::FunctionImageTooBigError => write!(f, "Function image is too large"),
            Err::CheckSizeError => write!(f, "Error checking size"),
            Err::DockerFetchError => write!(f, "Error fetching from Docker"),
            Err::QvnError(s) => write!(f, "QVN encountered an error: {}", s),
            Err::ContainerTimeout => write!(f, "Container operation timed out"),
        }
    }
}

impl Error for Err {
    // This can be further customized to return underlying errors for specific variants.
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Err::ContainerStartError(arc_error) => Some(&**arc_error),
            // Add more matches for error variants that have a source error.
            _ => None,
        }
    }
}
