import { Fragment, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useSmoothText, useUIMessages, type UIMessage } from '@convex-dev/agent/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { lineResolver, type LineLink, type TextPiece } from '../lib/chatLines';
import type { GameTree, TreeNode } from '../lib/tree';
import { moveLabel } from '../lib/treeLayout';

const VERDICT_WORD = { inaccuracy: 'an inaccuracy', mistake: 'a mistake', blunder: 'a blunder' } as const;

/** What a message needs to turn the lines it mentions into board previews. */
type Lines = { tree: GameTree; onPreview: (link: LineLink) => void };

/** The chat for one position. Answers are grounded in the server's engine analysis and tools. */
export function NodeChat({
  node,
  ready,
  bestLabel,
  onSelect,
  tree,
  onPreview,
  previewing,
}: {
  node: TreeNode;
  ready: boolean;
  bestLabel?: string;
  /** Jumps to a position, e.g. a line the coach added to the tree. */
  onSelect: (id: Id<'nodes'>) => void;
  tree: GameTree;
  /** Shows a line the coach wrote on the board, without adding it to the tree. */
  onPreview: (link: LineLink) => void;
  /** Set while a line is previewed on the board: questions wait until it's in the tree. */
  previewing?: { inTree: boolean; saving: boolean; onKeep: () => void } | null;
}) {
  const lines: Lines = { tree, onPreview };
  const threadId = useQuery(api.chat.threadFor, { nodeId: node._id });
  const earlier = useQuery(api.chat.earlierThreads, { nodeId: node._id }) ?? [];
  const send = useMutation(api.chat.send);
  const { results: messages } = useUIMessages(
    api.chat.messages,
    threadId ? { threadId } : 'skip',
    { initialNumItems: 30, stream: true },
  );
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const last = messages.at(-1);
  const busy = sending || last?.role === 'user' || last?.status === 'pending' || last?.status === 'streaming';

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setSending(true);
    setError(null);
    try {
      await send({ nodeId: node._id, prompt: question });
      setDraft('');
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : 'Could not send. Try again.');
    } finally {
      setSending(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };

  if (!ready) return <p className="chat-note muted">Questions open once the analysis finishes.</p>;

  return (
    <section className="chat" aria-label="Ask about this position">
      {earlier.map((t, i) => (
        <EarlierChat key={t.threadId} {...t} open={i === earlier.length - 1} onSelect={onSelect} lines={lines} />
      ))}
      {earlier.length > 0 && <p className="chat-here">Here · {node.moveSan ? moveLabel(node) : 'Start'}</p>}

      {messages.length === 0 && !previewing && (
        <div className="chat-suggestions">
          {suggestions(node, bestLabel).map((q) => (
            <button key={q} className="chat-suggestion ghost" disabled={busy} onClick={() => void ask(q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <ol className="chat-log">
          {messages.map((m) => (
            <Message key={m.key} message={m} onSelect={onSelect} context={node} lines={lines} />
          ))}
          {last?.role === 'user' && <li className="chat-msg assistant muted">Thinking…</li>}
        </ol>
      )}

      {previewing ? (
        <div className="chat-previewing">
          <p>
            You're previewing a line. {previewing.inTree ? 'Go to it in the tree' : 'Add it to the tree'} to ask about
            the position on the board.
          </p>
          <button className="primary" onClick={previewing.onKeep} disabled={previewing.saving}>
            {previewing.inTree ? 'Go to it in the tree' : previewing.saving ? 'Adding…' : 'Add to tree'}
          </button>
        </div>
      ) : (
        <form className="chat-form" onSubmit={submit}>
          <textarea
            value={draft}
            placeholder={`Ask about ${node.moveSan ? moveLabel(node) : 'the starting position'}…`}
            rows={2}
            maxLength={1000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter adds a line.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask(draft);
              }
            }}
          />
          <button type="submit" className="primary" disabled={busy || !draft.trim()}>
            Ask
          </button>
        </form>
      )}
      {error && <p className="chat-error">{error}</p>}
    </section>
  );
}

/** A chat from an earlier move on this line, read-only; the coach sees it too. */
function EarlierChat({
  threadId,
  nodeId,
  label,
  open,
  onSelect,
  lines,
}: {
  threadId: string;
  nodeId: Id<'nodes'>;
  label: string;
  open: boolean;
  onSelect: (id: Id<'nodes'>) => void;
  lines: Lines;
}) {
  const context = lines.tree.byId.get(nodeId);
  const { results: messages } = useUIMessages(api.chat.messages, { threadId }, { initialNumItems: 30, stream: true });
  if (messages.length === 0 || !context) return null;
  const asked = messages.filter((m) => m.role === 'user').length;
  return (
    <details className="chat-earlier" open={open}>
      <summary>
        <span>
          At {label} · {asked} {asked === 1 ? 'question' : 'questions'}
        </span>
        <button
          className="chat-earlier-go ghost"
          onClick={(e) => {
            e.preventDefault();
            onSelect(nodeId);
          }}
        >
          Go to move
        </button>
      </summary>
      <ol className="chat-log">
        {messages.map((m) => (
          <Message key={m.key} message={m} onSelect={onSelect} context={context} lines={lines} />
        ))}
      </ol>
    </details>
  );
}

function Message({
  message,
  onSelect,
  context,
  lines,
}: {
  message: UIMessage;
  onSelect: (id: Id<'nodes'>) => void;
  /** The position the chat is about, which the lines in the answer start from. */
  context: TreeNode;
  lines: Lines;
}) {
  if (message.role === 'user') return <li className="chat-msg user">{message.text}</li>;
  const checks = message.parts.filter((p) => p.type.startsWith('tool-'));
  // Only the text after the last tool call is the answer; text between calls is the model's working.
  const lastCheck = message.parts.map((p) => p.type.startsWith('tool-')).lastIndexOf(true);
  const answer = message.parts
    .slice(lastCheck + 1)
    .flatMap((p) => (p.type === 'text' ? [p.text] : []))
    .join('');
  return (
    <li className="chat-msg assistant">
      {checks.length > 0 && (
        <div className="chat-checks">
          {checks.map((p, i) => (
            <ToolChip key={i} part={p as ToolPart} onSelect={onSelect} />
          ))}
        </div>
      )}
      <AssistantText text={answer} streaming={message.status === 'streaming'} context={context} lines={lines} />
      {message.status === 'failed' && (
        <p className="chat-error">The model didn't answer (busy or unavailable). Try again in a moment.</p>
      )}
    </li>
  );
}

function AssistantText({ text, streaming, context, lines }: { text: string; streaming: boolean; context: TreeNode; lines: Lines }) {
  const [visible] = useSmoothText(text, { startStreaming: streaming });
  // Lines become links once the answer is complete, so they don't flicker while it streams.
  const linkify = streaming || visible !== text ? undefined : lineResolver(lines.tree, context);
  return <>{paragraphs(visible, linkify && { linkify, onPreview: lines.onPreview })}</>;
}

type ToolPart = { type: string; state: string; output?: Record<string, unknown> | string };

/** Where a claim came from: each engine check or move check the model ran. */
function ToolChip({ part, onSelect }: { part: ToolPart; onSelect: (id: Id<'nodes'>) => void }) {
  const out = part.output;
  let label: string;
  if (part.state !== 'output-available' || !out) label = part.state === 'output-error' ? 'Check failed' : 'Checking…';
  // A tool that threw comes back as its error text.
  else if (typeof out === 'string') label = part.type === 'tool-evaluate' ? 'Engine unavailable' : 'Check failed';
  else if (typeof out.error === 'string') label = out.error;
  else if (part.type === 'tool-evaluate') {
    const lines = out.lines as { line: string }[] | undefined;
    label = `Engine ${out.score}${lines?.[0] ? ` · ${lines[0].line}` : ''}`;
  } else if (part.type === 'tool-add_branch' && typeof out.nodeId === 'string') {
    const nodeId = out.nodeId as Id<'nodes'>;
    return (
      <button className="chat-check chat-check-action" onClick={() => onSelect(nodeId)} title="Show this line on the board">
        Added {String(out.added)} · Show on board
      </button>
    );
  } else if (part.type === 'tool-play_moves') {
    label = typeof out.illegal === 'string' ? `Illegal: ${out.illegal}` : `Played ${out.line}`;
  } else label = part.type.slice(5);
  return (
    <span className="chat-check" title={label}>
      {label}
    </span>
  );
}

/**
 * Plain paragraphs with **bold**; enough for short coaching answers. With `links`, the move lines
 * in the text become buttons that preview them on the board.
 */
function paragraphs(
  text: string,
  links?: { linkify: (text: string) => TextPiece[]; onPreview: (link: LineLink) => void },
): ReactNode[] {
  const inline = (chunk: string) =>
    (links ? links.linkify(chunk) : [chunk]).map((piece, k) =>
      typeof piece === 'string' ? (
        <Fragment key={k}>{piece}</Fragment>
      ) : (
        <button key={k} className="line-link" onClick={() => links!.onPreview(piece.link)} title="Preview this line on the board">
          {piece.text}
        </button>
      ),
    );
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p, i) => (
      <p key={i}>
        {p.split(/(\*\*[^*]+\*\*)/).map((chunk, j) =>
          chunk.startsWith('**') && chunk.endsWith('**') ? (
            <strong key={j}>{inline(chunk.slice(2, -2))}</strong>
          ) : (
            <Fragment key={j}>{inline(chunk)}</Fragment>
          ),
        )}
      </p>
    ));
}

function suggestions(node: TreeNode, bestLabel?: string): string[] {
  const out: string[] = [];
  const toMove = node.fen.split(' ')[1] === 'w' ? 'White' : 'Black';
  const c = node.classification;
  if (node.moveSan && (c === 'inaccuracy' || c === 'mistake' || c === 'blunder')) {
    out.push(`Why is ${node.moveSan} ${VERDICT_WORD[c]}?`);
    if (bestLabel) out.push(`What's the idea behind ${bestLabel.replace(/^\d+(\.|…) /, '')}?`);
  } else if (node.keyMoment && bestLabel) {
    out.push(`Why was ${bestLabel.replace(/^\d+(\.|…) /, '')} better?`);
  }
  out.push(`What should ${toMove} play here?`);
  out.push('What are the plans for both sides?');
  return out.slice(0, 3);
}
