class SimulationEngineImpl implements SimulationEngine {
  private bodies: BodyState[] = [];
  private rockets: RocketState[] = [];
  private missionEvents: MissionEvent[] = [];
  private gravityScaleMap: Map<BodyId, number> = new Map();
  private focusedBodyId: BodyId | null = null;
  private nextRocketId = 1;
  private readonly worldBounds = 2200;

  constructor() {
    this.reset();
  }

  step(dt: number): void {
    const runtime = window.NBodySim as {
      PHYSICS: typeof PHYSICS;
      integrateBodies: (
        bodies: BodyState[],
        dtSeconds: number,
        gravityScaleMap: Map<BodyId, number>
      ) => void;
      integrateRockets: (
        rockets: RocketState[],
        bodies: BodyState[],
        dtSeconds: number,
        gravityScaleMap: Map<BodyId, number>
      ) => void;
    };

    if (dt <= 0) {
      return;
    }

    const clampedDt = Math.min(dt, 0.05);
    this.missionEvents = [];

    for (let s = 0; s < runtime.PHYSICS.SUBSTEPS; s += 1) {
      const subDt = clampedDt / runtime.PHYSICS.SUBSTEPS;
      runtime.integrateBodies(this.bodies, subDt, this.gravityScaleMap);
      runtime.integrateRockets(this.rockets, this.bodies, subDt, this.gravityScaleMap);
      this.evaluateMissionEvents();
    }

    this.rockets = this.rockets.filter((rocket) => rocket.status === "flying");
  }

  getSnapshot(): SimulationSnapshot {
    return {
      bodies: this.bodies.map((body) => ({ ...body })),
      rockets: this.rockets.map((rocket) => ({ ...rocket })),
      missionEvents: this.missionEvents.map((event) => ({ ...event })),
    };
  }

  launchRocket(params: LaunchRocketParams): RocketId {
    const runtime = window.NBodySim as {
      PHYSICS: typeof PHYSICS;
      findNearestBody: (
        x: number,
        y: number,
        bodies: BodyState[]
      ) => { body: BodyState; distance: number } | null;
      degToRad: (deg: number) => number;
    };

    if (this.rockets.length >= runtime.PHYSICS.MAX_ROCKETS) {
      this.rockets.shift();
    }

    const rad = runtime.degToRad(params.angleDeg);
    const nearest = runtime.findNearestBody(params.x, params.y, this.bodies);

    let inheritVx = 0;
    let inheritVy = 0;
    if (nearest && nearest.distance <= nearest.body.radius + 24) {
      inheritVx = nearest.body.vx;
      inheritVy = nearest.body.vy;
    }

    const rocket: RocketState = {
      id: this.nextRocketId,
      x: params.x,
      y: params.y,
      vx: Math.cos(rad) * params.speed + inheritVx,
      vy: Math.sin(rad) * params.speed + inheritVy,
      color: "#f4f6fb",
      status: "flying",
    };

    this.rockets.push(rocket);
    this.nextRocketId += 1;
    return rocket.id;
  }

  deleteRocket(rocketId: RocketId): void {
    this.rockets = this.rockets.filter((rocket) => rocket.id !== rocketId);
  }

  setGravityScale(bodyId: BodyId, scale: number): void {
    const clamped = Math.max(0, Math.min(scale, 3));
    this.gravityScaleMap.set(bodyId, clamped);
  }

  focusBody(bodyId: BodyId | null): void {
    if (bodyId === null) {
      this.focusedBodyId = null;
      return;
    }

    const exists = this.bodies.some((body) => body.id === bodyId);
    this.focusedBodyId = exists ? bodyId : null;
  }

  getTelemetry(rocketId: RocketId): Telemetry | null {
    const runtime = window.NBodySim as {
      calculateGravityMagnitudeAtPoint: (
        x: number,
        y: number,
        bodies: BodyState[],
        gravityScaleMap: Map<BodyId, number>
      ) => number;
      findNearestBody: (
        x: number,
        y: number,
        bodies: BodyState[]
      ) => { body: BodyState; distance: number } | null;
      BODY_IDS: typeof BODY_IDS;
    };

    const rocket = this.rockets.find((candidate) => candidate.id === rocketId);
    if (!rocket) {
      return null;
    }

    const earth = this.bodies.find((body) => body.id === runtime.BODY_IDS.EARTH) ?? null;
    const nearest = runtime.findNearestBody(rocket.x, rocket.y, this.bodies);

    const altitudeFromEarth = earth
      ? Math.max(0, Math.hypot(rocket.x - earth.x, rocket.y - earth.y) - earth.radius)
      : 0;

    return {
      speed: Math.hypot(rocket.vx, rocket.vy),
      altitudeFromEarth,
      gravityAccel: runtime.calculateGravityMagnitudeAtPoint(
        rocket.x,
        rocket.y,
        this.bodies,
        this.gravityScaleMap
      ),
      nearestBody: nearest
        ? {
            name: nearest.body.name,
            distance: Math.max(0, nearest.distance - nearest.body.radius),
          }
        : { name: "-", distance: 0 },
    };
  }

  getFocusedBodyPosition(): { x: number; y: number } | null {
    if (this.focusedBodyId === null) {
      return null;
    }

    const body = this.bodies.find((candidate) => candidate.id === this.focusedBodyId);
    if (!body) {
      return null;
    }

    return { x: body.x, y: body.y };
  }

  predictLaunchOrbit(params: PredictOrbitParams): OrbitPoint[] {
    const runtime = window.NBodySim as {
      BODY_IDS: typeof BODY_IDS;
      degToRad: (deg: number) => number;
      predictRocketOrbit: (
        bodies: BodyState[],
        rocket: RocketState,
        steps: number,
        gravityScaleMap: Map<BodyId, number>
      ) => OrbitPoint[];
    };

    const earth = this.bodies.find((body) => body.id === runtime.BODY_IDS.EARTH) ?? null;
    if (!earth || params.steps <= 0 || params.speed <= 0) {
      return [];
    }

    const rad = runtime.degToRad(params.angleDeg);
    const startX = earth.x + Math.cos(rad) * (earth.radius + 2.5);
    const startY = earth.y + Math.sin(rad) * (earth.radius + 2.5);

    const probe: RocketState = {
      id: -1,
      x: startX,
      y: startY,
      vx: earth.vx + Math.cos(rad) * params.speed,
      vy: earth.vy + Math.sin(rad) * params.speed,
      color: "#9ad0ff",
      status: "flying",
    };

    return runtime.predictRocketOrbit(
      this.bodies,
      probe,
      Math.floor(params.steps),
      this.gravityScaleMap
    );
  }

  reset(): void {
    const runtime = window.NBodySim as {
      createSolarPreset: () => BodyState[];
    };

    this.bodies = runtime.createSolarPreset();
    this.rockets = [];
    this.missionEvents = [];
    this.focusedBodyId = null;
    this.gravityScaleMap = new Map();
    this.nextRocketId = 1;

    for (const body of this.bodies) {
      this.gravityScaleMap.set(body.id, 1);
    }
  }

  private evaluateMissionEvents(): void {
    const runtime = window.NBodySim as {
      BODY_IDS: typeof BODY_IDS;
    };

    const moon = this.bodies.find((body) => body.id === runtime.BODY_IDS.MOON) ?? null;
    const sun = this.bodies.find((body) => body.id === runtime.BODY_IDS.SUN) ?? null;

    for (const rocket of this.rockets) {
      if (rocket.status !== "flying") {
        continue;
      }

      if (moon) {
        const moonDist = Math.hypot(rocket.x - moon.x, rocket.y - moon.y);
        if (moonDist <= moon.radius + 2.2) {
          rocket.status = "reached_moon";
          this.missionEvents.push({ type: "reached_moon", rocketId: rocket.id });
          continue;
        }
      }

      if (sun) {
        const sunDist = Math.hypot(rocket.x - sun.x, rocket.y - sun.y);
        if (sunDist <= sun.radius + 1.2) {
          rocket.status = "fell_into_sun";
          this.missionEvents.push({ type: "fell_into_sun", rocketId: rocket.id });
          continue;
        }
      }

      if (Math.abs(rocket.x) > this.worldBounds || Math.abs(rocket.y) > this.worldBounds) {
        rocket.status = "out_of_bounds";
        this.missionEvents.push({ type: "out_of_bounds", rocketId: rocket.id });
      }
    }
  }
}

(window.NBodySim as { createSimulationEngine?: () => SimulationEngine }).createSimulationEngine =
  () => new SimulationEngineImpl();
