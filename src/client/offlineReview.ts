import { useCallback, useEffect, useRef, useState } from 'react';
import { assembleReview, type PositionAnalysis } from '../shared/review';
import type { AnalysisResult, GameData, ReviewResult } from '../shared/types';
import { isOfflineEngineAvailable, useOfflineJob } from './offlineEngine';

// Runs a full game review on-device by chaining sequential offline searches,
// one per ply, then assembling with the shared review module (identical
// classification, uncertainty, and summary semantics as server reviews).

export function useOfflineReview() {
  const [review, setReview] = useState<ReviewResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [reviewedPgn, setReviewedPgn] = useState('');
  const sequence = useRef(0);
  const offline = useOfflineJob();

  const cancel = useCallback(() => {
    sequence.current++;
    offline.cancel();
    setBusy(false);
    setProgress('');
  }, [offline]);

  const run = useCallback(
    async (game: GameData, depth: number): Promise<ReviewResult | undefined> => {
      if (!isOfflineEngineAvailable()) {
        setError('Offline reviews need Web Workers, which this browser blocks.');
        return undefined;
      }
      const runSequence = ++sequence.current;
      const alive = () => runSequence === sequence.current;
      setBusy(true);
      setError('');
      setProgress('');
      setReview(undefined);
      const started = performance.now();
      try {
        const positions: PositionAnalysis[] = [];
        for (const [ply, fen] of game.positions.entries()) {
          if (!alive()) return undefined;
          setProgress(`Reviewing position ${ply + 1} of ${game.positions.length}`);
          const analysis: AnalysisResult | undefined = await offline.run({
            fen,
            depth,
            multiPv: 1,
            timeLimitMs: 1_500,
          });
          if (!alive()) return undefined;
          if (!analysis?.lines[0]) {
            if (offline.stopped) return undefined;
            throw new Error(
              offline.error || 'The offline engine stopped answering during the review.',
            );
          }
          positions.push({
            score: analysis.lines[0].score,
            depth: analysis.completedDepth,
            depthLimited: analysis.depthLimited,
            bestMove: analysis.bestMove,
            pv: analysis.lines[0].pv,
            san: analysis.lines[0].san,
          });
        }
        if (!alive()) return undefined;
        const result = assembleReview(
          game,
          positions,
          'stockfish-offline',
          { depth, threads: 1, hash: 16, multiPv: 1 },
          Math.round(performance.now() - started),
        );
        result.warnings = [
          'Offline review on this device: single-threaded build, results may differ from server runs.',
        ];
        setReview(result);
        setReviewedPgn(game.pgn);
        setBusy(false);
        setProgress('');
        return result;
      } catch (error) {
        if (!alive()) return undefined;
        setBusy(false);
        setProgress('');
        setError(error instanceof Error ? error.message : 'Offline review failed.');
        return undefined;
      }
    },
    [offline],
  );

  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );

  return { review, reviewedPgn, busy, error, progress, run, cancel };
}
