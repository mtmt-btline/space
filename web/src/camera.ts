function createCameraState(): CameraState {
  return {
    x: 0,
    y: 0,
    zoom: 1.1,
    minZoom: 0.35,
    maxZoom: 4.5,
  };
}

function worldToScreen(
  world: OrbitPoint,
  camera: CameraState,
  canvas: HTMLCanvasElement
): OrbitPoint {
  const sx = (world.x - camera.x) * camera.zoom + canvas.width / 2;
  const sy = (world.y - camera.y) * camera.zoom + canvas.height / 2;
  return { x: sx, y: sy };
}

function screenToWorld(
  screen: OrbitPoint,
  camera: CameraState,
  canvas: HTMLCanvasElement
): OrbitPoint {
  const wx = (screen.x - canvas.width / 2) / camera.zoom + camera.x;
  const wy = (screen.y - canvas.height / 2) / camera.zoom + camera.y;
  return { x: wx, y: wy };
}

function panCameraPixels(camera: CameraState, dx: number, dy: number): void {
  camera.x -= dx / camera.zoom;
  camera.y -= dy / camera.zoom;
}

function zoomCameraAt(
  camera: CameraState,
  multiplier: number,
  screenPoint: OrbitPoint,
  canvas: HTMLCanvasElement
): void {
  const before = screenToWorld(screenPoint, camera, canvas);
  camera.zoom = Math.max(camera.minZoom, Math.min(camera.maxZoom, camera.zoom * multiplier));
  const after = screenToWorld(screenPoint, camera, canvas);

  camera.x += before.x - after.x;
  camera.y += before.y - after.y;
}

function updateCameraFocus(camera: CameraState, engine: SimulationEngine): void {
  const focused = engine.getFocusedBodyPosition();
  if (!focused) {
    return;
  }

  const lerp = 0.2;
  camera.x += (focused.x - camera.x) * lerp;
  camera.y += (focused.y - camera.y) * lerp;
}

const runtimeCamera = window.NBodySim;
runtimeCamera.createCameraState = createCameraState;
runtimeCamera.worldToScreen = worldToScreen;
runtimeCamera.screenToWorld = screenToWorld;
runtimeCamera.panCameraPixels = panCameraPixels;
runtimeCamera.zoomCameraAt = zoomCameraAt;
runtimeCamera.updateCameraFocus = updateCameraFocus;
