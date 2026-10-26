import { useCallback, useEffect, useMemo, useState, type PointerEvent } from 'react';
import { formatScore, terminalScore, winPercent, type Score } from '@variant/chess-core';
import type { Doc, Id } from '../../convex/_generated/dataModel';
import type { GameTree, TreeNode } from '../lib/tree';
import { moveLabel } from '../lib/treeLayout';

const HEIGHT = 84;

type Props = {
  tree: GameTree;
  analyses: Record<string, Doc<'analyses'>>;
  selectedId: Id<'nodes'>;
  onSelect: (id: Id<'nodes'>) => void;
};

type Point = { node: TreeNode; score: Score; win: number };

/**
 * White's winning chances across the main line (the Lichess win-% curve), white area below the
 * line and black above, like the eval bar. Marks inaccuracies to blunders and key moments; click
 * or drag to jump to a move.
 */
export function EvalGraph({ tree, analyses, selectedId, onSelect }: Props) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo(
    () =>
      tree.mainline.flatMap((node): Point[] => {
        const a = analyses[node.positionKey];
        if (!a) return [];
        const score = a.terminal ? terminalScore(a.fen, a.terminal) : a.lines[0]?.score;
        return score ? [{ node, score, win: winPercent(score) }] : [];
      }),
    [tree, analyses],
  );

  // A selection inside a branch shows where that branch left the main line.
  const current = useMemo(() => {
    for (let n = tree.byId.get(selectedId); n; n = tree.parentOf(n)) {
      if (n.source === 'game') return points.findIndex((p) => p.node._id === n._id);
    }
    return -1;
  }, [tree, points, selectedId]);

  if (points.length < 2) return null;
  const last = tree.mainline.length - 1;
  const x = (node: TreeNode) => (node.ply / Math.max(1, last)) * width;
  const y = (win: number) => (1 - win / 100) * HEIGHT;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.node).toFixed(1)} ${y(p.win).toFixed(1)}`).join('');
  const area = `${line}L${x(points.at(-1)!.node)} ${HEIGHT}L${x(points[0]!.node)} ${HEIGHT}Z`;

  const nearest = (e: PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ply = Math.round(((e.clientX - rect.left) / rect.width) * last);
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.node.ply - ply) < Math.abs(points[best]!.node.ply - ply)) best = i;
    });
    return best;
  };

  const shown = hover ?? (current >= 0 ? current : null);
  const tip = shown !== null ? points[shown] : undefined;

  return (
    <div className="eval-graph" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label="White's winning chances over the game"
          onPointerMove={(e) => {
            setHover(nearest(e));
            if (e.buttons === 1) onSelect(points[nearest(e)]!.node._id);
          }}
          onPointerLeave={() => setHover(null)}
          onPointerDown={(e) => onSelect(points[nearest(e)]!.node._id)}
        >
          <rect className="graph-black" width={width} height={HEIGHT} />
          <path className="graph-white" d={area} />
          <path className="graph-line" d={line} />
          <line className="graph-mid" x1={0} x2={width} y1={HEIGHT / 2} y2={HEIGHT / 2} />
          {points.map((p) => {
            const kind = p.node.keyMoment ? 'key' : p.node.classification;
            if (!kind || !['key', 'inaccuracy', 'mistake', 'blunder'].includes(kind)) return null;
            return <circle key={p.node._id} className={`graph-mark ${kind}`} cx={x(p.node)} cy={y(p.win)} r={kind === 'inaccuracy' ? 2.5 : 3.5} />;
          })}
          {tip && <line className={`graph-cursor ${hover !== null ? 'hover' : ''}`} x1={x(tip.node)} x2={x(tip.node)} y1={0} y2={HEIGHT} />}
        </svg>
      )}
      {tip && hover !== null && (
        <span className="graph-tip" style={{ left: Math.min(Math.max(x(tip.node), 50), width - 50) }}>
          {tip.node.moveSan ? moveLabel(tip.node) : 'Start'} · {formatScore(tip.score)}
        </span>
      )}
    </div>
  );
}

/**
 * A callback ref and the element's width. A callback ref (not useRef) because the graph renders
 * nothing until the analyses load, so the element appears after the first render.
 */
function useWidth(): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [useCallback((node: HTMLElement | null) => setEl(node), []), width];
}
