//! N体重力シミュレーション WASM エクスポートモジュール。
//! すべてのシミュレーション状態はスレッドローカルな [`SIM`] で管理し、
//! `#[wasm_bindgen]` 関数でブラウザから呼び出せる API を公開する。

use std::cell::RefCell;
use std::f64::consts::PI;
use wasm_bindgen::prelude::*;

// ─── API ステータスコード ────────────────────────────────────────────────────
const STATUS_OK: i32 = 0;
const STATUS_INVALID_ARGUMENT: i32 = 1;
const STATUS_NOT_FOUND: i32 = 2;
const STATUS_OUT_OF_RANGE: i32 = 3;

// ─── イベント種別 ────────────────────────────────────────────────────────────
const EVENT_TYPE_MISSION: u32 = 1;

// ─── ミッション状態コード ────────────────────────────────────────────────────
const MISSION_FLYING: u32 = 0;
const MISSION_REACHED_MOON: u32 = 1;
const MISSION_FELL_INTO_SUN: u32 = 2;
const MISSION_OUT_OF_BOUNDS: u32 = 3;

// ─── ミッションイベント詳細コード ───────────────────────────────────────────
const MISSION_DETAIL_REACHED_MOON: u32 = 1;
const MISSION_DETAIL_FELL_INTO_SUN: u32 = 2;
const MISSION_DETAIL_OUT_OF_BOUNDS: u32 = 3;

// ─── 天体 ID ─────────────────────────────────────────────────────────────────
const BODY_SUN: u32 = 1;
const BODY_MERCURY: u32 = 2;
const BODY_VENUS: u32 = 3;
const BODY_EARTH: u32 = 4;
const BODY_MOON: u32 = 5;
const BODY_MARS: u32 = 6;
const BODY_JUPITER: u32 = 7;

// ─── 物理定数・シミュレーションパラメータ ────────────────────────────────────
const G: f64 = 0.06;
const SOFTENING_SQ: f64 = 4.0; // 数値安定化のためのソフトニング係数²
const RESTITUTION: f64 = 0.92; // 衝突時の反発係数
const FIXED_MASS: f64 = 1e9; // 固定天体の仮想質量（衝突応答計算用）
const SUBSTEPS: usize = 4; // 1フレームあたりの積分ステップ数
const SUBSTEPS_F64: f64 = 4.0;
const MAX_ROCKETS: usize = 5; // 同時飛行ロケット最大数
const WORLD_BOUNDS: f64 = 2200.0; // この絶対座標を超えたロケットは Out of Bounds
const MAX_GRAVITY_SCALE: f64 = 3.0; // 重力スケール上限

/// 天体（惑星・衛星・恒星）の物理状態。
#[derive(Clone)]
struct Body {
    id: u32,
    x: f64,
    y: f64,
    vx: f64,
    vy: f64,
    mass: f64,
    radius: f64,
    fixed: bool, // true のとき位置を固定（太陽など）
}

/// ロケットの飛行状態。
#[derive(Clone)]
struct Rocket {
    id: u32,
    x: f64,
    y: f64,
    vx: f64,
    vy: f64,
    status: u32, // MISSION_* 定数
}

/// ミッション完了・失敗などを通知するイベント。
#[derive(Clone)]
struct Event {
    kind: u32, // EVENT_TYPE_* 定数
    rocket_id: u32,
    body_id: u32,
    detail: u32, // MISSION_DETAIL_* 定数
}

/// 次フレームで処理する発射リクエスト（発射はステップ先頭で一括適用）。
#[derive(Clone)]
struct LaunchRequest {
    rocket_id: u32,
    mode: u32,
    origin_body_id: u32,
    angle_deg: f64,
    speed: f64,
}

/// シミュレーション全体の状態を保持する。
/// スレッドローカルな [`SIM`] を通じてアクセスする。
struct Simulation {
    bodies: Vec<Body>,
    rockets: Vec<Rocket>,
    events: Vec<Event>,
    pending_launches: Vec<LaunchRequest>, // 次ステップ先頭で発射される予約
    gravity_scale: [f64; 8],              // 天体 ID をインデックスとした重力倍率
    next_rocket_id: u32,
    tick: u32,
    initial_phases_deg: [f64; 5], // リセット時に使う軌道初期位相
}

thread_local! {
    static SIM: RefCell<Simulation> = RefCell::new(Simulation::new());
}

impl Simulation {
    fn new() -> Self {
        let mut sim = Self {
            bodies: Vec::new(),
            rockets: Vec::new(),
            events: Vec::new(),
            pending_launches: Vec::new(),
            gravity_scale: [1.0; 8],
            next_rocket_id: 1,
            tick: 0,
            initial_phases_deg: [0.0; 5],
        };
        sim.reset();
        sim
    }

    fn reset(&mut self) {
        self.bodies = create_solar_preset(self.initial_phases_deg);
        self.rockets.clear();
        self.events.clear();
        self.pending_launches.clear();
        self.gravity_scale = [1.0; 8];
        self.next_rocket_id = 1;
        self.tick = 0;
    }

    fn body_by_id(&self, body_id: u32) -> Option<&Body> {
        self.bodies.iter().find(|b| b.id == body_id)
    }

    fn apply_pending_launches(&mut self) {
        if self.pending_launches.is_empty() {
            return;
        }

        let pending = std::mem::take(&mut self.pending_launches);
        for request in pending {
            if self.rockets.len() >= MAX_ROCKETS {
                self.rockets.remove(0);
            }

            if let Some(rocket) = self.build_rocket_from_request(&request) {
                self.rockets.push(rocket);
            }
        }
    }

    fn build_rocket_from_request(&self, req: &LaunchRequest) -> Option<Rocket> {
        let origin = self.body_by_id(req.origin_body_id)?;
        if req.mode != 0 {
            return None;
        }

        let rad = deg_to_rad(req.angle_deg);
        let x = origin.x + (origin.radius + 2.5) * rad.cos();
        let y = origin.y + (origin.radius + 2.5) * rad.sin();

        let vx = origin.vx + req.speed * rad.cos();
        let vy = origin.vy + req.speed * rad.sin();

        Some(Rocket {
            id: req.rocket_id,
            x,
            y,
            vx,
            vy,
            status: MISSION_FLYING,
        })
    }

    /// 1フレーム分の物理ステップを実行する。
    /// 発射予約の適用 → SUBSTEPS 回のサブステップ積分 → 完了ロケット除去 → tick 更新。
    fn step(&mut self, dt_seconds: f64) {
        if dt_seconds <= 0.0 {
            return;
        }

        // 発射予約を rockets に追加してからサブステップ積分を開始する
        self.apply_pending_launches();
        let clamped = dt_seconds.min(0.05); // フレーム落ち時の暴走防止

        for _ in 0..SUBSTEPS {
            let sub_dt = clamped / SUBSTEPS_F64;
            integrate_bodies(&mut self.bodies, sub_dt, &self.gravity_scale);
            integrate_rockets(&mut self.rockets, &self.bodies, sub_dt, &self.gravity_scale);
            // 各サブステップ後にミッション判定（月到達・太陽落下・範囲外）
            self.evaluate_mission_events();
        }

        // 飛行中以外のロケットは次フレームから除去する
        self.rockets
            .retain(|rocket| rocket.status == MISSION_FLYING);
        self.tick = self.tick.saturating_add(1);
    }

    fn evaluate_mission_events(&mut self) {
        let moon = self.body_by_id(BODY_MOON).cloned();
        let sun = self.body_by_id(BODY_SUN).cloned();

        for rocket in &mut self.rockets {
            if rocket.status != MISSION_FLYING {
                continue;
            }

            if let Some(moon_body) = &moon {
                let dist = (rocket.x - moon_body.x).hypot(rocket.y - moon_body.y);
                if dist <= moon_body.radius + 2.2 {
                    rocket.status = MISSION_REACHED_MOON;
                    self.events.push(Event {
                        kind: EVENT_TYPE_MISSION,
                        rocket_id: rocket.id,
                        body_id: BODY_MOON,
                        detail: MISSION_DETAIL_REACHED_MOON,
                    });
                    continue;
                }
            }

            if let Some(sun_body) = &sun {
                let dist = (rocket.x - sun_body.x).hypot(rocket.y - sun_body.y);
                if dist <= sun_body.radius + 1.2 {
                    rocket.status = MISSION_FELL_INTO_SUN;
                    self.events.push(Event {
                        kind: EVENT_TYPE_MISSION,
                        rocket_id: rocket.id,
                        body_id: BODY_SUN,
                        detail: MISSION_DETAIL_FELL_INTO_SUN,
                    });
                    continue;
                }
            }

            if rocket.x.abs() > WORLD_BOUNDS || rocket.y.abs() > WORLD_BOUNDS {
                rocket.status = MISSION_OUT_OF_BOUNDS;
                self.events.push(Event {
                    kind: EVENT_TYPE_MISSION,
                    rocket_id: rocket.id,
                    body_id: 0,
                    detail: MISSION_DETAIL_OUT_OF_BOUNDS,
                });
            }
        }
    }

    fn delete_rocket(&mut self, rocket_id: u32) -> bool {
        if let Some(index) = self.rockets.iter().position(|r| r.id == rocket_id) {
            self.rockets.remove(index);
            return true;
        }

        if let Some(index) = self
            .pending_launches
            .iter()
            .position(|r| r.rocket_id == rocket_id)
        {
            self.pending_launches.remove(index);
            return true;
        }

        false
    }
}

fn deg_to_rad(deg: f64) -> f64 {
    deg * PI / 180.0
}

/// `center_mass` を中心天体とする半径 `radius` での円軌道速度を返す。
fn circular_velocity(radius: f64, center_mass: f64) -> f64 {
    (G * center_mass / radius).sqrt()
}

/// 太陽を中心とした円軌道に天体を配置する。
/// 位相 `phase_deg` の方向に天体を置き、接線方向に円軌道速度を与える。
fn make_orbiting_body(id: u32, radius_orbit: f64, phase_deg: f64, mass: f64, radius: f64) -> Body {
    let sun_mass = 50000.0;
    let theta = deg_to_rad(phase_deg);
    let v = circular_velocity(radius_orbit, sun_mass);

    Body {
        id,
        x: radius_orbit * theta.cos(),
        y: radius_orbit * theta.sin(),
        vx: -v * theta.sin(),
        vy: v * theta.cos(),
        mass,
        radius,
        fixed: false,
    }
}

/// 地球周回軌道に月を配置する。
///
/// 太陽中心の円軌道速度だけを与えると地球周回軌道にならないため、
/// 地球の速度ベクトルに地球相対の円軌道速度を加算して初期化する。
/// `moon_relative_phase_deg` は地球を基準とした月の方位角（度）。
fn make_moon_body(earth_phase_deg: f64, moon_relative_phase_deg: f64) -> Body {
    let earth_orbit_r = 160.0;
    // 地球質量 20 でヒル球半径 ≈ 8.18。月を separation=8 に置くと
    // ヒル球内（< 8.18）かつ衝突半径外（> 4.8+1.6=6.4）で安定軌道が成立する。
    let moon_sep = 8.0;
    let earth_mass = 20.0; // N体積分での実際の質量と合わせる
    let sun_mass = 50000.0;

    let theta_e = deg_to_rad(earth_phase_deg);
    let v_earth = circular_velocity(earth_orbit_r, sun_mass);

    // 地球の位置と速度（太陽中心慣性系）
    let earth_x = earth_orbit_r * theta_e.cos();
    let earth_y = earth_orbit_r * theta_e.sin();
    let earth_vel_x = -v_earth * theta_e.sin();
    let earth_vel_y = v_earth * theta_e.cos();

    // 月の方位角と地球周回の接線速度
    let theta_m = deg_to_rad(earth_phase_deg + moon_relative_phase_deg);
    let v_moon_rel = circular_velocity(moon_sep, earth_mass);

    Body {
        id: BODY_MOON,
        x: earth_x + moon_sep * theta_m.cos(),
        y: earth_y + moon_sep * theta_m.sin(),
        vx: earth_vel_x - v_moon_rel * theta_m.sin(), // 地球速度 + 周回接線速度
        vy: earth_vel_y + v_moon_rel * theta_m.cos(),
        mass: 0.07,
        radius: 1.6,
        fixed: false,
    }
}

/// 軌道位相（度）を指定して太陽系の初期状態を生成する。
/// `phases_deg[0..3]` は水星・金星・地球・火星の位相、`phases_deg[4]` は地球基準の月の位相。
fn create_solar_preset(phases_deg: [f64; 5]) -> Vec<Body> {
    let earth_phase = phases_deg[2];

    vec![
        Body {
            id: BODY_SUN,
            x: 0.0,
            y: 0.0,
            vx: 0.0,
            vy: 0.0,
            mass: 50000.0,
            radius: 14.0,
            fixed: true,
        },
        make_orbiting_body(BODY_MERCURY, 70.0, phases_deg[0], 0.33, 3.0),
        make_orbiting_body(BODY_VENUS, 110.0, phases_deg[1], 4.87, 4.4),
        make_orbiting_body(BODY_EARTH, 160.0, earth_phase, 20.0, 4.8),
        make_moon_body(earth_phase, phases_deg[4]), // 地球周回軌道で初期化
        make_orbiting_body(BODY_MARS, 220.0, phases_deg[3], 0.64, 3.6),
        make_orbiting_body(BODY_JUPITER, 320.0, 0.0, 18.99, 7.5),
    ]
}

/// 全天体に対して N 体重力積分（オイラー法）と剛体衝突解決を行う。
/// 各天体ペアについて互いの重力加速度を計算し、速度・位置を更新する。
fn integrate_bodies(bodies: &mut [Body], dt: f64, gravity_scale: &[f64; 8]) {
    let mut ax = vec![0.0; bodies.len()];
    let mut ay = vec![0.0; bodies.len()];

    // ペア (i, j) の重力加速度を双方向に蓄積する（N² / 2 計算）
    for i in 0..bodies.len() {
        for j in (i + 1)..bodies.len() {
            let a = &bodies[i];
            let b = &bodies[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let d2 = dx * dx + dy * dy + SOFTENING_SQ;
            let d = d2.sqrt();
            let inv_d = 1.0 / d;

            let scale_from_b = gravity_scale.get(b.id as usize).copied().unwrap_or(1.0);
            let scale_from_a = gravity_scale.get(a.id as usize).copied().unwrap_or(1.0);

            let accel_on_a = (G * b.mass * scale_from_b) / d2;
            let accel_on_b = (G * a.mass * scale_from_a) / d2;

            if !a.fixed {
                ax[i] += accel_on_a * dx * inv_d;
                ay[i] += accel_on_a * dy * inv_d;
            }
            if !b.fixed {
                ax[j] -= accel_on_b * dx * inv_d;
                ay[j] -= accel_on_b * dy * inv_d;
            }
        }
    }

    for (i, body) in bodies.iter_mut().enumerate() {
        if body.fixed {
            continue;
        }
        body.vx += ax[i] * dt;
        body.vy += ay[i] * dt;
        body.x += body.vx * dt;
        body.y += body.vy * dt;
    }

    resolve_body_collisions(bodies);
}

fn resolve_body_collisions(bodies: &mut [Body]) {
    for i in 0..bodies.len() {
        for j in (i + 1)..bodies.len() {
            let (left, right) = bodies.split_at_mut(j);
            let a = &mut left[i];
            let b = &mut right[0];

            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let dist = dx.hypot(dy);
            let min_dist = a.radius + b.radius;
            if dist <= 0.0 || dist >= min_dist {
                continue;
            }

            let nx = dx / dist;
            let ny = dy / dist;
            let overlap = min_dist - dist;

            let ma = if a.fixed { FIXED_MASS } else { a.mass };
            let mb = if b.fixed { FIXED_MASS } else { b.mass };
            let wa = if a.fixed { 0.0 } else { 1.0 / ma };
            let wb = if b.fixed { 0.0 } else { 1.0 / mb };
            let wsum = wa + wb;

            if wsum > 0.0 {
                if !a.fixed {
                    a.x -= nx * overlap * wa / wsum;
                    a.y -= ny * overlap * wa / wsum;
                }
                if !b.fixed {
                    b.x += nx * overlap * wb / wsum;
                    b.y += ny * overlap * wb / wsum;
                }
            }

            let rvx = b.vx - a.vx;
            let rvy = b.vy - a.vy;
            let vn = rvx * nx + rvy * ny;
            if vn >= 0.0 {
                continue;
            }

            let impulse = (-(1.0 + RESTITUTION) * vn) / (1.0 / ma + 1.0 / mb);
            let jx = impulse * nx;
            let jy = impulse * ny;

            if !a.fixed {
                a.vx -= jx / ma;
                a.vy -= jy / ma;
            }
            if !b.fixed {
                b.vx += jx / mb;
                b.vy += jy / mb;
            }
        }
    }
}

/// 飛行中のロケットに全天体からの重力を積分して位置・速度を更新する。
/// ロケット同士の相互作用と推力は考慮しない。
fn integrate_rockets(rockets: &mut [Rocket], bodies: &[Body], dt: f64, gravity_scale: &[f64; 8]) {
    for rocket in rockets {
        if rocket.status != MISSION_FLYING {
            continue;
        }

        let mut ax = 0.0;
        let mut ay = 0.0;

        for body in bodies {
            let dx = body.x - rocket.x;
            let dy = body.y - rocket.y;
            let d2 = dx * dx + dy * dy + SOFTENING_SQ;
            let d = d2.sqrt();
            let scale = gravity_scale.get(body.id as usize).copied().unwrap_or(1.0);
            let accel = (G * body.mass * scale) / d2;
            ax += accel * dx / d;
            ay += accel * dy / d;
        }

        rocket.vx += ax * dt;
        rocket.vy += ay * dt;
        rocket.x += rocket.vx * dt;
        rocket.y += rocket.vy * dt;
    }
}

fn nearest_body(x: f64, y: f64, bodies: &[Body]) -> Option<(u32, f64)> {
    let mut min_dist = f64::INFINITY;
    let mut nearest = 0;

    for body in bodies {
        let dist = (x - body.x).hypot(y - body.y);
        if dist < min_dist {
            min_dist = dist;
            nearest = body.id;
        }
    }

    if min_dist.is_finite() {
        Some((nearest, min_dist))
    } else {
        None
    }
}

fn gravity_magnitude_at_point(x: f64, y: f64, bodies: &[Body], gravity_scale: &[f64; 8]) -> f64 {
    let mut ax = 0.0;
    let mut ay = 0.0;

    for body in bodies {
        let dx = body.x - x;
        let dy = body.y - y;
        let d2 = dx * dx + dy * dy + SOFTENING_SQ;
        let d = d2.sqrt();
        let scale = gravity_scale.get(body.id as usize).copied().unwrap_or(1.0);
        let accel = (G * body.mass * scale) / d2;
        ax += accel * dx / d;
        ay += accel * dy / d;
    }

    ax.hypot(ay)
}

/// 初期軌道位相を設定してシミュレーションをリセットする。
/// `req`: `[mercury_deg, venus_deg, earth_deg, mars_deg, moon_relative_deg]`（各 0–360 度）
#[wasm_bindgen]
#[must_use]
pub fn configure_initial_orbit(req: Vec<f64>) -> i32 {
    if req.len() != 5 {
        return STATUS_INVALID_ARGUMENT;
    }

    for phase in &req {
        if !(0.0..=360.0).contains(phase) {
            return STATUS_OUT_OF_RANGE;
        }
    }

    SIM.with(|cell| {
        let mut sim = cell.borrow_mut();
        sim.initial_phases_deg = [req[0], req[1], req[2], req[3], req[4]];
        sim.reset();
    });

    STATUS_OK
}

/// 1フレーム分のシミュレーションを進める。
/// `control`: `[dt_seconds]`（推奨 ≤ 0.05）
#[wasm_bindgen]
#[must_use]
pub fn step(control: Vec<f64>) -> i32 {
    if control.len() != 1 {
        return STATUS_INVALID_ARGUMENT;
    }

    let dt = control[0];
    if dt < 0.0 {
        return STATUS_OUT_OF_RANGE;
    }

    SIM.with(|cell| {
        cell.borrow_mut().step(dt);
    });

    STATUS_OK
}

/// 現在の状態サマリーを返す。
/// 戻り値: `[body_count, rocket_count, event_count, tick]`
#[wasm_bindgen]
#[must_use]
pub fn get_snapshot_meta() -> js_sys::Uint32Array {
    SIM.with(|cell| {
        let sim = cell.borrow();
        let meta = [
            sim.bodies.len() as u32,
            sim.rockets.len() as u32,
            sim.events.len() as u32,
            sim.tick,
        ];
        js_sys::Uint32Array::from(meta.as_slice())
    })
}

/// 全天体の状態を返す。
/// 戻り値: `[id, x, y, vx, vy, radius, mass]` × 天体数
#[wasm_bindgen]
#[must_use]
pub fn get_snapshot_bodies() -> js_sys::Float64Array {
    SIM.with(|cell| {
        let sim = cell.borrow();
        let mut out = Vec::with_capacity(sim.bodies.len() * 7);
        for body in &sim.bodies {
            out.push(f64::from(body.id));
            out.push(body.x);
            out.push(body.y);
            out.push(body.vx);
            out.push(body.vy);
            out.push(body.radius);
            out.push(body.mass);
        }
        js_sys::Float64Array::from(out.as_slice())
    })
}

/// 飛行中の全ロケット状態を返す。
/// 戻り値: `[id, x, y, vx, vy, status, nearest_body_id]` × ロケット数
#[wasm_bindgen]
#[must_use]
pub fn get_snapshot_rockets() -> js_sys::Float64Array {
    SIM.with(|cell| {
        let sim = cell.borrow();
        let mut out = Vec::with_capacity(sim.rockets.len() * 7);

        for rocket in &sim.rockets {
            let nearest_body_id =
                nearest_body(rocket.x, rocket.y, &sim.bodies).map_or(0, |(id, _)| id);

            out.push(f64::from(rocket.id));
            out.push(rocket.x);
            out.push(rocket.y);
            out.push(rocket.vx);
            out.push(rocket.vy);
            out.push(f64::from(rocket.status));
            out.push(f64::from(nearest_body_id));
        }

        js_sys::Float64Array::from(out.as_slice())
    })
}

/// 未読ミッションイベントをすべて取得し、キューをクリアする。
/// 戻り値: `[event_type, rocket_id, body_id, detail]` × イベント数
#[wasm_bindgen]
#[must_use]
pub fn get_events() -> js_sys::Uint32Array {
    SIM.with(|cell| {
        let mut sim = cell.borrow_mut();
        let events = std::mem::take(&mut sim.events);
        let mut out = Vec::with_capacity(events.len() * 4);

        for event in events {
            out.push(event.kind);
            out.push(event.rocket_id);
            out.push(event.body_id);
            out.push(event.detail);
        }

        js_sys::Uint32Array::from(out.as_slice())
    })
}

/// ロケット発射を予約し、次ステップで適用する。
/// `req`: `[mode, origin_body_id, angle_deg, speed]`
/// 戻り値: `[status_code, rocket_id]`（失敗時は `rocket_id` = 0）
#[wasm_bindgen]
#[must_use]
pub fn launch_rocket(req: Vec<f64>) -> js_sys::Uint32Array {
    if req.len() != 4 {
        return js_sys::Uint32Array::from([STATUS_INVALID_ARGUMENT as u32, 0].as_slice());
    }

    let mode = req[0] as i64;
    let origin_body_id = req[1] as i64;
    let angle_deg = req[2];
    let speed = req[3];

    if mode < 0 || origin_body_id <= 0 || speed < 0.0 {
        return js_sys::Uint32Array::from([STATUS_OUT_OF_RANGE as u32, 0].as_slice());
    }

    let result = SIM.with(|cell| {
        let mut sim = cell.borrow_mut();
        let origin_u32 = origin_body_id as u32;

        if sim.body_by_id(origin_u32).is_none() {
            return [STATUS_NOT_FOUND as u32, 0];
        }
        if mode != 0 {
            return [STATUS_INVALID_ARGUMENT as u32, 0];
        }

        let rocket_id = sim.next_rocket_id;
        sim.next_rocket_id = sim.next_rocket_id.saturating_add(1);
        sim.pending_launches.push(LaunchRequest {
            rocket_id,
            mode: mode as u32,
            origin_body_id: origin_u32,
            angle_deg,
            speed,
        });

        [STATUS_OK as u32, rocket_id]
    });

    js_sys::Uint32Array::from(result.as_slice())
}

/// 指定 ID のロケットを即座に削除する（飛行中・予約中を問わない）。
/// `req`: `[rocket_id]`
#[wasm_bindgen]
#[must_use]
pub fn delete_rocket(req: Vec<u32>) -> i32 {
    if req.len() != 1 {
        return STATUS_INVALID_ARGUMENT;
    }

    let rocket_id = req[0];
    let deleted = SIM.with(|cell| cell.borrow_mut().delete_rocket(rocket_id));
    if deleted { STATUS_OK } else { STATUS_NOT_FOUND }
}

/// 指定ロケットのテレメトリを返す。
/// 戻り値: `[rocket_id, speed, altitude_from_earth, gravity_accel, nearest_body_id, nearest_surface_dist, mission_state]`
#[wasm_bindgen]
#[must_use]
pub fn get_rocket_telemetry(req: Vec<u32>) -> js_sys::Float64Array {
    if req.len() != 1 {
        return js_sys::Float64Array::new_with_length(0);
    }

    SIM.with(|cell| {
        let sim = cell.borrow();
        let rocket_id = req[0];
        let Some(rocket) = sim.rockets.iter().find(|r| r.id == rocket_id) else {
            return js_sys::Float64Array::new_with_length(0);
        };

        let earth = sim.body_by_id(BODY_EARTH);
        let (nearest_body_id, nearest_distance) =
            nearest_body(rocket.x, rocket.y, &sim.bodies).unwrap_or((0, 0.0));

        let nearest_body_radius = sim
            .body_by_id(nearest_body_id)
            .map_or(0.0, |body| body.radius);

        let altitude_from_earth = earth
            .map_or(0.0, |e| (rocket.x - e.x).hypot(rocket.y - e.y) - e.radius)
            .max(0.0);

        let telemetry = [
            f64::from(rocket.id),
            rocket.vx.hypot(rocket.vy),
            altitude_from_earth,
            gravity_magnitude_at_point(rocket.x, rocket.y, &sim.bodies, &sim.gravity_scale),
            f64::from(nearest_body_id),
            (nearest_distance - nearest_body_radius).max(0.0),
            f64::from(rocket.status),
        ];

        js_sys::Float64Array::from(telemetry.as_slice())
    })
}

/// 発射パラメータから将来軌道を予測し、座標列を返す。
/// `req`: `[mode, origin_body_id, angle_deg, speed, steps, dt]`
/// 戻り値: `[x, y]` × steps（月到達・範囲外で早期終了）
#[wasm_bindgen]
#[must_use]
pub fn predict_orbit(req: Vec<f64>) -> js_sys::Float64Array {
    if req.len() != 6 {
        return js_sys::Float64Array::new_with_length(0);
    }

    let mode = req[0] as i64;
    let origin_body_id = req[1] as i64;
    let angle_deg = req[2];
    let speed = req[3];
    let steps = req[4] as i64;
    let dt = req[5];

    if mode != 0 || origin_body_id <= 0 || speed < 0.0 || dt <= 0.0 {
        return js_sys::Float64Array::new_with_length(0);
    }
    if !(1..=1024).contains(&steps) {
        return js_sys::Float64Array::new_with_length(0);
    }

    SIM.with(|cell| {
        let sim = cell.borrow();
        let origin_u32 = origin_body_id as u32;
        let request = LaunchRequest {
            rocket_id: 0,
            mode: mode as u32,
            origin_body_id: origin_u32,
            angle_deg,
            speed,
        };

        let mut local_bodies = sim.bodies.clone();
        let Some(mut probe) = sim.build_rocket_from_request(&request) else {
            return js_sys::Float64Array::new_with_length(0);
        };

        let mut out = Vec::with_capacity((steps as usize) * 2);
        for _ in 0..steps {
            for _ in 0..SUBSTEPS {
                let sub_dt = dt / SUBSTEPS_F64;
                integrate_bodies(&mut local_bodies, sub_dt, &sim.gravity_scale);
                integrate_rockets(
                    std::slice::from_mut(&mut probe),
                    &local_bodies,
                    sub_dt,
                    &sim.gravity_scale,
                );
            }

            out.push(probe.x);
            out.push(probe.y);

            let sun = local_bodies.iter().find(|b| b.id == BODY_SUN);
            if let Some(sun_body) = sun {
                let dist_to_sun = (probe.x - sun_body.x).hypot(probe.y - sun_body.y);
                if dist_to_sun <= sun_body.radius + 1.2 {
                    break;
                }
            }

            if probe.x.abs() > WORLD_BOUNDS || probe.y.abs() > WORLD_BOUNDS {
                break;
            }
        }

        js_sys::Float64Array::from(out.as_slice())
    })
}

/// シミュレーションを `initial_phases_deg` の状態にリセットする。
#[wasm_bindgen]
#[must_use]
pub fn reset_sim() -> i32 {
    SIM.with(|cell| {
        cell.borrow_mut().reset();
    });
    STATUS_OK
}

/// 指定天体の重力倍率を設定する（0.0 – `MAX_GRAVITY_SCALE`）。
/// `req`: `[body_id, scale]`
#[wasm_bindgen]
#[must_use]
pub fn set_gravity_scale(req: Vec<f64>) -> i32 {
    if req.len() != 2 {
        return STATUS_INVALID_ARGUMENT;
    }

    let body_id = req[0] as i64;
    let scale = req[1];

    if body_id <= 0 {
        return STATUS_OUT_OF_RANGE;
    }
    if scale < 0.0 {
        return STATUS_OUT_OF_RANGE;
    }

    SIM.with(|cell| {
        let mut sim = cell.borrow_mut();
        if sim.body_by_id(body_id as u32).is_none() {
            return STATUS_NOT_FOUND;
        }

        if let Some(slot) = sim.gravity_scale.get_mut(body_id as usize) {
            *slot = scale.min(MAX_GRAVITY_SCALE);
            STATUS_OK
        } else {
            STATUS_OUT_OF_RANGE
        }
    })
}
