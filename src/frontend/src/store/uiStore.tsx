/**
 * UI State Store (React Context)
 * グローバル UI 状態と補助フックを管理
 */

import { createContext, useCallback, useContext } from "react";
import {
  defaultMissionId,
  defaultUnlockedMissionIds,
  type MissionId,
} from "../config/missionConfig";
import type { MissionState } from "../mock/wasmInterface";

/**
 * UI 状態全体
 */
export interface UiState {
  // ミッション段階
  currentMissionId: MissionId;
  unlockedMissionIds: MissionId[];

  // シミュレーション状態
  missionStatus: "idle" | "running" | "finished";
  missionSuccess: boolean;
  timeScale: 0 | 1 | 2 | 4;

  // UI トグル状態
  showOrbitGuide: boolean;
  showBodyTrail: boolean;

  // トースト メッセージ
  toastMessage: string | null;
  toastType: "info" | "warning" | "error" | "success";

  // ロケット制御パラメータ
  rocketAngle: number;
  rocketSpeed: number;

  // ウィンドウサイズ
  windowWidth: number;
  windowHeight: number;
}

/**
 * UI アクション型定義
 */
export type UiAction =
  | {
      type: "SET_MISSION_STATE";
      payload: { status: MissionState["status"]; success: boolean };
    }
  | { type: "TOGGLE_ORBIT_GUIDE" }
  | { type: "TOGGLE_BODY_TRAIL" }
  | {
      type: "SHOW_TOAST";
      payload: { message: string; type: UiState["toastType"] };
    }
  | { type: "HIDE_TOAST" }
  | { type: "SET_ROCKET_ANGLE"; payload: number }
  | { type: "SET_ROCKET_SPEED"; payload: number }
  | { type: "SET_TIME_SCALE"; payload: UiState["timeScale"] }
  | { type: "SET_CURRENT_MISSION"; payload: MissionId }
  | { type: "UNLOCK_MISSION"; payload: MissionId }
  | { type: "SET_WINDOW_SIZE"; payload: { width: number; height: number } }
  | { type: "RESET_UI" };

/**
 * UI State Context
 */
export const UiStoreContext = createContext<{
  state: UiState;
  dispatch: (action: UiAction) => void;
} | null>(null);

/**
 * 初期状態
 */
export const initialState: UiState = {
  currentMissionId: defaultMissionId,
  unlockedMissionIds: defaultUnlockedMissionIds,
  missionStatus: "idle",
  missionSuccess: false,
  timeScale: 1,
  showOrbitGuide: true,
  showBodyTrail: false,
  toastMessage: null,
  toastType: "info",
  rocketAngle: 45,
  rocketSpeed: 50,
  windowWidth: typeof window !== "undefined" ? window.innerWidth : 1280,
  windowHeight: typeof window !== "undefined" ? window.innerHeight : 720,
};

/**
 * UI State Reducer
 */
export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case "SET_MISSION_STATE":
      return {
        ...state,
        missionStatus: action.payload.status,
        missionSuccess: action.payload.success,
      };

    case "TOGGLE_ORBIT_GUIDE":
      return {
        ...state,
        showOrbitGuide: !state.showOrbitGuide,
      };

    case "TOGGLE_BODY_TRAIL":
      return {
        ...state,
        showBodyTrail: !state.showBodyTrail,
      };

    case "SHOW_TOAST":
      return {
        ...state,
        toastMessage: action.payload.message,
        toastType: action.payload.type,
      };

    case "HIDE_TOAST":
      return {
        ...state,
        toastMessage: null,
      };

    case "SET_ROCKET_ANGLE":
      return {
        ...state,
        rocketAngle: Math.max(0, Math.min(90, action.payload)),
      };

    case "SET_ROCKET_SPEED":
      return {
        ...state,
        rocketSpeed: Math.max(0, action.payload),
      };

    case "SET_TIME_SCALE":
      return {
        ...state,
        timeScale: action.payload,
      };

    case "SET_CURRENT_MISSION":
      if (!state.unlockedMissionIds.includes(action.payload)) {
        return state;
      }
      return {
        ...state,
        currentMissionId: action.payload,
      };

    case "UNLOCK_MISSION":
      if (state.unlockedMissionIds.includes(action.payload)) {
        return state;
      }
      return {
        ...state,
        unlockedMissionIds: [...state.unlockedMissionIds, action.payload],
      };

    case "SET_WINDOW_SIZE":
      return {
        ...state,
        windowWidth: action.payload.width,
        windowHeight: action.payload.height,
      };

    case "RESET_UI":
      return {
        ...initialState,
        windowWidth: state.windowWidth,
        windowHeight: state.windowHeight,
      };

    default:
      return state;
  }
}

/**
 * UI Store Hook
 */
export function useUiStore() {
  const context = useContext(UiStoreContext);
  if (!context) {
    throw new Error("useUiStore must be used within UiStoreProvider");
  }
  return context;
}

/**
 * UI State 用の便利フック群
 */
export function useMissionState() {
  const { state, dispatch } = useUiStore();

  const setMissionState = useCallback(
    (status: MissionState["status"], success: boolean) => {
      dispatch({
        type: "SET_MISSION_STATE",
        payload: { status, success },
      });
    },
    [dispatch],
  );

  return {
    status: state.missionStatus,
    success: state.missionSuccess,
    setMissionState,
  };
}

export function useToast() {
  const { state, dispatch } = useUiStore();

  const showToast = useCallback(
    (message: string, type: UiState["toastType"] = "info") => {
      dispatch({
        type: "SHOW_TOAST",
        payload: { message, type },
      });
    },
    [dispatch],
  );

  const hideToast = useCallback(() => {
    dispatch({ type: "HIDE_TOAST" });
  }, [dispatch]);

  return {
    message: state.toastMessage,
    type: state.toastType,
    showToast,
    hideToast,
  };
}

export function useRocketControl() {
  const { state, dispatch } = useUiStore();

  const setAngle = useCallback(
    (angle: number) => {
      dispatch({ type: "SET_ROCKET_ANGLE", payload: angle });
    },
    [dispatch],
  );

  const setSpeed = useCallback(
    (speed: number) => {
      dispatch({ type: "SET_ROCKET_SPEED", payload: speed });
    },
    [dispatch],
  );

  return {
    angle: state.rocketAngle,
    speed: state.rocketSpeed,
    setAngle,
    setSpeed,
  };
}

export function useTimeScale() {
  const { state, dispatch } = useUiStore();

  const setTimeScale = useCallback(
    (timeScale: UiState["timeScale"]) => {
      dispatch({ type: "SET_TIME_SCALE", payload: timeScale });
    },
    [dispatch],
  );

  return {
    timeScale: state.timeScale,
    setTimeScale,
  };
}

export function useMissionSelection() {
  const { state, dispatch } = useUiStore();

  const setCurrentMission = useCallback(
    (missionId: MissionId) => {
      dispatch({ type: "SET_CURRENT_MISSION", payload: missionId });
    },
    [dispatch],
  );

  const unlockMission = useCallback(
    (missionId: MissionId) => {
      dispatch({ type: "UNLOCK_MISSION", payload: missionId });
    },
    [dispatch],
  );

  return {
    currentMissionId: state.currentMissionId,
    unlockedMissionIds: state.unlockedMissionIds,
    setCurrentMission,
    unlockMission,
  };
}
