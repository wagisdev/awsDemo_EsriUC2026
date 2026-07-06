import type { ReactNode } from "react";
import { Icon } from "./icons";

/**
 * Frosted-glass container for a widget's UI. Provides a titled header with a
 * close button; children render the widget body.
 */
export function WidgetPanel({
  title,
  onClose,
  children,
  className,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`glass-panel widget-panel${className ? ` ${className}` : ""}`}
      role="dialog"
      aria-label={title}
    >
      <div className="widget-panel__header">
        <span className="widget-panel__title">{title}</span>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      {children}
    </section>
  );
}
