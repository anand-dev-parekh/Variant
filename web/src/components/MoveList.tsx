import { useEffect, useRef } from 'react';
import type { Ply } from '@variant/chess-core';

type Props = {
  plies: Ply[];
  current: number;
  onSelect: (ply: number) => void;
};

type Row = { number: string; white?: Ply; black?: Ply };

export function MoveList({ plies, current, onSelect }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const cell = (p: Ply | undefined, placeholder: string) =>
    p ? (
      <button
        ref={p.ply === current ? activeRef : undefined}
        className={`move ${p.ply === current ? 'active' : ''}`}
        onClick={() => onSelect(p.ply)}
      >
        {p.san}
      </button>
    ) : (
      <span className="move empty">{placeholder}</span>
    );

  return (
    <ol className="move-list">
      {toRows(plies).map((row) => (
        <li key={row.number}>
          <span className="move-number">{row.number}.</span>
          {cell(row.white, '…')}
          {cell(row.black, '')}
        </li>
      ))}
    </ol>
  );
}

/** Groups plies by fullmove number; a game that starts with Black to move gets an empty White cell. */
function toRows(plies: Ply[]): Row[] {
  const rows: Row[] = [];
  for (const p of plies) {
    const number = p.fenBefore.split(' ')[5] ?? '?';
    let row = rows.at(-1);
    if (!row || row.number !== number) {
      row = { number };
      rows.push(row);
    }
    if (p.color === 'w') row.white = p;
    else row.black = p;
  }
  return rows;
}
