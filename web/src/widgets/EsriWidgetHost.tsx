import { useEffect, useRef } from "react";

export interface Destroyable {
  destroy: () => void;
}

/**
 * Create an `@arcgis/map-components` custom element, configure it, mount it into
 * the host container, and return a {@link Destroyable} that removes it (the
 * component auto-destroys on disconnect). Collapses the identical
 * create/append/remove boilerplate every component widget was repeating.
 */
export function mountArcgisComponent<K extends keyof HTMLElementTagNameMap>(
  container: HTMLElement,
  tag: K,
  configure: (el: HTMLElementTagNameMap[K]) => void,
): Destroyable {
  const el = document.createElement(tag);
  configure(el);
  container.appendChild(el);
  return { destroy: () => el.remove() };
}

/**
 * Mounts an ArcGIS Maps SDK widget into a React-owned container and destroys it
 * on unmount. `create` runs once; return the widget (or any Destroyable) so it
 * can be cleaned up.
 */
export function EsriWidgetHost({
  create,
  className,
}: {
  create: (container: HTMLDivElement) => Destroyable | Promise<Destroyable>;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // `create` is intentionally captured once; widgets are static per mount.
  const createRef = useRef(create);

  useEffect(() => {
    let instance: Destroyable | null = null;
    let cancelled = false;
    if (ref.current) {
      Promise.resolve(createRef.current(ref.current)).then((w) => {
        if (cancelled) w.destroy();
        else instance = w;
      });
    }
    return () => {
      cancelled = true;
      instance?.destroy();
    };
  }, []);

  return <div ref={ref} className={className} />;
}
