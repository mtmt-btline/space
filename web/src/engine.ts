import {
  configure_initial_orbit,
  delete_rocket,
  get_events,
  get_rocket_telemetry,
  get_snapshot_bodies,
  get_snapshot_meta,
  get_snapshot_rockets,
  launch_rocket,
  predict_orbit,
  reset_sim,
  set_gravity_scale,
  step,
} from '../pkg/engine.js';

const BODY_META: Record<
  number,
  Pick<BodyState, 'name' | 'color' | 'kind' | 'fixed' | 'glow'>
> = {
  1: { name: '太陽', color: '#f5c531', kind: 'sun', fixed: true, glow: true },
  2: { name: '水星', color: '#9aa3ad', kind: 'planet', fixed: false },
  3: { name: '金星', color: '#e8c270', kind: 'planet', fixed: false },
  4: { name: '地球', color: '#5aa9f0', kind: 'planet', fixed: false },
  5: { name: '月', color: '#cfd5db', kind: 'moon', fixed: false },
  6: { name: '火星', color: '#d96a4a', kind: 'planet', fixed: false },
  7: { name: '木星', color: '#c79a6b', kind: 'planet', fixed: false },
};

function missionStatusFromCode(code: number): RocketStatus {
  switch (code) {
    case 1:
      return 'reached_moon';
    case 2:
      return 'fell_into_sun';
    case 3:
      return 'out_of_bounds';
    default:
      return 'flying';
  }
}

function missionEventFromDetail(detail: number): MissionEventType {
  switch (detail) {
    case 1:
      return 'reached_moon';
    case 2:
      return 'fell_into_sun';
    default:
      return 'out_of_bounds';
  }
}

class SimulationEngineWasmAdapter implements SimulationEngine {
  private focusedBodyId: BodyId | null = null;
  private cachedTick = Number.NaN;
  private cachedSnapshot: SimulationSnapshot = {
    bodies: [],
    rockets: [],
    missionEvents: [],
  };

  constructor() {
    reset_sim();
  }

  step(dt: number): void {
    if (dt <= 0) {
      return;
    }

    const clampedDt = Math.min(dt, 0.05);
    step(new Float64Array([clampedDt]));
    this.cachedTick = Number.NaN;
  }

  getSnapshot(): SimulationSnapshot {
    const meta = get_snapshot_meta();
    const tick = meta[3] ?? 0;

    if (tick === this.cachedTick) {
      return this.cachedSnapshot;
    }

    const bodiesRaw = get_snapshot_bodies();
    const rocketsRaw = get_snapshot_rockets();
    const eventsRaw = get_events();

    const bodies: BodyState[] = [];
    for (let i = 0; i + 6 < bodiesRaw.length; i += 7) {
      const id = Math.trunc(bodiesRaw[i]);
      const metaForBody = BODY_META[id];
      if (!metaForBody) {
        continue;
      }

      bodies.push({
        id,
        x: bodiesRaw[i + 1],
        y: bodiesRaw[i + 2],
        vx: bodiesRaw[i + 3],
        vy: bodiesRaw[i + 4],
        radius: bodiesRaw[i + 5],
        mass: bodiesRaw[i + 6],
        color: metaForBody.color,
        name: metaForBody.name,
        kind: metaForBody.kind,
        fixed: metaForBody.fixed,
        glow: metaForBody.glow,
      });
    }

    const rockets: RocketState[] = [];
    for (let i = 0; i + 6 < rocketsRaw.length; i += 7) {
      rockets.push({
        id: Math.trunc(rocketsRaw[i]),
        x: rocketsRaw[i + 1],
        y: rocketsRaw[i + 2],
        vx: rocketsRaw[i + 3],
        vy: rocketsRaw[i + 4],
        status: missionStatusFromCode(Math.trunc(rocketsRaw[i + 5])),
        color: '#f4f6fb',
      });
    }

    const missionEvents: MissionEvent[] = [];
    for (let i = 0; i + 3 < eventsRaw.length; i += 4) {
      const eventType = Math.trunc(eventsRaw[i]);
      if (eventType !== 1) {
        continue;
      }

      missionEvents.push({
        type: missionEventFromDetail(Math.trunc(eventsRaw[i + 3])),
        rocketId: Math.trunc(eventsRaw[i + 1]),
      });
    }

    this.cachedTick = tick;
    this.cachedSnapshot = { bodies, rockets, missionEvents };
    return this.cachedSnapshot;
  }

  launchRocket(params: LaunchRocketParams): RocketId {
    const runtime = window.NBodySim as {
      BODY_IDS: typeof BODY_IDS;
    };

    const result = launch_rocket(
      new Float64Array([
        0,
        runtime.BODY_IDS.EARTH,
        params.angleDeg,
        params.speed,
      ]),
    );

    this.cachedTick = Number.NaN;
    return Math.trunc(result[1] ?? 0);
  }

  deleteRocket(rocketId: RocketId): void {
    delete_rocket(new Uint32Array([rocketId]));
    this.cachedTick = Number.NaN;
  }

  setGravityScale(bodyId: BodyId, scale: number): void {
    const clamped = Math.max(0, Math.min(scale, 3));
    set_gravity_scale(new Float64Array([bodyId, clamped]));
  }

  focusBody(bodyId: BodyId | null): void {
    if (bodyId === null) {
      this.focusedBodyId = null;
      return;
    }

    const exists = this.getSnapshot().bodies.some(body => body.id === bodyId);
    this.focusedBodyId = exists ? bodyId : null;
  }

  getTelemetry(rocketId: RocketId): Telemetry | null {
    const data = get_rocket_telemetry(new Uint32Array([rocketId]));
    if (data.length < 7) {
      return null;
    }

    const nearestBodyId = Math.trunc(data[4]);
    const nearestName = BODY_META[nearestBodyId]?.name ?? '-';

    return {
      speed: data[1],
      altitudeFromEarth: data[2],
      gravityAccel: data[3],
      nearestBody: {
        name: nearestName,
        distance: data[5],
      },
    };
  }

  getFocusedBodyPosition(): { x: number; y: number } | null {
    if (this.focusedBodyId === null) {
      return null;
    }

    const body = this.getSnapshot().bodies.find(
      candidate => candidate.id === this.focusedBodyId,
    );
    if (!body) {
      return null;
    }

    return { x: body.x, y: body.y };
  }

  predictLaunchOrbit(params: PredictOrbitParams): OrbitPoint[] {
    const runtime = window.NBodySim as {
      BODY_IDS: typeof BODY_IDS;
    };

    if (params.steps <= 0 || params.speed <= 0) {
      return [];
    }

    const steps = Math.max(1, Math.min(1024, Math.floor(params.steps)));
    const raw = predict_orbit(
      new Float64Array([
        0,
        runtime.BODY_IDS.EARTH,
        params.angleDeg,
        params.speed,
        steps,
        1 / 60,
      ]),
    );

    const points: OrbitPoint[] = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      points.push({ x: raw[i], y: raw[i + 1] });
    }

    return points;
  }

  reset(): void {
    reset_sim();
    configure_initial_orbit(new Float64Array([0, 0, 0, 0, 0]));
    this.focusedBodyId = null;
    this.cachedTick = Number.NaN;
  }
}

(
  window.NBodySim as { createSimulationEngine?: () => SimulationEngine }
).createSimulationEngine = () => new SimulationEngineWasmAdapter();
