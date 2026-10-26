import type { ReactNode } from 'react';
import { SiteHeader } from '../components/SiteHeader';

type Question = { q: string; a: ReactNode };

/** The FAQ, by topic. Numbers here should match the code (thresholds in chess-core's classify.ts). */
const TOPICS: { title: string; questions: Question[] }[] = [
  {
    title: 'The basics',
    questions: [
      {
        q: 'What does Variant do?',
        a: (
          <p>
            You import a finished game and Variant turns it into a tree of positions. Stockfish checks every move, marks the
            mistakes, and adds the engine's better line where the game turned. You can step into those lines, try your own
            moves, and ask the coach about any position.
          </p>
        ),
      },
      {
        q: 'Who decides what is a good or bad move?',
        a: (
          <p>
            Stockfish, always. Every evaluation, label and engine line comes from the engine and plain code. The coach
            (an AI model) only explains what the engine found, and checks any line it mentions with the engine first.
          </p>
        ),
      },
      {
        q: 'Is it free?',
        a: (
          <p>
            Yes. Importing, analysis, the tree and what-ifs cost nothing. The coach runs on your own API key, so questions
            are billed by your AI provider, not by Variant (see "The coach" below).
          </p>
        ),
      },
    ],
  },
  {
    title: 'Importing',
    questions: [
      {
        q: 'How do I bring in a game?',
        a: (
          <p>
            Press <strong>Import game</strong>. Connect your Lichess or Chess.com username to pick from your 20 most recent
            finished games, or paste a PGN from anywhere.
          </p>
        ),
      },
      {
        q: 'Do you need my Lichess or Chess.com password?',
        a: <p>No. Only your public games are read, by username. You can change or disconnect a username in Settings.</p>,
      },
      {
        q: 'How long does analysis take?',
        a: (
          <p>
            Usually a minute or so for a full game. Stockfish looks at every position to depth 18 and keeps its top three
            lines. The page fills in live while it works, and you can leave and come back.
          </p>
        ),
      },
    ],
  },
  {
    title: 'Reading the analysis',
    questions: [
      {
        q: 'What do best, good, inaccuracy, mistake and blunder mean?',
        a: (
          <>
            <p>
              Each move is judged by how much it lowered your chance of winning, compared with the engine's best move. The
              chance comes from the engine's evaluation, the same way Lichess does it.
            </p>
            <ul>
              <li>
                <strong>Best:</strong> the engine's first choice.
              </li>
              <li>
                <strong>Good:</strong> lost less than 10 points of winning chance.
              </li>
              <li>
                <strong>Inaccuracy:</strong> lost 10 or more.
              </li>
              <li>
                <strong>Mistake:</strong> lost 20 or more.
              </li>
              <li>
                <strong>Blunder:</strong> lost 30 or more, or walked into (or let slip) a forced mate.
              </li>
            </ul>
            <p>
              A move in an already-won or already-lost position rarely counts as a mistake, because it barely changes the
              outcome.
            </p>
          </>
        ),
      },
      {
        q: 'Why does the tree only branch at some moves?',
        a: (
          <p>
            The tree branches at the game's turning points: mistakes and blunders, plus up to two "key moments" per player,
            their biggest slips in games without many mistakes. Each branch shows the line the engine would have played
            instead. Branching everywhere would hide the story of the game.
          </p>
        ),
      },
      {
        q: 'What is a what-if?',
        a: (
          <p>
            A move you try yourself. Move a piece on the board and it's added to the tree as a new branch, judged just like
            a game move. You can keep going from there, or remove it. Pawns reaching the last rank always become queens.
          </p>
        ),
      },
    ],
  },
  {
    title: 'The coach',
    questions: [
      {
        q: 'How does the coach work?',
        a: (
          <p>
            Each position has its own chat. The coach gets the engine's facts about the position and can check moves and
            lines with the engine before answering. Lines in its answers are clickable: preview them on the board, then add
            them to your tree. It also sees what you asked earlier on the same line of the game.
          </p>
        ),
      },
      {
        q: 'Why do I need my own API key?',
        a: (
          <p>
            Variant is free and doesn't charge for anything, so it can't pay for the AI either. With your own key, you pay
            your provider directly for the questions you ask, usually a few cents each.
          </p>
        ),
      },
      {
        q: 'Where do I get a key?',
        a: (
          <p>
            From{' '}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
              Anthropic
            </a>{' '}
            (keys start with <code>sk-ant-</code>) or{' '}
            <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">
              OpenRouter
            </a>{' '}
            (<code>sk-or-</code>). Both need a little prepaid credit. Paste the key in the chat panel, on your home page, or
            in Settings.
          </p>
        ),
      },
      {
        q: 'Is my key safe?',
        a: (
          <>
            <p>
              Your key is checked with your provider, then stored encrypted. The app never shows it again (only its last
              four characters), and it's only used for questions you ask. People viewing a game you shared can't ask
              questions, so they never spend your key.
            </p>
            <p>
              Like any app that calls an AI on your behalf, the server has to decrypt the key to use it. Setting a monthly
              spending limit with your provider keeps the worst case small. You can change or remove the key at any time in
              Settings.
            </p>
          </>
        ),
      },
    ],
  },
  {
    title: 'Sharing and privacy',
    questions: [
      {
        q: 'Who can see my games?',
        a: <p>Only you, unless you share a game.</p>,
      },
      {
        q: 'How does sharing work?',
        a: (
          <>
            <p>
              Press <strong>Share</strong> in a game's header, then <strong>Create link</strong>. Anyone with it can open the game, signed in
              or not, and see the whole tree: the analysis, your what-ifs and your chats with the coach.
            </p>
            <p>
              It's view only. Visitors can't move pieces, add or remove branches, or ask the coach anything. To stop
              sharing, open it again (it now says <strong>Shared</strong>) and press <strong>Stop sharing</strong>: the link stops
              working, and sharing again makes a new link.
            </p>
          </>
        ),
      },
      {
        q: 'What happens when I delete a game?',
        a: (
          <p>
            The game, its what-ifs and its chats are deleted, and any share link stops working. The engine's evaluations of
            positions are kept, since they're shared by every game that reaches the same position. They don't say who
            played it.
          </p>
        ),
      },
    ],
  },
];

/** `#/help`: how Variant works, as questions and answers. Works signed in or out. */
export function Help() {
  return (
    <div className="v2">
      <SiteHeader />
      <main className="v2-main help">
        <p className="eyebrow-mono">Help</p>
        <h1>How it works</h1>
        <p className="lead-deck">Import a game, see where it turned, explore the lines you didn't play, and ask about any move.</p>
        {TOPICS.map((topic) => (
          <section key={topic.title} className="help-topic">
            <h2>{topic.title}</h2>
            {topic.questions.map(({ q, a }) => (
              <details key={q} className="help-item">
                <summary>{q}</summary>
                <div className="help-answer">{a}</div>
              </details>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
