import { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import type { HardwareRecommendation, SearchSettings } from '../../shared/types';
import { api } from '../api';

export function HardwareRecommendation({
  settings,
  setSettings,
}: {
  settings: SearchSettings;
  setSettings: (settings: SearchSettings) => void;
}) {
  const [recommendation, setRecommendation] = useState<HardwareRecommendation>();
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void api<HardwareRecommendation>('/hardware/recommendations', { signal: controller.signal })
      .then(setRecommendation)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Recommendations are unavailable.');
        }
      });
    return () => controller.abort();
  }, []);

  if (error) return null;
  if (!recommendation) return <p className="tiny muted">Checking this machine…</p>;
  const applied =
    settings.threads === recommendation.threads && settings.hash === recommendation.hashMb;

  return (
    <div className="hardware-recommendation">
      <span className="hardware-icon">
        <Cpu size={15} />
      </span>
      <div>
        <strong>
          Recommended for this machine: {recommendation.threads} thread
          {recommendation.threads === 1 ? '' : 's'}, {recommendation.hashMb} MB hash
        </strong>
        <span>{recommendation.reasons.join(' ')}</span>
        {!applied && (
          <button
            className="text-button tiny"
            onClick={() =>
              setSettings({
                ...settings,
                threads: recommendation.threads,
                hash: recommendation.hashMb,
              })
            }
          >
            Apply recommendation
          </button>
        )}
      </div>
    </div>
  );
}
