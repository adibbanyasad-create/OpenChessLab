import { availableParallelism, totalmem } from 'node:os';
import { LIMITS } from '../shared/limits.js';
import type { HardwareRecommendation } from '../shared/types.js';

export function recommendHardware(
  logicalCpus: number | undefined = availableParallelism(),
  totalMemoryBytes: number | null | undefined = safeTotalMemory(),
): HardwareRecommendation {
  const cpus =
    logicalCpus !== undefined && Number.isSafeInteger(logicalCpus) && logicalCpus > 0
      ? logicalCpus
      : 1;
  const totalMemoryMb =
    totalMemoryBytes !== undefined &&
    totalMemoryBytes !== null &&
    Number.isSafeInteger(totalMemoryBytes) &&
    totalMemoryBytes > 0
      ? Math.floor(totalMemoryBytes / 1_048_576)
      : null;
  const threads = Math.max(1, Math.min(LIMITS.maxThreads, cpus > 1 ? cpus - 1 : 1));
  const reasons = [
    threads >= cpus
      ? `Uses ${threads} thread${threads === 1 ? '' : 's'} because only ${cpus} logical CPU${cpus === 1 ? ' is' : 's are'} available.`
      : `Reserves one of ${cpus} logical CPUs for the interface, engine startup, and operating system.`,
    `Thread recommendations never exceed the application's ${LIMITS.maxThreads}-thread safety limit.`,
  ];
  let hashMb = 64;
  if (totalMemoryMb === null) {
    reasons.push('Total system memory is unavailable, so the conservative 64 MB default is used.');
  } else {
    // Keep hash comfortably below installed RAM and inside engine/server bounds.
    const candidates = [512, 256, 128, 64, 32, 16];
    hashMb =
      candidates.find((candidate) => candidate * 8 <= totalMemoryMb) ??
      (totalMemoryMb >= 128 ? 16 : 16);
    if (totalMemoryMb < 512) {
      reasons.push(
        `Only about ${totalMemoryMb} MB of RAM was detected, so hash stays at the 16 MB minimum.`,
      );
    } else {
      reasons.push(
        `Keeps hash near or below one-eighth of about ${totalMemoryMb} MB of RAM, within the 16-${LIMITS.maxHash} MB supported range.`,
      );
    }
  }
  return {
    threads,
    hashMb,
    logicalCpus: cpus,
    totalMemoryMb,
    reasons,
  };
}

function safeTotalMemory(): number | undefined {
  try {
    return totalmem();
  } catch {
    return undefined;
  }
}
