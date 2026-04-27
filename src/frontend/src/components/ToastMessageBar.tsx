/**
 * ToastMessageBar
 * 画面上部にメッセージ（通知、エラー）を表示
 * 一定時間後に自動的に消える
 */

import { useEffect } from "react";
import { useToast } from "../store/uiStore";
import { uiConfig } from "../config/uiConfig";

export function ToastMessageBar() {
  const { message, type, hideToast } = useToast();

  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(() => {
      hideToast();
    }, uiConfig.timing.toastMessageDurationMs);

    return () => clearTimeout(timer);
  }, [message, hideToast]);

  if (!message) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        left: "50%",
        transform: "translateX(-50%)",
        padding: "12px 24px",
        borderRadius: "4px",
        backgroundColor: getBackgroundColor(type),
        color: "#ffffff",
        fontSize: "14px",
        zIndex: 1000,
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
      }}
    >
      {message}
    </div>
  );
}

function getBackgroundColor(
  type: "info" | "warning" | "error" | "success",
): string {
  const colors = {
    info: "#2196F3",
    warning: "#FF9800",
    error: "#F44336",
    success: "#4CAF50",
  };
  return colors[type];
}
