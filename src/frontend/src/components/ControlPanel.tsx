/**
 * ControlPanel
 * ロケット発射パラメータの入力パネル
 * - 発射角度スライダー
 * - 発射速度スライダー
 * - 時間倍率
 * - 発射ボタン
 * - リセットボタン
 */

import {
  useMissionSelection,
  useRocketControl,
  useTimeScale,
  useUiStore,
} from "../store/uiStore";
import { missionDefinitions } from "../config/missionConfig";
import { useWasmGateway } from "../hooks/useWasmGateway";
import { uiConfig } from "../config/uiConfig";

export function ControlPanel() {
  const { angle, speed, setAngle, setSpeed } = useRocketControl();
  const { timeScale } = useTimeScale();
  const { currentMissionId, unlockedMissionIds, setCurrentMission } = useMissionSelection();
  const { state, dispatch } = useUiStore();
  const { launchRocket, reset, setTimeScale } = useWasmGateway();

  const handleLaunch = () => {
    if (state.missionStatus === "idle") {
      launchRocket(angle, speed);
    }
  };

  const handleReset = () => {
    reset();
    dispatch({ type: "RESET_UI" });
  };

  const isLocked = state.missionStatus !== "idle";

  return (
    <div
      style={{
        padding: "16px",
        backgroundColor: "#1a1a2e",
        borderTop: "1px solid #333",
        display: "flex",
        gap: "16px",
        alignItems: "center",
      }}
    >
      {/* ミッション選択 */}
      <div style={{ minWidth: "220px" }}>
        <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>
          Mission
        </label>
        <select
          value={currentMissionId}
          onChange={(event) => setCurrentMission(event.target.value as typeof currentMissionId)}
          disabled={isLocked}
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: "4px",
            border: "1px solid #4f4f68",
            backgroundColor: "#0f0f1e",
            color: "#ffffff",
          }}
        >
          {missionDefinitions
            .filter((mission) => unlockedMissionIds.includes(mission.id))
            .map((mission) => (
              <option key={mission.id} value={mission.id}>
                {mission.id}: {mission.name}
              </option>
            ))}
        </select>
      </div>

      {/* 発射角度スライダー */}
      <div style={{ flex: 1 }}>
        <label
          style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}
        >
          Angle: {angle.toFixed(1)}°
        </label>
        <input
          type="range"
          min="0"
          max="90"
          step={uiConfig.rocket.angleStep}
          value={angle}
          onChange={(e) => setAngle(Number(e.target.value))}
          disabled={isLocked}
          style={{ width: "100%" }}
        />
      </div>

      {/* 発射速度スライダー */}
      <div style={{ flex: 1 }}>
        <label
          style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}
        >
          Speed: {speed.toFixed(1)} m/s
        </label>
        <input
          type="range"
          min="0"
          max="100"
          step={uiConfig.rocket.speedStep}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          disabled={isLocked}
          style={{ width: "100%" }}
        />
      </div>

      {/* 発射ボタン */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {uiConfig.timeScaleOptions.map((scale) => {
          const isActive = timeScale === scale;
          const label = scale === 0 ? "Pause" : `${scale}x`;

          return (
            <button
              key={scale}
              onClick={() => setTimeScale(scale)}
              style={{
                padding: "8px 12px",
                backgroundColor: isActive ? "#4c6fff" : "#2a2a3d",
                color: "#ffffff",
                border: "1px solid #4f4f68",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* 発射ボタン */}
      <button
        onClick={handleLaunch}
        disabled={isLocked}
        style={{
          padding: "8px 16px",
          backgroundColor: isLocked ? "#555" : "#FF6B6B",
          color: "#ffffff",
          border: "none",
          borderRadius: "4px",
          cursor: isLocked ? "not-allowed" : "pointer",
          opacity: isLocked ? 0.5 : 1,
        }}
      >
        Launch
      </button>

      {/* リセットボタン */}
      <button
        onClick={handleReset}
        style={{
          padding: "8px 16px",
          backgroundColor: "#666",
          color: "#ffffff",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        Reset
      </button>
    </div>
  );
}
