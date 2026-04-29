function bindInput(options: {
  canvas: HTMLCanvasElement;
  camera: CameraState;
  engine: SimulationEngine;
  onDragLaunch: (params: LaunchRocketParams) => void;
  onFocusBody: (bodyId: BodyId) => void;
  onClearFocus: () => void;
}): InputBinding {
  const runtime = window.NBodySim as {
    BODY_IDS: typeof BODY_IDS;
    worldToScreen: (world: OrbitPoint, cameraState: CameraState, canvasEl: HTMLCanvasElement) => OrbitPoint;
    screenToWorld: (screen: OrbitPoint, cameraState: CameraState, canvasEl: HTMLCanvasElement) => OrbitPoint;
    panCameraPixels: (cameraState: CameraState, dx: number, dy: number) => void;
    zoomCameraAt: (
      cameraState: CameraState,
      multiplier: number,
      screenPoint: OrbitPoint,
      canvasEl: HTMLCanvasElement
    ) => void;
  };

  let activePointerId: number | null = null;
  let mode: "idle" | "pan" | "launch" = "idle";
  let lastScreen = { x: 0, y: 0 };
  let moved = false;
  let clickedBodyId: BodyId | null = null;
  let launchEarthRadius = 0;
  let launchPreview: LaunchDragPreview | null = null;

  function getScreenPoint(event: PointerEvent | WheelEvent): OrbitPoint {
    const rect = options.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function pickBody(screenPoint: OrbitPoint): BodyState | null {
    const snapshot = options.engine.getSnapshot();
    for (let i = snapshot.bodies.length - 1; i >= 0; i -= 1) {
      const body = snapshot.bodies[i];
      const bodyScreen = runtime.worldToScreen({ x: body.x, y: body.y }, options.camera, options.canvas);
      const hitRadius = Math.max(10, body.radius * options.camera.zoom + 7);
      if (Math.hypot(screenPoint.x - bodyScreen.x, screenPoint.y - bodyScreen.y) <= hitRadius) {
        return body;
      }
    }
    return null;
  }

  function updateLaunchPreview(currentScreen: OrbitPoint): void {
    if (!launchPreview) {
      return;
    }

    const currentWorld = runtime.screenToWorld(currentScreen, options.camera, options.canvas);
    const dx = currentWorld.x - launchPreview.start.x;
    const dy = currentWorld.y - launchPreview.start.y;

    launchPreview.current = currentWorld;
    launchPreview.angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    launchPreview.speed = Math.max(0, Math.min(18, Math.hypot(dx, dy) * 0.075));
  }

  function onPointerDown(event: PointerEvent): void {
    if (activePointerId !== null) {
      return;
    }

    activePointerId = event.pointerId;
    options.canvas.setPointerCapture(event.pointerId);

    const screenPoint = getScreenPoint(event);
    const hitBody = pickBody(screenPoint);
    clickedBodyId = hitBody ? hitBody.id : null;
    moved = false;

    lastScreen = screenPoint;

    if (event.button === 2 || event.button === 1) {
      options.onClearFocus();
      mode = "pan";
      return;
    }

    if (hitBody && hitBody.id === runtime.BODY_IDS.EARTH) {
      mode = "launch";
      launchEarthRadius = hitBody.radius;
      launchPreview = {
        active: true,
        start: { x: hitBody.x, y: hitBody.y },
        current: { x: hitBody.x, y: hitBody.y },
        angleDeg: 0,
        speed: 0,
      };
      return;
    }

    mode = "pan";
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) {
      return;
    }

    const screenPoint = getScreenPoint(event);
    const dx = screenPoint.x - lastScreen.x;
    const dy = screenPoint.y - lastScreen.y;

    if (Math.abs(dx) + Math.abs(dy) > 1.5) {
      moved = true;
    }

    if (mode === "pan") {
      if (moved) {
        options.onClearFocus();
      }
      runtime.panCameraPixels(options.camera, dx, dy);
      lastScreen = screenPoint;
      return;
    }

    if (mode === "launch") {
      updateLaunchPreview(screenPoint);
      lastScreen = screenPoint;
    }
  }

  function finishPointer(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) {
      return;
    }

    if (mode === "launch" && launchPreview) {
      if (launchPreview.speed > 0.08) {
        const rad = (launchPreview.angleDeg * Math.PI) / 180;
        const launchX = launchPreview.start.x + Math.cos(rad) * (launchEarthRadius + 2.5);
        const launchY = launchPreview.start.y + Math.sin(rad) * (launchEarthRadius + 2.5);

        options.onDragLaunch({
          x: launchX,
          y: launchY,
          angleDeg: launchPreview.angleDeg,
          speed: launchPreview.speed,
        });
      } else {
        options.onFocusBody(runtime.BODY_IDS.EARTH);
      }
    } else if (!moved && clickedBodyId !== null) {
      options.onFocusBody(clickedBodyId);
    }

    mode = "idle";
    clickedBodyId = null;
    launchPreview = null;

    try {
      options.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer may already be released.
    }

    activePointerId = null;
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    options.onClearFocus();
    const screenPoint = getScreenPoint(event);
    const multiplier = Math.exp(-event.deltaY * 0.0012);
    runtime.zoomCameraAt(options.camera, multiplier, screenPoint, options.canvas);
  }

  function onContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  options.canvas.addEventListener("pointerdown", onPointerDown);
  options.canvas.addEventListener("pointermove", onPointerMove);
  options.canvas.addEventListener("pointerup", finishPointer);
  options.canvas.addEventListener("pointercancel", finishPointer);
  options.canvas.addEventListener("wheel", onWheel, { passive: false });
  options.canvas.addEventListener("contextmenu", onContextMenu);

  return {
    destroy(): void {
      options.canvas.removeEventListener("pointerdown", onPointerDown);
      options.canvas.removeEventListener("pointermove", onPointerMove);
      options.canvas.removeEventListener("pointerup", finishPointer);
      options.canvas.removeEventListener("pointercancel", finishPointer);
      options.canvas.removeEventListener("wheel", onWheel);
      options.canvas.removeEventListener("contextmenu", onContextMenu);
    },
    getLaunchPreview(): LaunchDragPreview | null {
      return launchPreview;
    },
  };
}

(window.NBodySim as { bindInput?: typeof bindInput }).bindInput = bindInput;
