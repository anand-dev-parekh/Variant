import type { ReactNode } from 'react';
import { UserMenu } from './Account';

/** The site header: the wordmark, page actions, and the account corner. `wide` matches the game view. */
export function SiteHeader({ children, wide }: { children?: ReactNode; wide?: boolean }) {
  return (
    <header className={`site-header ${wide ? 'wide' : ''}`}>
      <div className="site-header-inner">
        <a className="site-logo" href="#/">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
            <path d="M4 18V4M4 11c5 0 6-5 14-5M4 11c5 0 6 5 14 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="18" cy="6" r="2.4" className="site-logo-dot" />
          </svg>
          Variant
        </a>
        <div className="site-header-actions">
          {children}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
