import { SignInButtons } from '../components/Account';
import { SiteHeader } from '../components/SiteHeader';
import { OPERA_STOPS, TreeSketch } from '../components/TreeSketch';

const STEPS = [
  {
    label: '01 · Import',
    title: 'From Lichess, Chess.com, or a PGN.',
    body: 'Connect your username and pick a recent game, or paste one from anywhere. The whole game becomes a tree of positions.',
  },
  {
    label: '02 · Turning points',
    title: 'See where it was decided.',
    body: 'Stockfish checks every move. Mistakes are marked, and the tree branches only where the game turned.',
  },
  {
    label: '03 · What-ifs',
    title: 'Play the move you missed.',
    body: "Step into the engine's alternatives, or try your own moves and see where they lead.",
  },
];

/** The signed-out home: what Variant does, with the Opera Game drawn as a tree, and sign-in. */
export function Landing() {
  return (
    <div className="v2">
      <SiteHeader>
        <a className="site-header-link" href="#/help">
          How it works
        </a>
        <a className="site-header-link" href="#coach">
          The coach
        </a>
      </SiteHeader>
      <main className="v2-main">
        <section className="lead">
          <div className="lead-text">
            <p className="eyebrow-mono">Import a game · see it as a tree</p>
            <h1>
              Every game is a tree. <span className="quiet">Explore the branches you didn't play.</span>
            </h1>
            <p className="lead-deck">
              Import a finished game. Variant finds the moments that decided it and lets you walk every line that could
              have happened instead.
            </p>
            <SignInButtons />
            <p className="lead-small muted">Your games stay private unless you share them.</p>
          </div>
          <figure className="lead-figure">
            <div className="lead-card">
              <div className="lead-card-head">
                <span>Morphy vs Duke Karl / Count Isouard</span>
                <span className="muted mono">Paris 1858 · 1–0</span>
              </div>
              <TreeSketch stops={OPERA_STOPS} />
            </div>
            <figcaption className="lead-caption">
              The Opera Game, as Variant shows it: two mistakes, and the engine's better lines beside them.
            </figcaption>
          </figure>
        </section>

        <section id="how" className="totals steps-strip" aria-label="How it works">
          {STEPS.map((s) => (
            <div key={s.label} className="step">
              <span className="total-label">{s.label}</span>
              <span className="step-title">{s.title}</span>
              <span className="step-body">{s.body}</span>
            </div>
          ))}
        </section>

        <section id="coach" className="coach-demo" aria-label="The coach">
          <div className="coach-demo-text">
            <p className="eyebrow-mono">The coach</p>
            <h2>
              Ask about any move. <span className="quiet">Every line it gives is checked by the engine first.</span>
            </h2>
            <p className="lead-deck">Lines in its answers are clickable: preview them on the board, then add them to your tree.</p>
          </div>
          <div className="coach-demo-card">
            <div className="coach-demo-question">Why was 9… b5 a blunder?</div>
            <p>
              It opens lines toward Black's king while it is still in the center. After{' '}
              <span className="chat-line-demo">10. Nxb5 cxb5 11. Bxb5+</span> White's pieces pour in, and{' '}
              <span className="chat-line-demo">9… Qc7</span> was the safer choice.
            </p>
          </div>
        </section>

        <section className="cta-bar" aria-label="Get started">
          <span className="cta-bar-title">Review your last game.</span>
          <span className="muted">Sign in with Google or GitHub to import your first one.</span>
          <SignInButtons />
        </section>
      </main>
      <footer className="site-footer">
        <span className="site-footer-mark">Variant</span>
        <a className="site-header-link" href="#/help">
          How it works and FAQ
        </a>
      </footer>
    </div>
  );
}
