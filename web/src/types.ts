export {};

declare global {
  const PHYSICS: {
    G: number;
    SOFTENING_SQ: number;
    RESTITUTION: number;
    FIXED_MASS: number;
    SUBSTEPS: number;
    MAX_ROCKETS: number;
    TRAIL_MAX_LENGTH: number;
  };

  const BODY_IDS: {
    readonly SUN: number;
    readonly MERCURY: number;
    readonly VENUS: number;
    readonly EARTH: number;
    readonly MOON: number;
    readonly MARS: number;
    readonly JUPITER: number;
  };

  type BodyId = number;
  type RocketId = number;

  type BodyKind = 'sun' | 'planet' | 'moon';
  type RocketStatus =
    | 'flying'
    | 'reached_moon'
    | 'fell_into_sun'
    | 'out_of_bounds';
  type MissionEventType = 'reached_moon' | 'fell_into_sun' | 'out_of_bounds';

  interface BodyState {
    id: BodyId;
    x: number;
    y: number;
    vx: number;
    vy: number;
    mass: number;
    radius: number;
    color: string;
    name: string;
    kind: BodyKind;
    fixed: boolean;
    glow?: boolean;
  }

  interface RocketState {
    id: RocketId;
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    status: RocketStatus;
  }

  interface MissionEvent {
    type: MissionEventType;
    rocketId: RocketId;
  }

  interface SimulationSnapshot {
    bodies: BodyState[];
    rockets: RocketState[];
    missionEvents: MissionEvent[];
  }

  interface Telemetry {
    speed: number;
    altitudeFromEarth: number;
    gravityAccel: number;
    nearestBody: { name: string; distance: number };
  }

  interface OrbitPoint {
    x: number;
    y: number;
  }

  interface LaunchRocketParams {
    x: number;
    y: number;
    angleDeg: number;
    speed: number;
  }

  interface PredictOrbitParams {
    angleDeg: number;
    speed: number;
    steps: number;
  }

  interface SimulationEngine {
    step(dt: number): void;
    getSnapshot(): SimulationSnapshot;

    launchRocket(params: LaunchRocketParams): RocketId;
    deleteRocket(rocketId: RocketId): void;
    setGravityScale(bodyId: BodyId, scale: number): void;
    focusBody(bodyId: BodyId | null): void;

    getTelemetry(rocketId: RocketId): Telemetry | null;
    getFocusedBodyPosition(): { x: number; y: number } | null;
    predictLaunchOrbit(params: PredictOrbitParams): OrbitPoint[];

    reset(): void;
  }

  interface CameraState {
    x: number;
    y: number;
    zoom: number;
    minZoom: number;
    maxZoom: number;
  }

  interface LaunchDragPreview {
    active: boolean;
    start: OrbitPoint;
    current: OrbitPoint;
    angleDeg: number;
    speed: number;
  }

  interface RendererHandle {
    resizeToDisplaySize(): void;
    render(
      snapshot: SimulationSnapshot,
      camera: CameraState,
      options: {
        trails: Map<RocketId, OrbitPoint[]>;
        selectedRocketId: RocketId | null;
        showOrbitGuides: boolean;
        predictedOrbit: OrbitPoint[];
        launchPreview: LaunchDragPreview | null;
        showUfo: boolean;
        nowMs: number;
      },
    ): void;
  }

  interface InputBinding {
    destroy(): void;
    getLaunchPreview(): LaunchDragPreview | null;
  }

  interface Window {
    NBodySim: {
      [key: string]: unknown;
    };
  }
}

window.NBodySim ??= {};
