import { useState } from "react";
import esriRequest from "@arcgis/core/request";
import { useMapContext } from "../map/MapContext";

/**
 * Data Enrichment: run Esri GeoEnrichment against the drawn/buffered study
 * areas to estimate demographics (population, households) inside the coverage
 * footprint. This is a BILLABLE Esri call and flows through the token proxy so
 * Esri meters it accurately.
 */

const ENRICH_URL =
  "https://geoenrich.arcgis.com/arcgis/rest/services/World/GeoenrichmentServer/Geoenrichment/enrich";

const VARIABLES = [
  { key: "TOTPOP", field: "KeyGlobalFacts.TOTPOP", label: "Total population" },
  { key: "TOTHH", field: "KeyGlobalFacts.TOTHH", label: "Total households" },
  { key: "AVGHHSZ", field: "KeyGlobalFacts.AVGHHSZ", label: "Avg. household size" },
];

interface EnrichRow {
  label: string;
  value: number;
}

export function EnrichWidget() {
  const { sketchLayer, analysisLayer } = useMapContext();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<EnrichRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function collectStudyAreas() {
    // Prefer buffered coverage areas; fall back to raw drawn shapes.
    const buffers = analysisLayer.graphics.filter((g) => g.attributes?.kind === "buffer");
    const source = buffers.length > 0 ? buffers : sketchLayer.graphics;
    return source
      .filter((g) => !!g.geometry)
      .map((g) => ({ geometry: g.geometry!.toJSON() }))
      .toArray();
  }

  async function runEnrich() {
    setError(null);
    setRows(null);
    const studyAreas = collectStudyAreas();
    if (studyAreas.length === 0) {
      setError("Draw or buffer an area first to enrich it.");
      return;
    }

    setLoading(true);
    try {
      const response = await esriRequest(ENRICH_URL, {
        method: "post",
        responseType: "json",
        query: {
          f: "json",
          studyAreas: JSON.stringify(studyAreas),
          analysisVariables: JSON.stringify(VARIABLES.map((v) => v.field)),
          returnGeometry: false,
        },
      });

      const features =
        response.data?.results?.[0]?.value?.FeatureSet?.[0]?.features ?? [];
      if (features.length === 0) throw new Error("No enrichment data returned.");

      // Aggregate across study areas (sum counts; average the ratio).
      const totals: Record<string, number> = {};
      for (const feat of features) {
        for (const v of VARIABLES) {
          const val = Number(feat.attributes?.[v.key] ?? 0);
          totals[v.key] = (totals[v.key] ?? 0) + (Number.isFinite(val) ? val : 0);
        }
      }
      if (features.length > 1 && totals.AVGHHSZ != null) {
        totals.AVGHHSZ = totals.AVGHHSZ / features.length;
      }

      setRows(
        VARIABLES.map((v) => ({ label: v.label, value: totals[v.key] ?? 0 })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="hint" style={{ marginBottom: "0.75rem" }}>
        Estimates who lives inside your drawn or buffered coverage area using
        Esri GeoEnrichment.
      </p>
      <div className="btn-row">
        <button className="btn" onClick={runEnrich} disabled={loading}>
          {loading ? "Enriching\u2026" : "Enrich study area"}
        </button>
      </div>
      {error && (
        <p className="hint" style={{ marginTop: "0.6rem", color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {rows && (
        <ul className="result-list">
          {rows.map((r) => (
            <li key={r.label}>
              <span>{r.label}</span>
              <span className="value">
                {r.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
