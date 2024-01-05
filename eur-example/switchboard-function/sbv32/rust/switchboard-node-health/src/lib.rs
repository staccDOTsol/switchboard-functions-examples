use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::OnceCell;
use tokio::sync::RwLock;
use warp::Filter;

pub static SWITCHBOARD_HEALTH: OnceCell<SwitchboardHealth> = OnceCell::const_new();

// Define an enum for health status
#[derive(Default, Debug, Clone)]
pub enum HealthStatus {
    #[default]
    NotReady,
    Ready,
}

// Define the SwitchboardHealth struct
#[derive(Default, Debug, Clone)]
pub struct SwitchboardHealth {
    health: Arc<RwLock<HealthStatus>>,
}

impl SwitchboardHealth {
    pub async fn get_or_init() -> &'static SwitchboardHealth {
        SWITCHBOARD_HEALTH
            .get_or_init(|| async { SwitchboardHealth::initialize().await })
            .await
    }

    pub async fn initialize() -> Self {
        let health = Arc::new(RwLock::new(HealthStatus::NotReady));

        // Clone the Arc to move into the async block
        let server_health = health.clone();

        tokio::spawn(async move {
            // Create a filter for the shared state
            let health_status_filter = warp::any().map(move || server_health.clone());

            // Define the health check route
            let health_route = warp::path("healthz")
                .and(warp::get())
                .and(health_status_filter)
                .and_then(SwitchboardHealth::respond_with_health);

            warp::serve(health_route).run(([0, 0, 0, 0], 8080)).await; // Bind to 0.0.0.0:8080
        });

        // Return struct
        SwitchboardHealth {
            health: health.clone(),
        }
    }

    pub async fn set_is_ready(&self) {
        *self.health.write().await = HealthStatus::Ready;
    }

    pub async fn set_is_not_ready(&self) {
        *self.health.write().await = HealthStatus::NotReady;
    }

    async fn respond_with_health(
        health_status: Arc<RwLock<HealthStatus>>,
    ) -> Result<impl warp::Reply, Infallible> {
        match *health_status.read().await {
            HealthStatus::Ready => Ok(warp::reply::with_status("Ok", warp::http::StatusCode::OK)),
            HealthStatus::NotReady => Ok(warp::reply::with_status(
                "Service Unavailable",
                warp::http::StatusCode::SERVICE_UNAVAILABLE,
            )),
        }
    }
}
