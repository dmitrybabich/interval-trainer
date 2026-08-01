import { PitchDetector } from "pitchy";

import type { PitchSample, SoundfontInstrument } from "@/audio/types";
import {
  CLARITY_THRESHOLD,
  DRONE_VOICE_RMS,
  FFT_SIZE,
  MIN_VOLUME_DB,
  PIANO_GAIN,
  PITCH_HZ_MAX,
  PITCH_HZ_MIN,
  SEC_PER_BEAT,
} from "@/lib/constants";
import { freqToMidiFloat } from "@/lib/music";

interface DroneHandle {
  oscs: OscillatorNode[];
  gain: GainNode;
}

/**
 * Owns AudioContext, mic input, pitchy detector, and the sampled/synth piano.
 * Purely imperative — no React inside. Ports every Web Audio primitive from the
 * original single-file app.
 */
export class AudioEngine {
  audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private detector: PitchDetector<Float32Array<ArrayBuffer>> | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private micStream: MediaStream | null = null;

  private piano: SoundfontInstrument | null = null;
  private pianoLoading = false;

  private drone: DroneHandle | null = null;

  // AudioContext.currentTime at which we stop ignoring the mic (the app is playing
  // through the speakers). Ports the muteUntil field on the old S god-object.
  private muteUntil = 0;

  isReady(): boolean {
    return this.analyser !== null && this.audioCtx !== null;
  }

  isPianoLoaded(): boolean {
    return this.piano !== null;
  }

  isPianoLoading(): boolean {
    return this.pianoLoading;
  }

  hasDrone(): boolean {
    return this.drone !== null;
  }

  now(): number {
    return this.audioCtx?.currentTime ?? 0;
  }

  isMuted(): boolean {
    if (!this.audioCtx) return false;
    return this.audioCtx.currentTime < this.muteUntil;
  }

  /**
   * Ignore the mic until `sec` seconds from now, so speaker output doesn't get
   * heard as "you're on pitch." A small tail covers the room ringing out.
   */
  deafenUntil(sec: number): void {
    if (!this.audioCtx) return;
    this.muteUntil = Math.max(this.muteUntil, this.audioCtx.currentTime + sec);
  }

  async startMic(onMicDenied: (message: string) => void): Promise<void> {
    if (this.analyser) return; // already running — reuse it
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();
    this.audioCtx = ctx;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      onMicDenied("Mic access denied. Allow the microphone and reload.");
      throw e;
    }
    this.micStream = stream;

    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    src.connect(analyser);
    this.analyser = analyser;

    const detector = PitchDetector.forFloat32Array(analyser.fftSize);
    detector.minVolumeDecibels = MIN_VOLUME_DB;
    this.detector = detector;
    this.buf = new Float32Array(analyser.fftSize);

    // fetch the sampled piano in the background — synth covers the gap
    void this.loadPiano();
  }

  /**
   * Load a real sampled grand piano (MusyngKite soundfont) via soundfont-player.
   * Best-effort: if the network/CDN is unavailable we just keep the synth.
   */
  async loadPiano(): Promise<void> {
    if (this.piano || this.pianoLoading || !this.audioCtx) return;
    this.pianoLoading = true;
    try {
      const Soundfont = (await import("soundfont-player")).default;
      this.piano = await Soundfont.instrument(this.audioCtx, "acoustic_grand_piano", {
        soundfont: "MusyngKite",
      });
    } catch {
      this.piano = null; // stay on the synth
    } finally {
      this.pianoLoading = false;
    }
  }

  /**
   * Resolve when the piano is ready, it gave up (synth fallback), or ~6s passes.
   * Guards against playing the very first note synthetic before samples arrive.
   */
  async waitForPiano(capMs = 6000): Promise<void> {
    if (this.piano || !this.pianoLoading) return;
    const POLL_MS = 80;
    const start = performance.now();
    while (this.pianoLoading && performance.now() - start < capMs) {
      this.deafenUntil(0.3); // keep the cue on "listen", not premature "sing now"
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }

  /**
   * Play one reference note as a sampled piano if available, else the synth
   * (sustained). `dur` sets how long the key is "held" before release.
   */
  refNote(freq: number, when: number, dur: number, gain: number): void {
    if (!this.audioCtx) return;
    if (this.piano) {
      const midi = Math.round(freqToMidiFloat(freq));
      this.piano.play(midi, when, { duration: dur, gain: gain * PIANO_GAIN });
    } else {
      this.pianoNote(freq, when, dur, gain, true);
    }
  }

  /**
   * Simple plucked-string / piano-ish synth voice: 5 partials, sharp attack, LP
   * filter sweep. sustain=false = plucky decay; sustain=true = holds for `dur`.
   */
  pianoNote(freq: number, start: number, dur = 2.0, gain = 0.5, sustain = false): void {
    const ac = this.audioCtx;
    if (!ac) return;
    const master = ac.createGain();
    master.gain.value = gain;

    // gentle lowpass so upper harmonics fade over the decay
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(Math.min(freq * 8, 8000), start);
    lp.frequency.exponentialRampToValueAtTime(Math.max(freq * 2, 400), start + Math.min(dur, 2.5));
    lp.connect(master).connect(ac.destination);

    // partials: fundamental + a few overtones, each quieter and decaying faster
    const partials = [
      { mult: 1, amp: 1.0, decay: dur },
      { mult: 2, amp: 0.45, decay: dur * 0.7 },
      { mult: 3, amp: 0.22, decay: dur * 0.5 },
      { mult: 4, amp: 0.12, decay: dur * 0.4 },
      { mult: 5.02, amp: 0.07, decay: dur * 0.3 }, // slightly inharmonic = stringy
    ];
    const rel = 0.25; // release tail

    for (const p of partials) {
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * p.mult;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(p.amp, start + 0.006); // sharp attack
      let stop: number;
      if (sustain) {
        // decay to steady body, hold, then release; higher partials settle lower
        // so the sustained tone mellows.
        const body = p.amp * (p.mult === 1 ? 0.6 : 0.28);
        g.gain.exponentialRampToValueAtTime(Math.max(body, 0.0002), start + 0.25);
        g.gain.setValueAtTime(Math.max(body, 0.0002), start + dur - rel);
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        stop = start + dur + 0.05;
      } else {
        g.gain.exponentialRampToValueAtTime(0.0001, start + p.decay); // long decay
        stop = start + p.decay + 0.05;
      }
      osc.connect(g).connect(lp);
      osc.start(start);
      osc.stop(stop);
    }
  }

  /** Short synth beep for the "you nailed it" confirmation. */
  tone(freq: number, start: number, dur: number, gain = 0.22, type: OscillatorType = "sine"): void {
    const ac = this.audioCtx;
    if (!ac) return;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.02);
    g.gain.setValueAtTime(gain, start + dur - 0.05);
    g.gain.linearRampToValueAtTime(0, start + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  /**
   * Play the whole target sequence spaced by `gap`. Notes ring 1.2s; we reopen
   * the mic right after the LAST note sounds (its tail is quiet).
   */
  playTargets(freqs: readonly number[]): void {
    if (!this.audioCtx) return;
    const t0 = this.audioCtx.currentTime + 0.05;
    const gap = 1.0;
    const dur = 1.2;
    const gain = 0.5;
    freqs.forEach((freq, i) => this.refNote(freq, t0 + i * gap, dur, gain));
    this.deafenUntil(0.05 + (freqs.length - 1) * gap + 0.9);
  }

  /**
   * Ladder rung-1 primer: play the song-anchor melody in its own rhythm (each
   * note carries relative `beats`), a breath, then the bare interval slow and
   * clear — so the ear hooks the interval to a melody it already knows. Empty
   * `anchor` = skip straight to the bare interval. Mic deafened throughout.
   */
  playAnchorPrimer(
    anchor: readonly { freq: number; beats: number }[],
    intervalFreqs: readonly number[],
  ): void {
    if (!this.audioCtx) return;
    const start = this.audioCtx.currentTime + 0.05;
    const BREATH_S = 0.5;
    const LEAP_DUR_S = 1.0;
    const LEAP_GAP_S = 1.0;
    let t = start;
    anchor.forEach(({ freq, beats }) => {
      const dur = beats * SEC_PER_BEAT;
      this.refNote(freq, t, dur * 0.92, 0.5); // slight gap between notes
      t += dur;
    });
    if (anchor.length > 0) t += BREATH_S;
    intervalFreqs.forEach((freq) => {
      this.refNote(freq, t, LEAP_DUR_S, 0.5);
      t += LEAP_GAP_S;
    });
    this.deafenUntil(t - start + 0.4);
  }

  /**
   * Replay the START (anchor) note. Always the first note — never a by-ear target
   * since ear mode would then leak the answer.
   */
  playHint(startFreq: number): void {
    if (!this.audioCtx) return;
    this.refNote(startFreq, this.audioCtx.currentTime + 0.05, 2.0, 0.5);
    this.deafenUntil(0.05 + 2.0 + 0.4);
  }

  /**
   * Play the current target quietly UNDER your voice WITHOUT deafening the mic —
   * you're singing the same pitch so its bleed is harmless.
   */
  playSupport(freq: number, dur: number): void {
    if (!this.audioCtx) return;
    // Kept quiet (0.12, ~30% of the old 0.4) so it underpins your voice while you
    // hold the pitch without drowning it out.
    this.refNote(freq, this.audioCtx.currentTime + 0.02, dur, 0.12);
  }

  /**
   * "You found it" confirmation: play the target on piano the instant you first
   * overlap it while seeking, and deafen the mic during playback so the speaker
   * bleed isn't mis-scored. Short so it doesn't stall your hold.
   */
  playFoundNote(freq: number): void {
    if (!this.audioCtx) return;
    const dur = 0.7;
    this.refNote(freq, this.audioCtx.currentTime + 0.02, dur, 0.5);
    this.deafenUntil(0.02 + dur + 0.15);
  }

  /**
   * Easy-mode guide tone: quiet continuous synthetic drone at `freq`. Does NOT
   * deafen the mic — a loudness gate in the pitch loop separates voice from bleed.
   */
  startDrone(freq: number): void {
    this.stopDrone();
    if (!this.audioCtx) return;
    const ac = this.audioCtx;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0.0105, ac.currentTime + 0.15); // soft fade-in
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.max(freq * 1.5, 300);
    lp.connect(gain).connect(ac.destination);
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(lp);
    o.start();
    this.drone = { oscs: [o], gain };
  }

  stopDrone(): void {
    if (!this.drone || !this.audioCtx) return;
    const { oscs, gain } = this.drone;
    const t = this.audioCtx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0.0001, t + 0.2);
    oscs.forEach((o) => o.stop(t + 0.25));
    this.drone = null;
  }

  /** Play just the first note, held long, so you can settle onto it. */
  playStartNote(freq: number): void {
    if (!this.audioCtx) return;
    this.refNote(freq, this.audioCtx.currentTime + 0.05, 3.5, 0.5);
    this.deafenUntil(0.05 + 3.5 + 0.4);
  }

  /** Bright "you nailed it" confirmation. */
  bip(): void {
    if (!this.audioCtx) return;
    const t = this.audioCtx.currentTime;
    this.tone(880, t, 0.12, 0.3, "triangle");
    this.tone(1320, t + 0.09, 0.12, 0.22, "triangle");
    this.deafenUntil(0.09 + 0.12 + 0.25);
  }

  /**
   * Softer, lower "you're sitting on your anchor" confirmation — distinct from
   * the bright success bip so eyes-closed you can tell them apart.
   */
  anchorBip(): void {
    if (!this.audioCtx) return;
    const t = this.audioCtx.currentTime;
    this.tone(440, t, 0.1, 0.18, "sine");
    this.tone(660, t + 0.07, 0.12, 0.14, "sine");
    this.deafenUntil(0.07 + 0.12 + 0.2);
  }

  /**
   * Read one frame of pitch. Applies all the "is this a real sung note?" gates:
   * not muted, RMS loud enough (raised while drone plays), clarity high, pitch
   * in the human singing range.
   */
  readPitch(): PitchSample {
    if (!this.analyser || !this.detector || !this.buf || !this.audioCtx) {
      return { midi: null, freq: 0, clarity: 0, rms: 0, singing: false, muted: false };
    }
    this.analyser.getFloatTimeDomainData(this.buf);
    const [freq, clarity] = this.detector.findPitch(this.buf, this.audioCtx.sampleRate);

    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);

    const muted = this.isMuted();
    // The guide-tone drone leaks into the mic; require real singing loudness
    // while it's active so its faint bleed alone can't auto-pass note 1.
    const loudEnough = this.drone ? rms > DRONE_VOICE_RMS : true;
    const singing = !muted && loudEnough && clarity > CLARITY_THRESHOLD && freq > PITCH_HZ_MIN && freq < PITCH_HZ_MAX;
    const midi = singing ? freqToMidiFloat(freq) : null;
    return { midi, freq, clarity, rms, singing, muted };
  }

  /** Clean shutdown — used on unmount or leaving the trainer. */
  dispose(): void {
    this.stopDrone();
    this.micStream?.getTracks().forEach((t) => t.stop());
    void this.audioCtx?.close();
    this.audioCtx = null;
    this.analyser = null;
    this.detector = null;
    this.buf = null;
    this.micStream = null;
    this.piano = null;
  }
}
