import { Fragment, useEffect, useRef } from 'react';
import type { Id } from '../../convex/_generated/dataModel';
import type { GameTree, TreeNode } from '../lib/tree';

type Props = {
  tree: GameTree;
  selectedId: Id<'nodes'>;
  onSelect: (id: Id<'nodes'>) => void;
};

export const GLYPHS: Record<string, string> = { inaccuracy: '?!', mistake: '?', blunder: '??' };

type Row = { number: string; white?: TreeNode; black?: TreeNode };

/** The main line as numbered rows, with engine alternatives shown under each critical move. */
export function MoveList({ tree, selectedId, onSelect }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const move = (node: TreeNode, className = 'move') => (
    <button
      key={node._id}
      ref={node._id === selectedId ? activeRef : undefined}
      className={`${className} ${node.classification ?? ''} ${node._id === selectedId ? 'active' : ''}`}
      onClick={() => onSelect(node._id)}
    >
      {node.moveSan}
      {node.classification && GLYPHS[node.classification]}
      {node.critical && <span className="critical-dot" title="Critical moment" />}
    </button>
  );

  const cell = (node: TreeNode | undefined, placeholder: string) =>
    node ? move(node) : <span className="move empty">{placeholder}</span>;

  return (
    <ol className="move-list">
      {toRows(tree.mainline.slice(1)).map((row) => {
        const critical = [row.white, row.black].filter((n) => n?.critical) as TreeNode[];
        return (
          <Fragment key={row.number}>
            <li className="move-row">
              <span className="move-number">{row.number}.</span>
              {cell(row.white, '…')}
              {cell(row.black, '')}
            </li>
            {critical.flatMap((node) =>
              tree.alternativesTo(node).map((alt) => (
                <li key={alt._id} className="variation">
                  {tree.lineFrom(alt).map((n, i) => (
                    <Fragment key={n._id}>
                      {moveNumber(n, i === 0) && <span className="move-number">{moveNumber(n, i === 0)}</span>}
                      {move(n, 'var-move')}
                    </Fragment>
                  ))}
                </li>
              )),
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}

/** "12." before White's moves; "12…" before a line that starts with Black's move. */
function moveNumber(node: TreeNode, first: boolean): string | null {
  const whiteMoved = node.fen.split(' ')[1] === 'b';
  const fullmove = Number(node.fen.split(' ')[5]);
  if (whiteMoved) return `${fullmove}.`;
  return first ? `${fullmove - 1}…` : null;
}

/** Groups main-line nodes into numbered rows; a game that starts with Black to move gets an empty White cell. */
function toRows(nodes: TreeNode[]): Row[] {
  const rows: Row[] = [];
  for (const node of nodes) {
    const whiteMoved = node.fen.split(' ')[1] === 'b';
    const fullmove = Number(node.fen.split(' ')[5]);
    const number = String(whiteMoved ? fullmove : fullmove - 1);
    let row = rows.at(-1);
    if (!row || row.number !== number) {
      row = { number };
      rows.push(row);
    }
    if (whiteMoved) row.white = node;
    else row.black = node;
  }
  return rows;
}
