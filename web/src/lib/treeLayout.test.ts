import { describe, expect, it } from 'vitest';
import { OPERA_GAME_PGN, parseGame } from '@variant/chess-core';
import type { Id } from '../../convex/_generated/dataModel';
import { GameTree, type TreeNode } from './tree';
import { buildTreeView, itemPositions, moveLabel } from './treeLayout';

const id = (s: string) => s as Id<'nodes'>;
let clock = 0;

function node(name: string, parent: string | undefined, fields: Partial<TreeNode> = {}): TreeNode {
  return {
    _id: id(name),
    _creationTime: clock++,
    gameId: 'g' as Id<'games'>,
    parentId: parent ? id(parent) : undefined,
    fen: '8/8/8/8/8/8/8/8 w - - 0 1',
    positionKey: name,
    ply: 0,
    moveSan: parent ? name : undefined,
    source: 'game',
    ...fields,
  };
}

/** A main line m0 (start) … m{length-1}. */
function mainline(length: number, fields: Record<number, Partial<TreeNode>> = {}): TreeNode[] {
  return Array.from({ length }, (_, i) => node(`m${i}`, i ? `m${i - 1}` : undefined, { ply: i, ...fields[i] }));
}

function branch(prefix: string, from: string, length: number, source: 'engine' | 'user'): TreeNode[] {
  return Array.from({ length }, (_, i) => node(`${prefix}${i}`, i ? `${prefix}${i - 1}` : from, { source }));
}

const shape = (nodes: TreeNode[], revealed: string[] = []) =>
  buildTreeView(new GameTree(nodes), new Set(revealed.map(id))).items.map((item) => ({
    nodes: item.nodes.map((n) => n._id).join(','),
    at: [item.column, item.row],
    parent: item.parentItemId,
  }));

describe('buildTreeView', () => {
  it('folds a quiet game into start, one run, and the final position', () => {
    expect(shape(mainline(10))).toEqual([
      { nodes: 'm0', at: [0, 0], parent: undefined },
      { nodes: 'm1,m2,m3,m4,m5,m6,m7,m8', at: [0, 1], parent: 'm0' },
      { nodes: 'm9', at: [0, 2], parent: 'run:m1' },
    ]);
  });

  it('does not fold stretches shorter than a run', () => {
    const items = shape(mainline(6, { 3: { critical: true } }));
    expect(items.map((i) => i.nodes)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5']);
  });

  it('shows critical moments, branch points and blunders; folds engine lines into one box', () => {
    const nodes = [
      ...mainline(12, { 6: { critical: true, classification: 'blunder' }, 9: { classification: 'mistake' } }),
      ...branch('e', 'm5', 5, 'engine'),
      ...branch('f', 'm5', 2, 'engine'),
    ];
    expect(shape(nodes)).toEqual([
      { nodes: 'm0', at: [0, 0], parent: undefined },
      { nodes: 'm1,m2,m3,m4', at: [0, 1], parent: 'm0' },
      { nodes: 'm5', at: [0, 2], parent: 'run:m1' },
      { nodes: 'm6', at: [0, 3], parent: 'm5' },
      { nodes: 'm7', at: [0, 4], parent: 'm6' },
      { nodes: 'm8', at: [0, 5], parent: 'm7' },
      { nodes: 'm9', at: [0, 6], parent: 'm8' },
      { nodes: 'm10', at: [0, 7], parent: 'm9' },
      { nodes: 'm11', at: [0, 8], parent: 'm10' },
      { nodes: 'e0,e1,e2,e3,e4', at: [1, 3], parent: 'm5' },
      // Too short to fold, and pushed right of the first branch.
      { nodes: 'f0', at: [2, 3], parent: 'm5' },
      { nodes: 'f1', at: [2, 4], parent: 'f0' },
    ]);
  });

  it('shows revealed nodes and user what-ifs move by move', () => {
    const nodes = [...mainline(8, { 3: { critical: true } }), ...branch('e', 'm2', 4, 'engine'), ...branch('u', 'm5', 3, 'user')];
    const items = shape(nodes, ['e0', 'e1', 'e2', 'e3']);
    expect(items.filter((i) => i.at[0]! > 0).map((i) => i.nodes)).toEqual(['e0', 'e1', 'e2', 'e3', 'u0', 'u1', 'u2']);
  });

  it('reuses a column once an earlier branch has ended', () => {
    const nodes = [
      ...mainline(20, { 4: { critical: true }, 14: { critical: true } }),
      ...branch('a', 'm3', 2, 'engine'),
      ...branch('b', 'm13', 2, 'engine'),
    ];
    const columns = shape(nodes).filter((i) => i.nodes.startsWith('a') || i.nodes.startsWith('b'));
    expect(columns.map((i) => i.at[0])).toEqual([1, 1, 1, 1]);
  });

  it('maps every node to the box that shows it', () => {
    const tree = new GameTree(mainline(10));
    const view = buildTreeView(tree, new Set());
    expect(view.itemOf.get(id('m4'))?.id).toBe('run:m1');
    expect(view.itemOf.size).toBe(10);
  });
});

describe('itemPositions', () => {
  it('draws mistakes and blunders as cards and makes their rows taller', () => {
    const tree = new GameTree(mainline(4, { 2: { classification: 'blunder', critical: true } }));
    const view = buildTreeView(tree, new Set());
    expect(view.items.map((i) => i.kind)).toEqual(['move', 'move', 'card', 'move']);
    const pos = itemPositions(view, { columnWidth: 100, rowHeight: 30, cardHeight: 90, gap: 10 });
    expect([...pos.values()].map((p) => p.y)).toEqual([0, 40, 80, 180]);
  });
});

describe('moveLabel', () => {
  it('numbers White and Black moves', () => {
    const { plies } = parseGame(OPERA_GAME_PGN);
    const label = (i: number) => moveLabel(node('x', 'root', { fen: plies[i]!.fenAfter, moveSan: plies[i]!.san }));
    expect(label(0)).toBe('1. e4');
    expect(label(1)).toBe('1… e5');
    expect(moveLabel(node('root', undefined))).toBe('Start');
  });
});
