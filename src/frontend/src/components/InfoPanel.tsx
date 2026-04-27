/**
 * InfoPanel
 * テレメトリと状態情報を表示するパネル
 * - ロケットの高度、速度、重力加速度、最近傍天体
 * - 経過時間
 * - ミッション状態
 */

import { useEffect, useState } from "react";
import { getMissionById } from "../config/missionConfig";
import { useUiStore } from "../store/uiStore";
import { getWasmInstance } from "../mock/wasmInterface";

export function InfoPanel() {
  const { state } = useUiStore();
  const selectedMission = getMissionById(state.currentMissionId);
  const [telemetry, setTelemetry] = useState({
    elapsed_time: 0,
    rocket_height: 0,
    rocket_velocity: 0,
    gravity_acceleration: 0,
    nearest_body_name: "Earth",
    nearest_body_distance: 0,
  });

  useEffect(() => {
    if (state.missionStatus === "idle") {
      return;
    }

    const interval = setInterval(() => {
      const wasmInstance = getWasmInstance();
      const telemetry = wasmInstance.get_telemetry();
      setTelemetry(telemetry);
    }, 100); // 100ms ごとに更新

    return () => clearInterval(interval);
  }, [state.missionStatus]);

  const getMissionMessage = () => {
    if (state.missionStatus === "idle") {
      return "Ready to launch";
    }
    if (state.missionStatus === "running") {
      return "Mission in progress...";
    }
    if (state.missionSuccess) {
      return "✓ Mission accomplished!";
    }
    return "✗ Mission failed";
  };

  return (
    <div
      style={{
        padding: "16px",
        backgroundColor: "#1a1a2e",
        borderLeft: "1px solid #333",
        width: "250px",
        height: "100%",
        boxSizing: "border-box",
        flexShrink: 0,
        overflowY: "auto",
        overflowX: "hidden",
        fontSize: "14px",
      }}
    >
      <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Status</h3>

      <div
        style={{
          marginBottom: "16px",
          padding: "8px",
          backgroundColor: "#0f0f1e",
          borderRadius: "4px",
        }}
      >
        <div style={{ color: "#AAA", fontSize: "12px", marginBottom: "4px" }}>
          CURRENT MISSION
        </div>
        <div style={{ marginBottom: "4px" }}>
          {selectedMission.id}: {selectedMission.name}
        </div>
        <div style={{ color: "#AAA", fontSize: "12px" }}>{selectedMission.objective}</div>
      </div>

      {/* ミッション状態 */}
      <div
        style={{
          marginBottom: "16px",
          padding: "8px",
          backgroundColor: "#0f0f1e",
          borderRadius: "4px",
        }}
      >
        <div style={{ color: "#AAA", fontSize: "12px", marginBottom: "4px" }}>
          MISSION STATUS
        </div>
        <div style={{ color: state.missionSuccess ? "#4CAF50" : "#FF9800" }}>
          {getMissionMessage()}
        </div>
      </div>

      {/* テレメトリ */}
      {state.missionStatus !== "idle" && (
        <>
          <div style={{ marginBottom: "12px" }}>
            <div
              style={{ color: "#AAA", fontSize: "12px", marginBottom: "4px" }}
            >
              ELAPSED TIME
            </div>
            <div>{telemetry.elapsed_time.toFixed(2)} sec</div>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <div
              style={{ color: "#AAA", fontSize: "12px", marginBottom: "4px" }}
            >
              ALTITUDE
            </div>
            <div>{telemetry.rocket_height.toFixed(1)} m</div>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <div
              style={{ color: "#AAA", fontSize: "12px", marginBottom: "4px" }}
            >
              VELOCITY
            </div>
            <div>{telemetry.rocket_velocity.toFixed(1)} m/s</div>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <div
              style={{ color: "#AAA", fontSize: "12px", marginBottom: "4px" }}
            >
              GRAVITY
            </div>
            <div>{telemetry.gravity_acceleration.toFixed(2)} m/s²</div>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <div
              style={{ color: "#AAA", fontSize: "12px", marginBottom: "4px" }}
            >
              NEAREST BODY
            </div>
            <div>{telemetry.nearest_body_name}</div>
            <div style={{ fontSize: "12px", marginTop: "4px", color: "#AAA" }}>
              {telemetry.nearest_body_distance.toFixed(1)} units
            </div>
          </div>
        </>
      )}

      {/* UI トグル */}
      <div
        style={{
          marginTop: "24px",
          borderTop: "1px solid #333",
          paddingTop: "16px",
        }}
      >
        <h4 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>Display</h4>
        <label
          style={{ display: "block", marginBottom: "8px", cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={state.showOrbitGuide}
            onChange={() => {}}
            style={{ marginRight: "8px" }}
          />
          Orbit Guide
        </label>
        <label style={{ display: "block", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={state.showBodyTrail}
            onChange={() => {}}
            style={{ marginRight: "8px" }}
          />
          Body Trail
        </label>
      </div>
    </div>
  );
}
