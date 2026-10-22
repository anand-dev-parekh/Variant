import { memo, useCallback, useEffect, useMemo } from 'react';
import {
  BaseEdge,
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { formatScore, terminalScore, type Score } from '@variant/chess-core';
import type { Doc, Id } from '../../convex/_generated/dataModel';
import type { GameTree, TreeNode } from '../lib/tree';
import { GEOMETRY, buildTreeView, itemPositions, moveLabel, type ViewItem } from '../lib/treeLayout';
import { MiniBoard } from './MiniBoard';
import { GLYPHS } from './MoveList';

/** Every item's dot sits here (relative to the item's top-left); edges run dot to dot. */
const DOT = { x: 10, y: 18 };

export type Revealed = ReadonlySet<Id<'nodes'>>;

type Props = {
  tree: GameTree;
  analyses: Record<string, Doc<'analyses'>>;
  selectedId: Id<'nodes'>;
  onSelect: (id: Id<'nodes'>) => void;
  /** Fold state lives with the page, so the tree keeps it when it moves between tab and full screen. */
  revealed: Revealed;
  setRevealed: (update: (prev: Revealed) => Revealed) => void;
  flipped?: boolean;
  onHover?: (id: Id<'nodes'> | null) => void;
};

type ItemData = {
  item: ViewItem;
  selected: boolean;
  onPath: boolean;
  evalText?: string;
  bestText?: string;
  flipped: boolean;
};
type ItemNode = Node<ItemData, ViewItem['kind']>;

/**
 * The game as a metro map: moves are stops on a line, inaccuracies to blunders are colored stops,
 * and mistakes and blunders open into cards with the position. Engine lines and quiet stretches
 * fold into one stop that expands on click.
 */
export function GameTreeView(props: Props) {
  return (
    <ReactFlowProvider>
      <TreeCanvas {...props} />
    </ReactFlowProvider>
  );
}

function TreeCanvas({ tree, analyses, selectedId, onSelect, revealed, setRevealed, flipped = false, onHover }: Props) {
  const view = useMemo(() => buildTreeView(tree, revealed), [tree, revealed]);
  const positions = useMemo(() => itemPositions(view), [view]);

  // Selecting a folded move (from the move list or the keyboard) unfolds its stretch.
  const selectedItem = view.itemOf.get(selectedId);
  useEffect(() => {
    if (selectedItem?.kind === 'run') reveal(setRevealed, selectedItem.nodes);
  }, [selectedItem, setRevealed]);

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
      view.items.map((item): ItemNode => {
        const node = item.nodes[0]!;
        const parent = tree.parentOf(node);
        return {
          id: item.id,
          type: item.kind,
          position: positions.get(item.id)!,
          data: {
            item,
            selected: item.kind !== 'run' && node._id === selectedId,
            onPath: onPath.has(item.id),
            evalText: item.kind === 'card' ? evalOf(analyses, node) : undefined,
            bestText: item.kind === 'card' && parent ? bestMoveOf(analyses, parent) : undefined,
            flipped,
          },
        };
      }),
    [view, positions, selectedId, onPath, analyses, tree, flipped],
  );

  const edges = useMemo(() => {
    const byId = new Map(view.items.map((i) => [i.id, i]));
    return view.items.flatMap((item): Edge[] => {
      if (!item.parentItemId) return [];
      const parent = byId.get(item.parentItemId)!;
      const classes = [
        `edge-${item.nodes[0]!.source}`,
        item.kind === 'run' || parent.kind === 'run' ? 'edge-run' : '',
        onPath.has(item.id) ? 'on-path' : '',
      ];
      return [{ id: `${parent.id}->${item.id}`, source: parent.id, target: item.id, type: 'elbow', className: classes.join(' ') }];
    });
  }, [view, onPath]);

  const onNodeClick: NodeMouseHandler<ItemNode> = useCallback(
    (_event, n) => {
      if (n.data.item.kind === 'run') reveal(setRevealed, n.data.item.nodes);
      else onSelect(n.data.item.nodes[0]!._id);
    },
    [onSelect, setRevealed],
  );

  const allIds = useMemo(() => [...tree.byId.keys()], [tree]);
  const target = selectedItem && selectedItem.kind !== 'run' ? positions.get(selectedItem.id) : undefined;

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodeClick={onNodeClick}
      onNodeMouseEnter={onHover ? (_e, n) => n.data.item.kind !== 'run' && onHover(n.data.item.nodes[0]!._id) : undefined}
      onNodeMouseLeave={onHover ? () => onHover(null) : undefined}
      defaultViewport={{ x: 28, y: 20, zoom: 1 }}
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
      <FollowSelection target={target} card={selectedItem?.kind === 'card'} />
      <Controls showInteractive={false} position="bottom-right" />
      <Panel position="top-right" className="tree-actions">
        <button onClick={() => setRevealed(() => new Set(allIds))}>Expand all</button>
        <button onClick={() => setRevealed(() => new Set())}>Collapse</button>
      </Panel>
      <Panel position="bottom-left" className="tree-legend" aria-label="Legend">
        <span>
          <i className="legend-dot inaccuracy" />
          Inaccuracy ?!
        </span>
        <span>
          <i className="legend-dot mistake" />
          Mistake ?
        </span>
        <span>
          <i className="legend-dot blunder" />
          Blunder ??
        </span>
        <span>
          <i className="legend-dash" />
          Engine line
        </span>
        <span>
          <i className="legend-dot user" />
          Your what-if
        </span>
      </Panel>
    </ReactFlow>
  );
}

function reveal(setRevealed: Props['setRevealed'], nodes: TreeNode[]) {
  setRevealed((prev) => new Set([...prev, ...nodes.map((n) => n._id)]));
}

/** "+1.25" for the position after this node's move; "#" results for finished games. */
function evalOf(analyses: Props['analyses'], node: TreeNode): string | undefined {
  const a = analyses[node.positionKey];
  if (!a) return undefined;
  const score: Score | undefined = a.terminal ? terminalScore(a.fen, a.terminal) : a.lines[0]?.score;
  if (a.terminal === 'checkmate') return 'mate';
  return score ? formatScore(score) : undefined;
}

/** The engine's choice in the position before the move, e.g. "15. fxe3". */
function bestMoveOf(analyses: Props['analyses'], parent: TreeNode): string | undefined {
  const san = analyses[parent.positionKey]?.lines[0]?.san[0];
  if (!san) return undefined;
  const [, turn, , , , fullmove] = parent.fen.split(' ');
  return turn === 'w' ? `${fullmove}. ${san}` : `${fullmove}… ${san}`;
}

/**
 * Pans to the selected item when it's out of view: after stepping with the arrow keys, or when
 * folding or resizing moves it. Only checks when one of those changes, so manual panning sticks.
 */
function FollowSelection({ target, card }: { target: { x: number; y: number } | undefined; card: boolean }) {
  const flow = useReactFlow();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);

  useEffect(() => {
    if (!target || !width || !height) return;
    const w = card ? 260 : 160;
    const h = card ? GEOMETRY.cardHeight : GEOMETRY.rowHeight;
    const { x, y, zoom } = flow.getViewport();
    const margin = 12;
    const visible =
      target.x * zoom + x >= margin &&
      (target.x + w) * zoom + x <= width - margin &&
      target.y * zoom + y >= margin &&
      (target.y + h) * zoom + y <= height - margin;
    if (!visible) flow.setCenter(target.x + w / 2, target.y + h / 2, { zoom, duration: 200 });
    // Re-check only when the item moves or the panel resizes.
  }, [target?.x, target?.y, card, width, height, flow]);

  return null;
}

/** Both handles sit on the dot, so lines join dot to dot. */
function Handles() {
  const style = { left: DOT.x, top: DOT.y };
  return (
    <>
      <Handle type="target" position={Position.Top} style={style} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} style={style} isConnectable={false} />
    </>
  );
}

function dotClass(node: TreeNode, data: ItemData, extra = '') {
  return ['metro-dot', node.classification ?? '', `source-${node.source}`, data.selected ? 'selected' : '', extra].join(' ');
}

function MoveLabel({ node }: { node: TreeNode }) {
  const label = moveLabel(node);
  const space = label.indexOf(' ');
  return (
    <>
      {space > 0 && <span className="metro-num">{label.slice(0, space + 1)}</span>}
      <span className="metro-san">{space > 0 ? label.slice(space + 1) : label}</span>
      {node.classification && GLYPHS[node.classification] && (
        <span className={`metro-glyph ${node.classification}`}>{GLYPHS[node.classification]}</span>
      )}
    </>
  );
}

const MoveItem = memo(function MoveItem({ data }: NodeProps<ItemNode>) {
  const node = data.item.nodes[0]!;
  return (
    <div className={`metro-item ${data.selected ? 'selected' : ''} source-${node.source}`} title={describe(node)}>
      <Handles />
      <span className={dotClass(node, data)} />
      <span className="metro-label">
        <MoveLabel node={node} />
      </span>
    </div>
  );
});

const CardItem = memo(function CardItem({ data }: NodeProps<ItemNode>) {
  const node = data.item.nodes[0]!;
  const verdict = node.classification === 'blunder' ? 'Blunder' : 'Mistake';
  return (
    <div className={`metro-item card ${data.selected ? 'selected' : ''}`} title={describe(node)}>
      <Handles />
      <span className={dotClass(node, data)} />
      <div className={`metro-card ${node.classification} ${data.selected ? 'selected' : ''}`}>
        <MiniBoard fen={node.fen} size={84} flipped={data.flipped} />
        <div className="metro-card-text">
          <span className="metro-label">
            <MoveLabel node={node} />
          </span>
          <span className={`metro-verdict ${node.classification}`}>
            {verdict}
            {node.winPercentLoss !== undefined && ` · −${node.winPercentLoss.toFixed(0)}%`}
          </span>
          {data.evalText && <span className="metro-meta">eval {data.evalText}</span>}
          {data.bestText && <span className="metro-meta">best {data.bestText}</span>}
        </div>
      </div>
    </div>
  );
});

const RunItem = memo(function RunItem({ data }: NodeProps<ItemNode>) {
  const { nodes } = data.item;
  const first = nodes[0]!;
  const last = nodes.at(-1)!;
  const mainline = first.source === 'game';
  return (
    <div className={`metro-item run source-${first.source}`} title={`${runText(nodes)}\nClick to expand`}>
      <Handles />
      <span className={dotClass(first, data, 'run')} />
      <span className="metro-label">
        <span className="metro-num">{moveLabel(first)}</span>
        {mainline ? (
          <span className="metro-num">
            {' '}
            … {moveLabel(last)} · {nodes.length} moves
          </span>
        ) : (
          <span className="metro-num"> … +{nodes.length}</span>
        )}
      </span>
    </div>
  );
});

const NODE_TYPES = { move: MoveItem, card: CardItem, run: RunItem };

/** Straight down the line, or down to the gap above the target row, across, and down into it. */
function ElbowEdge({ id, sourceX, sourceY, targetX, targetY, style }: EdgeProps) {
  let path: string;
  if (Math.abs(sourceX - targetX) < 1) {
    path = `M${sourceX} ${sourceY}V${targetY}`;
  } else {
    const turn = targetY - DOT.y - GEOMETRY.gap / 2;
    const r = 8;
    const dir = targetX > sourceX ? 1 : -1;
    path =
      `M${sourceX} ${sourceY}V${turn - r}Q${sourceX} ${turn} ${sourceX + dir * r} ${turn}` +
      `H${targetX - dir * r}Q${targetX} ${turn} ${targetX} ${turn + r}V${targetY}`;
  }
  return <BaseEdge id={id} path={path} style={style} />;
}

const EDGE_TYPES = { elbow: ElbowEdge };

/** "13. Qxd5 Bxh4 14. a4 …" — the folded moves, numbered, for the tooltip. */
function runText(nodes: TreeNode[]): string {
  return nodes.map((n, i) => (i === 0 || n.fen.split(' ')[1] === 'b' ? moveLabel(n) : n.moveSan)).join(' ');
}

function describe(node: TreeNode): string {
  const parts = [node.source === 'game' ? 'Played' : node.source === 'engine' ? 'Engine line' : 'Your what-if'];
  if (node.classification) parts.push(node.classification);
  if (node.winPercentLoss !== undefined && node.winPercentLoss >= 1) parts.push(`lost ${node.winPercentLoss.toFixed(0)}% win chance`);
  if (node.onlyMove) parts.push('only move');
  return parts.join(' · ');
}
