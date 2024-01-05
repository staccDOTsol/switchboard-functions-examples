#[derive(Copy, Drop, Serde)]
enum Permission {
    Heartbeat,
    Usage,
    CanServiceQueue,
}

