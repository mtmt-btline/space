use serde::Serialize;
use std::cmp::Ordering;
use wasm_bindgen::prelude::*;

const GRAVITY: f64 = 9.8;

#[derive(Clone, Copy, PartialEq, Eq)]
enum MissionStatus {
    Idle,
    Running,
    Finished,
}

impl MissionStatus {
    fn as_str(self) -> &'static str {
        match self {
            MissionStatus::Idle => "idle",
            MissionStatus::Running => "running",
            MissionStatus::Finished => "finished",
        }
    }
}

#[derive(Serialize)]
struct Vector2 {
    x: f64,
    y: f64,
}

#[derive(Serialize)]
struct Body {
    id: u32,
    name: String,
    position: Vector2,
    velocity: Vector2,
    radius: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    mass: Option<f64>,
}

#[derive(Serialize)]
struct Telemetry {
    elapsed_time: f64,
    rocket_height: f64,
    rocket_velocity: f64,
    gravity_acceleration: f64,
    nearest_body_name: String,
    nearest_body_distance: f64,
}

#[derive(Serialize)]
struct MissionState {
    status: String,
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

struct RocketKinematics {
    x: f64,
    y: f64,
    vx: f64,
    vy: f64,
}

#[wasm_bindgen]
pub struct SimulationEngine {
    simulation_time: f64,
    rocket_launched: bool,
    launch_angle: f64,
    launch_speed: f64,
    time_scale: u8,
    mission_status: MissionStatus,
    mission_success: bool,
}

#[wasm_bindgen]
impl SimulationEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let mut engine = Self {
            simulation_time: 0.0,
            rocket_launched: false,
            launch_angle: 0.0,
            launch_speed: 0.0,
            time_scale: 1,
            mission_status: MissionStatus::Idle,
            mission_success: false,
        };
        engine.reset();
        engine
    }

    pub fn step(&mut self, dt: f64) {
        if self.mission_status != MissionStatus::Running {
            return;
        }
        if self.time_scale == 0 {
            return;
        }

        self.simulation_time += dt * f64::from(self.time_scale);

        if self.rocket_launched && self.simulation_time > 10.0 {
            self.mission_status = MissionStatus::Finished;
            self.mission_success = true;
        }
    }

    pub fn launch_rocket(&mut self, angle: f64, speed: f64) {
        if self.mission_status == MissionStatus::Idle {
            self.rocket_launched = true;
            self.mission_status = MissionStatus::Running;
            self.launch_angle = angle;
            self.launch_speed = speed;
            self.simulation_time = 0.0;
        }
    }

    pub fn set_time_scale(&mut self, scale: u8) {
        if matches!(scale, 0 | 1 | 2 | 4) {
            self.time_scale = scale;
        }
    }

    pub fn get_time_scale(&self) -> u8 {
        self.time_scale
    }

    pub fn get_bodies(&self) -> Result<JsValue, JsValue> {
        let mut bodies = vec![
            Body {
                id: 0,
                name: "Sun".to_string(),
                position: Vector2 { x: 0.0, y: 0.0 },
                velocity: Vector2 { x: 0.0, y: 0.0 },
                radius: 20.0,
                mass: Some(1.989e30),
            },
            Body {
                id: 1,
                name: "Earth".to_string(),
                position: Vector2 { x: 150.0, y: 0.0 },
                velocity: Vector2 { x: 0.0, y: 30.0 },
                radius: 6.0,
                mass: Some(5.972e24),
            },
            Body {
                id: 2,
                name: "Moon".to_string(),
                position: Vector2 { x: 160.0, y: 0.0 },
                velocity: Vector2 { x: 0.0, y: 31.0 },
                radius: 1.7,
                mass: Some(7.342e22),
            },
        ];

        if self.rocket_launched && self.mission_status == MissionStatus::Running {
            if let Some(rocket) = self.rocket_kinematics() {
                bodies.push(Body {
                    id: 999,
                    name: "Rocket".to_string(),
                    position: Vector2 {
                        x: rocket.x,
                        y: rocket.y,
                    },
                    velocity: Vector2 {
                        x: rocket.vx,
                        y: rocket.vy,
                    },
                    radius: 2.0,
                    mass: None,
                });
            }
        }

        serde_wasm_bindgen::to_value(&bodies)
            .map_err(|error| JsValue::from_str(&format!("serialization error: {error}")))
    }

    pub fn get_telemetry(&self) -> Result<JsValue, JsValue> {
        let mut telemetry = Telemetry {
            elapsed_time: self.simulation_time,
            rocket_height: 0.0,
            rocket_velocity: 0.0,
            gravity_acceleration: GRAVITY,
            nearest_body_name: "Earth".to_string(),
            nearest_body_distance: 0.0,
        };

        if self.rocket_launched && self.mission_status == MissionStatus::Running {
            if let Some(rocket) = self.rocket_kinematics() {
                telemetry.rocket_height = rocket.y;
                telemetry.rocket_velocity = (rocket.vx.powi(2) + rocket.vy.powi(2)).sqrt();

                let distances = [
                    ("Earth", (rocket.x - 150.0).hypot(rocket.y)),
                    ("Moon", (rocket.x - 160.0).hypot(rocket.y)),
                    ("Sun", rocket.x.hypot(rocket.y)),
                ];

                if let Some((name, distance)) = distances
                    .iter()
                    .min_by(|left, right| {
                        left.1
                            .partial_cmp(&right.1)
                            .unwrap_or(Ordering::Equal)
                    })
                    .map(|(name, distance)| ((*name).to_string(), *distance))
                {
                    telemetry.nearest_body_name = name;
                    telemetry.nearest_body_distance = distance;
                    telemetry.gravity_acceleration =
                        (GRAVITY / f64::max(1.0, distance / 20.0)).max(0.5);
                }
            }
        }

        serde_wasm_bindgen::to_value(&telemetry)
            .map_err(|error| JsValue::from_str(&format!("serialization error: {error}")))
    }

    pub fn get_mission_state(&self) -> Result<JsValue, JsValue> {
        let mission_state = MissionState {
            status: self.mission_status.as_str().to_string(),
            success: self.mission_success,
            message: if self.mission_success {
                Some("Mission accomplished!".to_string())
            } else {
                None
            },
        };

        serde_wasm_bindgen::to_value(&mission_state)
            .map_err(|error| JsValue::from_str(&format!("serialization error: {error}")))
    }

    pub fn reset(&mut self) {
        self.simulation_time = 0.0;
        self.rocket_launched = false;
        self.launch_angle = 0.0;
        self.launch_speed = 0.0;
        self.time_scale = 1;
        self.mission_status = MissionStatus::Idle;
        self.mission_success = false;
    }
}

impl SimulationEngine {
    fn rocket_kinematics(&self) -> Option<RocketKinematics> {
        if !(self.rocket_launched && self.mission_status == MissionStatus::Running) {
            return None;
        }

        let angle_rad = self.launch_angle.to_radians();
        let vx = self.launch_speed * angle_rad.cos();
        let vy = self.launch_speed * angle_rad.sin() - GRAVITY * self.simulation_time;

        let raw_y =
            self.launch_speed * angle_rad.sin() * self.simulation_time - 0.5 * GRAVITY * self.simulation_time.powi(2);
        let clamped_y = raw_y.max(0.0);
        let x = self.launch_speed * angle_rad.cos() * self.simulation_time;

        Some(RocketKinematics {
            x,
            y: clamped_y,
            vx,
            vy,
        })
    }
}
