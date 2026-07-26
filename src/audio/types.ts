// Soundfont-player has no @types package; declare the shape we use.
export interface SoundfontInstrument {
  play(midi: number, when?: number, opts?: { duration?: number; gain?: number }): void;
}

export type SoundBadgeState = "loading" | "real" | "synth";

export interface PitchSample {
  // Fractional MIDI (null when not singing / muted / low-clarity).
  midi: number | null;
  // Raw pitchy outputs for tests/debugging.
  freq: number;
  clarity: number;
  rms: number;
  // Whether the loop should treat this frame as a valid sung pitch.
  singing: boolean;
  muted: boolean;
}
