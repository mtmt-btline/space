/**
 * WASM モック実装
 * requirements-physics.md で定義された API の型定義とスタブ実装
 * 本番時には実際の WASM バイナリに置き換える
 */

/**
 * 天体データ型
 * 位置、速度、サイズ、識別情報を保持
 */
export interface Body {
  id: number;
  name: string;
  position: {
    x: number;
    y: number;
  };
  velocity: {
    x: number;
    y: number;
  };
  radius: number;
  mass?: number;
}

/**
 * ロケット推進時のテレメトリ
 */
export interface Telemetry {
  elapsed_time: number; // seconds
  rocket_height: number; // meters (地面からの高さ)
  rocket_velocity: number; // m/s
  gravity_acceleration: number; // m/s^2
  nearest_body_name: string;
  nearest_body_distance: number; // meters (mock units)
}

/**
 * ミッション状態
 */
export interface MissionState {
  status: "idle" | "running" | "finished";
  success: boolean;
  message?: string;
}

/**
 * シミュレーション状態全体
 */
export interface SimulationSnapshot {
  bodies: Body[];
  telemetry: Telemetry;
  mission: MissionState;
}

/**
 * WASM インターフェース
 * モック実装による開発用インターフェース
 */
export class WasmInterface {
  private simulationTime: number = 0;
  private rocketLaunched: boolean = false;
  private launchAngle: number = 0;
  private launchSpeed: number = 0;
  private timeScale: 0 | 1 | 2 | 4 = 1;
  private missionStatus: "idle" | "running" | "finished" = "idle";
  private missionSuccess: boolean = false;

  constructor() {
    this.reset();
  }

  /**
   * シミュレーション時間を進める
   * @param dt 時間ステップ (秒)
   */
  step(dt: number): void {
    if (this.missionStatus !== "running") return;
    if (this.timeScale === 0) return;

    this.simulationTime += dt * this.timeScale;

    // ロケット発射後、一定時間で完了
    if (this.rocketLaunched) {
      // 10秒後にミッション完了（仮）
      if (this.simulationTime > 10) {
        this.missionStatus = "finished";
        this.missionSuccess = true;
      }
    }
  }

  /**
   * ロケットを発射
   * @param angle 発射角度 (0-90 度)
   * @param speed 発射速度 (m/s)
   */
  launch_rocket(angle: number, speed: number): void {
    if (this.missionStatus === "idle") {
      this.rocketLaunched = true;
      this.missionStatus = "running";
      this.launchAngle = angle;
      this.launchSpeed = speed;
      this.simulationTime = 0;
    }
  }

  set_time_scale(scale: 0 | 1 | 2 | 4): void {
    this.timeScale = scale;
  }

  get_time_scale(): 0 | 1 | 2 | 4 {
    return this.timeScale;
  }

  /**
   * 全天体のデータを取得
   */
  get_bodies(): Body[] {
    const bodies: Body[] = [
      {
        id: 0,
        name: "Sun",
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        radius: 20,
        mass: 1.989e30,
      },
      {
        id: 1,
        name: "Earth",
        position: { x: 150, y: 0 },
        velocity: { x: 0, y: 30 },
        radius: 6,
        mass: 5.972e24,
      },
      {
        id: 2,
        name: "Moon",
        position: { x: 160, y: 0 },
        velocity: { x: 0, y: 31 },
        radius: 1.7,
        mass: 7.342e22,
      },
    ];

    // ロケット発射時のみロケットを追加（開発用）
    if (this.rocketLaunched && this.missionStatus === "running") {
      const rocketX =
        this.launchSpeed *
        Math.cos((this.launchAngle * Math.PI) / 180) *
        this.simulationTime;
      const rocketY =
        this.launchSpeed *
          Math.sin((this.launchAngle * Math.PI) / 180) *
          this.simulationTime -
        0.5 * 9.8 * this.simulationTime ** 2;

      bodies.push({
        id: 999,
        name: "Rocket",
        position: { x: rocketX, y: Math.max(0, rocketY) },
        velocity: {
          x: this.launchSpeed * Math.cos((this.launchAngle * Math.PI) / 180),
          y:
            this.launchSpeed * Math.sin((this.launchAngle * Math.PI) / 180) -
            9.8 * this.simulationTime,
        },
        radius: 2,
      });
    }

    return bodies;
  }

  /**
   * テレメトリデータを取得
   */
  get_telemetry(): Telemetry {
    let rocketHeight = 0;
    let rocketVelocity = 0;
    let gravityAcceleration = 9.8;
    let nearestBodyName = "Earth";
    let nearestBodyDistance = 0;

    if (this.rocketLaunched && this.missionStatus === "running") {
      const rocketX =
        this.launchSpeed *
        Math.cos((this.launchAngle * Math.PI) / 180) *
        this.simulationTime;
      const rocketY = Math.max(
        0,
        this.launchSpeed *
          Math.sin((this.launchAngle * Math.PI) / 180) *
          this.simulationTime -
          0.5 * 9.8 * this.simulationTime ** 2,
      );
      const vY =
        this.launchSpeed * Math.sin((this.launchAngle * Math.PI) / 180) -
        9.8 * this.simulationTime;
      rocketHeight = Math.max(
        0,
        this.launchSpeed *
          Math.sin((this.launchAngle * Math.PI) / 180) *
          this.simulationTime -
          0.5 * 9.8 * this.simulationTime ** 2,
      );
      rocketVelocity = Math.sqrt(
        (this.launchSpeed * Math.cos((this.launchAngle * Math.PI) / 180)) ** 2 +
          vY ** 2,
      );

      const distances = [
        { name: "Earth", distance: Math.hypot(rocketX - 150, rocketY) },
        { name: "Moon", distance: Math.hypot(rocketX - 160, rocketY) },
        { name: "Sun", distance: Math.hypot(rocketX, rocketY) },
      ].sort((left, right) => left.distance - right.distance);

      nearestBodyName = distances[0].name;
      nearestBodyDistance = distances[0].distance;
      gravityAcceleration = Math.max(
        0.5,
        9.8 / Math.max(1, nearestBodyDistance / 20),
      );
    }

    return {
      elapsed_time: this.simulationTime,
      rocket_height: rocketHeight,
      rocket_velocity: rocketVelocity,
      gravity_acceleration: gravityAcceleration,
      nearest_body_name: nearestBodyName,
      nearest_body_distance: nearestBodyDistance,
    };
  }

  /**
   * ミッション状態を取得
   */
  get_mission_state(): MissionState {
    return {
      status: this.missionStatus,
      success: this.missionSuccess,
      message: this.missionSuccess ? "Mission accomplished!" : undefined,
    };
  }

  /**
   * シミュレーションをリセット
   */
  reset(): void {
    this.simulationTime = 0;
    this.rocketLaunched = false;
    this.launchAngle = 0;
    this.launchSpeed = 0;
    this.timeScale = 1;
    this.missionStatus = "idle";
    this.missionSuccess = false;
  }
}

/**
 * シングルトンインスタンス
 */
let wasmInstance: WasmInterface | null = null;

/**
 * WASM インスタンスを取得
 */
export function getWasmInstance(): WasmInterface {
  if (!wasmInstance) {
    wasmInstance = new WasmInterface();
  }
  return wasmInstance;
}
