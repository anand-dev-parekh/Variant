import type { ReactNode } from 'react';
import { UserMenu } from './Account';

/** Site header: wordmark on the left, page actions and the account on the right. */
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
        <nav className="topbar-actions">
          {children}
          <UserMenu />
        </nav>
      </div>
    </header>
  );
}
