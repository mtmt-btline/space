/**
 * AppLayout
 * メインレイアウト
 * - トップメッセージバー
 * - 中央シミュレーションキャンバス
 * - 右パネル（テレメトリ）
 * - 下パネル（制御）
 */

import { useEffect, useRef, useState } from "react";
import { SimulationCanvas } from "../components/SimulationCanvas";
import { ToastMessageBar } from "../components/ToastMessageBar";
import { ControlPanel } from "../components/ControlPanel";
import { InfoPanel } from "../components/InfoPanel";

export function AppLayout() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const element = canvasContainerRef.current;
    if (!element) {
      return;
    }

    const updateCanvasSize = () => {
      setCanvasSize({
        width: Math.max(0, element.clientWidth),
        height: Math.max(0, element.clientHeight),
      });
    };

    updateCanvasSize();

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* トップメッセージバー */}
      <ToastMessageBar />

      {/* メインコンテンツ */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, minWidth: 0 }}>
        {/* キャンバス + 右パネル */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, minWidth: 0 }}>
          {/* キャンバス */}
          <div
            ref={canvasContainerRef}
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              backgroundColor: "#0a0a1a",
            }}
          >
            {canvasSize.width > 0 && canvasSize.height > 0 && (
              <SimulationCanvas
                width={canvasSize.width}
                height={canvasSize.height}
              />
            )}
          </div>

          {/* 右パネル（テレメトリ） */}
          <InfoPanel />
        </div>
      </div>

      {/* 下パネル（制御） */}
      <ControlPanel />
    </div>
  );
}
