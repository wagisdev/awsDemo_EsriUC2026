import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type { Lifecycle } from "../../state/appState";

/**
 * Lifecycle filtering ("current" = deployed vs "future" = planned).
 *
 * We do NOT hardcode the exact `status` values — they are discovered at runtime
 * by querying distinct values from the service, then classified by keyword. A
 * date-based fallback (`dateDeployed`) is used if no status values classify.
 */
export const STATUS_FIELD = "status";
export const DEPLOYED_DATE_FIELD = "dateDeployed";

export type StatusClass = "current" | "future" | "other";

const CURRENT_RE = /(deploy|active|online|live|operational|installed|complete|connected)/i;
const FUTURE_RE = /(plan|schedul|proposed|future|design|pending|construction|backlog|survey)/i;

/** Classify a raw status value into the lifecycle bucket it belongs to. */
export function classifyStatus(value: string): StatusClass {
  if (FUTURE_RE.test(value)) return "future";
  if (CURRENT_RE.test(value)) return "current";
  return "other";
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

const statusCache = new Map<string, string[]>();

/** Query distinct `status` values for a layer (cached per layer uid). */
export async function fetchStatusValues(layer: FeatureLayer): Promise<string[]> {
  const key = layer.uid ?? layer.id;
  const cached = statusCache.get(key);
  if (cached) return cached;

  const query = layer.createQuery();
  query.where = "1=1";
  query.outFields = [STATUS_FIELD];
  query.returnDistinctValues = true;
  query.returnGeometry = false;
  query.orderByFields = [STATUS_FIELD];

  const result = await layer.queryFeatures(query);
  const values = result.features
    .map((f) => f.attributes?.[STATUS_FIELD])
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  statusCache.set(key, values);
  return values;
}

/**
 * Build the lifecycle portion of a definition expression.
 * `statusValues` should be the distinct values discovered for the layer.
 */
export function buildLifecycleWhere(mode: Lifecycle, statusValues: string[]): string {
  if (mode === "all") return "1=1";

  const matched = statusValues.filter((v) => classifyStatus(v) === mode);
  if (matched.length > 0) {
    const list = matched.map((v) => `'${escapeSql(v)}'`).join(", ");
    return `${STATUS_FIELD} IN (${list})`;
  }

  // Fallback: derive lifecycle from the deployed date.
  return mode === "current"
    ? `${DEPLOYED_DATE_FIELD} IS NOT NULL`
    : `${DEPLOYED_DATE_FIELD} IS NULL`;
}

/** Build a "name contains" clause, or null when the filter is empty. */
export function buildNameWhere(nameFilter: string): string | null {
  const trimmed = nameFilter.trim();
  if (!trimmed) return null;
  return `name LIKE '%${escapeSql(trimmed)}%'`;
}

/** Combine clauses with AND, dropping the trivial "1=1". */
export function combineWhere(...clauses: Array<string | null>): string {
  const real = clauses.filter((c): c is string => !!c && c !== "1=1");
  return real.length ? real.join(" AND ") : "1=1";
}
