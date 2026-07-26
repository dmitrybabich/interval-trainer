import "@/index.css";
import "@/i18n";

import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { App } from "@/App";

// autoUpdate: fetch the new service worker and swap it in on the next load.
registerSW({ immediate: true });

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root missing.");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
