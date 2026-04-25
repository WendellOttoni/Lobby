import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";

if (import.meta.env.PROD) {
  window.addEventListener("contextmenu", (e) => {
    if (e.defaultPrevented) return;
    e.preventDefault();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "F12") {
      e.preventDefault();
      invoke("toggle_devtools").catch(() => {});
      return;
    }
    if (e.key === "F5") e.preventDefault();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") e.preventDefault();
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
