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
import { freqToMidiFloat, midiToFreq, midiToName } from "@/lib/music";

interface DroneHandle {
  oscs: OscillatorNode[];
  gain: GainNode;
}

// Every sound the trainer makes has a code name so we can trace which support is
// firing when. Logged at the source (each play method) so it fires no matter who
// triggers it. Grep the console for "🔊" to see the full soundtrack of a session.
export type SoundName =
  | "REFERENCE" // full target sequence played upfront
  | "ANCHOR_PRIMER" // rung-1 song melody + the bare interval
  | "HINT" // replays the start note when you're stuck off-target
  | "SUPPORT" // quiet note held under your voice while you sustain
  | "FOUND" // chime the instant you land on the target
  | "DRONE_START" // continuous guide tone begins
  | "DRONE_STOP" // guide tone ends
  | "START_NOTE" // the first note, held long, to settle onto
  | "SUCCESS_BIP" // bright "you nailed it" beep on advance
  | "ANCHOR_BIP" // soft "you're on your anchor" beep between leaps
  | "READY_CUE"; // subtle "reference done — sing now" cue as the mic reopens

function logSound(name: SoundName, detail = ""): void {
  console.log(`🔊 ${name}${detail ? ` — ${detail}` : ""}`);
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

  private recorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

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
    const AC =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
   * Schedule one note (by MIDI number) on the sampled piano if loaded, else the
   * synth. `when` is an absolute AudioContext time; `gain` is a per-note multiplier
   * so a melody guide can sit above quieter accompaniment.
   */
  scheduleNote(midi: number, when: number, dur: number, gain: number): void {
    if (!this.audioCtx) return;
    if (this.piano) {
      this.piano.play(midi, when, { duration: dur, gain: gain * PIANO_GAIN });
    } else {
      this.pianoNote(midiToFreq(midi), when, dur, gain, false);
    }
  }

  /** Cut every note the sampled piano has playing or scheduled ahead. */
  stopScheduled(): void {
    this.piano?.stop();
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
   * A dry mechanical "tik" — a short low-passed noise burst, like a light switch,
   * NOT a pitched beep. `cutoff` sets how dull/deep the click sounds (lower =
   * deeper thunk). Used for the ready cue so it can't be mistaken for a tone.
   */
  click(start: number, gain = 0.3, cutoff = 900): void {
    const ac = this.audioCtx;
    if (!ac) return;
    const DUR_S = 0.02; // a few ms of noise = a transient tick, not a tone
    const frames = Math.ceil(ac.sampleRate * DUR_S);
    const noise = ac.createBuffer(1, frames, ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = noise;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cutoff; // low cutoff = deep, dull click
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + DUR_S); // instant decay
    src.connect(lp).connect(g).connect(ac.destination);
    src.start(start);
    src.stop(start + DUR_S + 0.01);
  }

  /**
   * Play the whole target sequence spaced by `gap`, then keep the mic deafened
   * until the LAST note has fully rung out plus a settling pause — otherwise the
   * final note's tail bleeds into the mic and gets scored as your first sung
   * note. Returns the total deafen duration (seconds) so callers can schedule the
   * "sing now" cue exactly when the mic reopens.
   */
  playTargets(freqs: readonly number[]): number {
    if (!this.audioCtx) return 0;
    logSound("REFERENCE", `${freqs.length} notes`);
    const HEAD_S = 0.05;
    const GAP_S = 1.0;
    const DUR_S = 1.2; // each note rings this long — the tail MUST be deafened
    const PAUSE_S = 0.5; // deliberate breath after the reference before you sing
    const gain = 0.5;
    freqs.forEach((freq, i) => this.refNote(freq, this.now() + HEAD_S + i * GAP_S, DUR_S, gain));
    // Last note starts at HEAD + (n-1)*GAP and rings DUR — cover that, then pause.
    const deafenS = HEAD_S + (freqs.length - 1) * GAP_S + DUR_S + PAUSE_S;
    this.deafenUntil(deafenS);
    return deafenS;
  }

  /**
   * Subtle two-tone "reference is done — start singing" cue. Distinct from the
   * bright success bip and the anchor bip: a soft rising blip, played as the mic
   * reopens so you know listening is over.
   */
  readyCue(): void {
    if (!this.audioCtx) return;
    logSound("READY_CUE", "sing now");
    const t = this.audioCtx.currentTime;
    // Two dry low clicks — "tik-tik," like flipping a light switch. A transient,
    // not a tone, so it can't read as the pitched success bip.
    this.click(t, 0.32, 700);
    this.click(t + 0.11, 0.32, 700);
    this.deafenUntil(0.11 + 0.02 + 0.08); // don't score the cue's own bleed
  }

  /**
   * Ladder rung-1 primer: play the song-anchor melody in its own rhythm (each
   * note carries relative `beats`), a breath, then the bare interval slow and
   * clear — so the ear hooks the interval to a melody it already knows. Empty
   * `anchor` = skip straight to the bare interval. Mic deafened throughout.
   */
  playAnchorPrimer(anchor: readonly { freq: number; beats: number }[], intervalFreqs: readonly number[]): number {
    if (!this.audioCtx) return 0;
    logSound("ANCHOR_PRIMER", `${anchor.length} melody + ${intervalFreqs.length} interval`);
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
    const deafenS = t - start + 0.4;
    this.deafenUntil(deafenS);
    return deafenS;
  }

  /**
   * Replay a reminder note when you're stuck. The caller picks which: the note
   * you're seeking in guided mode, or the root in ear mode (so the by-ear target
   * is never leaked).
   */
  playHint(freq: number): void {
    if (!this.audioCtx) return;
    logSound("HINT", `replay ${midiToName(Math.round(freqToMidiFloat(freq)))}`);
    this.refNote(freq, this.audioCtx.currentTime + 0.05, 2.0, 0.5);
    this.deafenUntil(0.05 + 2.0 + 0.4);
  }

  /**
   * Play the current target quietly UNDER your voice WITHOUT deafening the mic —
   * you're singing the same pitch so its bleed is harmless.
   */
  playSupport(freq: number, dur: number): void {
    if (!this.audioCtx) return;
    logSound("SUPPORT", "quiet note under voice");
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
    logSound("FOUND", "landed-on-pitch chime");
    const dur = 0.7;
    this.refNote(freq, this.audioCtx.currentTime + 0.02, dur, 0.5);
    this.deafenUntil(0.02 + dur + 0.15);
  }

  /**
   * Play one MIDI note on the piano (sampled if loaded, else synth). For the
   * free-sing detector keyboard: does NOT deafen the mic, since you may be
   * singing along and a little bleed into the trail is harmless — there's no
   * scoring here. Returns the note's frequency so callers can place a reference.
   */
  playKey(midi: number, dur = 1.4): number {
    const freq = midiToFreq(midi);
    if (!this.audioCtx) return freq;
    this.refNote(freq, this.now() + 0.01, dur, 0.5);
    return freq;
  }

  /**
   * Continuous sine drone at `freq`. Used two ways: the trainer's subliminal
   * guide tone (default level) and the detector's foreground practice drone (a
   * louder `level`). Does NOT deafen the mic — a loudness gate in the pitch loop
   * separates voice from bleed.
   */
  startDrone(freq: number, level = 0.0105): void {
    this.stopDrone();
    if (!this.audioCtx) return;
    logSound("DRONE_START", "guide tone on");
    const ac = this.audioCtx;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(level, ac.currentTime + 0.15); // soft fade-in
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
    logSound("DRONE_STOP", "guide tone off");
    const { oscs, gain } = this.drone;
    const t = this.audioCtx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0.0001, t + 0.2);
    oscs.forEach((o) => o.stop(t + 0.25));
    this.drone = null;
  }

  /** Play just the first note, held long, so you can settle onto it. */
  playStartNote(freq: number): number {
    if (!this.audioCtx) return 0;
    logSound("START_NOTE", "first note, held long");
    this.refNote(freq, this.audioCtx.currentTime + 0.05, 3.5, 0.5);
    const deafenS = 0.05 + 3.5 + 0.4;
    this.deafenUntil(deafenS);
    return deafenS;
  }

  /** Bright "you nailed it" confirmation. */
  bip(): void {
    if (!this.audioCtx) return;
    logSound("SUCCESS_BIP", "nailed-it beep");
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
    logSound("ANCHOR_BIP", "on-your-anchor beep");
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

  /**
   * Record the mic (your voice, dry — the backing is in your headphones, not the
   * mic) so you can play your take back. Best-effort: a no-op if the mic isn't live
   * or MediaRecorder is unsupported, or if a recording is already running.
   */
  startRecording(): void {
    if (!this.micStream || this.recorder || typeof MediaRecorder === "undefined") return;
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
    const rec = mime ? new MediaRecorder(this.micStream, { mimeType: mime }) : new MediaRecorder(this.micStream);
    this.recordedChunks = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };
    rec.start();
    this.recorder = rec;
  }

  /** Stop the current recording and resolve its audio Blob (null if nothing captured). */
  async stopRecording(): Promise<Blob | null> {
    const rec = this.recorder;
    if (!rec) return null;
    this.recorder = null;
    return new Promise((resolve) => {
      rec.onstop = () =>
        resolve(this.recordedChunks.length > 0 ? new Blob(this.recordedChunks, { type: rec.mimeType || "audio/webm" }) : null);
      rec.stop();
    });
  }

  /** Clean shutdown — used on unmount or leaving the trainer. */
  dispose(): void {
    this.stopDrone();
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.recorder = null;
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
