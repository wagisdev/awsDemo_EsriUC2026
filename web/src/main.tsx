import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// ArcGIS dark theme so SDK widgets blend with the frosted-glass UI.
import "@arcgis/core/assets/esri/themes/dark/main.css";
import "./styles/theme.css";
import "./styles/map.css";

import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
