import { useEffect, useState } from "react";
import Portal from "@arcgis/core/portal/Portal";
import type PortalItem from "@arcgis/core/portal/PortalItem";
import Layer from "@arcgis/core/layers/Layer";
import { useMapContext } from "../map/MapContext";
import { Icon } from "./icons";

/**
 * Add Data — LIVING ATLAS ONLY.
 *
 * Content is constrained to Esri's Living Atlas using the `groupdesignations:
 * livingatlas` search filter, so only curated, authoritative layers can be
 * added — no arbitrary user URLs or other org content. (Approach mirrors the
 * proven amznNetworkPOC implementation.)
 */

const ADDABLE_TYPES = [
  'type:"Feature Service"',
  'type:"Vector Tile Service"',
  'type:"Imagery Layer"',
].join(" OR ");

/** Marker we stamp on layers added here so we can toggle them off again. */
interface TaggedLayer extends Layer {
  isLivingAtlas?: boolean;
  portalItem?: { id: string };
}

export function AddDataWidget() {
  const { view } = useMapContext();
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<PortalItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Derive "added" from the map (not just local state) so the widget REMEMBERS
  // what it added after it's closed and reopened — the layers live on the map,
  // tagged with isLivingAtlas, so they're the source of truth.
  const [added, setAdded] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    view.map?.layers.forEach((l) => {
      const t = l as TaggedLayer;
      if (t.isLivingAtlas && t.portalItem?.id) ids.add(t.portalItem.id);
    });
    return ids;
  });

  // Debounced search on term change (and once on mount for a popular list).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchLivingAtlas(term);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [term]);

  async function searchLivingAtlas(text: string) {
    setLoading(true);
    setError(null);
    try {
      const portal = new Portal(); // defaults to www.arcgis.com (proxied)
      const query = `groupdesignations:livingatlas AND (${ADDABLE_TYPES})${
        text.trim() ? ` AND (${text.trim()})` : ""
      }`;
      const response = await portal.queryItems({
        query,
        num: 20,
        sortField: "num-views",
        sortOrder: "desc",
      });
      setItems(response.results);
      if (response.results.length === 0) setError("No Living Atlas layers matched.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function toggleLayer(item: PortalItem) {
    const map = view.map;
    if (!map || !item.id) return;
    const id = item.id;

    if (added.has(id)) {
      const existing = map.layers.find(
        (l) => (l as TaggedLayer).portalItem?.id === id,
      );
      if (existing) map.remove(existing);
      setAdded((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }

    try {
      const layer = (await Layer.fromPortalItem({ portalItem: item })) as TaggedLayer;
      layer.isLivingAtlas = true;
      // Make sure it shows up (and stays manageable) in the Layer List.
      (layer as unknown as { listMode: string }).listMode = "show";
      if (!layer.title && item.title) layer.title = item.title;
      // Append = top of the draw order / top of the Layer List, so a freshly
      // added Living Atlas layer sits on top and is easy to find + remove.
      map.add(layer);
      setAdded((prev) => new Set(prev).add(id));
    } catch (err) {
      setError(
        `Could not add "${item.title}": ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  return (
    <div>
      <p className="hint" style={{ marginBottom: "0.6rem" }}>
        Curated layers from Esri&rsquo;s Living Atlas only.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void searchLivingAtlas(term);
        }}
        style={{ marginBottom: "0.75rem" }}
      >
        <input
          type="text"
          className="control"
          placeholder="Search Living Atlas (e.g. population)"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </form>

      {loading && <p className="hint">Searching&hellip;</p>}
      {error && !loading && (
        <p className="hint" style={{ color: "var(--danger)", marginBottom: "0.5rem" }}>
          {error}
        </p>
      )}

      <ul className="result-list" style={{ maxHeight: "42vh", overflow: "auto" }}>
        {items.map((item) => {
          const isAdded = item.id ? added.has(item.id) : false;
          const thumb =
            item.thumbnailUrl || "https://www.arcgis.com/home/images/default_thumb.png";
          return (
            <li key={item.id ?? undefined} style={{ alignItems: "center", gap: "0.6rem" }}>
              <img
                src={thumb}
                alt=""
                width={56}
                height={38}
                style={{ borderRadius: 4, objectFit: "cover", flex: "0 0 auto" }}
              />
              <span
                style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
                title={item.title ?? undefined}
              >
                {item.title}
                <br />
                <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>
                  {item.owner}
                </span>
              </span>
              <button
                type="button"
                className="btn"
                style={{ padding: "0.35rem 0.6rem", flex: "0 0 auto" }}
                onClick={() => void toggleLayer(item)}
                aria-label={`${isAdded ? "Remove" : "Add"} ${item.title}`}
              >
                <Icon name={isAdded ? "trash" : "addData"} size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
