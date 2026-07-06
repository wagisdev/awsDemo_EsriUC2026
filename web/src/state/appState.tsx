import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { readShareState, type ShareState } from "../widgets/share/shareState";

export type Lifecycle = NonNullable<ShareState["lifecycle"]>;

/** Identifier of the currently open widget panel (only one open at a time). */
export type WidgetId =
  | "layers"
  | "basemap"
  | "filter"
  | "ruler"
  | "draw"
  | "coordConvert"
  | "buffer"
  | "enrich"
  | "table"
  | "addData"
  | "share";

interface AppState {
  lifecycle: Lifecycle;
  setLifecycle: (l: Lifecycle) => void;
  /** Free-text "name contains" filter applied to network layers. */
  nameFilter: string;
  setNameFilter: (v: string) => void;
  activeWidget: WidgetId | null;
  setActiveWidget: (w: WidgetId | null) => void;
  /** Toggle a widget panel open/closed. */
  toggleWidget: (w: WidgetId) => void;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const initialLifecycle: Lifecycle = readShareState()?.lifecycle ?? "all";
  const [lifecycle, setLifecycle] = useState<Lifecycle>(initialLifecycle);
  const [nameFilter, setNameFilter] = useState<string>("");
  const [activeWidget, setActiveWidget] = useState<WidgetId | null>(null);

  const value = useMemo<AppState>(
    () => ({
      lifecycle,
      setLifecycle,
      nameFilter,
      setNameFilter,
      activeWidget,
      setActiveWidget,
      toggleWidget: (w) => setActiveWidget((cur) => (cur === w ? null : w)),
    }),
    [lifecycle, nameFilter, activeWidget],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
