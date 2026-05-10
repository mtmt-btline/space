function createRenderer(canvas: HTMLCanvasElement): RendererHandle {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is not available.');
  }
  const context: CanvasRenderingContext2D = ctx;

  const starField = buildStarField(180);

  function resizeToDisplaySize(): void {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function render(
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
  ): void {
    const runtime = window.NBodySim as {
      worldToScreen: (
        world: OrbitPoint,
        cameraState: CameraState,
        cnv: HTMLCanvasElement,
      ) => OrbitPoint;
      ORBIT_GUIDE_RADII: number[];
      BODY_IDS: typeof BODY_IDS;
    };

    const width = canvas.width;
    const height = canvas.height;

    drawBackground(context, width, height);
    drawStars(context, width, height, starField, camera);

    if (options.showOrbitGuides) {
      drawOrbitGuides(
        context,
        snapshot,
        camera,
        canvas,
        runtime.ORBIT_GUIDE_RADII,
        runtime.worldToScreen,
      );
    }

    drawTrails(
      context,
      options.trails,
      snapshot.rockets,
      camera,
      canvas,
      runtime.worldToScreen,
    );
    drawPredictedOrbit(
      context,
      options.predictedOrbit,
      camera,
      canvas,
      runtime.worldToScreen,
    );
    drawBodies(
      context,
      snapshot.bodies,
      camera,
      canvas,
      runtime.worldToScreen,
      runtime.BODY_IDS.EARTH,
    );
    drawRockets(
      context,
      snapshot.rockets,
      camera,
      canvas,
      runtime.worldToScreen,
      options.selectedRocketId,
    );

    if (options.launchPreview && options.launchPreview.active) {
      drawLaunchPreview(
        context,
        options.launchPreview,
        camera,
        canvas,
        runtime.worldToScreen,
      );
    }

    if (options.showUfo) {
      drawUfo(context, options.nowMs, camera, canvas, runtime.worldToScreen);
    }
  }

  return { resizeToDisplaySize, render };
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createRadialGradient(
    width * 0.5,
    height * 0.45,
    40,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.9,
  );
  gradient.addColorStop(0, '#121b37');
  gradient.addColorStop(1, '#070c1a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function buildStarField(
  count: number,
): Array<{ x: number; y: number; radius: number; alpha: number }> {
  const stars: Array<{ x: number; y: number; radius: number; alpha: number }> =
    [];
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: Math.random(),
      y: Math.random(),
      radius: 0.4 + Math.random() * 1.6,
      alpha: 0.22 + Math.random() * 0.55,
    });
  }
  return stars;
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  stars: Array<{ x: number; y: number; radius: number; alpha: number }>,
  camera: CameraState,
): void {
  const parallaxX = camera.x * 0.03;
  const parallaxY = camera.y * 0.03;

  ctx.save();
  for (const star of stars) {
    let sx = star.x * width - parallaxX;
    let sy = star.y * height - parallaxY;

    sx = ((sx % width) + width) % width;
    sy = ((sy % height) + height) % height;

    ctx.beginPath();
    ctx.fillStyle = `rgba(255,255,255,${star.alpha.toFixed(3)})`;
    ctx.arc(sx, sy, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawOrbitGuides(
  ctx: CanvasRenderingContext2D,
  snapshot: SimulationSnapshot,
  camera: CameraState,
  canvas: HTMLCanvasElement,
  radii: number[],
  worldToScreen: (
    world: OrbitPoint,
    cameraState: CameraState,
    cnv: HTMLCanvasElement,
  ) => OrbitPoint,
): void {
  const sun = snapshot.bodies.find(body => body.kind === 'sun') ?? null;
  if (!sun) {
    return;
  }

  const sunScreen = worldToScreen({ x: sun.x, y: sun.y }, camera, canvas);

  ctx.save();
  ctx.strokeStyle = 'rgba(200,220,255,0.18)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 7]);

  for (const radius of radii) {
    ctx.beginPath();
    ctx.arc(sunScreen.x, sunScreen.y, radius * camera.zoom, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawTrails(
  ctx: CanvasRenderingContext2D,
  trails: Map<RocketId, OrbitPoint[]>,
  rockets: RocketState[],
  camera: CameraState,
  canvas: HTMLCanvasElement,
  worldToScreen: (
    world: OrbitPoint,
    cameraState: CameraState,
    cnv: HTMLCanvasElement,
  ) => OrbitPoint,
): void {
  const rocketColor = new Map<RocketId, string>();
  for (const rocket of rockets) {
    rocketColor.set(rocket.id, rocket.color);
  }

  for (const [id, trail] of trails.entries()) {
    if (trail.length < 2) {
      continue;
    }

    const color = rocketColor.get(id) ?? '#98b7ff';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.52;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();

    for (let i = 0; i < trail.length; i += 1) {
      const p = worldToScreen(trail[i], camera, canvas);
      if (i === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }

    ctx.stroke();
    ctx.restore();
  }
}

function drawPredictedOrbit(
  ctx: CanvasRenderingContext2D,
  points: OrbitPoint[],
  camera: CameraState,
  canvas: HTMLCanvasElement,
  worldToScreen: (
    world: OrbitPoint,
    cameraState: CameraState,
    cnv: HTMLCanvasElement,
  ) => OrbitPoint,
): void {
  if (points.length < 2) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(146, 206, 255, 0.78)';
  ctx.lineWidth = 1.3;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();

  for (let i = 0; i < points.length; i += 1) {
    const p = worldToScreen(points[i], camera, canvas);
    if (i === 0) {
      ctx.moveTo(p.x, p.y);
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }

  ctx.stroke();
  ctx.restore();
}

function drawBodies(
  ctx: CanvasRenderingContext2D,
  bodies: BodyState[],
  camera: CameraState,
  canvas: HTMLCanvasElement,
  worldToScreen: (
    world: OrbitPoint,
    cameraState: CameraState,
    cnv: HTMLCanvasElement,
  ) => OrbitPoint,
  earthBodyId: BodyId,
): void {
  // 月の描画位置補正用に地球を先に取得しておく。
  // 物理位置では月が地球の描画半径(4.8)の内側に入って見えなくなるため、
  // 月だけ地球から離れた位置に描画する（物理計算には影響しない）。
  const earthForMoon = bodies.find(b => b.id === earthBodyId) ?? null;

  ctx.save();
  ctx.font = '12px system-ui';
  ctx.textBaseline = 'middle';

  for (const body of bodies) {
    // 月だけは地球からの相対位置を引き伸ばして描画する。
    // 地球から月への単位ベクトル方向に MOON_DISPLAY_DISTANCE だけ離して見せる。
    let displayX = body.x;
    let displayY = body.y;
    if (body.kind === 'moon' && earthForMoon) {
      const dx = body.x - earthForMoon.x;
      const dy = body.y - earthForMoon.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1e-6) {
        const MOON_DISPLAY_DISTANCE = 8.0; // 地球描画半径(4.8)の外側
        const scale = MOON_DISPLAY_DISTANCE / dist;
        displayX = earthForMoon.x + dx * scale;
        displayY = earthForMoon.y + dy * scale;
      }
    }

    const center = worldToScreen({ x: displayX, y: displayY }, camera, canvas);
    const radius = Math.max(1.3, body.renderRadius * camera.zoom);

    if (body.glow) {
      const glow = ctx.createRadialGradient(
        center.x,
        center.y,
        radius * 0.6,
        center.x,
        center.y,
        radius * 3.6,
      );
      glow.addColorStop(0, 'rgba(245,197,49,0.45)');
      glow.addColorStop(1, 'rgba(245,197,49,0.0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius * 3.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = body.color;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (radius > 2.8 || body.glow) {
      ctx.fillStyle = 'rgba(244,246,251,0.9)';
      ctx.fillText(body.name, center.x + radius + 7, center.y);
    }
  }

  ctx.restore();
}

function drawRockets(
  ctx: CanvasRenderingContext2D,
  rockets: RocketState[],
  camera: CameraState,
  canvas: HTMLCanvasElement,
  worldToScreen: (
    world: OrbitPoint,
    cameraState: CameraState,
    cnv: HTMLCanvasElement,
  ) => OrbitPoint,
  selectedRocketId: RocketId | null,
): void {
  for (const rocket of rockets) {
    const p = worldToScreen({ x: rocket.x, y: rocket.y }, camera, canvas);
    const angle = Math.atan2(rocket.vy, rocket.vx);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.fillStyle = rocket.color;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, 4);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-5, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (selectedRocketId === rocket.id) {
      ctx.save();
      ctx.strokeStyle = 'rgba(145, 198, 255, 0.95)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawLaunchPreview(
  ctx: CanvasRenderingContext2D,
  preview: LaunchDragPreview,
  camera: CameraState,
  canvas: HTMLCanvasElement,
  worldToScreen: (
    world: OrbitPoint,
    cameraState: CameraState,
    cnv: HTMLCanvasElement,
  ) => OrbitPoint,
): void {
  const start = worldToScreen(preview.start, camera, canvas);
  const current = worldToScreen(preview.current, camera, canvas);

  ctx.save();
  ctx.strokeStyle = 'rgba(170, 210, 255, 0.9)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(current.x, current.y);
  ctx.stroke();

  ctx.fillStyle = 'rgba(170, 210, 255, 0.92)';
  ctx.font = '12px system-ui';
  ctx.fillText(
    `speed ${preview.speed.toFixed(2)}`,
    current.x + 9,
    current.y - 7,
  );
  ctx.restore();
}

function drawUfo(
  ctx: CanvasRenderingContext2D,
  nowMs: number,
  camera: CameraState,
  canvas: HTMLCanvasElement,
  worldToScreen: (
    world: OrbitPoint,
    cameraState: CameraState,
    cnv: HTMLCanvasElement,
  ) => OrbitPoint,
): void {
  const t = nowMs * 0.00023;
  const ufoWorld: OrbitPoint = {
    x: Math.cos(t) * 250 + 80,
    y: Math.sin(t * 1.2) * 120 - 140,
  };
  const p = worldToScreen(ufoWorld, camera, canvas);

  ctx.save();
  ctx.translate(p.x, p.y);

  ctx.fillStyle = 'rgba(170, 235, 244, 0.7)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(210, 250, 255, 0.95)';
  ctx.beginPath();
  ctx.ellipse(0, -4.5, 6.5, 3.4, 0, Math.PI, 0);
  ctx.fill();

  ctx.restore();
}

(
  window.NBodySim as {
    createRenderer?: (canvas: HTMLCanvasElement) => RendererHandle;
  }
).createRenderer = createRenderer;
