import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Id } from '../../convex/_generated/dataModel';
import type { GameTree, TreeNode } from '../lib/tree';
import { buildTreeView, moveLabel, type ViewItem } from '../lib/treeLayout';
import { GLYPHS } from './MoveList';

const COLUMN_WIDTH = 168;
const ROW_HEIGHT = 46;
const BOX_WIDTH = 144;
const BOX_HEIGHT = 32;

type BoxData = { item: ViewItem; selected: boolean; onPath: boolean };
type BoxNode = Node<BoxData, 'move' | 'run'>;

type Props = {
  tree: GameTree;
  selectedId: Id<'nodes'>;
  onSelect: (id: Id<'nodes'>) => void;
};

/** The game as a pannable tree. Long stretches and engine lines fold into boxes that expand on click. */
export function GameTreeView(props: Props) {
  return (
    <section className="tree-panel" aria-label="Variation tree">
      <ReactFlowProvider>
        <TreeCanvas {...props} />
      </ReactFlowProvider>
    </section>
  );
}

function TreeCanvas({ tree, selectedId, onSelect }: Props) {
  const [revealed, setRevealed] = useState<ReadonlySet<Id<'nodes'>>>(() => new Set());
  const view = useMemo(() => buildTreeView(tree, revealed), [tree, revealed]);

  // Selecting a folded move (from the move list or the keyboard) unfolds its box.
  const selectedItem = view.itemOf.get(selectedId);
  useEffect(() => {
    if (selectedItem?.kind === 'run') reveal(setRevealed, selectedItem.nodes);
  }, [selectedItem]);

  const onPath = useMemo(() => {
    const ids = new Set<string>();
    for (let n: TreeNode | undefined = tree.byId.get(selectedId); n; n = tree.parentOf(n)) {
      const item = view.itemOf.get(n._id);
      if (item) ids.add(item.id);
    }
    return ids;
  }, [tree, view, selectedId]);

  const nodes = useMemo(
    () =>
      view.items.map(
        (item): BoxNode => ({
          id: item.id,
          type: item.kind,
          position: { x: item.column * COLUMN_WIDTH, y: item.row * ROW_HEIGHT },
          data: { item, selected: item.kind === 'move' && item.nodes[0]!._id === selectedId, onPath: onPath.has(item.id) },
          width: BOX_WIDTH,
          height: BOX_HEIGHT,
        }),
      ),
    [view, selectedId, onPath],
  );

  const edges = useMemo(
    () =>
      view.items.flatMap((item): Edge[] =>
        item.parentItemId
          ? [
              {
                id: `${item.parentItemId}->${item.id}`,
                source: item.parentItemId,
                target: item.id,
                type: 'smoothstep',
                className: [`edge-${item.nodes[0]!.source}`, onPath.has(item.id) ? 'on-path' : ''].join(' '),
              },
            ]
          : [],
      ),
    [view, onPath],
  );

  const onNodeClick: NodeMouseHandler<BoxNode> = useCallback(
    (_event, box) => {
      if (box.data.item.kind === 'run') reveal(setRevealed, box.data.item.nodes);
      else onSelect(box.data.item.nodes[0]!._id);
    },
    [onSelect],
  );

  const allIds = useMemo(() => [...tree.byId.keys()], [tree]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodeClick={onNodeClick}
      defaultViewport={{ x: 24, y: 20, zoom: 1 }}
      minZoom={0.3}
      maxZoom={1.5}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      disableKeyboardA11y
      deleteKeyCode={null}
      panOnScroll
      zoomOnScroll={false}
      colorMode="system"
    >
      <FollowSelection item={selectedItem} />
      <Controls showInteractive={false} position="bottom-right" />
      <Panel position="top-right" className="tree-actions">
        <button onClick={() => setRevealed(new Set(allIds))}>Expand all</button>
        <button onClick={() => setRevealed(new Set())}>Collapse</button>
      </Panel>
    </ReactFlow>
  );
}

function reveal(setRevealed: (update: (prev: ReadonlySet<Id<'nodes'>>) => ReadonlySet<Id<'nodes'>>) => void, nodes: TreeNode[]) {
  setRevealed((prev) => new Set([...prev, ...nodes.map((n) => n._id)]));
}

/**
 * Pans to the selected box when it's out of view: after stepping with the arrow keys, or when
 * folding or resizing moves it. Only checks when one of those changes, so manual panning sticks.
 */
function FollowSelection({ item }: { item: ViewItem | undefined }) {
  const flow = useReactFlow();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const target = item && item.kind === 'move' ? { column: item.column, row: item.row } : null;

  useEffect(() => {
    if (!target || !width || !height) return;
    const left = target.column * COLUMN_WIDTH;
    const top = target.row * ROW_HEIGHT;
    const { x, y, zoom } = flow.getViewport();
    const margin = 12;
    const visible =
      left * zoom + x >= margin &&
      (left + BOX_WIDTH) * zoom + x <= width - margin &&
      top * zoom + y >= margin &&
      (top + BOX_HEIGHT) * zoom + y <= height - margin;
    if (!visible) flow.setCenter(left + BOX_WIDTH / 2, top + BOX_HEIGHT / 2, { zoom, duration: 200 });
  }, [target?.column, target?.row, width, height, flow]);

  return null;
}

const MoveBox = memo(function MoveBox({ data }: NodeProps<BoxNode>) {
  const node = data.item.nodes[0]!;
  const classes = ['tree-box', `source-${node.source}`, node.classification ?? '', data.selected ? 'selected' : '', data.onPath ? 'on-path' : ''];
  const glyph = node.classification ? GLYPHS[node.classification] : undefined;
  return (
    <div className={classes.join(' ')} title={describe(node)}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <span className="tree-label">
        {moveLabel(node)}
        {glyph}
      </span>
      {node.critical && <span className="critical-dot" />}
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
});

const RunBox = memo(function RunBox({ data }: NodeProps<BoxNode>) {
  const { nodes } = data.item;
  const first = nodes[0]!;
  const classes = ['tree-box', 'run', `source-${first.source}`, data.onPath ? 'on-path' : ''];
  return (
    <div className={classes.join(' ')} title={`${runText(nodes)}\n${nodes.length} moves · click to expand`}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <span className="tree-label">{moveLabel(first)} …</span>
      <span className="run-count">+{nodes.length}</span>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
});

const NODE_TYPES = { move: MoveBox, run: RunBox };

/** "13. Qxd5 Bxh4 14. a4 …" — the folded moves, numbered, for the tooltip. */
function runText(nodes: TreeNode[]): string {
  return nodes
    .map((n, i) => (i === 0 || n.fen.split(' ')[1] === 'b' ? moveLabel(n) : n.moveSan))
    .join(' ');
}

function describe(node: TreeNode): string {
  const parts = [node.source === 'game' ? 'Played' : node.source === 'engine' ? 'Engine line' : 'Your what-if'];
  if (node.classification) parts.push(node.classification);
  if (node.winPercentLoss !== undefined && node.winPercentLoss >= 1) parts.push(`lost ${node.winPercentLoss.toFixed(0)}% win chance`);
  if (node.onlyMove) parts.push('only move');
  if (node.critical) parts.push('critical moment');
  return parts.join(' · ');
}
