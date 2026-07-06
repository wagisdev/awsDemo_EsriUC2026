import { useEffect, useState } from "react";
import { useMapContext } from "../map/MapContext";
import { useAppState, type Lifecycle } from "../state/appState";
import { classifyStatus, fetchStatusValues, type StatusClass } from "./filter/lifecycle";

const LIFECYCLE_OPTIONS: { id: Lifecycle; label: string }[] = [
  { id: "all", label: "All" },
  { id: "current", label: "Current" },
  { id: "future", label: "Planned" },
];

const CLASS_COLOR: Record<StatusClass, string> = {
  current: "var(--accent-emerald)",
  future: "var(--warning)",
  other: "var(--text-muted)",
};

/**
 * Filter controls: switch the network view between currently-deployed and
 * planned/future assets, and filter by name. Discovered status values are shown
 * so the operator can see how the service's own values map to the lifecycle.
 */
export function FilterWidget() {
  const { operationalLayers } = useMapContext();
  const { lifecycle, setLifecycle, nameFilter, setNameFilter } = useAppState();
  const [statuses, setStatuses] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = new Set<string>();
      for (const o of operationalLayers) {
        if (!o.def.supportsLifecycleFilter) continue;
        const values = await fetchStatusValues(o.layer).catch(() => []);
        values.forEach((v) => all.add(v));
      }
      if (!cancelled) setStatuses([...all].sort());
    })();
    return () => {
      cancelled = true;
    };
  }, [operationalLayers]);

  return (
    <div>
      <div className="field">
        <label>Network lifecycle</label>
        <div className="segmented">
          {LIFECYCLE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={lifecycle === opt.id ? "is-active" : ""}
              onClick={() => setLifecycle(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="name-filter">Name contains</label>
        <input
          id="name-filter"
          type="text"
          className="control"
          placeholder="e.g. San Isidro"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />
      </div>

      {statuses.length > 0 && (
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Status values in service</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {statuses.map((s) => {
              const cls = classifyStatus(s);
              return (
                <span
                  key={s}
                  title={`Classified as: ${cls}`}
                  style={{
                    fontSize: "0.72rem",
                    padding: "0.2rem 0.55rem",
                    borderRadius: "9999px",
                    border: `1px solid ${CLASS_COLOR[cls]}`,
                    color: CLASS_COLOR[cls],
                  }}
                >
                  {s}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
