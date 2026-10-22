import type { Id } from '../../convex/_generated/dataModel';
import type { GameTree, TreeNode } from './tree';

/** One box in the tree view: a single position, or a folded run of consecutive moves. */
export type ViewItem = {
  id: string;
  /** move: one position · card: a mistake or blunder, drawn large with a board · run: folded moves */
  kind: 'move' | 'card' | 'run';
  nodes: TreeNode[];
  column: number;
  row: number;
  /** The item this one hangs from: the previous item on its line, or the position it branches from. */
  parentItemId?: string;
};

export type TreeView = {
  items: ViewItem[];
  /** Which item shows each node (folded nodes map to their run). */
  itemOf: Map<Id<'nodes'>, ViewItem>;
};

/** Shorter stretches of quiet moves aren't worth folding: the run box would be as big as the moves. */
export const MIN_RUN = 3;

/** Drawn as cards. */
const TURNING_POINTS = new Set(['mistake', 'blunder']);
/** Never folded away on the main line. */
const MARKED = new Set(['inaccuracy', 'mistake', 'blunder']);

/**
 * Lays the game out as a top-down tree: the main line in column 0, each branch in the nearest
 * column to the right that is free for the rows it spans.
 *
 * Folding keeps long games readable. On the main line, only landmarks get their own box: the
 * start, the final position, inaccuracies, mistakes and blunders, and positions that branch.
 * Engine lines fold completely. The user's own what-ifs never fold. Anything in `revealed` is
 * shown regardless.
 */
export function buildTreeView(tree: GameTree, revealed: ReadonlySet<Id<'nodes'>>): TreeView {
  const items: ViewItem[] = [];
  const itemOf = new Map<Id<'nodes'>, ViewItem>();
  const occupied: [number, number][][] = [];

  const isLandmark = (node: TreeNode): boolean => {
    if (revealed.has(node._id) || node.source === 'user') return true;
    if (node.source !== 'game') return false;
    return (
      node === tree.root ||
      !!node.critical ||
      MARKED.has(node.classification ?? '') ||
      tree.childrenOf(node).length > 1 ||
      tree.next(node) === undefined
    );
  };

  const isFree = (column: number, from: number, to: number) =>
    !(occupied[column] ?? []).some(([start, end]) => from <= end && start <= to);

  const place = (start: TreeNode, row: number, minColumn: number, parentItemId: string | undefined) => {
    const line = tree.lineFrom(start);
    const groups = foldLine(line, isLandmark);

    let column = minColumn;
    while (!isFree(column, row, row + groups.length - 1)) column++;
    (occupied[column] ??= []).push([row, row + groups.length - 1]);

    const placed: ViewItem[] = [];
    for (const nodes of groups) {
      const first = nodes[0]!;
      const item: ViewItem = {
        id: nodes.length > 1 ? `run:${first._id}` : first._id,
        kind: nodes.length > 1 ? 'run' : TURNING_POINTS.has(first.classification ?? '') ? 'card' : 'move',
        nodes,
        column,
        row: row + placed.length,
        parentItemId: placed.at(-1)?.id ?? parentItemId,
      };
      for (const node of nodes) itemOf.set(node._id, item);
      items.push(item);
      placed.push(item);
    }

    // Branches off this line, in line order, each starting one row below where it leaves.
    const onLine = new Set(line.map((n) => n._id));
    for (const item of placed) {
      for (const node of item.nodes) {
        for (const child of tree.childrenOf(node)) {
          if (!onLine.has(child._id)) place(child, item.row + 1, column + 1, item.id);
        }
      }
    }
  };

  place(tree.root, 0, 0, undefined);
  return { items, itemOf };
}

/** Pixel geometry of the view. Rows grow to fit the tallest item in them (cards are taller). */
export type Geometry = { columnWidth: number; rowHeight: number; cardHeight: number; gap: number };
export const GEOMETRY: Geometry = { columnWidth: 280, rowHeight: 36, cardHeight: 104, gap: 10 };

/** Top-left corner of every item, by id. */
export function itemPositions(view: TreeView, g: Geometry = GEOMETRY): Map<string, { x: number; y: number }> {
  const heights: number[] = [];
  for (const item of view.items) {
    const h = item.kind === 'card' ? g.cardHeight : g.rowHeight;
    heights[item.row] = Math.max(heights[item.row] ?? 0, h);
  }
  const tops: number[] = [];
  let y = 0;
  for (let row = 0; row < heights.length; row++) {
    tops[row] = y;
    y += (heights[row] ?? g.rowHeight) + g.gap;
  }
  return new Map(view.items.map((item) => [item.id, { x: item.column * g.columnWidth, y: tops[item.row]! }]));
}

/** Splits a line into boxes: landmarks alone, stretches of other moves folded when long enough. */
export function foldLine(line: TreeNode[], isLandmark: (node: TreeNode) => boolean): TreeNode[][] {
  const groups: TreeNode[][] = [];
  let pending: TreeNode[] = [];
  const flush = () => {
    if (pending.length >= MIN_RUN) groups.push(pending);
    else groups.push(...pending.map((n) => [n]));
    pending = [];
  };
  for (const node of line) {
    if (isLandmark(node)) {
      flush();
      groups.push([node]);
    } else {
      pending.push(node);
    }
  }
  flush();
  return groups;
}

/** "12." before White's move, "12…" before Black's. */
export function moveLabel(node: TreeNode): string {
  if (!node.moveSan) return 'Start';
  const [, turn, , , , fullmove] = node.fen.split(' ');
  const whiteMoved = turn === 'b';
  const number = whiteMoved ? Number(fullmove) : Number(fullmove) - 1;
  return `${number}${whiteMoved ? '.' : '…'} ${node.moveSan}`;
}
