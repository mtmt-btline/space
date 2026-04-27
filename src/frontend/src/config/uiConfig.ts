/**
 * UI 設定
 * 開発環境、ブレークポイント、タイミング、初期状態を集約
 */

export interface UiConfig {
  // レスポンシブ ブレークポイント (px)
  breakpoints: {
    mobile: number;
    tablet: number;
    desktop: number;
  };

  // タイミング設定
  timing: {
    resultAutoReturnSeconds: number; // ミッション完了後、自動リセットまでの秒数
    toastMessageDurationMs: number; // トーストメッセージ表示時間
  };

  // UI 初期状態
  defaults: {
    showOrbitGuide: boolean;
    showBodyTrail: boolean;
    canvasGridSize: number; // グリッドサイズ (px)
  };

  // Canvas 設定
  canvas: {
    backgroundColor: string;
    gridColor: string;
    gridAlpha: number; // グリッド透明度 (0-1)
  };

  // ロケット制御の初期値
  rocket: {
    defaultAngle: number; // 度数法 (0-90)
    defaultSpeed: number; // m/s
    angleStep: number; // スライダーステップ
    speedStep: number; // スライダーステップ
  };

  timeScaleOptions: Array<0 | 1 | 2 | 4>;
}

/**
 * デフォルト UI 設定
 */
export const uiConfig: UiConfig = {
  breakpoints: {
    mobile: 640,
    tablet: 1024,
    desktop: 1280,
  },

  timing: {
    resultAutoReturnSeconds: 3,
    toastMessageDurationMs: 3000,
  },

  defaults: {
    showOrbitGuide: true,
    showBodyTrail: false,
    canvasGridSize: 50,
  },

  canvas: {
    backgroundColor: "#0a0a1a",
    gridColor: "#1a1a4a",
    gridAlpha: 0.3,
  },

  rocket: {
    defaultAngle: 45,
    defaultSpeed: 50,
    angleStep: 1,
    speedStep: 1,
  },

  timeScaleOptions: [0, 1, 2, 4],
};

/**
 * UI 設定を取得
 * 将来的には外部設定ソースから読み込む拡張が可能
 */
export function getUiConfig(): UiConfig {
  return uiConfig;
}

/**
 * 画面幅に基づいてブレークポイントを判定
 */
export function getBreakpoint(width: number): "mobile" | "tablet" | "desktop" {
  const { mobile, tablet } = uiConfig.breakpoints;
  if (width < mobile) return "mobile";
  if (width < tablet) return "tablet";
  return "desktop";
}
