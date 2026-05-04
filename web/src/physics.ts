const PHYSICS = {
  G: 0.06,
  SOFTENING_SQ: 0.25,
  RESTITUTION: 0.92,
  FIXED_MASS: 1e9,
  SUBSTEPS: 8,
  MAX_ROCKETS: 5,
  TRAIL_MAX_LENGTH: 200,
};

const BODY_IDS = {
  SUN: 1,
  MERCURY: 2,
  VENUS: 3,
  EARTH: 4,
  MOON: 5,
  MARS: 6,
} as const;

const ORBIT_GUIDE_RADII = [70, 110, 160, 170, 220];

const runtimePhysics = window.NBodySim;
runtimePhysics.PHYSICS = PHYSICS;
runtimePhysics.BODY_IDS = BODY_IDS;
runtimePhysics.ORBIT_GUIDE_RADII = ORBIT_GUIDE_RADII;

function getGravityScale(
  gravityScaleMap: Map<BodyId, number>,
  bodyId: BodyId,
): number {
  return gravityScaleMap.get(bodyId) ?? 1;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function createSolarPreset(): BodyState[] {
  const SUN_MASS = 50000;
  const vCirc = (r: number) => Math.sqrt((PHYSICS.G * SUN_MASS) / r);

  return [
    {
      id: BODY_IDS.SUN,
      name: '太陽',
      mass: SUN_MASS,
      radius: 14,
      renderRadius: 14,
      color: '#f5c531',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      kind: 'sun',
      fixed: true,
      glow: true,
    },
    {
      id: BODY_IDS.MERCURY,
      name: '水星',
      mass: 0.33,
      radius: 3.0,
      renderRadius: 3.0,
      color: '#9aa3ad',
      x: 70,
      y: 0,
      vx: 0,
      vy: vCirc(70),
      kind: 'planet',
      fixed: false,
    },
    {
      id: BODY_IDS.VENUS,
      name: '金星',
      mass: 4.87,
      radius: 4.4,
      renderRadius: 4.4,
      color: '#e8c270',
      x: 110,
      y: 0,
      vx: 0,
      vy: vCirc(110),
      kind: 'planet',
      fixed: false,
    },
    {
      id: BODY_IDS.EARTH,
      name: '地球',
      mass: 5.97,
      radius: 4.8,
      renderRadius: 4.8,
      color: '#5aa9f0',
      x: 160,
      y: 0,
      vx: 0,
      vy: vCirc(160),
      kind: 'planet',
      fixed: false,
    },
    {
      id: BODY_IDS.MOON,
      name: '月',
      mass: 0.07,
      radius: 1.6,
      renderRadius: 1.6,
      color: '#cfd5db',
      x: 170,
      y: 0,
      vx: 0,
      vy: vCirc(170),
      kind: 'moon',
      fixed: false,
    },
    {
      id: BODY_IDS.MARS,
      name: '火星',
      mass: 0.64,
      radius: 3.6,
      renderRadius: 3.6,
      color: '#d96a4a',
      x: 220,
      y: 0,
      vx: 0,
      vy: vCirc(220),
      kind: 'planet',
      fixed: false,
    },
  ];
}

// [WASM_BOUNDARY_START] ここから先は Rust/WASM に置き換わる
function integrateBodies(
  bodies: BodyState[],
  dt: number,
  gravityScaleMap: Map<BodyId, number>,
): void {
  const ax = new Array<number>(bodies.length).fill(0);
  const ay = new Array<number>(bodies.length).fill(0);

  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy + PHYSICS.SOFTENING_SQ;
      const d = Math.sqrt(d2);
      const invD = 1 / d;

      const scaleFromB = getGravityScale(gravityScaleMap, b.id);
      const scaleFromA = getGravityScale(gravityScaleMap, a.id);

      const accelOnA = (PHYSICS.G * b.mass * scaleFromB) / d2;
      const accelOnB = (PHYSICS.G * a.mass * scaleFromA) / d2;

      if (!a.fixed) {
        ax[i] += accelOnA * dx * invD;
        ay[i] += accelOnA * dy * invD;
      }
      if (!b.fixed) {
        ax[j] -= accelOnB * dx * invD;
        ay[j] -= accelOnB * dy * invD;
      }
    }
  }

  for (let i = 0; i < bodies.length; i += 1) {
    const b = bodies[i];
    if (b.fixed) {
      continue;
    }
    b.vx += ax[i] * dt;
    b.vy += ay[i] * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  resolveBodyCollisions(bodies);
}

function resolveBodyCollisions(bodies: BodyState[]): void {
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = a.radius + b.radius;

      if (dist <= 0 || dist >= minDist) {
        continue;
      }

      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;

      const ma = a.fixed ? PHYSICS.FIXED_MASS : a.mass;
      const mb = b.fixed ? PHYSICS.FIXED_MASS : b.mass;
      const wa = a.fixed ? 0 : 1 / ma;
      const wb = b.fixed ? 0 : 1 / mb;
      const wsum = wa + wb;

      if (wsum > 0) {
        if (!a.fixed) {
          a.x -= (nx * overlap * wa) / wsum;
          a.y -= (ny * overlap * wa) / wsum;
        }
        if (!b.fixed) {
          b.x += (nx * overlap * wb) / wsum;
          b.y += (ny * overlap * wb) / wsum;
        }
      }

      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const vn = rvx * nx + rvy * ny;
      if (vn >= 0) {
        continue;
      }

      const impulse = (-(1 + PHYSICS.RESTITUTION) * vn) / (1 / ma + 1 / mb);
      const jx = impulse * nx;
      const jy = impulse * ny;

      if (!a.fixed) {
        a.vx -= jx / ma;
        a.vy -= jy / ma;
      }
      if (!b.fixed) {
        b.vx += jx / mb;
        b.vy += jy / mb;
      }
    }
  }
}

function integrateRockets(
  rockets: RocketState[],
  bodies: BodyState[],
  dt: number,
  gravityScaleMap: Map<BodyId, number>,
): void {
  for (const rocket of rockets) {
    if (rocket.status !== 'flying') {
      continue;
    }

    let ax = 0;
    let ay = 0;

    for (const body of bodies) {
      const dx = body.x - rocket.x;
      const dy = body.y - rocket.y;
      const d2 = dx * dx + dy * dy + PHYSICS.SOFTENING_SQ;
      const d = Math.sqrt(d2);
      const scale = getGravityScale(gravityScaleMap, body.id);
      const accel = (PHYSICS.G * body.mass * scale) / d2;
      ax += (accel * dx) / d;
      ay += (accel * dy) / d;
    }

    rocket.vx += ax * dt;
    rocket.vy += ay * dt;
    rocket.x += rocket.vx * dt;
    rocket.y += rocket.vy * dt;
  }
}

function calculateGravityMagnitudeAtPoint(
  x: number,
  y: number,
  bodies: BodyState[],
  gravityScaleMap: Map<BodyId, number>,
): number {
  let ax = 0;
  let ay = 0;

  for (const body of bodies) {
    const dx = body.x - x;
    const dy = body.y - y;
    const d2 = dx * dx + dy * dy + PHYSICS.SOFTENING_SQ;
    const d = Math.sqrt(d2);
    const scale = getGravityScale(gravityScaleMap, body.id);
    const accel = (PHYSICS.G * body.mass * scale) / d2;
    ax += (accel * dx) / d;
    ay += (accel * dy) / d;
  }

  return Math.hypot(ax, ay);
}

function findNearestBody(
  x: number,
  y: number,
  bodies: BodyState[],
): { body: BodyState; distance: number } | null {
  let nearest: BodyState | null = null;
  let minDistance = Number.POSITIVE_INFINITY;

  for (const body of bodies) {
    const d = Math.hypot(body.x - x, body.y - y);
    if (d < minDistance) {
      minDistance = d;
      nearest = body;
    }
  }

  if (!nearest) {
    return null;
  }

  return { body: nearest, distance: minDistance };
}

function cloneBodies(bodies: BodyState[]): BodyState[] {
  return bodies.map(body => ({ ...body }));
}

function predictRocketOrbit(
  bodies: BodyState[],
  rocket: RocketState,
  steps: number,
  gravityScaleMap: Map<BodyId, number>,
): OrbitPoint[] {
  const localBodies = cloneBodies(bodies);
  const probe: RocketState = { ...rocket };
  const points: OrbitPoint[] = [];
  const dt = 1 / 60;

  for (let i = 0; i < steps; i += 1) {
    for (let s = 0; s < PHYSICS.SUBSTEPS; s += 1) {
      const subDt = dt / PHYSICS.SUBSTEPS;
      integrateBodies(localBodies, subDt, gravityScaleMap);
      integrateRockets([probe], localBodies, subDt, gravityScaleMap);
    }

    points.push({ x: probe.x, y: probe.y });

    const sun = localBodies.find(body => body.kind === 'sun') ?? null;
    if (
      sun &&
      Math.hypot(probe.x - sun.x, probe.y - sun.y) <= sun.radius + 1.2
    ) {
      break;
    }

    if (Math.abs(probe.x) > 2200 || Math.abs(probe.y) > 2200) {
      break;
    }
  }

  return points;
}
// [WASM_BOUNDARY_END]

runtimePhysics.createSolarPreset = createSolarPreset;
runtimePhysics.integrateBodies = integrateBodies;
runtimePhysics.integrateRockets = integrateRockets;
runtimePhysics.calculateGravityMagnitudeAtPoint =
  calculateGravityMagnitudeAtPoint;
runtimePhysics.findNearestBody = findNearestBody;
runtimePhysics.predictRocketOrbit = predictRocketOrbit;
runtimePhysics.degToRad = degToRad;
