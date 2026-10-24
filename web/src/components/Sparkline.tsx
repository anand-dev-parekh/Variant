const W = 300;
const H = 40;
/** Evaluations past this many pawns draw at the edge. */
const CLAMP = 5;

/** A game's evaluation as a thin line over a shaded area, White's advantage up. */
export function Sparkline({ evals, className, label }: { evals: number[]; className?: string; label: string }) {
  if (evals.length < 2) return null;
  const mid = H / 2;
  const points = evals
    .map((v, i) => `${((i / (evals.length - 1)) * W).toFixed(1)},${(mid - (Math.max(-CLAMP, Math.min(CLAMP, v)) / CLAMP) * (mid - 2)).toFixed(1)}`)
    .join(' ');
  return (
    <svg className={`sparkline ${className ?? ''}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <line x1="0" y1={mid} x2={W} y2={mid} className="sparkline-axis" />
      <polygon points={`0,${mid} ${points} ${W},${mid}`} className="sparkline-area" />
      <polyline points={points} className="sparkline-line" />
    </svg>
  );
}
