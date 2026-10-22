import type { ReactNode } from 'react';

/** Site header: wordmark on the left, page actions on the right. */
export function TopBar({ children, narrow }: { children?: ReactNode; narrow?: boolean }) {
  return (
    <header className={`topbar ${narrow ? 'narrow' : ''}`}>
      <div className="topbar-inner">
        <a className="wordmark" href="#/">
          <span className="wordmark-mark" aria-hidden>
            ♞
          </span>
          Variant
        </a>
        <nav className="topbar-actions">{children}</nav>
      </div>
    </header>
  );
}
