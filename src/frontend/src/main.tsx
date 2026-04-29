import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { initWasmInterface } from "./mock/wasmInterface";

async function bootstrap() {
  await initWasmInterface();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap().catch((error: unknown) => {
  console.error("Failed to initialize Rust WASM backend", error);
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML =
      '<div style="padding:16px;color:#fff;background:#1f1f2f;font-family:system-ui,sans-serif;">Rust WASM backend initialization failed. Run npm run wasm:build and retry.</div>';
  }
});
