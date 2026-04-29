/**
 * WASM インターフェース
 * Rust で実装された WASM バックエンドとの連携を担当
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

type TimeScale = 0 | 1 | 2 | 4;

interface SimulationBackend {
  step(dt: number): void;
  launch_rocket(angle: number, speed: number): void;
  set_time_scale(scale: TimeScale): void;
  get_time_scale(): TimeScale;
  get_bodies(): Body[];
  get_telemetry(): Telemetry;
  get_mission_state(): MissionState;
  reset(): void;
}

interface RustSimulationEngine {
  step(dt: number): void;
  launch_rocket(angle: number, speed: number): void;
  set_time_scale(scale: number): void;
  get_time_scale(): number;
  get_bodies(): Body[];
  get_telemetry(): Telemetry;
  get_mission_state(): MissionState;
  reset(): void;
}

interface RustWasmModule {
  default: () => Promise<unknown>;
  SimulationEngine: new () => RustSimulationEngine;
}

let rustBackendFactory: (() => SimulationBackend) | null = null;
let initPromise: Promise<void> | null = null;

function isTimeScale(value: number): value is TimeScale {
  return value === 0 || value === 1 || value === 2 || value === 4;
}

class RustBackendAdapter implements SimulationBackend {
  private readonly engine: RustSimulationEngine;

  constructor(engine: RustSimulationEngine) {
    this.engine = engine;
  }

  step(dt: number): void {
    this.engine.step(dt);
  }

  launch_rocket(angle: number, speed: number): void {
    this.engine.launch_rocket(angle, speed);
  }

  set_time_scale(scale: TimeScale): void {
    this.engine.set_time_scale(scale);
  }

  get_time_scale(): TimeScale {
    const timeScale = this.engine.get_time_scale();
    return isTimeScale(timeScale) ? timeScale : 1;
  }

  get_bodies(): Body[] {
    return this.engine.get_bodies();
  }

  get_telemetry(): Telemetry {
    return this.engine.get_telemetry();
  }

  get_mission_state(): MissionState {
    return this.engine.get_mission_state();
  }

  reset(): void {
    this.engine.reset();
  }
}

async function loadRustBackendFactory(): Promise<() => SimulationBackend> {
  const wasmModule =
    (await import("../wasm/pkg/space_wasm.js")) as RustWasmModule;

  await wasmModule.default();

  return () => new RustBackendAdapter(new wasmModule.SimulationEngine());
}

export async function initWasmInterface(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    rustBackendFactory = await loadRustBackendFactory();
  })();

  return initPromise.catch((error: unknown) => {
    rustBackendFactory = null;
    const reason =
      error instanceof Error ? error.message : "Unknown initialization error";
    throw new Error(
      `Rust WASM backend initialization failed: ${reason}. Run npm run wasm:build before starting the app.`,
    );
  });
}

function createBackend(): SimulationBackend {
  if (!rustBackendFactory) {
    throw new Error(
      "Rust WASM backend is not initialized. Call initWasmInterface() before getWasmInstance().",
    );
  }

  return rustBackendFactory();
}

/**
 * WASM インターフェース
 * 既存 UI が使う API 互換のアダプタ
 */
export class WasmInterface implements SimulationBackend {
  private readonly backend: SimulationBackend;

  constructor() {
    this.backend = createBackend();
  }

  step(dt: number): void {
    this.backend.step(dt);
  }

  launch_rocket(angle: number, speed: number): void {
    this.backend.launch_rocket(angle, speed);
  }

  set_time_scale(scale: TimeScale): void {
    this.backend.set_time_scale(scale);
  }

  get_time_scale(): TimeScale {
    return this.backend.get_time_scale();
  }

  get_bodies(): Body[] {
    return this.backend.get_bodies();
  }

  get_telemetry(): Telemetry {
    return this.backend.get_telemetry();
  }

  get_mission_state(): MissionState {
    return this.backend.get_mission_state();
  }

  reset(): void {
    this.backend.reset();
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
