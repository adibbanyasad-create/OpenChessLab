// Tiny synthesized UI sounds: zero assets, zero network, mutable, and fully
// optional. Everything is generated with the Web Audio API on first use.

export type SoundName = 'move' | 'capture' | 'select' | 'check' | 'review' | 'brilliant';

const STORAGE_KEY = 'ocl-sound-v1';

function loadPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

let enabled = typeof localStorage === 'undefined' ? true : loadPreference();
let context: AudioContext | null = null;

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
  } catch {
    /* Preference persistence is best effort. */
  }
}

function audio(): AudioContext | null {
  if (!enabled || typeof AudioContext === 'undefined') return null;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    return context;
  } catch {
    return null;
  }
}

function tone(
  ctx: AudioContext,
  at: number,
  frequency: number,
  duration: number,
  type: OscillatorType,
  gain: number,
): void {
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(gain, at + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(envelope).connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.05);
}

export function playSound(name: SoundName): void {
  const ctx = audio();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    switch (name) {
      case 'move':
        tone(ctx, now, 340, 0.09, 'triangle', 0.16);
        tone(ctx, now + 0.015, 520, 0.07, 'sine', 0.1);
        break;
      case 'capture':
        tone(ctx, now, 210, 0.12, 'square', 0.07);
        tone(ctx, now + 0.02, 420, 0.1, 'triangle', 0.16);
        break;
      case 'select':
        tone(ctx, now, 660, 0.05, 'sine', 0.08);
        break;
      case 'check':
        tone(ctx, now, 740, 0.09, 'triangle', 0.14);
        tone(ctx, now + 0.1, 740, 0.12, 'triangle', 0.14);
        break;
      case 'review':
        tone(ctx, now, 440, 0.12, 'sine', 0.12);
        tone(ctx, now + 0.11, 560, 0.12, 'sine', 0.12);
        tone(ctx, now + 0.22, 700, 0.16, 'sine', 0.12);
        break;
      case 'brilliant':
        tone(ctx, now, 520, 0.1, 'triangle', 0.14);
        tone(ctx, now + 0.08, 660, 0.1, 'triangle', 0.14);
        tone(ctx, now + 0.16, 880, 0.22, 'triangle', 0.15);
        break;
    }
  } catch {
    /* Sound must never break the workspace. */
  }
}
