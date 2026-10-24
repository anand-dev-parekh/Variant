import { describe, expect, it } from 'vitest';
import { playSanLine } from '@variant/chess-core';
import type { Id } from '../../convex/_generated/dataModel';
import { lineResolver, type TextPiece } from './chatLines';
import { GameTree, type TreeNode } from './tree';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Main line 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5, as nodes m0 (start) … m6.
const played = playSanLine(STARTING_FEN, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']).moves;
const nodes: TreeNode[] = [{ san: undefined, uci: undefined, fen: STARTING_FEN }, ...played].map((m, i) => ({
  _id: `m${i}` as Id<'nodes'>,
  _creationTime: i,
  gameId: 'g' as Id<'games'>,
  parentId: i ? (`m${i - 1}` as Id<'nodes'>) : undefined,
  fen: m.fen,
  positionKey: `m${i}`,
  ply: i,
  moveSan: m.san,
  moveUci: m.uci,
  source: 'game',
}));
const tree = new GameTree(nodes);

/** The pieces with each link shown as "text @ base: moves (from first)". */
function resolve(at: string, ...texts: string[]) {
  const pieces = lineResolver(tree, tree.byId.get(at as Id<'nodes'>)!);
  return texts.flatMap(pieces).map((p: TextPiece) =>
    typeof p === 'string' ? p : `[${p.text} @ ${p.link.baseId}: ${p.link.steps.map((s) => s.san).join(' ')} (from ${p.link.first})]`,
  );
}

describe('lineResolver', () => {
  it('places a line from the chat position', () => {
    expect(resolve('m4', 'Try 3. Bb5 a6 instead.')).toEqual(['Try ', '[3. Bb5 a6 @ m4: Bb5 a6 (from 0)]', ' instead.']);
  });

  it('places a line from an earlier position on the path', () => {
    expect(resolve('m4', '2. d4 was also possible.')).toEqual(['[2. d4 @ m2: d4 (from 0)]', ' was also possible.']);
  });

  it('places a line from the moves that follow', () => {
    expect(resolve('m2', 'The game went 3. Bc4 Bc5.')).toEqual(['The game went ', '[3. Bc4 Bc5 @ m4: Bc4 Bc5 (from 0)]', '.']);
  });

  it('continues a line from earlier in the answer, across pieces', () => {
    expect(resolve('m4', 'After 3. Bb5 a6, ', 'White retreats with 4. Ba4 Nf6.')).toEqual([
      'After ',
      '[3. Bb5 a6 @ m4: Bb5 a6 (from 0)]',
      ', ',
      'White retreats with ',
      '[4. Ba4 Nf6 @ m4: Bb5 a6 Ba4 Nf6 (from 2)]',
      '.',
    ]);
  });

  it('continues the line just written with an unnumbered Black move', () => {
    expect(resolve('m4', 'After 3. Bb5, …a6 4. Ba4 is the main line.')).toEqual([
      'After ',
      '[3. Bb5 @ m4: Bb5 (from 0)]',
      ', ',
      '[…a6 4. Ba4 @ m4: Bb5 a6 Ba4 (from 1)]',
      ' is the main line.',
    ]);
  });

  it('places an unnumbered Black move at the chat position when nothing came before', () => {
    expect(resolve('m5', 'Here …Nf6 is natural.')).toEqual(['Here ', '[…Nf6 @ m5: Nf6 (from 0)]', ' is natural.']);
  });

  it('leaves illegal lines as text', () => {
    expect(resolve('m4', 'Not 3. Qxf7 here.')).toEqual(['Not 3. Qxf7 here.']);
  });
});
