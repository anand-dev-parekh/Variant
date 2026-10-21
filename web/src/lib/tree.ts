import type { Doc, Id } from '../../convex/_generated/dataModel';

export type TreeNode = Doc<'nodes'>;

const SOURCE_ORDER = { game: 0, engine: 1, user: 2 } as const;

/** Index over a game's nodes: lookups by id, ordered children, and the main line. */
export class GameTree {
  readonly byId = new Map<Id<'nodes'>, TreeNode>();
  readonly root: TreeNode;
  readonly mainline: TreeNode[];
  private children = new Map<Id<'nodes'> | undefined, TreeNode[]>();

  constructor(nodes: TreeNode[]) {
    for (const node of nodes) {
      this.byId.set(node._id, node);
      const siblings = this.children.get(node.parentId) ?? [];
      siblings.push(node);
      this.children.set(node.parentId, siblings);
    }
    // The played move comes first, then engine alternatives, then the user's what-ifs.
    for (const list of this.children.values()) {
      list.sort((a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || a._creationTime - b._creationTime);
    }

    const root = this.children.get(undefined)?.[0];
    if (!root) throw new Error('Game has no root position');
    this.root = root;
    this.mainline = [root];
    for (let n = this.next(root); n && n.source === 'game'; n = this.next(n)) this.mainline.push(n);
  }

  childrenOf(node: TreeNode): TreeNode[] {
    return this.children.get(node._id) ?? [];
  }

  parentOf(node: TreeNode): TreeNode | undefined {
    return node.parentId ? this.byId.get(node.parentId) : undefined;
  }

  /** The continuation of the line `node` is on: the played move on the main line, else the first child. */
  next(node: TreeNode): TreeNode | undefined {
    const kids = this.childrenOf(node);
    return kids.find((k) => k.source === node.source) ?? kids[0];
  }

  /** `node` and the moves that follow it along its line. */
  lineFrom(node: TreeNode): TreeNode[] {
    const line = [node];
    for (let n = this.next(node); n; n = this.next(n)) line.push(n);
    return line;
  }

  /** Alternatives to the move into `node`: its siblings that aren't the played move. */
  alternativesTo(node: TreeNode): TreeNode[] {
    const parent = this.parentOf(node);
    return parent ? this.childrenOf(parent).filter((k) => k._id !== node._id) : [];
  }
}
