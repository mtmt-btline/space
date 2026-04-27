/**
 * SimulationCanvas
 * Canvas 2D でシミュレーション結果を描画
 * - 天体と軌道の描画
 * - ロケットトレイルの描画
 * - カメラ制御（ズーム、パン）
 */

import { useEffect, useRef } from "react";
import { useUiStore } from "../store/uiStore";
import { getWasmInstance } from "../mock/wasmInterface";
import type { Body } from "../mock/wasmInterface";
import { uiConfig } from "../config/uiConfig";

interface SimulationCanvasProps {
  width: number;
  height: number;
}

export function SimulationCanvas({ width, height }: SimulationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state } = useUiStore();
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const wasmInstance = getWasmInstance();
    let lastTimestamp = Date.now();

    const render = () => {
      const now = Date.now();
      const deltaTime = (now - lastTimestamp) / 1000; // 秒単位
      lastTimestamp = now;

      // シミュレーション 1 ステップ
      wasmInstance.step(deltaTime);

      // Canvas クリア
      ctx.fillStyle = uiConfig.canvas.backgroundColor;
      ctx.fillRect(0, 0, width, height);

      // グリッド描画
      if (state.showOrbitGuide) {
        drawGrid(ctx, width, height);
      }

      // 天体と軌道を描画
      const bodies = wasmInstance.get_bodies();
      drawBodies(ctx, bodies, width, height);

      // ロケットトレイル描画（実装予定）
      if (state.showBodyTrail) {
        // drawTrails(ctx, trails, width, height);
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [width, height, state.showOrbitGuide, state.showBodyTrail]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        border: "1px solid #333",
      }}
    />
  );
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const { gridSize: size } = { gridSize: uiConfig.defaults.canvasGridSize };

  ctx.strokeStyle = uiConfig.canvas.gridColor;
  ctx.globalAlpha = uiConfig.canvas.gridAlpha;
  ctx.lineWidth = 1;

  // 縦線
  for (let x = 0; x < width; x += size) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // 横線
  for (let y = 0; y < height; y += size) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawBodies(
  ctx: CanvasRenderingContext2D,
  bodies: Body[],
  width: number,
  height: number,
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const scale = 2; // px/unit（スケール）

  bodies.forEach((body) => {
    const x = centerX + body.position.x * scale;
    const y = centerY + body.position.y * scale;
    const radius = Math.max(body.radius * scale, 2); // 最小サイズ 2px

    // 天体を円で描画
    ctx.fillStyle = getBodyColor(body.name);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // 名前ラベル
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(body.name, x, y + radius + 12);
  });
}

function getBodyColor(name: string): string {
  const colors: Record<string, string> = {
    Sun: "#FDB813",
    Earth: "#4CAF50",
    Moon: "#999999",
    Rocket: "#FF5722",
  };
  return colors[name] || "#FFFFFF";
}
