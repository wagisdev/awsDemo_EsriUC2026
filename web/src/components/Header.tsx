/**
 * Application header — frosted-glass bar with the Pormanes.NET brand, title,
 * subtitle and a live "System Online" status pill. Sits above the map stage.
 */
export function Header() {
  return (
    <header className="app-header">
      <img
        className="app-header__logo"
        src="/logo.png"
        alt="Pormanes.NET logo"
        width={56}
        height={56}
      />
      <div className="app-header__titles">
        <span className="app-header__title">Pormanes.NET Internet Service</span>
        <span className="app-header__subtitle">
          Brgy. San Isidro, Almagro Island, Western Samar
        </span>
      </div>
      <div className="app-header__spacer" />
      <div className="status-indicator" role="status" aria-live="polite">
        <span className="pulse-dot" aria-hidden="true" />
        System Online &bull; 24/7 Reliability
      </div>
    </header>
  );
}
