import { useEffect, useRef } from 'react';
import type { Site } from '../../convex/lib/chessSites';
import { ImportPanel } from './ImportPanel';
import { ConnectForm, RecentGameList, SITES, type RecentGames } from './SiteImport';

export type ImportTab = Site | 'pgn';

/**
 * "Import game": a modal with a tab per chess site (connect a username, then pick a recent game)
 * and one for pasting a PGN. The recent games come from the page, which also counts the new ones.
 */
export function ImportDialog({
  tab,
  onTab,
  onClose,
  usernames,
  recent,
  newCounts,
}: {
  tab: ImportTab | null;
  onTab: (tab: ImportTab) => void;
  onClose: () => void;
  usernames: Partial<Record<Site, string>>;
  recent: Record<Site, RecentGames>;
  newCounts: Record<Site, number>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = tab !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const tabs: { id: ImportTab; name: string; count?: number }[] = [
    ...SITES.map((s) => ({ id: s.site, name: s.name, count: newCounts[s.site] })),
    { id: 'pgn', name: 'Paste a PGN' },
  ];

  return (
    <dialog
      ref={ref}
      className="import-dialog"
      aria-label="Import a game"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {tab !== null && (
        <div className="import-dialog-body">
          <div className="import-dialog-head">
            <h2>Import a game</h2>
            <button className="ghost import-dialog-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <div className="segmented" role="tablist">
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => onTab(t.id)}>
                {t.name}
                {t.count ? <span className="count-badge">{t.count} new</span> : null}
              </button>
            ))}
          </div>
          {tab === 'pgn' ? (
            <ImportPanel onCreated={(id) => (window.location.hash = `#/game/${id}`)} />
          ) : usernames[tab] ? (
            <RecentGameList key={tab} site={tab} username={usernames[tab]} recent={recent[tab]} />
          ) : (
            <ConnectForm key={tab} site={tab} />
          )}
        </div>
      )}
    </dialog>
  );
}
