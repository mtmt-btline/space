import { useEffect } from "react";
import { UiStoreProvider } from "./store/UiStoreProvider";
import { AppLayout } from "./layout/AppLayout";
import "./App.css";

function App() {
  useEffect(() => {
    // グローバル スタイル設定
    document.body.style.backgroundColor = "#0a0a1a";
    document.body.style.color = "#ffffff";
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.fontFamily = "system-ui, -apple-system, sans-serif";
  }, []);

  return (
    <UiStoreProvider>
      <AppLayout />
    </UiStoreProvider>
  );
}

export default App;
