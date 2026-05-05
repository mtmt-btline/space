import './style.css';
import './types';
import './physics';
import './engine';
import './renderer';
import './input';
import './camera';
import init from '../pkg/engine.js';

await init();

const runtimeMain = window.NBodySim as {
  PHYSICS: typeof PHYSICS;
  BODY_IDS: typeof BODY_IDS;
  createSimulationEngine: () => SimulationEngine;
  createCameraState: () => CameraState;
  createRenderer: (canvas: HTMLCanvasElement) => RendererHandle;
  bindInput: (options: {
    canvas: HTMLCanvasElement;
    camera: CameraState;
    engine: SimulationEngine;
    onDragLaunch: (params: LaunchRocketParams) => void;
    onFocusBody: (bodyId: BodyId) => void;
    onClearFocus: () => void;
  }) => InputBinding;
  updateCameraFocus: (camera: CameraState, engine: SimulationEngine) => void;
};

const canvas = document.getElementById(
  'sim-canvas',
) as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('Canvas element not found.');
}

const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement;
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
const timeScaleSlider = document.getElementById(
  'time-scale',
) as HTMLInputElement;
const timeScaleValue = document.getElementById(
  'time-scale-value',
) as HTMLSpanElement;

const angleSlider = document.getElementById('launch-angle') as HTMLInputElement;
const angleValue = document.getElementById(
  'launch-angle-value',
) as HTMLSpanElement;
const speedSlider = document.getElementById('launch-speed') as HTMLInputElement;
const speedValue = document.getElementById(
  'launch-speed-value',
) as HTMLSpanElement;
const launchBtn = document.getElementById('launch-btn') as HTMLButtonElement;

const showOrbitToggle = document.getElementById(
  'toggle-orbits',
) as HTMLInputElement;
const showPredictionToggle = document.getElementById(
  'toggle-prediction',
) as HTMLInputElement;
const showUfoToggle = document.getElementById('toggle-ufo') as HTMLInputElement;

const gravitySun = document.getElementById('gravity-sun') as HTMLInputElement;
const gravityEarth = document.getElementById(
  'gravity-earth',
) as HTMLInputElement;
const gravityMoon = document.getElementById('gravity-moon') as HTMLInputElement;
const gravitySunValue = document.getElementById(
  'gravity-sun-value',
) as HTMLSpanElement;
const gravityEarthValue = document.getElementById(
  'gravity-earth-value',
) as HTMLSpanElement;
const gravityMoonValue = document.getElementById(
  'gravity-moon-value',
) as HTMLSpanElement;

const telemetryPanel = document.getElementById(
  'telemetry-panel',
) as HTMLDivElement;
const telemetrySpeed = document.getElementById(
  'telemetry-speed',
) as HTMLSpanElement;
const telemetryAltitude = document.getElementById(
  'telemetry-altitude',
) as HTMLSpanElement;
const telemetryGravity = document.getElementById(
  'telemetry-gravity',
) as HTMLSpanElement;
const telemetryNearest = document.getElementById(
  'telemetry-nearest',
) as HTMLSpanElement;
const telemetryRocketLabel = document.getElementById(
  'telemetry-rocket-id',
) as HTMLSpanElement;

const rocketList = document.getElementById('rocket-list') as HTMLDivElement;
const focusLabel = document.getElementById('focus-label') as HTMLSpanElement;
const missionToast = document.getElementById('mission-toast') as HTMLDivElement;

const engine = runtimeMain.createSimulationEngine();
const camera = runtimeMain.createCameraState();
const renderer = runtimeMain.createRenderer(canvas);

let paused = false;
let timeScale = 1;
let launchAngle = 28;
let launchSpeed = 6;
let showOrbitGuides = true;
let showPrediction = true;
let showUfo = true;
let selectedRocketId: RocketId | null = null;
let focusedBodyId: BodyId | null = null;
let lastTimestamp = performance.now();
let missionToastTimer = 0;
// 前回描画時のロケットID列。リスト再構築の要否判定に使う。
let renderedRocketIds: number[] = [];

// JS 側で管理。WASM に移行しない。
const trails = new Map<RocketId, OrbitPoint[]>();

// rocketList 全体にイベント委譲を設定する。
// ※ updateRocketList が毎フレーム innerHTML を書き換えると pointerdown〜click の間に
//   要素が差し替えられてクリックが空振りするため、親要素へ委譲することで安定させている。
rocketList.addEventListener('click', (e: MouseEvent) => {
  const target = e.target as HTMLElement;

  // 削除ボタン（×）のクリック: エンジンとトレイルから即座に除去する
  const delBtn = target.closest<HTMLElement>('.rocket-delete[data-rocket-id]');
  if (delBtn) {
    e.stopPropagation();
    const rocketId = Number(delBtn.dataset.rocketId);
    engine.deleteRocket(rocketId);
    trails.delete(rocketId); // トレイルも同時に削除（ポーズ中でも軌跡が残らないようにする）
    if (selectedRocketId === rocketId) {
      selectedRocketId = null;
    }
    return;
  }

  // ロケットチップ（#xx）のクリック: テレメトリ表示対象を切り替える
  const chip = target.closest<HTMLElement>('.rocket-chip[data-rocket-id]');
  if (chip) {
    selectedRocketId = Number(chip.dataset.rocketId);
  }
});

function updateTrails(rockets: RocketState[]): void {
  for (const rocket of rockets) {
    if (!trails.has(rocket.id)) trails.set(rocket.id, []);
    const trail = trails.get(rocket.id);
    if (!trail) continue;
    trail.push({ x: rocket.x, y: rocket.y });
    if (trail.length > runtimeMain.PHYSICS.TRAIL_MAX_LENGTH) trail.shift();
  }
  for (const id of trails.keys()) {
    if (!rockets.find(r => r.id === id)) trails.delete(id);
  }
}

function formatMultiplier(value: number): string {
  return `${value.toFixed(1)}x`;
}

function formatSpeed(value: number): string {
  return `${value.toFixed(2)}`;
}

function setFocusedBody(bodyId: BodyId | null): void {
  focusedBodyId = bodyId;
  engine.focusBody(bodyId);

  if (bodyId === null) {
    focusLabel.textContent = '追従なし';
    return;
  }

  const body = engine.getSnapshot().bodies.find(item => item.id === bodyId);
  focusLabel.textContent = body ? `${body.name} 追従中` : '追従なし';
}

function showMissionMessage(event: MissionEvent): void {
  const textByType: Record<MissionEventType, string> = {
    reached_moon: `ロケット #${event.rocketId} が月に到達`,
    fell_into_sun: `ロケット #${event.rocketId} が太陽へ落下`,
    out_of_bounds: `ロケット #${event.rocketId} が画面外へ離脱`,
  };

  const toneByType: Record<MissionEventType, string> = {
    reached_moon: 'success',
    fell_into_sun: 'danger',
    out_of_bounds: 'danger',
  };

  missionToast.textContent = textByType[event.type];
  missionToast.classList.remove('success', 'danger');
  missionToast.classList.add('show', toneByType[event.type]);

  if (missionToastTimer !== 0) {
    window.clearTimeout(missionToastTimer);
  }
  missionToastTimer = window.setTimeout(() => {
    missionToast.classList.remove('show');
  }, 2200);
}

function launchFromPanel(): void {
  const snapshot = engine.getSnapshot();
  const earth =
    snapshot.bodies.find(body => body.id === runtimeMain.BODY_IDS.EARTH) ??
    null;
  if (!earth) {
    return;
  }

  const rad = (launchAngle * Math.PI) / 180;
  const x = earth.x + Math.cos(rad) * (earth.radius + 2.5);
  const y = earth.y + Math.sin(rad) * (earth.radius + 2.5);

  const rocketId = engine.launchRocket({
    x,
    y,
    angleDeg: launchAngle,
    speed: launchSpeed,
  });

  selectedRocketId = rocketId;
}

function syncGravityUI(): void {
  gravitySunValue.textContent = Number(gravitySun.value).toFixed(2);
  gravityEarthValue.textContent = Number(gravityEarth.value).toFixed(2);
  gravityMoonValue.textContent = Number(gravityMoon.value).toFixed(2);
}

function applyGravityFromUI(): void {
  engine.setGravityScale(runtimeMain.BODY_IDS.SUN, Number(gravitySun.value));
  engine.setGravityScale(
    runtimeMain.BODY_IDS.EARTH,
    Number(gravityEarth.value),
  );
  engine.setGravityScale(runtimeMain.BODY_IDS.MOON, Number(gravityMoon.value));
  syncGravityUI();
}

function updateRocketList(snapshot: SimulationSnapshot): void {
  const currentIds = snapshot.rockets.map(r => r.id);

  // ロケットの増減があったときのみ DOM を再構築する。
  // 毎フレーム innerHTML をクリアすると pointerdown 後の RAF で要素が消え、
  // クリックイベントが親まで伝播しなくなるため、差分がある場合のみ更新する。
  const needsRebuild =
    currentIds.length !== renderedRocketIds.length ||
    currentIds.some((id, i) => id !== renderedRocketIds[i]);

  if (needsRebuild) {
    rocketList.innerHTML = '';
    renderedRocketIds = currentIds;

    if (snapshot.rockets.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'muted';
      empty.textContent = 'ロケットなし';
      rocketList.appendChild(empty);
    } else {
      for (const rocket of snapshot.rockets) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'rocket-chip';
        chip.dataset.rocketId = String(rocket.id);
        chip.textContent = `#${rocket.id}`;

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'rocket-delete';
        del.dataset.rocketId = String(rocket.id);
        del.textContent = '×';
        del.title = `ロケット #${rocket.id} を削除`;

        const wrap = document.createElement('div');
        wrap.className = 'rocket-entry';
        wrap.appendChild(chip);
        wrap.appendChild(del);
        rocketList.appendChild(wrap);
      }
    }
  }

  // active クラスは選択状態が変わるたびに反映が必要なため、毎フレーム更新する
  for (const chip of rocketList.querySelectorAll<HTMLElement>(
    '.rocket-chip[data-rocket-id]',
  )) {
    chip.classList.toggle(
      'active',
      Number(chip.dataset.rocketId) === selectedRocketId,
    );
  }
}

function updateTelemetry(snapshot: SimulationSnapshot): void {
  if (selectedRocketId === null) {
    telemetryPanel.classList.add('hidden');
    return;
  }

  const exists = snapshot.rockets.some(
    rocket => rocket.id === selectedRocketId,
  );
  if (!exists) {
    selectedRocketId = null;
    telemetryPanel.classList.add('hidden');
    return;
  }

  const telemetry = engine.getTelemetry(selectedRocketId);
  if (!telemetry) {
    telemetryPanel.classList.add('hidden');
    return;
  }

  telemetryPanel.classList.remove('hidden');
  telemetryRocketLabel.textContent = `#${selectedRocketId}`;
  telemetrySpeed.textContent = `${telemetry.speed.toFixed(3)}`;
  telemetryAltitude.textContent = `${telemetry.altitudeFromEarth.toFixed(2)}`;
  telemetryGravity.textContent = `${telemetry.gravityAccel.toFixed(4)}`;
  telemetryNearest.textContent = `${telemetry.nearestBody.name} (${telemetry.nearestBody.distance.toFixed(2)})`;
}

function computePredictedOrbit(
  launchPreview: LaunchDragPreview | null,
): OrbitPoint[] {
  if (!showPrediction) {
    return [];
  }

  if (launchPreview && launchPreview.active && launchPreview.speed > 0.05) {
    return engine.predictLaunchOrbit({
      angleDeg: launchPreview.angleDeg,
      speed: launchPreview.speed,
      steps: 260,
    });
  }

  return engine.predictLaunchOrbit({
    angleDeg: launchAngle,
    speed: launchSpeed,
    steps: 260,
  });
}

const inputBinding = runtimeMain.bindInput({
  canvas,
  camera,
  engine,
  onDragLaunch: (params: LaunchRocketParams) => {
    const rocketId = engine.launchRocket(params);
    selectedRocketId = rocketId;
  },
  onFocusBody: (bodyId: BodyId) => {
    setFocusedBody(bodyId);
  },
  onClearFocus: () => {
    setFocusedBody(null);
  },
});

pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? '再生' : '一時停止';
});

resetBtn.addEventListener('click', () => {
  engine.reset();
  trails.clear();
  selectedRocketId = null;
  setFocusedBody(null);
  gravitySun.value = '1';
  gravityEarth.value = '1';
  gravityMoon.value = '1';
  applyGravityFromUI();
});

timeScaleSlider.addEventListener('input', () => {
  timeScale = Number(timeScaleSlider.value);
  timeScaleValue.textContent = formatMultiplier(timeScale);
});

angleSlider.addEventListener('input', () => {
  launchAngle = Number(angleSlider.value);
  angleValue.textContent = `${launchAngle.toFixed(0)}°`;
});

speedSlider.addEventListener('input', () => {
  launchSpeed = Number(speedSlider.value);
  speedValue.textContent = formatSpeed(launchSpeed);
});

launchBtn.addEventListener('click', launchFromPanel);

showOrbitToggle.addEventListener('change', () => {
  showOrbitGuides = showOrbitToggle.checked;
});

showPredictionToggle.addEventListener('change', () => {
  showPrediction = showPredictionToggle.checked;
});

showUfoToggle.addEventListener('change', () => {
  showUfo = showUfoToggle.checked;
});

gravitySun.addEventListener('input', applyGravityFromUI);
gravityEarth.addEventListener('input', applyGravityFromUI);
gravityMoon.addEventListener('input', applyGravityFromUI);

window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    setFocusedBody(null);
  }
});

function render(snapshot: SimulationSnapshot, cameraState: CameraState): void {
  renderer.resizeToDisplaySize();

  const launchPreview = inputBinding.getLaunchPreview();
  const predictedOrbit = computePredictedOrbit(launchPreview);

  renderer.render(snapshot, cameraState, {
    trails,
    selectedRocketId,
    showOrbitGuides,
    predictedOrbit,
    launchPreview,
    showUfo,
    nowMs: performance.now(),
  });

  updateRocketList(snapshot);
  updateTelemetry(snapshot);

  if (focusedBodyId === null) {
    focusLabel.textContent = '追従なし';
  }
}

function gameLoop(timestamp: number): void {
  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05) * timeScale;
  lastTimestamp = timestamp;

  if (!paused) {
    engine.step(dt);
    updateTrails(engine.getSnapshot().rockets); // JS 側でトレイル管理
  }

  const snapshot = engine.getSnapshot();

  if (!paused && snapshot.missionEvents.length > 0) {
    for (const event of snapshot.missionEvents) {
      showMissionMessage(event);
    }
  }

  runtimeMain.updateCameraFocus(camera, engine);
  render(snapshot, camera); // Canvas 描画

  requestAnimationFrame(gameLoop);
}

function initializeUI(): void {
  timeScaleValue.textContent = formatMultiplier(timeScale);
  angleValue.textContent = `${launchAngle.toFixed(0)}°`;
  speedValue.textContent = formatSpeed(launchSpeed);
  showOrbitToggle.checked = showOrbitGuides;
  showPredictionToggle.checked = showPrediction;
  showUfoToggle.checked = showUfo;

  gravitySun.value = '1';
  gravityEarth.value = '1';
  gravityMoon.value = '1';
  applyGravityFromUI();
  setFocusedBody(null);
}

initializeUI();
requestAnimationFrame(gameLoop);

window.addEventListener('beforeunload', () => {
  inputBinding.destroy();
});
