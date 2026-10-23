import { findMoveRuns, playSanLine, sideToMove, type MoveRun } from '@variant/chess-core';
import type { Id } from '../../convex/_generated/dataModel';
import type { GameTree, TreeNode } from './tree';

export type LineStep = { san: string; uci: string; fen: string };

/**
 * A line the coach wrote, placed on the board: the moves from a tree position `baseId`. `steps`
 * may begin with moves from an earlier line in the same answer ("after 12. dxe5 Nh7, 13. Qxd8…");
 * `first` is the index of this line's own first move.
 */
export type LineLink = { baseId: Id<'nodes'>; baseFen: string; steps: LineStep[]; first: number };

export type TextPiece = string | { text: string; link: LineLink };

type Start = { baseId: Id<'nodes'>; baseFen: string; prefix: LineStep[] };

/**
 * Turns the coach's text into plain text and playable lines, for a chat at `context`. A line is
 * placed where its move number and side fit and every move is legal, trying in turn: lines
 * earlier in the same answer (latest first), the chat's own position, the moves leading to it
 * (nearest first), then the moves that follow it. Call it on an answer's pieces in order, so
 * later lines can continue earlier ones.
 */
export function lineResolver(tree: GameTree, context: TreeNode) {
  const path: TreeNode[] = [];
  for (let n = tree.parentOf(context); n; n = tree.parentOf(n)) path.push(n);
  const fixed: Start[] = [context, ...path, ...tree.lineFrom(context).slice(1)].map((n) => ({
    baseId: n._id,
    baseFen: n.fen,
    prefix: [],
  }));
  const fromAnswer: Start[] = [];

  const place = (run: MoveRun): LineLink | null => {
    for (const start of [...fromAnswer, ...fixed]) {
      const fen = start.prefix.at(-1)?.fen ?? start.baseFen;
      if (sideToMove(fen) !== run.side || Number(fen.split(' ')[5]) !== run.number) continue;
      const played = playSanLine(fen, run.san);
      if (played.illegal) continue;
      const steps = [...start.prefix, ...played.moves];
      // Later lines may continue from any position along this one.
      for (let i = start.prefix.length; i < steps.length; i++) {
        fromAnswer.unshift({ baseId: start.baseId, baseFen: start.baseFen, prefix: steps.slice(0, i + 1) });
      }
      return { baseId: start.baseId, baseFen: start.baseFen, steps, first: start.prefix.length };
    }
    return null;
  };

  return (text: string): TextPiece[] => {
    const out: TextPiece[] = [];
    let at = 0;
    for (const run of findMoveRuns(text)) {
      const link = place(run);
      if (!link) continue;
      if (run.start > at) out.push(text.slice(at, run.start));
      out.push({ text: text.slice(run.start, run.end), link });
      at = run.end;
    }
    if (at < text.length) out.push(text.slice(at));
    return out;
  };
}

/** The tree nodes along a line, as far as the tree already has its moves. */
export function nodesAlong(tree: GameTree, link: LineLink): TreeNode[] {
  const out: TreeNode[] = [];
  let at = tree.byId.get(link.baseId);
  for (const step of link.steps) {
    at = at && tree.childrenOf(at).find((c) => c.moveUci === step.uci);
    if (!at) break;
    out.push(at);
  }
  return out;
}
