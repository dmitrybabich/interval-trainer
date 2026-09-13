import { assignFingering, MAX_FRET, positionsForMidi } from "@/lib/fretboard";

// The melody line (track 0) of Любэ — Конь, as MIDI note numbers. A real tune that
// spans D3–G4, so a good fingering must move across strings and stay in a low hand
// position rather than crawling up one string.
// prettier-ignore
const KON_MELODY = [
  57,57,59,59,60,60,59,59,57,57,55,55,53,53,52,52,57,57,55,55,57,57,59,59,60,60,60,60,62,62,64,64,57,57,57,57,65,65,64,64,
  62,62,64,64,62,62,60,60,59,59,60,60,57,57,59,59,60,60,60,60,60,60,62,62,64,64,59,59,60,60,57,57,57,57,57,65,65,64,64,62,
  62,64,64,62,62,60,60,59,59,60,60,57,57,59,59,60,60,60,60,60,60,62,62,64,64,59,59,60,60,57,57,57,57,59,59,60,60,59,59,57,
  57,55,55,53,53,52,52,57,57,55,55,57,57,59,60,60,60,60,62,64,57,57,57,57,65,65,64,64,62,62,64,64,62,62,60,60,59,59,60,60,
  59,59,61,61,62,62,61,61,59,59,57,57,55,55,54,54,59,59,57,57,59,59,61,61,62,62,62,62,64,64,66,66,59,59,59,59,67,67,66,66,
  64,64,66,66,64,64,62,62,61,61,62,62,59,61,62,62,62,64,66,61,62,59,
];

function fingeringFrets(midis: readonly number[]) {
  const notes = midis.map((midi, i) => ({ t: i * 0.25, midi, dur: 0.25 }));
  return assignFingering(notes);
}

describe("fretboard fingering", () => {
  it("keeps a real melody in a low, tight hand position across strings", () => {
    const fing = fingeringFrets(KON_MELODY);
    const frets = fing.map((pos) => pos.fret);

    // Every position is physically reachable.
    expect(Math.min(...frets)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...frets)).toBeLessThanOrEqual(MAX_FRET);

    // It doesn't crawl up one string: this melody must use several strings.
    const strings = new Set(fing.map((pos) => pos.string));
    expect(strings.size).toBeGreaterThanOrEqual(3);

    // It stays in a low hand position (no high-fret detours like the "22" bug).
    expect(Math.max(...frets)).toBeLessThanOrEqual(9);

    // No wild jumps between consecutive notes (the hand slides at most a few frets).
    let maxJump = 0;
    for (let i = 1; i < frets.length; i++) maxJump = Math.max(maxJump, Math.abs((frets[i] ?? 0) - (frets[i - 1] ?? 0)));
    expect(maxJump).toBeLessThanOrEqual(5);
  });

  it("prefers a low fret when a pitch is reachable on several strings", () => {
    // A4 (69) sits at fret 2 on the high E string — far lower than fret 14 on the A
    // string. A single-note fingering should take the low one.
    const [only] = fingeringFrets([69]);
    expect(only?.fret).toBeLessThanOrEqual(5);
  });

  it("offers multiple positions for a mid-range pitch", () => {
    // G3 (55) is reachable on the low E, A, D and G strings.
    expect(positionsForMidi(55).length).toBeGreaterThanOrEqual(4);
  });
});
