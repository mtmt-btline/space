/**
 * useWasmGateway
 * WASM インスタンスとの連携を抽象化する Hook
 * 将来的には実際の WASM バイナリに切り替え可能
 */

import { useCallback, useEffect } from "react";
import { getWasmInstance } from "../mock/wasmInterface";
import { useUiStore } from "../store/uiStore";
import { useToast } from "../store/uiStore";

export function useWasmGateway() {
  const { dispatch } = useUiStore();
  const { showToast } = useToast();

  const wasmInstance = getWasmInstance();

  const launchRocket = useCallback(
    (angle: number, speed: number) => {
      try {
        wasmInstance.launch_rocket(angle, speed);
        dispatch({
          type: "SET_MISSION_STATE",
          payload: { status: "running", success: false },
        });
        showToast(`Rocket launched at ${angle}° with ${speed} m/s`, "info");
      } catch (error) {
        showToast(`Launch failed: ${error}`, "error");
      }
    },
    [wasmInstance, dispatch, showToast],
  );

  const reset = useCallback(() => {
    try {
      wasmInstance.reset();
      dispatch({
        type: "SET_MISSION_STATE",
        payload: { status: "idle", success: false },
      });
      showToast("Simulation reset", "info");
    } catch (error) {
      showToast(`Reset failed: ${error}`, "error");
    }
  }, [wasmInstance, dispatch, showToast]);

  const setTimeScale = useCallback(
    (timeScale: 0 | 1 | 2 | 4) => {
      wasmInstance.set_time_scale(timeScale);
      dispatch({ type: "SET_TIME_SCALE", payload: timeScale });
    },
    [wasmInstance, dispatch],
  );

  // ミッション状態の監視（定期的に確認）
  useEffect(() => {
    const interval = setInterval(() => {
      const missionState = wasmInstance.get_mission_state();
      if (missionState.status === "finished") {
        dispatch({
          type: "SET_MISSION_STATE",
          payload: { status: "finished", success: missionState.success },
        });
        if (missionState.success) {
          showToast("Mission accomplished! 🎉", "success");
        } else {
          showToast("Mission failed", "error");
        }
      }
    }, 100); // 100ms ごとに確認

    return () => clearInterval(interval);
  }, [wasmInstance, dispatch, showToast]);

  return {
    launchRocket,
    reset,
    setTimeScale,
    wasmInstance,
  };
}
