import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useSmoothText, useUIMessages, type UIMessage } from '@convex-dev/agent/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { TreeNode } from '../lib/tree';
import { moveLabel } from '../lib/treeLayout';

const VERDICT_WORD = { inaccuracy: 'an inaccuracy', mistake: 'a mistake', blunder: 'a blunder' } as const;

/** The chat for one position. Answers are grounded in the server's engine analysis and tools. */
export function NodeChat({
  node,
  ready,
  bestLabel,
  onSelect,
}: {
  node: TreeNode;
  ready: boolean;
  bestLabel?: string;
  /** Jumps to a position, e.g. a line the coach added to the tree. */
  onSelect: (id: Id<'nodes'>) => void;
}) {
  const threadId = useQuery(api.chat.threadFor, { nodeId: node._id });
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
      {messages.length === 0 && (
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
            <Message key={m.key} message={m} onSelect={onSelect} />
          ))}
          {last?.role === 'user' && <li className="chat-msg assistant muted">Thinking…</li>}
        </ol>
      )}

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
      {error && <p className="chat-error">{error}</p>}
    </section>
  );
}

function Message({ message, onSelect }: { message: UIMessage; onSelect: (id: Id<'nodes'>) => void }) {
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
      <AssistantText text={answer} streaming={message.status === 'streaming'} />
      {message.status === 'failed' && (
        <p className="chat-error">The model didn't answer (busy or unavailable). Try again in a moment.</p>
      )}
    </li>
  );
}

function AssistantText({ text, streaming }: { text: string; streaming: boolean }) {
  const [visible] = useSmoothText(text, { startStreaming: streaming });
  return <>{paragraphs(visible)}</>;
}

type ToolPart = { type: string; state: string; output?: Record<string, unknown> };

/** Where a claim came from: each engine check or move check the model ran. */
function ToolChip({ part, onSelect }: { part: ToolPart; onSelect: (id: Id<'nodes'>) => void }) {
  const out = part.output;
  let label: string;
  if (part.state !== 'output-available' || !out) label = part.state === 'output-error' ? 'Check failed' : 'Checking…';
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

/** Plain paragraphs with **bold**; enough for short coaching answers. */
function paragraphs(text: string): ReactNode[] {
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p, i) => (
      <p key={i}>
        {p.split(/(\*\*[^*]+\*\*)/).map((chunk, j) =>
          chunk.startsWith('**') && chunk.endsWith('**') ? <strong key={j}>{chunk.slice(2, -2)}</strong> : chunk,
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
