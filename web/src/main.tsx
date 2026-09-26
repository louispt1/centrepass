import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import init from "./wasm/netball";
import wasmUrl from "./wasm/netball_bg.wasm?url";
import App from "./App";

async function start() {
  await init({ module_or_path: wasmUrl });
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
