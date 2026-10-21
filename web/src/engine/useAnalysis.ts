import { useEffect, useRef, useState } from 'react';
import { StockfishEngine, type Analysis } from './stockfish';

const DEPTH = 20;

/** Live engine analysis of `fen`. Returns null until the first line arrives. */
export function useAnalysis(fen: string | null, enabled: boolean): Analysis | null {
  const engineRef = useRef<StockfishEngine | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  useEffect(() => {
    const engine = new StockfishEngine();
    engineRef.current = engine;
    return () => {
      engine.terminate();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    setAnalysis(null);
    if (!engine || !fen || !enabled) {
      engine?.stop();
      return;
    }
    engine.analyze(fen, DEPTH, setAnalysis);
  }, [fen, enabled]);

  // Never show lines computed for a different position.
  return analysis && analysis.fen === fen ? analysis : null;
}
