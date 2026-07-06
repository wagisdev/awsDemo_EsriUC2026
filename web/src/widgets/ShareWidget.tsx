import { useCallback, useEffect, useState } from "react";
import { useMapContext } from "../map/MapContext";
import { useAppState } from "../state/appState";
import { buildShareUrl } from "./share/shareState";
import { Icon } from "./icons";

/**
 * Share: capture the current view (center, zoom, basemap, visible layers,
 * lifecycle filter) into a URL. Pure client-side — no backend, no short links.
 */
export function ShareWidget() {
  const { view, operationalLayers } = useMapContext();
  const { lifecycle } = useAppState();
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const regenerate = useCallback(() => {
    const next = buildShareUrl(view, operationalLayers, lifecycle);
    setUrl(next);
    // Reflect the state in the address bar without reloading.
    window.history.replaceState(null, "", next);
  }, [view, operationalLayers, lifecycle]);

  useEffect(() => {
    regenerate();
  }, [regenerate]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be blocked; the field is selectable as a fallback */
    }
  }

  return (
    <div>
      <p className="hint" style={{ marginBottom: "0.6rem" }}>
        Anyone with this link opens the map exactly as you see it now.
      </p>
      <div className="field">
        <label htmlFor="share-url">Shareable link</label>
        <input
          id="share-url"
          type="text"
          className="control"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
      <div className="btn-row">
        <button className="btn" onClick={copy}>
          <Icon name={copied ? "check" : "copy"} size={16} />
          {copied ? "Copied" : "Copy link"}
        </button>
        <button className="btn btn--ghost" onClick={regenerate}>
          Update to current view
        </button>
      </div>
    </div>
  );
}
