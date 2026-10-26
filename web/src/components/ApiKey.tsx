import { useAction, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useState, type FormEvent } from 'react';
import { api } from '../../convex/_generated/api';

/** Add (or replace) the user's own LLM key. The server checks it with the provider before saving. */
export function ApiKeyForm({ onDone }: { onDone?: () => void }) {
  const save = useAction(api.apiKeys.save);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await save({ key });
      setKey('');
      onDone?.();
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : 'Could not save the key. Try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="api-key-form" onSubmit={(e) => void submit(e)}>
      {!onDone && (
        <p className="chat-note">
          The coach runs on your own API key, so you pay your provider directly (a few cents a question). Paste an{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
            Anthropic
          </a>{' '}
          or{' '}
          <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">
            OpenRouter
          </a>{' '}
          key.
        </p>
      )}
      <div className="api-key-row">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-… or sk-or-…"
          autoComplete="off"
          spellCheck={false}
        />
        <button className="primary" type="submit" disabled={saving || !key.trim()}>
          {saving ? 'Checking…' : 'Save key'}
        </button>
        {onDone && (
          <button type="button" className="ghost" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
      {error && <p className="chat-error">{error}</p>}
      <p className="muted api-key-note">
        Stored encrypted and only used for your questions. Setting a spending limit with your provider is a good idea.
      </p>
    </form>
  );
}

/** "Using your Anthropic key ····abcd", with Change and Remove (which asks first). */
export function ApiKeyStatus({ name, last4 }: { name: string; last4: string }) {
  const remove = useMutation(api.apiKeys.remove);
  const [mode, setMode] = useState<'shown' | 'changing' | 'removing'>('shown');
  if (mode === 'changing') return <ApiKeyForm onDone={() => setMode('shown')} />;
  return (
    <p className="muted api-key-status">
      Using your {name} key ····{last4} ·{' '}
      {mode === 'removing' ? (
        <>
          Remove it?{' '}
          <button className="link danger" onClick={() => void remove()}>
            Remove
          </button>{' '}
          <button className="link" onClick={() => setMode('shown')}>
            Keep
          </button>
        </>
      ) : (
        <>
          <button className="link" onClick={() => setMode('changing')}>
            Change
          </button>{' '}
          ·{' '}
          <button className="link" onClick={() => setMode('removing')}>
            Remove
          </button>
        </>
      )}
    </p>
  );
}

/** The key's status, or the form to add one. Nothing while it loads. */
export function ApiKeySetting() {
  const apiKey = useQuery(api.apiKeys.mine);
  if (apiKey === undefined) return null;
  return apiKey ? <ApiKeyStatus name={apiKey.name} last4={apiKey.last4} /> : <ApiKeyForm />;
}
