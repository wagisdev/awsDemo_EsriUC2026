import { Header } from "./components/Header";
import { MapView } from "./map/MapView";
import { AppStateProvider } from "./state/appState";

/**
 * Root layout: frosted-glass header on top, full-bleed ArcGIS map below.
 */
export function App() {
  return (
    <AppStateProvider>
      <div className="app-shell">
        <Header />
        <main className="map-stage">
          <MapView />
        </main>
      </div>
    </AppStateProvider>
  );
}
